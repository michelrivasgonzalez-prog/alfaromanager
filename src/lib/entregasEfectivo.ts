import { DENOMINACIONES, type Cuadre, type Denominaciones, type PuntoVenta, type Recogida } from "@/store/cuadreStore";
import { rpcTurnoProtegido } from "@/lib/turnosOperativos";

export type EstadoEntregaEfectivo = "pendiente" | "confirmada" | "diferencia" | "anulada";
export type EntregaEfectivo = {
  id: string;
  turno_operativo_id: string;
  punto_venta: PuntoVenta;
  dependiente_id: string | null;
  dependiente: string;
  entregado_en: string;
  denominaciones_declaradas: Denominaciones;
  total_declarado: number;
  estado: EstadoEntregaEfectivo;
  observacion?: string;
  denominaciones_recibidas: Denominaciones | null;
  total_recibido: number | null;
  recibido_por_id: string | null;
  recibido_por: string | null;
  recibido_en: string | null;
  nota_conteo: string | null;
  motivo_resolucion: string | null;
  resuelto_en: string | null;
  anulado_en: string | null;
};

export const codigoEntrega = (id: string): string =>
  "EFE-" + id.replace(/-/g, "").slice(0, 8).toUpperCase();

export const formatoDinero = (n: number): string =>
  new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(n) + " CUP";

export const formatoFechaEntrega = (fecha: string): string => {
  return new Date(fecha).toLocaleString("es-CU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

export const totalDenominaciones = (den: Denominaciones): number =>
  Object.entries(den).reduce((s, [billete, cantidad]) => s + Number(billete) * Number(cantidad || 0), 0);

export function validarDenominaciones(den: Denominaciones, permitirCero = false): number {
  const permitidas = new Set(DENOMINACIONES.map(String));
  let total = 0;
  for (const [billete, cantidad] of Object.entries(den)) {
    if (!permitidas.has(billete) || !Number.isSafeInteger(cantidad) || cantidad < 0) {
      throw new Error(`Cantidad inválida de billetes de ${billete} CUP.`);
    }
    total += Number(billete) * cantidad;
  }
  if (!Number.isSafeInteger(total) || total < 0 || (!permitirCero && total === 0)) {
    throw new Error("Introduce al menos un billete válido en la entrega.");
  }
  return total;
}

export const desgloseBilletes = (d?: Denominaciones | null): string =>
  Object.entries(d ?? {}).filter(([, n]) => Number(n) > 0)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([b, n]) => `${n} × ${Number(b).toLocaleString("es-ES")}`).join(" · ");

export async function listarEntregasEfectivo(
  usuarioId: string, turnoId?: string | null,
): Promise<EntregaEfectivo[]> {
  const datos = await rpcTurnoProtegido(usuarioId, "alfaro_efectivo_listar", {
    p_turno_id: turnoId ?? null,
  });
  return (datos.entregas ?? []) as EntregaEfectivo[];
}

export async function enviarEntregaEfectivo(
  usuarioId: string, turnoId: string, denominaciones: Denominaciones, observacion = "",
): Promise<EntregaEfectivo> {
  validarDenominaciones(denominaciones);
  const r = await rpcTurnoProtegido(usuarioId, "alfaro_efectivo_enviar", {
    p_turno_id: turnoId, p_den: denominaciones, p_observacion: observacion,
  });
  return r.entrega as EntregaEfectivo;
}

export async function contarEntregaEfectivo(
  usuarioId: string, entregaId: string, denominaciones: Denominaciones, nota = "",
): Promise<EntregaEfectivo> {
  validarDenominaciones(denominaciones, true);
  const r = await rpcTurnoProtegido(usuarioId, "alfaro_efectivo_contar", {
    p_entrega_id: entregaId, p_den: denominaciones, p_nota: nota,
  });
  return r.entrega as EntregaEfectivo;
}

export async function resolverDiferenciaEfectivo(
  usuarioId: string, entregaId: string, motivo: string,
): Promise<EntregaEfectivo> {
  if (motivo.trim().length < 10) throw new Error("Explica la diferencia en al menos 10 caracteres.");
  const r = await rpcTurnoProtegido(usuarioId, "alfaro_efectivo_resolver", {
    p_entrega_id: entregaId, p_motivo: motivo.trim(),
  });
  return r.entrega as EntregaEfectivo;
}

export async function anularEntregaEfectivo(
  usuarioId: string, entregaId: string, motivo: string,
): Promise<EntregaEfectivo> {
  if (motivo.trim().length < 10) throw new Error("Justifica la anulación en al menos 10 caracteres.");
  const r = await rpcTurnoProtegido(usuarioId, "alfaro_efectivo_anular", {
    p_entrega_id: entregaId, p_motivo: motivo.trim(),
  });
  return r.entrega as EntregaEfectivo;
}

/** Solo el importe CONTADO y confirmado se incluye en el Cuadre Oficial. */
export function recogidaDesdeEntrega(e: EntregaEfectivo): Recogida {
  if (e.estado !== "confirmada" || !e.denominaciones_recibidas || e.total_recibido == null) {
    throw new Error("Solo pueden incorporarse entregas confirmadas por administración.");
  }
  const fecha = new Date(e.entregado_en);
  const dia = [fecha.getFullYear(), String(fecha.getMonth() + 1).padStart(2, "0"),
    String(fecha.getDate()).padStart(2, "0")].join("-");
  return {
    id: e.id,
    fecha: dia,
    quien: e.recibido_por || "Administración",
    denominaciones: e.denominaciones_recibidas,
    monto: Number(e.total_recibido),
    entregaEfectivoId: e.id,
    confirmadoEn: e.recibido_en || undefined,
  };
}

/** Evita incorporar el mismo fajo confirmado en dos cuadres oficiales. */
export function fajosDuplicadosEnCuadres(
  cuadre: Pick<Cuadre, "id" | "recogidas">,
  historico: Array<Pick<Cuadre, "id" | "recogidas">>,
): string[] {
  const registrados = new Set(historico.filter((c) => c.id !== cuadre.id)
    .flatMap((c) => (c.recogidas ?? []).map((r) => r.entregaEfectivoId).filter(Boolean) as string[]));
  const vistos = new Set<string>();
  const duplicados = new Set<string>();
  for (const r of cuadre.recogidas ?? []) {
    if (!r.entregaEfectivoId) continue;
    if (registrados.has(r.entregaEfectivoId) || vistos.has(r.entregaEfectivoId)) {
      duplicados.add(r.entregaEfectivoId);
    }
    vistos.add(r.entregaEfectivoId);
  }
  return [...duplicados];
}
