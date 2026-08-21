/** Formatos unificados de la app.
 *  - Dinero: sin decimales.
 *  - Cantidades/existencias: hasta 2 decimales (sin ceros sobrantes).
 */
export const fmtDinero = (n: number) =>
  `$${Math.round(Number(n) || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 })}`;

export const fmtNum = (n: number) =>
  (Number(n) || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 });

export const fmtCant = (n: number) =>
  (Number(n) || 0).toLocaleString("es-ES", { maximumFractionDigits: 2 });
