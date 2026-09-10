import { format } from "date-fns";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDinero, fmtCant } from "@/lib/format";
import { generarPDFMensual, type ReporteMensual } from "@/lib/reporteMensual";

const fmt = fmtDinero;

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`font-mono text-sm font-bold tabular-nums ${
          tone === "ok" ? "text-secondary" : tone === "danger" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-border/60 py-1 text-xs last:border-0">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export default function ReporteMensualCards({ rep }: { rep: ReporteMensual }) {
  const t = rep.totales;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold capitalize text-primary">{rep.etiqueta}</div>
          <div className="text-[11px] text-muted-foreground">
            Guardado {format(new Date(rep.creado), "dd/MM/yyyy HH:mm")}
          </div>
        </div>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => generarPDFMensual(rep)}>
          <FileDown className="mr-1 h-3.5 w-3.5" /> PDF
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
        <div className="mb-2 text-xs font-semibold">Resumen general</div>
        <div className="grid grid-cols-2 gap-2">
          <Kpi label="Cuadres" value={String(t.cuadres)} />
          <Kpi label="Venta total" value={fmt(t.venta)} />
          <Kpi label="Costo total" value={fmt(t.costo)} />
          <Kpi label="Ganancia bruta" value={fmt(t.gananciaBruta)} />
          <Kpi label="Gastos" value={fmt(t.gastos)} />
          <Kpi label="Ganancia neta" value={fmt(t.gananciaNeta)} tone="ok" />
        </div>
        <div className="mt-2">
          <Row label="Salarios" value={fmt(t.salarios)} />
          <Row label="Propinas" value={fmt(t.propinas)} />
          <Row label="Faltantes" value={fmt(t.faltantes)} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
        <div className="mb-1 text-xs font-semibold">Gastos por categoría</div>
        {Object.entries(rep.gastosPorCategoria).length === 0 ? (
          <div className="py-2 text-xs text-muted-foreground">Sin gastos registrados</div>
        ) : (
          Object.entries(rep.gastosPorCategoria)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => <Row key={k} label={k} value={fmt(v)} />)
        )}
      </div>

      {rep.porPunto.map((p) => (
        <div key={p.punto} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
          <div className="mb-2 text-xs font-bold text-primary">{p.punto}</div>
          <div className="grid grid-cols-2 gap-2">
            <Kpi label="Cuadres" value={String(p.cuadres)} />
            <Kpi label="Días" value={String(p.dias)} />
            <Kpi label="Venta" value={fmt(p.venta)} />
            <Kpi label="Costo" value={fmt(p.costo)} />
            <Kpi label="Ganancia bruta" value={fmt(p.gananciaBruta)} />
            <Kpi label="Ganancia neta" value={fmt(p.gananciaNeta)} tone="ok" />
          </div>
          <div className="mt-2">
            <Row label="Gastos" value={fmt(p.gastos)} />
            <Row label="Salarios" value={fmt(p.salarios)} />
            <Row label="Propinas" value={fmt(p.propinas)} />
            <Row label="Faltantes" value={fmt(p.faltantes)} />
          </div>
          <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Más vendidos
          </div>
          <div className="mt-1 space-y-1">
            {p.topProductos.length === 0 && (
              <div className="text-xs text-muted-foreground">Sin ventas registradas</div>
            )}
            {p.topProductos.map((tp) => (
              <div key={tp.nombre} className="rounded-lg border border-border bg-muted/30 px-2 py-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{tp.nombre}</span>
                  <span className="font-mono text-xs font-bold tabular-nums">{fmt(tp.importe)}</span>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span>
                    Cant. <b className="text-foreground">{fmtCant(tp.cantidad)}</b>
                  </span>
                  <span>
                    Ganancia <b className="text-secondary">{fmt(tp.ganancia)}</b>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
        <div className="mb-1 text-xs font-semibold">Dependientes</div>
        {rep.porDependiente.map((d) => (
          <div key={d.nombre} className="border-b border-dashed border-border/60 py-1.5 last:border-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-semibold">{d.nombre}</span>
              <span className="font-mono text-xs font-bold tabular-nums">{fmt(d.venta)}</span>
            </div>
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span>
                Cuadres <b className="text-foreground">{d.cuadres}</b>
              </span>
              <span>
                Salario <b className="text-foreground">{fmt(d.salario)}</b>
              </span>
            </div>
          </div>
        ))}
      </div>

      {rep.diasNoTrabajados.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
          <div className="mb-1 text-xs font-semibold">
            Días no trabajados ({rep.diasNoTrabajados.length})
          </div>
          <div className="text-xs text-muted-foreground">
            {rep.diasNoTrabajados
              .map((d) => format(new Date(`${d}T12:00:00`), "dd/MM"))
              .join(", ")}
          </div>
        </div>
      )}
    </div>
  );
}
