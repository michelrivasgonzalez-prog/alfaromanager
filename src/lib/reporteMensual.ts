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

  const puntoBloques = rep.porPunto
    .map(
      (p) => `
    <h2>${esc(p.punto)}</h2>
    <div class="card">
      ${row("Cuadres", String(p.cuadres))}
      ${row("Días trabajados", String(p.dias))}
      ${row("Venta", fmt(p.venta))}
      ${row("Costo", fmt(p.costo))}
      ${row("Ganancia bruta", fmt(p.gananciaBruta))}
      ${row("Gastos", fmt(p.gastos))}
      ${row("Salarios", fmt(p.salarios))}
      ${row("Propinas", fmt(p.propinas))}
      ${row("Faltantes", fmt(p.faltantes))}
      ${row("Ganancia neta", fmt(p.gananciaNeta), "total ok")}
    </div>
    <table>
      <thead><tr><th>Producto más vendido</th><th class="r">Cant.</th><th class="r">Importe</th><th class="r">Ganancia</th></tr></thead>
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
    </table>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Reporte mensual ${esc(rep.etiqueta)}</title>
<style>
  *{box-sizing:border-box} body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#1c1917}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:20px 0 8px;text-transform:capitalize;border-bottom:2px solid #e7e5e4;padding-bottom:4px}
  .sub{color:#78716c;font-size:12px;margin-bottom:12px;text-transform:capitalize}
  .card{border:1px solid #e7e5e4;border-radius:10px;padding:10px 12px;margin-bottom:8px}
  .row{display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px dashed #f5f5f4}
  .row:last-child{border-bottom:0} .row.total{font-weight:700;font-size:13px} .row.ok{color:#047857}
  .v{font-variant-numeric:tabular-nums;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
  th,td{border:1px solid #e7e5e4;padding:4px 6px;text-align:left}
  th{background:#fafaf9;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  .r{text-align:right;font-variant-numeric:tabular-nums} .b{font-weight:700}
  .footer{margin-top:24px;display:flex;justify-content:space-between;font-size:10px;color:#78716c}
  .btn{position:fixed;top:12px;right:12px;padding:8px 14px;border-radius:8px;border:0;background:#0f766e;color:#fff;font-weight:600}
  @media print{.btn{display:none}}
</style></head>
<body>
<button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button>
<h1>AlFaro Café · Reporte mensual</h1>
<div class="sub">${esc(rep.etiqueta)} · generado ${format(
    new Date(rep.creado),
    "dd/MM/yyyy HH:mm"
  )}</div>

<h2>Resumen general</h2>
<div class="card">
  ${row("Cuadres del mes", String(rep.totales.cuadres))}
  ${row("Venta total", fmt(rep.totales.venta))}
  ${row("Costo total", fmt(rep.totales.costo))}
  ${row("Ganancia bruta", fmt(rep.totales.gananciaBruta))}
  ${row("Gastos totales", fmt(rep.totales.gastos))}
  ${row("Salarios", fmt(rep.totales.salarios))}
  ${row("Propinas", fmt(rep.totales.propinas))}
  ${row("Faltantes", fmt(rep.totales.faltantes))}
  ${row("Ganancia neta", fmt(rep.totales.gananciaNeta), "total ok")}
</div>

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

${puntoBloques}

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
    ? `<h2>Días no trabajados</h2><div class="card">${row(
        rep.diasNoTrabajados
          .map((d) => format(new Date(`${d}T12:00:00`), "dd/MM"))
          .join(", "),
        String(rep.diasNoTrabajados.length)
      )}</div>`
    : ""
}

<div class="footer"><span>AlFaro Café</span><span>Firma: ____________________</span></div>
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
