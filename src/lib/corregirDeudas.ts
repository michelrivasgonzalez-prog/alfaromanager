/**
 * Calcula cómo ajustar una deuda ya registrada cuando cambia su total
 * (por ejemplo, tras editar un cuadre cerrado). Lo ya abonado se respeta.
 */
export type AjusteDeuda = {
  total: number;
  saldo: number;
  estado: "pendiente" | "parcial" | "pagada";
  /** true si no hay abonos y el nuevo total es 0: se puede eliminar */
  eliminar: boolean;
  /** abonado por encima del nuevo total */
  excedente: number;
};

export function ajustarDeuda(
  actual: { total: number; saldo: number },
  nuevoTotal: number
): AjusteDeuda {
  const pagado = Math.max(0, Number(actual.total) - Number(actual.saldo));
  const nuevo = Math.max(0, Math.round(Number(nuevoTotal) * 100) / 100);
  if (nuevo <= 0 && pagado <= 0) {
    return { total: 0, saldo: 0, estado: "pagada", eliminar: true, excedente: 0 };
  }
  const total = Math.max(nuevo, pagado);
  const saldo = Math.max(0, nuevo - pagado);
  const estado = saldo <= 0 ? "pagada" : pagado > 0 ? "parcial" : "pendiente";
  return { total, saldo, estado, eliminar: false, excedente: Math.max(0, pagado - nuevo) };
}
