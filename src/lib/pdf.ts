import { Cuadre, calcCuadre, DENOMINACIONES, catLabel } from "@/store/cuadreStore";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import logoUrl from "@/assets/alfaro-logo.jpg";
import { formatDiasTrabajados, formatGastoDetalle, gastoLineas, ordenarGastos } from "@/lib/dias";

const fechaTrabajada = (c: Cuadre) => c.diasTrabajados?.[0] ?? c.fecha;

const fmt = (n: number) =>
  `$${Math.round(Number(n) || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 })}`;
const n2 = (n: number) =>
  Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 2 });

/**
 * Genera un reporte imprimible (HTML) en una nueva ventana con
 * `window.print()`. Es más fiel al formato real, soporta el logo y se puede
 * "Guardar como PDF" desde el diálogo de impresión.
 */
export function generarPDF(c: Cuadre) {
  const r = calcCuadre(c);

  const productosRows = r.productos
    .filter(
      (p) =>
        Number(p.inicio) !== 0 ||
        Number(p.entradas) !== 0 ||
        Number(p.traslados) !== 0 ||
        Number(p.total) !== 0 ||
        Number(p.final) !== 0
    )
    .map(
      (p) => `
      <tr>
        <td class="l name">${escape(p.nombre)}</td>
        <td class="r">${n2(p.inicio)}</td>
        <td class="r">${n2(p.entradas)}</td>
        <td class="r">${n2(p.traslados)}</td>
        <td class="r">${n2(p.total)}</td>
        <td class="r">${n2(p.final)}</td>
        <td class="r b">${n2(p.venta)}</td>
        <td class="r">${fmt(p.precio)}</td>
        <td class="r b">${fmt(p.importe)}</td>
        <td class="r">${fmt(p.costo)}</td>
        <td class="r">${fmt(p.costoTotal)}</td>
        <td class="r b">${fmt(p.ganancia)}</td>
      </tr>${
        (p as any).mixto
          ? [
              ...((p as any).tramos ?? []).map(
                (t: any) =>
                  `<tr class="sub"><td class="l name">↳ Precio mixto${t.nota ? ` (${escape(t.nota)})` : ""}</td><td colspan="5"></td><td class="r">${n2(t.cantidad)}</td><td class="r">${fmt(t.precio)}</td><td class="r">${fmt(Number(t.cantidad) * Number(t.precio))}</td><td class="r">${fmt(t.costo)}</td><td class="r">${fmt(Number(t.cantidad) * Number(t.costo))}</td><td class="r">${fmt(Number(t.cantidad) * (Number(t.precio) - Number(t.costo)))}</td></tr>`
              ),
              Number((p as any).resto) > 0
                ? `<tr class="sub"><td class="l name">↳ Precio base</td><td colspan="5"></td><td class="r">${n2((p as any).resto)}</td><td class="r">${fmt(p.precio)}</td><td class="r">${fmt(Number((p as any).resto) * Number(p.precio))}</td><td class="r">${fmt(p.costo)}</td><td class="r">${fmt(Number((p as any).resto) * Number(p.costo))}</td><td class="r">${fmt(Number((p as any).resto) * (Number(p.precio) - Number(p.costo)))}</td></tr>`
                : "",
            ].join("")
          : ""
      }`
    )
    .join("");


  const gastosRows = ordenarGastos(c.gastos)
    .map(
      (g) => `
      <tr>
        <td>${escape(catLabel(g.categoria))}</td>
        <td>${escape(g.tipo)}</td>
        <td>${escape(g.nombre || "—")}</td>
        <td>${gastoLineas(g).map((l) => escape(l)).join("<br>")}</td>
        <td class="r b">${fmt(g.monto)}</td>
      </tr>`
    )
    .join("");

  const denominacionCajaRows = DENOMINACIONES.map((d) => {
    const n = c.denominaciones[String(d)] || 0;
    if (!n) return "";
    return `<tr><td>$${d}</td><td class="r">× ${n}</td><td class="r b">${fmt(d * n)}</td></tr>`;
  })
    .filter(Boolean)
    .join("");

  const denominacionPagoRows = DENOMINACIONES.map((d) => {
    const n = c.salarioDenominaciones[String(d)] || 0;
    if (!n) return "";
    return `<tr><td>$${d}</td><td class="r">× ${n}</td><td class="r b">${fmt(d * n)}</td></tr>`;
  })
    .filter(Boolean)
    .join("");

  const totalPagado = Object.entries(c.salarioDenominaciones).reduce(
    (s, [b, n]) => s + Number(b) * n,
    0
  );

  const diasTrabajadosStr = formatDiasTrabajados(c.diasTrabajados);

  const productosBloqueados = c.productos.filter((p) => p.notaDesbloqueo);
  const notasRows = productosBloqueados
    .map(
      (p) => `
      <tr>
        <td><strong>${escape(p.nombre)}</strong></td>
        <td>${escape(p.notaDesbloqueo!)}</td>
      </tr>`
    )
    .join("");

  const tieneFaltante = r.diferencia < 0;

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Cuadre · ${escape(c.dependiente || "AlFaroCafé")} · ${format(
    new Date(fechaTrabajada(c)),
    "dd-MM-yyyy"
  )}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 0.5cm; }
  html, body { margin: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; padding: 0.5cm; font-size: 10.5px; }
  header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #4B3621; padding-bottom: 12px; margin-bottom: 16px; }
  header img { height: 70px; width: 70px; object-fit: contain; }
  header .title { flex: 1; }
  header h1 { margin: 0; font-size: 22px; color: #4B3621; letter-spacing: 0.5px; }
  header .sub { color: #555; font-size: 12px; margin-top: 2px; }
  header .meta { text-align: right; font-size: 11px; color: #555; }
  h2 { font-size: 13px; color: #065F46; margin: 16px 0 6px; border-left: 4px solid #065F46; padding-left: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: fixed; }
  th, td { padding: 1.5px 4px; border-bottom: 1px solid #e5e5e5; vertical-align: middle; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  th { background: #f5efe6; color: #4B3621; text-transform: uppercase; font-size: 9px; letter-spacing: 0.4px; text-align: left; white-space: normal; }
  td.r, th.r { text-align: right; font-variant-numeric: tabular-nums; }
  td.l { text-align: left; }
  td.name, th.name { width: 26%; white-space: normal; word-break: break-word; }
  td.b { font-weight: 700; }
  tr.sub td { color: #666; font-size: 9.5px; background: #fafafa; }

  tfoot td { font-weight: 700; background: #faf6f0; border-top: 2px solid #4B3621; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 12px; }
  .card h3 { margin: 0 0 6px; font-size: 11px; color: #4B3621; text-transform: uppercase; letter-spacing: 0.5px; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .row .v { font-weight: 700; font-variant-numeric: tabular-nums; }
  .ok { color: #065F46; }
  .bad { color: #b91c1c; }
  .total { font-size: 14px; font-weight: 800; }
  .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 10px; color: #666; display: flex; justify-content: space-between; }
  .page-break { page-break-before: always; break-before: page; }

  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
  .actions { position: fixed; top: 12px; right: 12px; }
  .actions button { background: #065F46; color: white; border: 0; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; margin-left: 6px; }
  .actions button.alt { background: #4B3621; }
</style>
</head>
<body>
  <div class="actions no-print">
    <button onclick="window.print()">Imprimir / Guardar PDF</button>
    <button class="alt" onclick="window.close()">Cerrar</button>
  </div>

  <header>
    <img src="${logoUrl}" alt="AlFaro Café" />
    <div class="title">
      <h1>AlFaro Café · Cuadre de turno</h1>
      <div class="sub">${escape(c.puntoVenta)} · Dependiente: <strong>${escape(
    c.dependiente || "—"
  )}</strong></div>
      <div class="sub">Días trabajados: <strong>${escape(
        diasTrabajadosStr || "—"
      )}</strong> (${c.diasTrabajados.length})</div>
    </div>
    <div class="meta">
      ${format(new Date(fechaTrabajada(c)), "dd MMM yyyy", { locale: es })}<br/>
      ${c.diasTrabajados.length} día(s) trabajado(s)
    </div>
  </header>

  <h2>1. IPV — Inventario y Productos Vendidos</h2>
  <table>
    <thead>
      <tr>
        <th class="name">Producto</th>

        <th class="r">Inicio</th>
        <th class="r">Entr.</th>
        <th class="r">Trasl.</th>
        <th class="r">Total</th>
        <th class="r">Final</th>
        <th class="r">Vendidos</th>
        <th class="r">Precio</th>
        <th class="r">Importe</th>
        <th class="r">Costo u.</th>
        <th class="r">Costo total</th>
        <th class="r">Ganancia</th>
      </tr>
    </thead>
    <tbody>${productosRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="8" class="r">Totales</td>
        <td class="r">${fmt(r.totalVenta)}</td>
        <td></td>
        <td class="r">${fmt(r.totalCosto)}</td>
        <td class="r">${fmt(r.gananciaTotal)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="page-break"></div>
  <h2>2. Gastos del turno</h2>

  <table>
    <thead>
      <tr>
        <th>Categoría</th>
        <th>Tipo</th>
        <th>Recibe</th>
        <th>Detalle</th>
        <th class="r">Monto</th>
      </tr>
    </thead>
    <tbody>${
      gastosRows ||
      `<tr><td colspan="5" style="text-align:center;color:#999">Sin gastos registrados</td></tr>`
    }</tbody>
    <tfoot>
      <tr><td colspan="4" class="r">Total gastos</td><td class="r">${fmt(
        r.totalGastos
      )}</td></tr>
    </tfoot>
  </table>

  <h2>3. Cuadre de caja</h2>
  <div class="grid">
    <div class="card">
      <h3>Denominación recibida (en caja)</h3>
      <table>
        <thead><tr><th>Billete</th><th class="r">Cantidad</th><th class="r">Importe</th></tr></thead>
        <tbody>${
          denominacionCajaRows ||
          `<tr><td colspan="3" style="text-align:center;color:#999">—</td></tr>`
        }</tbody>
      </table>
      <div class="row total"><span>Efectivo final en caja</span><span class="v">${fmt(
        r.efectivoCajaFinal
      )}</span></div>
    </div>
    ${
      (c.recogidas ?? []).length
        ? `<div class="card">
      <h3>Efectivo recogido</h3>
      <table>
        <thead><tr><th>Fecha</th><th>Recoge</th><th>Billetes</th><th class="r">Importe</th></tr></thead>
        <tbody>${(c.recogidas ?? [])
          .map(
            (rc) =>
              `<tr><td>${format(new Date(rc.fecha + "T12:00:00"), "d MMM", { locale: es })}</td><td>${
                rc.quien ?? "—"
              }</td><td>${Object.entries(rc.denominaciones)
                .filter(([, n]) => Number(n) > 0)
                .sort((a, b) => Number(b[0]) - Number(a[0]))
                .map(([b, n]) => `${n}×${Number(b).toLocaleString("es")}`)
                .join(", ")}</td><td class="r">${fmt(rc.monto)}</td></tr>`
          )
          .join("")}</tbody>
      </table>
      <div class="row total"><span>Total recogido</span><span class="v">${fmt(
        r.efectivoRecogido
      )}</span></div>
    </div>`
        : ""
    }
    <div class="card">
      <h3>Resumen de caja</h3>
      <div class="row"><span>Venta total</span><span class="v">${fmt(r.totalVenta)}</span></div>
      <div class="row"><span>− Total gastos</span><span class="v">${fmt(
        r.totalGastos
      )}</span></div>
      <div class="row"><span>= A depositar</span><span class="v">${fmt(
        r.efectivoADepositar
      )}</span></div>
      ${
        r.efectivoRecogido > 0
          ? `<div class="row"><span>Efectivo recogido</span><span class="v">${fmt(
              r.efectivoRecogido
            )}</span></div><div class="row"><span>Efectivo final en caja</span><span class="v">${fmt(
              r.efectivoCajaFinal
            )}</span></div>`
          : ""
      }
      <div class="row"><span>Total entregado</span><span class="v">${fmt(
        r.efectivoEnCaja
      )}</span></div>
      <div class="row total ${
        r.diferencia < 0 ? "bad" : r.diferencia > 0 ? "ok" : ""
      }">
        <span>${
          r.diferencia < 0 ? "Faltante" : r.diferencia > 0 ? "Sobrante / propina" : "Cuadrado"
        }</span>
        <span class="v">${fmt(r.diferencia)}</span>
      </div>
    </div>
  </div>

  <h2>4. Salario</h2>
  <div class="grid">
    <div class="card">
      <h3>Cálculo</h3>
      <div class="row"><span>Días trabajados</span><span class="v">${r.diasCount}</span></div>
      <div class="row"><span>Modo</span><span class="v">${
        r.salarioModo === "porcentaje"
          ? `${r.porcentajeVenta}% de venta`
          : r.salarioModo === "mixto"
          ? `Base o ${r.porcentajeVenta}% (mayor)`
          : "Base/día"
      }</span></div>
      <div class="row"><span>Salario base/día</span><span class="v">${fmt(
        c.salarioBase
      )}</span></div>
      ${
        r.salarioModo !== "base"
          ? `<div class="row"><span>Calc. por base</span><span class="v">${fmt(
              r.salarioBasePeriodo
            )}</span></div><div class="row"><span>Calc. por % (${r.porcentajeVenta}%)</span><span class="v">${fmt(
              r.salarioPorPorcentaje
            )}</span></div>`
          : ""
      }
      <div class="row"><span>Salario bruto</span><span class="v">${fmt(
        r.salarioBruto
      )}</span></div>
      ${
        r.propina > 0
          ? `<div class="row ok"><span>+ Propina</span><span class="v">${fmt(
              r.propina
            )}</span></div>`
          : ""
      }
      ${
        r.descuentoFalta > 0
          ? `<div class="row bad"><span>− Descuento por faltante</span><span class="v">${fmt(
              r.descuentoFalta
            )}</span></div>`
          : ""
      }
      ${
        r.deudaDependiente > 0
          ? ""
          : `<div class="row total ok"><span>Salario real (pagado)</span><span class="v">${fmt(
              Math.max(0, r.salarioReal)
            )}</span></div>`
      }

      ${
        r.deudaDependiente > 0
          ? `<div class="row total bad"><span>Deuda del dependiente</span><span class="v">${fmt(
              r.deudaDependiente
            )}</span></div>`
          : ""
      }
    </div>
    <div class="card">
      <h3>Pago — billetes entregados</h3>
      <table>
        <thead><tr><th>Billete</th><th class="r">Cantidad</th><th class="r">Importe</th></tr></thead>
        <tbody>${
          denominacionPagoRows ||
          `<tr><td colspan="3" style="text-align:center;color:#999">—</td></tr>`
        }</tbody>
      </table>
      <div class="row total"><span>Total entregado</span><span class="v">${fmt(
        totalPagado
      )}</span></div>
    </div>
  </div>

  <h2>5. Resumen final</h2>
  <div class="card">
    <div class="row"><span>Venta total</span><span class="v">${fmt(r.totalVenta)}</span></div>
    <div class="row"><span>Costo total</span><span class="v">${fmt(r.totalCosto)}</span></div>
    <div class="row"><span>Ganancia total</span><span class="v">${fmt(
      r.gananciaTotal
    )}</span></div>
    <div class="row total ok"><span>Ganancia neta</span><span class="v">${fmt(
      r.gananciaNeta
    )}</span></div>
  </div>

  ${
    notasRows
      ? `<h2>6. Notas de desbloqueo de inicios</h2>
  <table>
    <thead><tr><th>Producto</th><th>Nota</th></tr></thead>
    <tbody>${notasRows}</tbody>
  </table>`
      : ""
  }

  <div class="footer">
    <span>AlFaro Café · Reporte generado ${format(new Date(), "dd/MM/yyyy HH:mm")}</span>
    <span>Firma: ____________________</span>
  </div>

  <script>
    // No se auto-imprime para no bloquear la interfaz. El usuario decide
    // cuándo abrir el diálogo desde el botón superior derecho.
  </script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Habilita las ventanas emergentes para generar el PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escape(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
