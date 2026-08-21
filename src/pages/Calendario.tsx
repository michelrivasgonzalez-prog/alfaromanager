import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  
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
  const [diaSel, setDiaSel] = useState<string | null>(null);

  const noTrabajados = settings.diasNoTrabajados ?? [];
  const perPunto = settings.diasNoTrabajadosPunto ?? {};
  const listaPunto = (p: "Cafetería" | "Mipyme") => perPunto[p] ?? [];
  const esNoTrab = (k: string, p: "Cafetería" | "Mipyme") =>
    noTrabajados.includes(k) || listaPunto(p).includes(k);

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

  // Solo meses con cuadres (más el mes actual, para poder marcar días).
  const meses = useMemo(() => {
    const set = new Set<string>([format(startOfMonth(new Date()), "yyyy-MM")]);
    for (const k of porDia.keys()) set.add(k.slice(0, 7));
    return Array.from(set)
      .sort()
      .map((m) => startOfMonth(new Date(`${m}-01T00:00:00`)));
  }, [porDia]);

  const [mesIdx, setMesIdx] = useState(() => Math.max(0, meses.length - 1));
  const idx = Math.min(mesIdx, meses.length - 1);
  const mes = meses[idx] ?? startOfMonth(new Date());

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


  /** Marca / desmarca "día no trabajado" para un punto de venta concreto. */
  const toggleNoTrabajado = async (k: string, punto: "Cafetería" | "Mipyme") => {
    const otro = punto === "Cafetería" ? "Mipyme" : "Cafetería";
    const marcado = esNoTrab(k, punto);
    let global = [...noTrabajados];
    const per: Record<string, string[]> = {
      "Cafetería": [...listaPunto("Cafetería")],
      "Mipyme": [...listaPunto("Mipyme")],
    };

    if (marcado) {
      if (global.includes(k)) {
        // Estaba marcado para ambos: se conserva solo en el otro punto.
        global = global.filter((x) => x !== k);
        if (!per[otro].includes(k)) per[otro].push(k);
      }
      per[punto] = per[punto].filter((x) => x !== k);
    } else {
      per[punto] = [...per[punto], k];
      if (per[otro].includes(k)) {
        // Ambos puntos → se guarda como día global.
        per["Cafetería"] = per["Cafetería"].filter((x) => x !== k);
        per["Mipyme"] = per["Mipyme"].filter((x) => x !== k);
        if (!global.includes(k)) global.push(k);
      }
    }

    updateSettings({
      diasNoTrabajados: global,
      diasNoTrabajadosPunto: per as any,
    });
    try {
      await pushSettings();
      toast.success(
        marcado ? `${punto}: día reabierto` : `${punto}: día no trabajado`
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
          <Button
            variant="ghost"
            size="icon"
            disabled={idx <= 0}
            onClick={() => setMesIdx(idx - 1)}
          >
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
          <Button
            variant="ghost"
            size="icon"
            disabled={idx >= meses.length - 1}
            onClick={() => setMesIdx(idx + 1)}
          >
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
              <div className="grid grid-cols-2 gap-2">
                {(["Cafetería", "Mipyme"] as const).map((p) => {
                  const marcado = esNoTrab(diaSel, p);
                  const tieneCuadre = cuadresDia.some((c) => c.puntoVenta === p);
                  return (
                    <Button
                      key={p}
                      variant={marcado ? "outline" : "ghost"}
                      className={`w-full rounded-xl text-xs ${marcado ? "" : "text-destructive"}`}
                      onClick={() => toggleNoTrabajado(diaSel, p)}
                      disabled={tieneCuadre && !marcado}
                    >
                      {marcado ? (
                        <>
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Reabrir {p}
                        </>
                      ) : (
                        <>
                          <Ban className="mr-1.5 h-3.5 w-3.5" /> No trabajado {p}
                        </>
                      )}
                    </Button>
                  );
                })}
              </div>
            )}
            {diaSel && cuadresDia.length > 0 && (
              <p className="text-center text-[10px] text-muted-foreground">
                Un punto con cuadre en este día no se puede marcar como no trabajado.
              </p>
            )}

          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
