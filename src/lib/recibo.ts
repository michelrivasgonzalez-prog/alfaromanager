import { format } from "date-fns";
import { es } from "date-fns/locale";
import logoUrl from "@/assets/alfaro-logo.jpg";

const fmt = (n: number) =>
  `$${Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]
  );

export type ReciboData = {
  numero: string;
  cliente: string;
  fecha: string;
  monto: number;
  deudaLabel: string;
  deudaTotal: number;
  saldoDeuda: number;
  usuario?: string | null;
  nota?: string | null;
};

/** Abre una ventana imprimible (se puede "Guardar como PDF") con el recibo de pago. */
export function imprimirRecibo(r: ReciboData) {
  const fechaTxt = format(new Date(r.fecha), "dd 'de' MMMM yyyy · HH:mm", { locale: es });
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Recibo ${esc(r.numero)} · ${esc(r.cliente)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:"Segoe UI",system-ui,sans-serif;margin:0;padding:24px;color:#1f2937;background:#f8fafc}
  .card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px}
  .head{display:flex;align-items:center;gap:12px;border-bottom:2px solid #0f766e;padding-bottom:12px}
  .head img{width:52px;height:52px;border-radius:12px;object-fit:cover}
  .brand{font-size:20px;font-weight:700;color:#0f766e;line-height:1.1}
  .sub{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em}
  h1{font-size:15px;margin:18px 0 4px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
  td{padding:7px 0;border-bottom:1px dashed #e5e7eb}
  td.r{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  .total{margin-top:16px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:12px;display:flex;justify-content:space-between;align-items:center}
  .total span{font-size:12px;color:#065f46;text-transform:uppercase;letter-spacing:.06em}
  .total b{font-size:22px;color:#065f46}
  .foot{margin-top:18px;font-size:11px;color:#6b7280;text-align:center;line-height:1.6}
  @media print{body{background:#fff;padding:0}.card{border:none}}
</style></head>
<body>
  <div class="card">
    <div class="head">
      <img src="${logoUrl}" alt="AlFaroCafé" />
      <div>
        <div class="brand">AlFaroCafé</div>
        <div class="sub">Recibo de pago Nº ${esc(r.numero)}</div>
      </div>
    </div>
    <h1>Datos del pago</h1>
    <table>
      <tr><td>Cliente</td><td class="r">${esc(r.cliente)}</td></tr>
      <tr><td>Fecha</td><td class="r">${esc(fechaTxt)}</td></tr>
      <tr><td>Deuda</td><td class="r">${esc(r.deudaLabel)}</td></tr>
      <tr><td>Total de la deuda</td><td class="r">${fmt(r.deudaTotal)}</td></tr>
      <tr><td>Saldo después del pago</td><td class="r">${fmt(r.saldoDeuda)}</td></tr>
      ${r.usuario ? `<tr><td>Atendido por</td><td class="r">${esc(r.usuario)}</td></tr>` : ""}
      ${r.nota ? `<tr><td>Nota</td><td class="r">${esc(r.nota)}</td></tr>` : ""}
    </table>
    <div class="total"><span>Importe abonado</span><b>${fmt(r.monto)}</b></div>
    <div class="foot">
      Gracias por su pago.<br />
      AlFaroCafé — Documento generado automáticamente.
    </div>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
