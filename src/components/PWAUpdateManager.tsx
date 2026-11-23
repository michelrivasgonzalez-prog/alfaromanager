import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCuadreStore } from "@/store/cuadreStore";
import {
  hayCambiosPorSincronizar,
  mostrarCompilacion,
  useActualizacionesStore,
} from "@/lib/actualizaciones";

/**
 * Comprueba nuevas versiones y solo recarga tras confirmación.
 * Mantener montado una sola vez en App para no duplicar registros del SW.
 * No modifica almacenamiento local, sesiones PIN, datos, ni suscripciones push.
 */
export default function PWAUpdateManager() {
  const { disponible, compilacionRemota, avisoDescartado, marcarDisponible,
    verificar, descartarAviso } = useActualizacionesStore();
  const [actualizando, setActualizando] = useState(false);
  const { needRefresh: [esperandoSW], updateServiceWorker } = useRegisterSW({
    immediate: true,
    onNeedRefresh() {
      useActualizacionesStore.getState().marcarDisponible();
    },
    onRegisteredSW(_scriptUrl, registration) {
      if (registration?.waiting && navigator.serviceWorker.controller) {
        useActualizacionesStore.getState().marcarDisponible();
      }
    },
    onRegisterError(error) {
      console.warn("No se pudo registrar el comprobador de versiones PWA:", error);
    },
  });

  useEffect(() => {
    if (esperandoSW) marcarDisponible();
  }, [esperandoSW, marcarDisponible]);

  const comprobar = useCallback(() => {
    if (!navigator.onLine || document.visibilityState !== "visible") return;
    const last = useActualizacionesStore.getState().ultimoChequeo;
    if (last && Date.now() - last < 90_000) return;
    void verificar();
  }, [verificar]);

  useEffect(() => {
    const initial = window.setTimeout(comprobar, 2500);
    const interval = window.setInterval(comprobar, 10 * 60_000);
    const onFocus = () => comprobar();
    const onVisible = () => {
      if (document.visibilityState === "visible") comprobar();
    };
    window.addEventListener("online", onFocus);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("online", onFocus);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [comprobar]);

  const actualizar = useCallback(async () => {
    if (actualizando) return;
    if (!navigator.onLine) {
      toast.error("Conéctate a Internet antes de actualizar.");
      return;
    }
    if (hayCambiosPorSincronizar() ||
        (useCuadreStore.getState().pendingCuadres ?? []).length > 0) {
      toast.error("Hay turnos o cambios pendientes de sincronización. Sincronízalos antes de actualizar.");
      return;
    }

    // La dependienta puede tener un precuadre todavía abierto en React y
    // el administrador un paso del cuadre sin terminar. No recargar sin aviso.
    if (!window.confirm(
      "¿Ya guardaste o enviaste tu trabajo actual?\n\n" +
      "Actualizar cerrará la pantalla y puede perder los cambios de formularios " +
      "que todavía no hayas guardado. La app instalada y sus datos guardados permanecerán."
    )) return;

    setActualizando(true);
    try {
      const reg = "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration()
        : undefined;
      if (!reg) {
        toast.error("El navegador aún no tiene registrado el servicio de actualización. Vuelve a abrir la aplicación instalada.");
        return;
      }
      if (!reg.waiting) await reg.update();
      if (!reg.waiting) {
        toast.info("La nueva versión está preparándose. Pulsa «Buscar actualizaciones» en Ajustes e inténtalo otra vez.");
        return;
      }
      await updateServiceWorker(true);
      // Workbox recargará cuando el SW nuevo controle la página.
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo activar la nueva versión.");
    } finally {
      setActualizando(false);
    }
  }, [actualizando, updateServiceWorker]);

  useEffect(() => {
    const onApply = () => { void actualizar(); };
    window.addEventListener("alfaro:pwa-aplicar", onApply);
    return () => window.removeEventListener("alfaro:pwa-aplicar", onApply);
  }, [actualizar]);

  if (!disponible || avisoDescartado) return null;

  return (
    <section
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[5.5rem] z-[90] mx-auto max-w-lg rounded-2xl border border-primary/30 bg-card p-4 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">Nueva versión de AlFaroCafé disponible</p>
          <p className="text-xs text-muted-foreground">
            Puedes actualizar sin desinstalar la app ni limpiar Safari o Chrome.
            Guarda tu trabajo antes de continuar.
          </p>
          {compilacionRemota && (
            <p className="text-[11px] text-muted-foreground">
              Publicada: {mostrarCompilacion(compilacionRemota)}
            </p>
          )}
          <Button type="button" size="sm" className="mt-2 h-9 rounded-xl"
            disabled={actualizando} onClick={() => void actualizar()}>
            <RefreshCw className={"mr-2 h-3.5 w-3.5 " + (actualizando ? "animate-spin" : "")} />
            {actualizando ? "Actualizando…" : "Actualizar ahora"}
          </Button>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
          aria-label="Actualizar más tarde" onClick={descartarAviso}>
          <X className="h-4 w-4"/>
        </Button>
      </div>
    </section>
  );
}
