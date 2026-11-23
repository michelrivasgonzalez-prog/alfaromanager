import { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Home, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const STEPS = [
  "Datos del turno",
  "Inventario inicial",
  "Entradas y traslados",
  "Inventario final",
  "Resultados",
  "Gastos",
  "Cuadre de efectivo",
  "Diferencia de caja",
  "Salario",
  "Resumen",
];

export default function StepShell({
  children,
  title,
  onNextDisabled,
  onNext,
  hideNext,
}: {
  children: ReactNode;
  title?: string;
  onNextDisabled?: boolean;
  onNext?: () => void;
  hideNext?: boolean;
}) {
  const { step } = useParams();
  const nav = useNavigate();
  const idx = Math.max(1, Math.min(10, Number(step) || 1));
  const stepLabel = title ?? STEPS[idx - 1];

  const goPrev = () => (idx === 1 ? nav("/") : nav("/cuadre/" + (idx - 1)));
  const goNext = () => {
    // Se respeta exactamente el callback y la validación del paso actual.
    onNext?.();
    if (idx < 10) nav("/cuadre/" + (idx + 1));
  };

  return (
    <div className="space-y-4 pb-2">
      <header className="alfaro-page-header space-y-4">
        <div className="flex items-start gap-2.5">
          <Button type="button" variant="outline" size="icon"
            onClick={goPrev} title="Paso anterior" aria-label="Paso anterior"
            className="h-10 w-10 shrink-0 rounded-xl">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-secondary dark:text-emerald-300">
              <ClipboardCheck className="h-4 w-4" /> Cuadre Oficial
            </div>
            <h1 className="mt-0.5 text-lg font-extrabold tracking-tight text-foreground sm:text-xl">{stepLabel}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Paso {idx} de {STEPS.length}</p>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={() => nav("/")}
            className="h-10 w-10 shrink-0 rounded-xl" aria-label="Salir al Inicio" title="Volver al Inicio">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-10 gap-1" role="progressbar"
          aria-label="Progreso del Cuadre Oficial" aria-valuemin={1}
          aria-valuemax={STEPS.length} aria-valuenow={idx}>
          {STEPS.map((label, i) => (
            <div key={label} className="flex min-w-0 flex-col items-center gap-1"
              title={"Paso " + (i + 1) + ": " + label}>
              <span aria-current={i + 1 === idx ? "step" : undefined}
                className={"flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold tabular-nums sm:h-8 sm:w-8 sm:text-xs " +
                  (i + 1 < idx
                    ? "border-secondary bg-secondary text-secondary-foreground"
                    : i + 1 === idx
                      ? "border-secondary bg-secondary/10 text-secondary ring-2 ring-secondary/30 dark:text-emerald-300"
                      : "border-border bg-card text-muted-foreground")}>
                {i + 1 < idx ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
            </div>
          ))}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-secondary transition-all"
            style={{ width: (idx / STEPS.length * 100) + "%" }} />
        </div>
      </header>

      <motion.div key={idx} initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
        className="space-y-4">
        {children}
      </motion.div>

      {!hideNext && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 rounded-2xl border border-border/60 bg-card/95 p-2.5 shadow-elegant backdrop-blur-lg">
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button type="button" variant="outline" onClick={() => nav("/")}
              className="h-12 rounded-xl px-3 text-xs sm:text-sm">
              <Home className="mr-1.5 h-4 w-4" /> Inicio
            </Button>
            <Button type="button" onClick={goNext} disabled={onNextDisabled}
              className="h-12 min-w-0 rounded-xl bg-secondary text-sm font-semibold text-secondary-foreground hover:bg-secondary/90 sm:text-base">
              {idx === 10 ? "Finalizar" : "Continuar"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
