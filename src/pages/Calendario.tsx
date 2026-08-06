import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Store,
  FileDown,
  Eye,
  Ban,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCuadreStore, calcCuadre, Cuadre } from "@/store/cuadreStore";
import { generarPDF } from "@/lib/pdf";
import { pushSettings } from "@/lib/sync";
import { formatDiasTrabajados } from "@/lib/dias";

const key = (d: Date | string) => format(new Date(d), "yyyy-MM-dd");
const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-ES")}`;

export default function Calendario() {
  const nav = useNavigate();
  const { history, settings, updateSettings } = useCuadreStore();
  const [mes, setMes] = useState(() => startOfMonth(new Date()));
  const [diaSel, setDiaSel] = useState<string | null>(null);

  const noTrabajados = settings.diasNoTrabajados ?? [];

  // Mapa día -> cuadres que incluyen ese día trabajado
  const porDia = useMemo(() => {
    const m = new Map<string, Cuadre[]>();
    for (const c of history) {
      const dias = c.diasTrabajados?.length ? c.diasTrabajados : [c.fecha];
      for (const d of dias) {
        const k = key(d);
        if (!m.has(k)) m.set(k, []);
        if (!m.get(k)!.some((x) => x.id === c.id)) m.get(k)!.push(c);
      }
    }
    return m;
  }, [history]);

  const dias = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(mes), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(mes), { weekStartsOn: 1 }),
      }),
    [mes]
  );

  const cuadresMes = useMemo(
    () =>
      Array.from(porDia.entries())
        .filter(([k]) => isSameMonth(new Date(k), mes))
        .flatMap(([, cs]) => cs)
        .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i),
    [porDia, mes]
  );
  const ventaMes = cuadresMes.reduce((s, c) => s + calcCuadre(c).totalVenta, 0);

  const toggleNoTrabajado = async (k: string) => {
    const next = noTrabajados.includes(k)
      ? noTrabajados.filter((x) => x !== k)
      : [...noTrabajados, k];
    updateSettings({ diasNoTrabajados: next });
    try {
      await pushSettings();
      toast.success(
        noTrabajados.includes(k) ? "Día reabierto" : "Día marcado como no trabajado"
      );
    } catch {
      toast.error("Guardado local; se subirá al reconectar");
    }
  };

  const cuadresDia = diaSel ? porDia.get(diaSel) ?? [] : [];

  return (
    <div className="space-y-4 pb-24">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-soft">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-primary">Calendario de cuadres</h1>
          <p className="text-xs text-muted-foreground">Cafetería y Mipyme por día trabajado</p>
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setMes(addMonths(mes, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <div className="text-sm font-bold capitalize">
              {format(mes, "MMMM yyyy", { locale: es })}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {cuadresMes.length} cuadre(s) · {fmt(ventaMes)} en ventas
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setMes(addMonths(mes, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-muted-foreground">
          {["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {dias.map((d) => {
            const k = key(d);
            const cs = porDia.get(k) ?? [];
            const fuera = !isSameMonth(d, mes);
            const noTrab = noTrabajados.includes(k);
            const tieneCafe = cs.some((c) => c.puntoVenta === "Cafetería");
            const tienePyme = cs.some((c) => c.puntoVenta === "Mipyme");
            return (
              <button
                key={k}
                onClick={() => setDiaSel(k)}
                className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-xs transition-colors ${
                  fuera ? "opacity-35" : ""
                } ${
                  noTrab
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : cs.length > 0
                    ? "border-secondary/40 bg-secondary/10 font-semibold"
                    : "border-border bg-card text-muted-foreground"
                } ${isToday(d) ? "ring-2 ring-primary" : ""}`}
              >
                <span>{format(d, "d")}</span>
                <span className="mt-0.5 flex h-2 items-center gap-0.5">
                  {tieneCafe && <span className="h-1.5 w-1.5 rounded-full bg-secondary" />}
                  {tienePyme && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  {noTrab && <Ban className="h-2.5 w-2.5" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" /> Cafetería
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Mipyme
          </span>
          <span className="inline-flex items-center gap-1">
            <Ban className="h-3 w-3 text-destructive" /> No trabajado
          </span>
        </div>
      </div>

      <Dialog open={!!diaSel} onOpenChange={(o) => !o && setDiaSel(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {diaSel ? format(new Date(diaSel), "EEEE dd 'de' MMMM yyyy", { locale: es }) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {cuadresDia.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No hay cuadres registrados en este día.
              </div>
            )}
            {cuadresDia.map((c) => {
              const r = calcCuadre(c);
              const Icon = c.puntoVenta === "Cafetería" ? Coffee : Store;
              return (
                <div key={c.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <Icon className="h-3.5 w-3.5" /> {c.puntoVenta}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.dependiente || "Sin nombre"} · {formatDiasTrabajados(c.diasTrabajados)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase text-muted-foreground">Venta</div>
                      <div className="font-mono text-sm font-bold text-secondary tabular-nums">
                        {fmt(r.totalVenta)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-lg"
                      onClick={() => nav("/historial")}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" /> Ver en historial
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      onClick={() => generarPDF(c)}
                    >
                      <FileDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}

            {diaSel && (
              <Button
                variant={noTrabajados.includes(diaSel) ? "outline" : "ghost"}
                className={`w-full rounded-xl ${
                  noTrabajados.includes(diaSel) ? "" : "text-destructive"
                }`}
                onClick={() => toggleNoTrabajado(diaSel)}
                disabled={cuadresDia.length > 0 && !noTrabajados.includes(diaSel)}
              >
                {noTrabajados.includes(diaSel) ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Quitar "día no trabajado"
                  </>
                ) : (
                  <>
                    <Ban className="mr-2 h-4 w-4" /> Marcar día no trabajado
                  </>
                )}
              </Button>
            )}
            {diaSel && cuadresDia.length > 0 && !noTrabajados.includes(diaSel) && (
              <p className="text-center text-[10px] text-muted-foreground">
                No se puede marcar como no trabajado: hay cuadres en este día.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
