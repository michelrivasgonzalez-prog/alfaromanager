import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSesionCaja } from "@/lib/cajaSobrantes";
import { usePinStore } from "@/store/pinStore";

export function SesionCaja({ children }: { children: ReactNode }) {
  const cuenta = useSesionCaja((s) => s.cuenta);
  const usuario = usePinStore((s) => s.currentUserId);
  const logout = usePinStore((s) => s.logout);
  const navigate = useNavigate();

  if (cuenta && cuenta === usuario) return <>{children}</>;

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <p className="text-sm">
        Para abrir Caja de Sobrantes, entra a la aplicación con tu PIN autorizado.
      </p>
      <Button onClick={() => {
        logout();
        navigate("/auth", { replace: true });
      }}>Volver a ingresar con PIN</Button>
    </div>
  );
}
