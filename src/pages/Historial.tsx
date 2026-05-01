import { useState } from "react";
import {
  useCuadreStore,
  calcCuadre,
  Cuadre,
  DENOMINACIONES,
} from "@/store/cuadreStore";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  FileDown,
  Trash2,
  History as HistoryIcon,
  Eye,
} from "lucide-react";
import { generarPDF } from "@/lib/pdf";
import { deleteCuadreRemote } from "@/lib/sync";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const fmt = (n: number) => `$${n.toLocaleString("es-ES")}`;

export default function Historial() {
  const { history, deleteHistory } = useCuadreStore();
  const { role } = useAuth();
  const canDelete = role === "admin";
  const canPDF = role === "admin" || role === "duena";
  const [detalle, setDetalle] = useState<Cuadre | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Historial de cuadres</h1>
      {history.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <HistoryIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Aún no hay cuadres guardados.
          </p>
        </div>
      )}
      {history.map((c) => {
        const r = calcCuadre(c);
        return (
          <div
            key={c.id}
            className="rounded-2xl border border-border bg-card p-4 shadow-soft"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{c.dependiente || "Sin nombre"}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(c.fecha), "dd MMM yyyy · HH:mm", { locale: es })} ·{" "}
                  {c.diasTrabajados.length} día(s)
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Ganancia neta</div>
                <div className="font-mono text-lg font-bold text-secondary">
                  {fmt(r.gananciaNeta)}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <Mini label="Venta" value={fmt(r.totalVenta)} />
              <Mini label="Gastos" value={fmt(r.totalGastos)} />
              <Mini
                label="Diferencia"
                value={fmt(r.diferencia)}
                tone={r.diferencia < 0 ? "danger" : r.diferencia > 0 ? "ok" : undefined}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setDetalle(c)}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Ver
              </Button>
              {canPDF && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => generarPDF(c)}
              >
                <FileDown className="mr-1.5 h-3.5 w-3.5" /> PDF
              </Button>
              )}
              {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  if (!confirm("¿Eliminar este cuadre del historial?")) return;
                  deleteHistory(c.id);
                  deleteCuadreRemote(c.id).catch(console.error);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              )}
            </div>
          </div>
        );
      })}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalle del cuadre
              {detalle ? ` · ${detalle.dependiente || "Sin nombre"}` : ""}
            </DialogTitle>
          </DialogHeader>
          {detalle && <CuadreDetalle c={detalle} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CuadreDetalle({ c }: { c: Cuadre }) {
  const r = calcCuadre(c);
  const totalPagado = Object.entries(c.salarioDenominaciones).reduce(
    (s, [b, n]) => s + Number(b) * n,
    0
  );
  return (
    <div className="space-y-4 text-sm">
      <div className="text-xs text-muted-foreground">
        {format(new Date(c.fecha), "dd MMM yyyy · HH:mm", { locale: es })} ·{" "}
        {c.puntoVenta} · {c.diasTrabajados.length} día(s)
      </div>

      {/* IPV */}
      <Section title="IPV — Productos">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Producto</th>
                <th className="px-2 py-1.5 text-right">Ini</th>
                <th className="px-2 py-1.5 text-right">Ent</th>
                <th className="px-2 py-1.5 text-right">Tras</th>
                <th className="px-2 py-1.5 text-right">Tot</th>
                <th className="px-2 py-1.5 text-right">Fin</th>
                <th className="px-2 py-1.5 text-right">Vend</th>
                <th className="px-2 py-1.5 text-right">Importe</th>
                <th className="px-2 py-1.5 text-right">Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {r.productos.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-2 py-1.5">{p.nombre}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.inicio}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.entradas}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.traslados}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.total}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.final}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                    {p.venta}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmt(p.importe)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-secondary">
                    {fmt(p.ganancia)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td colSpan={7} className="px-2 py-1.5 text-right">
                  Totales
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmt(r.totalVenta)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-secondary">
                  {fmt(r.gananciaTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      {/* Gastos */}
      <Section title={`Gastos (${c.gastos.length})`}>
        {c.gastos.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sin gastos</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Categoría</th>
                <th className="px-2 py-1.5 text-left">Tipo</th>
                <th className="px-2 py-1.5 text-left">Recibe</th>
                <th className="px-2 py-1.5 text-left">Detalle</th>
                <th className="px-2 py-1.5 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {c.gastos.map((g) => (
                <tr key={g.id} className="border-t border-border">
                  <td className="px-2 py-1.5">{g.categoria}</td>
                  <td className="px-2 py-1.5">{g.tipo}</td>
                  <td className="px-2 py-1.5">{g.nombre || "—"}</td>
                  <td className="px-2 py-1.5">
                    {g.tipo === "Producto"
                      ? `${g.productoNombre ?? g.descripcion} (${g.cantidad} × ${fmt(
                          g.precio || 0
                        )})`
                      : g.descripcion}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                    {fmt(g.monto)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-semibold">
                <td colSpan={4} className="px-2 py-1.5 text-right">
                  Total
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmt(r.totalGastos)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </Section>

      {/* Caja + denominación */}
      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Denominación recibida">
          <DenomList den={c.denominaciones} />
          <Row label="Efectivo en caja" value={fmt(r.efectivoEnCaja)} bold />
        </Section>
        <Section title="Resumen de caja">
          <Row label="Venta total" value={fmt(r.totalVenta)} />
          <Row label="− Total gastos" value={fmt(r.totalGastos)} />
          <Row label="= A depositar" value={fmt(r.efectivoADepositar)} />
          <Row label="Efectivo en caja" value={fmt(r.efectivoEnCaja)} />
          <Row
            label={
              r.diferencia < 0
                ? "Faltante"
                : r.diferencia > 0
                ? "Sobrante / propina"
                : "Cuadrado"
            }
            value={fmt(r.diferencia)}
            tone={r.diferencia < 0 ? "danger" : r.diferencia > 0 ? "ok" : undefined}
            bold
          />
        </Section>
      </div>

      {/* Salario */}
      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Salario">
          <Row label="Días trabajados" value={String(r.diasCount)} />
          <Row label="Salario base/día" value={fmt(c.salarioBase)} />
          <Row label="Salario bruto" value={fmt(r.salarioBruto)} />
          {r.propina > 0 && (
            <Row label="+ Propina" value={fmt(r.propina)} tone="ok" />
          )}
          {r.descuentoFalta > 0 && (
            <Row
              label="− Descuento por faltante"
              value={fmt(r.descuentoFalta)}
              tone="danger"
            />
          )}
          <Row label="Salario real (pagado)" value={fmt(r.salarioReal)} bold tone="ok" />
        </Section>
        <Section title="Pago — billetes entregados">
          <DenomList den={c.salarioDenominaciones} />
          <Row label="Total entregado" value={fmt(totalPagado)} bold />
        </Section>
      </div>

      {/* Resumen final */}
      <Section title="Resumen final">
        <Row label="Venta total" value={fmt(r.totalVenta)} />
        <Row label="Costo total" value={fmt(r.totalCosto)} />
        <Row label="Ganancia bruta" value={fmt(r.gananciaTotal)} />
        <Row label="− Gastos (Local + Yanitza)" value={fmt(
          (r.gastosPorCategoria["Local"] || 0) + (r.gastosPorCategoria["Yanitza"] || 0)
        )} />
        <Row label="− Salario base" value={fmt(r.salarioBruto)} />
        <Row label="Ganancia neta" value={fmt(r.gananciaNeta)} bold tone="ok" />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-mono tabular-nums ${bold ? "font-bold" : ""} ${
          tone === "ok"
            ? "text-secondary"
            : tone === "danger"
            ? "text-destructive"
            : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function DenomList({ den }: { den: Record<string, number> }) {
  const rows = DENOMINACIONES.map((d) => ({ d, n: den[String(d)] || 0 })).filter(
    (x) => x.n > 0
  );
  if (rows.length === 0)
    return <div className="text-xs text-muted-foreground">—</div>;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {rows.map(({ d, n }) => (
        <span
          key={d}
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums"
        >
          ${d} × {n} = {fmt(d * n)}
        </span>
      ))}
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="rounded-xl bg-muted/60 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div
        className={`font-mono font-semibold tabular-nums ${
          tone === "ok" ? "text-secondary" : tone === "danger" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
