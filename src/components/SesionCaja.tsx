import { useState, type ReactNode } from "react";
import { entrarConPinDeCaja, useSesionCaja } from "@/lib/cajaSobrantes";
import { usePinStore } from "@/store/pinStore";
import { PinPad } from "@/components/PinPad";
import { toast } from "sonner";

export function SesionCaja({ children }: { children: ReactNode }) {
  const cuenta = useSesionCaja((s) => s.cuenta);
  const usuario = usePinStore((s) => s.currentUserId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (cuenta && cuenta === usuario) return <>{children}</>;

  return (
    <div className="mx-auto max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="space-y-1 text-center">
        <h3 className="text-base font-semibold">Caja de Sobrantes</h3>
        <p className="text-xs text-muted-foreground">
          Ingresa tu PIN de 6 dígitos habitual de inicio de sesión para abrir la caja.
        </p>
      </div>
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
  );
}
