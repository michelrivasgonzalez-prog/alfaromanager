import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Cuadre, calcCuadre } from "@/store/cuadreStore";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const fmt = (n: number) =>
  `$${n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function generarPDF(c: Cuadre) {
  const doc = new jsPDF();
  const r = calcCuadre(c);

  doc.setFillColor(75, 54, 33);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text("AlFaroCafé · Cuadre de turno", 14, 14);
  doc.setFontSize(10);
  doc.text(
    `${format(new Date(c.fecha), "dd MMM yyyy HH:mm", { locale: es })} · ${
      c.dependiente
    }`,
    14,
    22
  );

  doc.setTextColor(0, 0, 0);
  let y = 36;

  autoTable(doc, {
    startY: y,
    head: [["Producto", "Inicio", "Entr.", "Trasl.", "Total", "Final", "Precio", "Importe", "Costo", "Ganancia"]],
    body: r.productos.map((p) => [
      p.nombre, p.inicio, p.entradas, p.traslados, p.total, p.final,
      fmt(p.precio), fmt(p.importe), fmt(p.costoTotal), fmt(p.ganancia),
    ]),
    theme: "striped",
    headStyles: { fillColor: [6, 95, 70] },
    styles: { fontSize: 8 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  autoTable(doc, {
    startY: y,
    head: [["Categoría", "Descripción", "Monto"]],
    body: c.gastos.map((g) => [g.categoria, g.descripcion, fmt(g.monto)]),
    foot: [["", "Total", fmt(r.totalGastos)]],
    theme: "striped",
    headStyles: { fillColor: [75, 54, 33] },
    footStyles: { fillColor: [180, 50, 50], textColor: 255 },
    styles: { fontSize: 9 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  const resumen: [string, string][] = [
    ["Venta total", fmt(r.totalVenta)],
    ["Costo total", fmt(r.totalCosto)],
    ["Ganancia bruta", fmt(r.gananciaTotal)],
    ["Total gastos", fmt(r.totalGastos)],
    ["Efectivo a depositar", fmt(r.efectivoADepositar)],
    ["Efectivo en caja", fmt(r.efectivoEnCaja)],
    ["Diferencia", fmt(r.diferencia)],
    ["Salario bruto", fmt(r.salarioBruto)],
    ["Propina", fmt(r.propina)],
    ["Descuento por faltante", fmt(r.descuentoFalta)],
    ["Salario real", fmt(r.salarioReal)],
    ["Ganancia neta", fmt(r.gananciaNeta)],
  ];
  autoTable(doc, {
    startY: y,
    head: [["Resumen", "Valor"]],
    body: resumen,
    theme: "grid",
    headStyles: { fillColor: [6, 95, 70] },
    styles: { fontSize: 10 },
  });

  doc.save(`cuadre-${c.dependiente || "alfaro"}-${format(new Date(c.fecha), "yyyyMMdd-HHmm")}.pdf`);
}
