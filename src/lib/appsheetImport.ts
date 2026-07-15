import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { ensureCloudSession } from "@/lib/cloudBootstrap";

/**
 * Importación desde AppSheet.
 *
 * Formato esperado: un archivo .xlsx con hasta tres hojas:
 *   - "Clientes" (columnas: Nombre / Cliente / Name; Teléfono / Telefono / Phone; Observaciones / Notas)
 *   - "Deudas"   (columnas: Cliente, Fecha, Detalle/Concepto/Producto, Cantidad, Precio, Total, Saldo, Estado)
 *   - "Abonos"   (columnas: Cliente, Fecha, Monto, Nota)
 *
 * El importador tolera nombres alternativos y saltos de mayúsculas.
 * Todo se inserta con soft-delete = null y se enlaza por nombre de cliente.
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
    // Excel serial date
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
  const { data: existentes } = await supabase.from("clientes").select("id, nombre").is("deleted_at", null);
  const byName = new Map<string, string>();
  for (const c of existentes ?? []) byName.set(norm(c.nombre), c.id);

  for (const r of clientesRows) {
    const nombre = pick(r, ["nombre", "cliente", "name", "customer"]);
    if (!nombre) continue;
    if (byName.has(norm(nombre))) {
      result.clientes.existentes++;
      continue;
    }
    const telefono = pick(r, ["telefono", "teléfono", "phone", "celular"]);
    const observaciones = pick(r, ["observaciones", "notas", "notes", "comentarios"]);
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
    byName.set(norm(data.nombre), data.id);
    result.clientes.creados++;
  }

  // Descarga clientes de nuevo por si algún nombre difería
  const resolveCliente = (nombre: any): string | null => {
    const id = byName.get(norm(nombre));
    return id ?? null;
  };

  // 2) Deudas: una fila = una deuda
  for (const r of deudasRows) {
    const nomCli = pick(r, ["cliente", "nombre", "customer"]);
    const cliId = resolveCliente(nomCli);
    if (!cliId) {
      result.deudas.omitidas++;
      if (nomCli) result.errores.push(`Deuda omitida: cliente "${nomCli}" no encontrado`);
      continue;
    }
    const total = parseNumber(pick(r, ["total", "importe", "monto"]));
    const saldoRaw = pick(r, ["saldo", "pendiente", "balance"]);
    const saldo = saldoRaw !== undefined ? parseNumber(saldoRaw) : total;
    if (total <= 0 && saldo <= 0) {
      result.deudas.omitidas++;
      continue;
    }
    const fecha = parseDate(pick(r, ["fecha", "date"]));
    const detalle =
      pick(r, ["detalle", "concepto", "producto", "descripcion", "descripción"]) ?? "Importado";
    const cantidad = parseNumber(pick(r, ["cantidad", "qty"])) || 1;
    const precio = parseNumber(pick(r, ["precio", "unitario"])) || total / (cantidad || 1);
    const estado =
      saldo <= 0.001 ? "pagada" : saldo < total ? "parcial" : "pendiente";
    const { error } = await supabase.from("deudas").insert({
      cliente_id: cliId,
      cuadre_id: null,
      cuadre_label: "Importado desde AppSheet",
      fecha,
      productos: [{ nombre: String(detalle), cantidad, precio }] as any,
      total,
      saldo,
      estado,
    });
    if (error) {
      result.errores.push(`Deuda "${nomCli}": ${error.message}`);
      result.deudas.omitidas++;
    } else {
      result.deudas.creadas++;
    }
  }

  // 3) Abonos: histórico plano
  for (const r of abonosRows) {
    const nomCli = pick(r, ["cliente", "nombre", "customer"]);
    const cliId = resolveCliente(nomCli);
    if (!cliId) {
      result.abonos.omitidos++;
      if (nomCli) result.errores.push(`Abono omitido: cliente "${nomCli}" no encontrado`);
      continue;
    }
    const monto = parseNumber(pick(r, ["monto", "importe", "total", "pago"]));
    if (monto <= 0) {
      result.abonos.omitidos++;
      continue;
    }
    const fecha = parseDate(pick(r, ["fecha", "date"]));
    const nota = pick(r, ["nota", "notas", "descripcion", "descripción", "detalle"]);
    const { error } = await supabase.from("abonos").insert({
      cliente_id: cliId,
      monto,
      fecha,
      usuario_nombre: "Importación AppSheet",
      nota: nota ? String(nota) : "Abono histórico importado",
    });
    if (error) {
      result.errores.push(`Abono "${nomCli}": ${error.message}`);
      result.abonos.omitidos++;
    } else {
      result.abonos.creados++;
    }
  }

  return result;
}
