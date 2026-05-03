import { useState } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  length?: number;
  onComplete: (pin: string) => void;
  busy?: boolean;
  error?: string | null;
}

export function PinPad({ length = 6, onComplete, busy, error }: Props) {
  const [pin, setPin] = useState("");

  const press = (d: string) => {
    if (busy) return;
    if (pin.length >= length) return;
    const next = pin + d;
    setPin(next);
    if (next.length === length) {
      onComplete(next);
      setTimeout(() => setPin(""), 600);
    }
  };
  const back = () => {
    if (busy) return;
    setPin((p) => p.slice(0, -1));
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-3">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-4 w-4 rounded-full border-2 transition-smooth",
              i < pin.length
                ? "border-primary bg-primary"
                : "border-border bg-card",
              error && "border-destructive"
            )}
          />
        ))}
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => press(n)}
            className="h-16 rounded-2xl border border-border bg-card text-2xl font-semibold shadow-soft active:scale-95 transition-smooth"
          >
            {n}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => press("0")}
          className="h-16 rounded-2xl border border-border bg-card text-2xl font-semibold shadow-soft active:scale-95 transition-smooth"
        >
          0
        </button>
        <button
          type="button"
          onClick={back}
          className="flex h-16 items-center justify-center rounded-2xl border border-border bg-card shadow-soft active:scale-95 transition-smooth"
          aria-label="Borrar"
        >
          <Delete className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
