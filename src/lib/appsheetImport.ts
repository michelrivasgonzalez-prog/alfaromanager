import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { ensureCloudSession } from "@/lib/cloudBootstrap";

/**
 * Importación desde AppSheet — schema real del usuario.
 *
 * Hoja "Clientes":
 *   ID_Cliente, Nombre Completo, Teléfono, (Foto opcional)
 * Hoja "Deudas":
 *   PK_Deuda, ID_Deuda, ID_Cliente, Procedencia, Fecha, Monto Total, Descripción
 * Hoja "Abonos":
 *   ID_Abono, Numero de Recibo, ID_Deuda, Monto Pagado, Fecha de Pago
 *
 * Los IDs de AppSheet NO se guardan; se usan sólo para enlazar filas durante
 * la importación. Los abonos se aplican a la deuda correspondiente vía el
 * RPC `registrar_abono` para que el saldo y el estado se actualicen bien.
 */

type Row = Record<string, any>;

const norm = (s: any) =>
  String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const pick = (row: Row, keys: string[]): any => {
  const nk = Object.keys(row).reduce<Record<string, string>>((acc, k) => {
    acc[norm(k)] = k;
    return acc;
  }, {});
  for (const k of keys) {
    const real = nk[norm(k)];
    if (real !== undefined && row[real] !== undefined && row[real] !== null && row[real] !== "") {
      return row[real];
    }
  }
  return undefined;
};

const parseNumber = (v: any): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^0-9.,-]/g, "").replace(/,/g, ".");
  const n = Number(s);
  return isFinite(n) ? n : 0;
};

const parseDate = (v: any): string => {
  if (!v) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString();
  }
  const d = new Date(String(v));
  return isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
};

export type ImportResult = {
  clientes: { creados: number; existentes: number };
  deudas: { creadas: number; omitidas: number };
  abonos: { creados: number; omitidos: number };
  errores: string[];
};

export async function importFromAppsheet(file: File): Promise<ImportResult> {
  await ensureCloudSession();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  const result: ImportResult = {
    clientes: { creados: 0, existentes: 0 },
    deudas: { creadas: 0, omitidas: 0 },
    abonos: { creados: 0, omitidos: 0 },
    errores: [],
  };

  const sheetByName = (needles: string[]) => {
    const key = wb.SheetNames.find((n) => needles.some((x) => norm(n).includes(norm(x))));
    return key ? (XLSX.utils.sheet_to_json(wb.Sheets[key]) as Row[]) : [];
  };

  const clientesRows = sheetByName(["cliente"]);
  const deudasRows = sheetByName(["deuda", "cuenta"]);
  const abonosRows = sheetByName(["abono", "pago"]);

  // 1) Clientes: crear si no existen (case-insensitive por nombre)
  //    Guardamos mapa: ID_Cliente AppSheet -> uuid Supabase
  const { data: existentes } = await supabase
    .from("clientes")
    .select("id, nombre")
    .is("deleted_at", null);
  const byName = new Map<string, string>();
  for (const c of existentes ?? []) byName.set(norm(c.nombre), c.id);

  const appsheetClienteId = new Map<string, string>(); // ID_Cliente -> uuid

  for (const r of clientesRows) {
    const nombre = pick(r, ["nombre completo", "nombre", "cliente", "name", "customer"]);
    const idAppsheet = pick(r, ["id_cliente", "id", "pk_cliente"]);
    if (!nombre) continue;
    const telefono = pick(r, ["telefono", "teléfono", "phone", "celular"]);
    const observaciones = pick(r, ["observaciones", "notas", "notes", "comentarios"]);

    let uuid = byName.get(norm(nombre));
    if (uuid) {
      result.clientes.existentes++;
      // Si el existente no tiene teléfono y en el excel viene, lo actualizamos.
      if (telefono) {
        await supabase
          .from("clientes")
          .update({ telefono: String(telefono).trim() })
          .eq("id", uuid)
          .is("telefono", null);
      }
    } else {
      const { data, error } = await supabase
        .from("clientes")
        .insert({
          nombre: String(nombre).trim(),
          telefono: telefono ? String(telefono).trim() : null,
          observaciones: observaciones ? String(observaciones).trim() : null,
        })
        .select("id, nombre")
        .single();
      if (error) {
        result.errores.push(`Cliente "${nombre}": ${error.message}`);
        continue;
      }
      uuid = data.id;
      byName.set(norm(data.nombre), uuid);
      result.clientes.creados++;
    }
    if (idAppsheet) appsheetClienteId.set(String(idAppsheet).trim(), uuid!);
  }

  // 2) Deudas
  //    Guardamos mapa: ID_Deuda AppSheet -> uuid Supabase
  const appsheetDeudaId = new Map<string, string>();

  for (const r of deudasRows) {
    const idDeudaAS = pick(r, ["id_deuda", "pk_deuda"]);
    const idCliAS = pick(r, ["id_cliente"]);
    let cliId: string | null | undefined = idCliAS ? appsheetClienteId.get(String(idCliAS).trim()) : undefined;
    if (!cliId) {
      // fallback por nombre si trae la columna cliente
      const nomCli = pick(r, ["nombre completo", "cliente", "nombre"]);
      if (nomCli) cliId = byName.get(norm(nomCli)) ?? null;
    }
    if (!cliId) {
      result.deudas.omitidas++;
      result.errores.push(`Deuda ${idDeudaAS ?? ""}: cliente no encontrado`);
      continue;
    }

    const total = parseNumber(pick(r, ["monto total", "total", "importe", "monto"]));
    if (total <= 0) {
      result.deudas.omitidas++;
      continue;
    }
    const fecha = parseDate(pick(r, ["fecha", "date"]));
    const procedencia = pick(r, ["procedencia", "origen"]);
    const detalle = pick(r, ["descripción", "descripcion", "detalle", "concepto"]) ?? procedencia ?? "Importado";

    const { data, error } = await supabase
      .from("deudas")
      .insert({
        cliente_id: cliId,
        cuadre_id: null,
        cuadre_label: procedencia ? `Importado · ${procedencia}` : "Importado desde AppSheet",
        fecha,
        productos: [{ nombre: String(detalle), cantidad: 1, precio: total }] as any,
        total,
        saldo: total,
        estado: "pendiente",
      })
      .select("id")
      .single();

    if (error) {
      result.errores.push(`Deuda ${idDeudaAS ?? ""}: ${error.message}`);
      result.deudas.omitidas++;
      continue;
    }
    if (idDeudaAS) appsheetDeudaId.set(String(idDeudaAS).trim(), data.id);
    result.deudas.creadas++;
  }

  // 3) Abonos: usan RPC para aplicar correctamente al saldo/estado.
  for (const r of abonosRows) {
    const idDeudaAS = pick(r, ["id_deuda"]);
    if (!idDeudaAS) {
      result.abonos.omitidos++;
      continue;
    }
    const deudaUuid = appsheetDeudaId.get(String(idDeudaAS).trim());
    if (!deudaUuid) {
      result.abonos.omitidos++;
      result.errores.push(`Abono omitido: no encuentro deuda ${idDeudaAS}`);
      continue;
    }
    const monto = parseNumber(pick(r, ["monto pagado", "monto", "importe", "pago"]));
    if (monto <= 0) {
      result.abonos.omitidos++;
      continue;
    }
    const fecha = parseDate(pick(r, ["fecha de pago", "fecha", "date"]));
    const recibo = pick(r, ["numero de recibo", "número de recibo", "recibo"]);
    const nota = recibo ? `Recibo #${recibo}` : "Abono histórico importado";

    // Necesitamos cliente_id de la deuda
    const { data: deudaRow } = await supabase
      .from("deudas")
      .select("cliente_id, saldo")
      .eq("id", deudaUuid)
      .single();
    if (!deudaRow) {
      result.abonos.omitidos++;
      continue;
    }
    // Aplicamos como mucho el saldo actual (para no romper el RPC).
    const aplicar = Math.min(monto, Number((deudaRow as any).saldo));
    if (aplicar <= 0) {
      result.abonos.omitidos++;
      continue;
    }
    const { error } = await supabase.rpc("registrar_abono" as any, {
      _cliente_id: (deudaRow as any).cliente_id,
      _monto: aplicar,
      _aplicaciones: [{ deuda_id: deudaUuid, monto: aplicar }] as any,
      _usuario_id: null,
      _usuario_nombre: "Importación AppSheet",
      _nota: nota,
      _fecha: fecha,
    } as any);
    if (error) {
      result.errores.push(`Abono deuda ${idDeudaAS}: ${error.message}`);
      result.abonos.omitidos++;
    } else {
      result.abonos.creados++;
    }
  }

  return result;
}
