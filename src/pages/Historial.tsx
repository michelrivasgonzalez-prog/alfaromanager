import { useCuadreStore, calcCuadre } from "@/store/cuadreStore";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileDown, Trash2, History as HistoryIcon } from "lucide-react";
import { generarPDF } from "@/lib/pdf";
import { deleteCuadreRemote } from "@/lib/sync";
import { useAuth } from "@/hooks/useAuth";

const fmt = (n: number) => `$${n.toLocaleString("es-ES")}`;

export default function Historial() {
  const { history, deleteHistory } = useCuadreStore();
  const { role } = useAuth();
  const canDelete = role === "admin";
  const canPDF = role === "admin" || role === "duena";

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
