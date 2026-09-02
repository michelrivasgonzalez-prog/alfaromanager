import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { usePinStore } from "@/store/pinStore";

/**
 * Cierra la sesión (vuelve al PIN) tras un periodo de inactividad.
 * NO borra el cuadre en curso: solo limpia el usuario autenticado.
 */
export function useAutoLogout(minutos = 20) {
  const nav = useNavigate();
  const currentUserId = usePinStore((s) => s.currentUserId);
  const logout = usePinStore((s) => s.logout);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!currentUserId) return;
    const ms = minutos * 60_000;

    const cerrar = () => {
      logout();
      toast.info("Sesión cerrada por inactividad");
      nav("/auth", { replace: true });
    };

    const reset = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(cerrar, ms);
    };

    const eventos: (keyof WindowEventMap)[] = [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
    ];
    eventos.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    const onVis = () => {
      if (document.visibilityState === "visible") reset();
    };
    document.addEventListener("visibilitychange", onVis);
    reset();

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      eventos.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [currentUserId, minutos, logout, nav]);
}
