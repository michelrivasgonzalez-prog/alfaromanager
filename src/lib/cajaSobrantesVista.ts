import type { MovimientoFondo } from "@/lib/cajaSobrantes";

export type FiltroCaja = "todos" | "ingresos" | "retiros" | "pendientes";

/** La diferencia pendiente exige recepción física, aun si el movimiento base ya fue confirmado. */
export function requiereConfirmacionFisica(m: MovimientoFondo): boolean {
  return m.tipo === "ingreso" &&
    (m.estado === "pendiente" || Boolean(m.detalles?.ajuste_pendiente));
}

/** Solo una vista: no cambia las operaciones, los importes ni las confirmaciones. */
export function filtrarMovimientosCaja(movimientos: MovimientoFondo[], filtro: FiltroCaja) {
  return movimientos
    .filter((m) => {
      if (filtro === "ingresos") return m.tipo === "ingreso";
      if (filtro === "retiros") return m.tipo === "retiro";
      if (filtro === "pendientes") return requiereConfirmacionFisica(m);
      return true;
    })
    .slice()
    .sort((a, b) => {
      const t = Date.parse(b.realizado_en) - Date.parse(a.realizado_en);
      return Number.isFinite(t) ? t : 0;
    });
}

export function etiquetaMovimientoCaja(m: MovimientoFondo): string {
  if (m.detalles?.origen === "faltante_cuadre") return "Faltante de cuadre";
  if (m.detalles?.origen === "compensacion_deuda") return "Compensación de deuda";
  return m.tipo === "ingreso" ? "Ingreso de sobrante" : "Retiro de fondos";
}

export function importeMovimientoCaja(m: MovimientoFondo) {
  return Number(m.monto);
}
