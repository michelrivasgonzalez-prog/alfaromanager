import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Cuadre,
  PUNTOS,
  PuntoVenta,
  calcCuadre,
  catLabel,
} from "@/store/cuadreStore";

const fmt = (n: number) =>
  `$${Math.round(Number(n) || 0).toLocaleString("es-ES", { maximumFractionDigits: 0 })}`;
const n2 = (n: number) =>
  Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 2 });

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export type ProductoTop = {
  nombre: string;
  cantidad: number;
  importe: number;
  ganancia: number;
};

export type ResumenPunto = {
  punto: PuntoVenta;
  cuadres: number;
  dias: number;
  venta: number;
  costo: number;
  gananciaBruta: number;
  gananciaNeta: number;
  gastos: number;
  salarios: number;
  propinas: number;
  faltantes: number;
  topProductos: ProductoTop[];
};

export type ReporteMensual = {
  mes: string; // yyyy-MM
  etiqueta: string;
  creado: string; // ISO
  totales: {
    cuadres: number;
    venta: number;
    costo: number;
    gananciaBruta: number;
    gananciaNeta: number;
    gastos: number;
    salarios: number;
    propinas: number;
    faltantes: number;
  };
  gastosPorCategoria: Record<string, number>;
  porPunto: ResumenPunto[];
  porDependiente: { nombre: string; cuadres: number; venta: number; salario: number }[];
  diasNoTrabajados: string[];
};

const fechaTrabajada = (c: Cuadre) => c.diasTrabajados?.[0] ?? c.fecha;

function resumirPunto(punto: PuntoVenta, cuadres: Cuadre[]): ResumenPunto {
  const rs = cuadres.map((c) => calcCuadre(c));
  const prod = new Map<string, ProductoTop>();
  for (const r of rs) {
    for (const p of r.productos) {
      if (!p.venta) continue;
      const k = p.nombre.trim().toLowerCase();
      const prev =
        prod.get(k) ?? { nombre: p.nombre, cantidad: 0, importe: 0, ganancia: 0 };
      prev.cantidad += p.venta;
      prev.importe += p.importe;
      prev.ganancia += p.ganancia;
      prod.set(k, prev);
    }
  }
  const dias = new Set<string>();
  for (const c of cuadres)
    for (const d of c.diasTrabajados?.length ? c.diasTrabajados : [c.fecha])
      dias.add(format(new Date(d), "yyyy-MM-dd"));

  return {
    punto,
    cuadres: cuadres.length,
    dias: dias.size,
    venta: rs.reduce((s, r) => s + r.totalVenta, 0),
    costo: rs.reduce((s, r) => s + r.totalCosto, 0),
    gananciaBruta: rs.reduce((s, r) => s + r.gananciaTotal, 0),
    gananciaNeta: rs.reduce((s, r) => s + r.gananciaNeta, 0),
    gastos: rs.reduce((s, r) => s + r.totalGastos, 0),
    salarios: rs.reduce((s, r) => s + r.salarioBruto, 0),
    propinas: rs.reduce((s, r) => s + r.propina, 0),
    faltantes: rs.reduce((s, r) => s + r.descuentoFalta + r.deudaDependiente, 0),
    topProductos: [...prod.values()]
      .sort((a, b) => b.importe - a.importe)
      .slice(0, 15),
  };
}

export function construirReporteMensual(
  mes: string,
  cuadres: Cuadre[],
  diasNoTrabajados: string[] = []
): ReporteMensual {
  const rs = cuadres.map((c) => calcCuadre(c));
  const gastosPorCategoria: Record<string, number> = {};
  for (const c of cuadres)
    for (const g of c.gastos)
      gastosPorCategoria[catLabel(g.categoria)] =
        (gastosPorCategoria[catLabel(g.categoria)] || 0) + g.monto;

  const depMap = new Map<string, { nombre: string; cuadres: number; venta: number; salario: number }>();
  cuadres.forEach((c, i) => {
    const nombre = c.dependiente || "Sin nombre";
    const prev = depMap.get(nombre) ?? { nombre, cuadres: 0, venta: 0, salario: 0 };
    prev.cuadres += 1;
    prev.venta += rs[i].totalVenta;
    prev.salario += rs[i].salarioReal;
    depMap.set(nombre, prev);
  });

  return {
    mes,
    etiqueta: format(new Date(`${mes}-01T12:00:00`), "MMMM yyyy", { locale: es }),
    creado: new Date().toISOString(),
    totales: {
      cuadres: cuadres.length,
      venta: rs.reduce((s, r) => s + r.totalVenta, 0),
      costo: rs.reduce((s, r) => s + r.totalCosto, 0),
      gananciaBruta: rs.reduce((s, r) => s + r.gananciaTotal, 0),
      gananciaNeta: rs.reduce((s, r) => s + r.gananciaNeta, 0),
      gastos: rs.reduce((s, r) => s + r.totalGastos, 0),
      salarios: rs.reduce((s, r) => s + r.salarioBruto, 0),
      propinas: rs.reduce((s, r) => s + r.propina, 0),
      faltantes: rs.reduce((s, r) => s + r.descuentoFalta + r.deudaDependiente, 0),
    },
    gastosPorCategoria,
    porPunto: PUNTOS.map((p) =>
      resumirPunto(
        p,
        cuadres.filter((c) => c.puntoVenta === p)
      )
    ),
    porDependiente: [...depMap.values()].sort((a, b) => b.venta - a.venta),
    diasNoTrabajados: [...diasNoTrabajados].sort(),
  };
}

export function generarPDFMensual(rep: ReporteMensual) {
  const row = (l: string, v: string, cls = "") =>
    `<div class="row ${cls}"><span>${esc(l)}</span><span class="v">${v}</span></div>`;

  const kpi = (l: string, v: string, cls = "") =>
    `<div class="kpi ${cls}"><div class="kl">${esc(l)}</div><div class="kv">${v}</div></div>`;

  const puntoBloques = rep.porPunto
    .map(
      (p) => `
    <section class="page">
      <h2>${esc(p.punto)}</h2>
      <div class="kpis">
        ${kpi("Cuadres", String(p.cuadres))}
        ${kpi("Días trabajados", String(p.dias))}
        ${kpi("Venta", fmt(p.venta))}
        ${kpi("Costo", fmt(p.costo))}
        ${kpi("Ganancia bruta", fmt(p.gananciaBruta))}
        ${kpi("Ganancia neta", fmt(p.gananciaNeta), "ok")}
      </div>
      <div class="card avoid">
        ${row("Gastos", fmt(p.gastos))}
        ${row("Salarios", fmt(p.salarios))}
        ${row("Propinas", fmt(p.propinas))}
        ${row("Faltantes", fmt(p.faltantes))}
      </div>
      <h3>Productos más vendidos</h3>
      <table>
        <thead><tr><th>Producto</th><th class="r">Cant.</th><th class="r">Importe</th><th class="r">Ganancia</th></tr></thead>
        <tbody>
          ${
            p.topProductos.length
              ? p.topProductos
                  .map(
                    (t) =>
                      `<tr><td>${esc(t.nombre)}</td><td class="r">${n2(
                        t.cantidad
                      )}</td><td class="r b">${fmt(t.importe)}</td><td class="r">${fmt(
                        t.ganancia
                      )}</td></tr>`
                  )
                  .join("")
              : `<tr><td colspan="4">Sin ventas registradas</td></tr>`
          }
        </tbody>
      </table>
    </section>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Reporte mensual ${esc(rep.etiqueta)}</title>
<style>
  @page{size:A4;margin:14mm}
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:20px;color:#1c1917;background:#fff}
  header.top{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:3px solid #0f766e;padding-bottom:8px;margin-bottom:14px}
  h1{font-size:20px;margin:0}
  .sub{color:#78716c;font-size:11px;text-transform:capitalize}
  h2{font-size:14px;margin:18px 0 8px;text-transform:capitalize;background:#f0fdfa;color:#0f766e;border-left:4px solid #0f766e;padding:5px 8px;border-radius:4px}
  h3{font-size:12px;margin:12px 0 6px;color:#44403c}
  section{break-inside:avoid;page-break-inside:avoid}
  section.page{break-before:page;page-break-before:always}
  .avoid,table,thead,tr,.card,.kpis,.kpi{break-inside:avoid;page-break-inside:avoid}
  thead{display:table-header-group}
  tr{page-break-inside:avoid}
  .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}
  .kpi{border:1px solid #e7e5e4;border-radius:8px;padding:6px 8px;background:#fafaf9}
  .kpi .kl{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#78716c}
  .kpi .kv{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
  .kpi.ok .kv{color:#047857}
  .card{border:1px solid #e7e5e4;border-radius:8px;padding:8px 12px;margin-bottom:8px}
  .row{display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0;border-bottom:1px dashed #f5f5f4}
  .row:last-child{border-bottom:0} .row.total{font-weight:700;font-size:13px} .row.ok{color:#047857}
  .v{font-variant-numeric:tabular-nums;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
  th,td{border:1px solid #e7e5e4;padding:4px 6px;text-align:left}
  th{background:#f5f5f4;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em}
  tbody tr:nth-child(even){background:#fafaf9}
  .r{text-align:right;font-variant-numeric:tabular-nums} .b{font-weight:700}
  .footer{margin-top:22px;display:flex;justify-content:space-between;font-size:10px;color:#78716c;border-top:1px solid #e7e5e4;padding-top:6px}
  .btn{position:fixed;top:12px;right:12px;padding:8px 14px;border-radius:8px;border:0;background:#0f766e;color:#fff;font-weight:600;cursor:pointer}
  @media print{.btn{display:none} body{padding:0}}
</style></head>
<body>
<button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button>
<header class="top">
  <div>
    <h1>AlFaro Café · Reporte mensual</h1>
    <div class="sub">${esc(rep.etiqueta)}</div>
  </div>
  <div class="sub">Generado ${format(new Date(rep.creado), "dd/MM/yyyy HH:mm")}</div>
</header>

<section>
  <h2>Resumen general</h2>
  <div class="kpis">
    ${kpi("Cuadres del mes", String(rep.totales.cuadres))}
    ${kpi("Venta total", fmt(rep.totales.venta))}
    ${kpi("Costo total", fmt(rep.totales.costo))}
    ${kpi("Ganancia bruta", fmt(rep.totales.gananciaBruta))}
    ${kpi("Gastos totales", fmt(rep.totales.gastos))}
    ${kpi("Ganancia neta", fmt(rep.totales.gananciaNeta), "ok")}
  </div>
  <div class="card">
    ${row("Salarios", fmt(rep.totales.salarios))}
    ${row("Propinas", fmt(rep.totales.propinas))}
    ${row("Faltantes", fmt(rep.totales.faltantes))}
    ${row("Ganancia neta", fmt(rep.totales.gananciaNeta), "total ok")}
  </div>
</section>

<section>
  <h2>Gastos por categoría</h2>
  <div class="card">
    ${
      Object.entries(rep.gastosPorCategoria).length
        ? Object.entries(rep.gastosPorCategoria)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => row(k, fmt(v)))
            .join("")
        : row("Sin gastos registrados", "—")
    }
  </div>
</section>

${puntoBloques}

<section class="page">
  <h2>Dependientes</h2>
  <table>
    <thead><tr><th>Dependiente</th><th class="r">Cuadres</th><th class="r">Venta</th><th class="r">Salario</th></tr></thead>
    <tbody>
      ${rep.porDependiente
        .map(
          (d) =>
            `<tr><td>${esc(d.nombre)}</td><td class="r">${d.cuadres}</td><td class="r b">${fmt(
              d.venta
            )}</td><td class="r">${fmt(d.salario)}</td></tr>`
        )
        .join("")}
    </tbody>
  </table>

  ${
    rep.diasNoTrabajados.length
      ? `<h3>Días no trabajados (${rep.diasNoTrabajados.length})</h3><div class="card">${row(
          rep.diasNoTrabajados
            .map((d) => format(new Date(`${d}T12:00:00`), "dd/MM"))
            .join(", "),
          String(rep.diasNoTrabajados.length)
        )}</div>`
      : ""
  }

  <div class="footer"><span>AlFaro Café · ${esc(rep.etiqueta)}</span><span>Firma: ____________________</span></div>
</section>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Habilita las ventanas emergentes para generar el PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export const mesDeCuadre = (c: Cuadre) => format(new Date(fechaTrabajada(c)), "yyyy-MM");
