import { useState, type ReactNode } from "react";
import { entrarConPinDeCaja, useSesionCaja } from "@/lib/cajaSobrantes";
import { usePinStore } from "@/store/pinStore";
import { PinPad } from "@/components/PinPad";
import { toast } from "sonner";
import { LockKeyhole, ShieldCheck, Wallet } from "lucide-react";

export function SesionCaja({ children }: { children: ReactNode }) {
  const cuenta = useSesionCaja((s) => s.cuenta);
  const usuario = usePinStore((s) => s.currentUserId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (cuenta && cuenta === usuario) return <>{children}</>;

  return (
    <div className="mx-auto max-w-sm space-y-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Wallet className="h-8 w-8" />
          <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground">
            <LockKeyhole className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-bold">Caja de Sobrantes</h1>
          <p className="text-sm font-medium text-muted-foreground">Acceso protegido</p>
        </div>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Ingresa tu PIN habitual de 6 dígitos para consultar y operar la caja.
        </p>
      </div>
      <div className="rounded-2xl bg-muted/30 p-3">
      <PinPad
        busy={busy}
        error={error}
        onComplete={async (pin) => {
          setBusy(true);
          setError(null);
          try {
            const perfil = await entrarConPinDeCaja(pin);
            if (!perfil) {
              setError("PIN incorrecto o no autorizado para la caja");
              return;
            }
            toast.success("Caja de Sobrantes desbloqueada");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Error al validar el PIN");
          } finally {
            setBusy(false);
          }
        }}
      />
      </div>
      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
        Acceso exclusivo para perfiles autorizados
      </p>
    </div>
  );
}
