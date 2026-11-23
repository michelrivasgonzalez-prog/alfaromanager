import { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
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

  const goPrev = () => (idx === 1 ? nav("/") : nav(`/cuadre/${idx - 1}`));
  const goNext = () => {
    onNext?.();
    if (idx < 10) nav(`/cuadre/${idx + 1}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={goPrev} className="rounded-xl">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Paso {idx} de 10
          </div>
          <div className="text-base font-bold text-primary">{stepLabel}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => nav("/")} className="rounded-xl">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* progress */}
      <div className="flex gap-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-smooth ${
              i < idx ? "gradient-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <motion.div
        key={idx}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-4"
      >
        {children}
      </motion.div>

      {!hideNext && (
        <div className="sticky bottom-24 pt-2">
          <Button
            onClick={goNext}
            disabled={onNextDisabled}
            className="h-12 w-full rounded-2xl gradient-primary text-base font-semibold shadow-elegant"
          >
            {idx === 10 ? "Finalizar" : "Continuar"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
