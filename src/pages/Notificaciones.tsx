import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, CheckCheck, Clock, Info, RefreshCw, Smartphone, Send, Activity, ChevronDown, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { usePinStore } from "@/store/pinStore";
import {
  activarPushConPermiso, bandejaNotificaciones, cambiarPreferenciasNotificaciones,
  clavePublicaPush, configuracionNotificaciones, CATEGORIAS_NOTIFICACION,
  cerrarSesionNotificaciones, desactivarPush, esPWAInstalada, marcarNotificacionLeida,
  PREFERENCIAS_INICIALES, sesionActualNotificaciones, soportaPush,
  solicitarPushDePrueba, consultarEstadoPush, probarBannerLocal, type EstadoPushDiagnostico,
  type CategoriaNotificacion, type EventoNotificacion, type PreferenciasNotificaciones,
} from "@/lib/notificaciones";

const nombreCategoria: Record<CategoriaNotificacion, string> = {
  precuadres: "Turnos", caja: "Caja", stock: "Inventario",
  cxc: "Cuentas por Cobrar", auditoria: "Auditoría",
};

export default function Notificaciones() {
  const navigate = useNavigate();
  const usuarioId = usePinStore((s) => s.currentUserId);
  const [notificaciones, setNotificaciones] = useState<EventoNotificacion[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [prefs, setPrefs] = useState<PreferenciasNotificaciones>(PREFERENCIAS_INICIALES);
  const [habilitado, setHabilitado] = useState(false);
  const [servidorListo, setServidorListo] = useState(false);
  const [rol, setRol] = useState("");
  const [instalada] = useState(esPWAInstalada);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostico, setDiagnostico] = useState<EstadoPushDiagnostico | null>(null);
  const [probando, setProbando] = useState(false);

  const cargar = useCallback(async () => {
    if (!usuarioId) return;
    if (!sesionActualNotificaciones(usuarioId)) {
      setCargando(false);
      setError("Para registrar este dispositivo, sal de la aplicación y vuelve a entrar con tu PIN habitual. No necesitas crear otro PIN.");
      return;
    }
    try {
      const [config, bandeja, key] = await Promise.all([
        configuracionNotificaciones(),
        bandejaNotificaciones(),
        clavePublicaPush(),
      ]);
      setError(null);
      setPrefs(config.preferencias);
      setRol(config.rol);
      setHabilitado(config.habilitado);
      setNotificaciones(bandeja.items);
      setNoLeidas(bandeja.no_leidos);
      setServidorListo(Boolean(key));
      // El diagnóstico no debe bloquear los avisos si aún no se aplicó la migración.
      void consultarEstadoPush().then(setDiagnostico).catch(() => setDiagnostico(null));
    } catch (e: any) {
      setError(e?.message ?? "No se pudieron cargar las notificaciones");
    } finally {
      setCargando(false);
    }
  }, [usuarioId]);

  useEffect(() => {
    void cargar();
    const onSesion = () => { void cargar(); };
    const onFocus = () => { if (document.visibilityState === "visible") void cargar(); };
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, 60_000);
    window.addEventListener("alfaro:notificaciones-sesion", onSesion);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener("alfaro:notificaciones-sesion", onSesion);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [cargar]);

  const guardarCategoria = async (categoria: CategoriaNotificacion, activada: boolean) => {
    const siguientes = { ...prefs, [categoria]: activada };
    setPrefs(siguientes);
    try {
      await cambiarPreferenciasNotificaciones(siguientes);
      toast.success("Preferencias guardadas para este dispositivo");
    } catch (e: any) {
      setPrefs(prefs);
      toast.error(e?.message ?? "No se pudo guardar");
    }
  };

  const activar = async () => {
    if (!servidorListo) {
      toast.error("Falta configurar la clave del servidor de notificaciones.");
      return;
    }
    if (!soportaPush()) {
      toast.error("Este navegador no permite Web Push. Prueba desde la aplicación instalada en tu dispositivo.");
      return;
    }
    if (!instalada && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      toast.error("Primero usa Safari > Compartir > Añadir a pantalla de inicio; abre la aplicación desde su icono.");
      return;
    }

    // ¡Importante! Pedir permiso directamente desde este toque del usuario.
    // No ejecutar operaciones de red ni otros awaits antes de este diálogo.
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") {
      toast.error("No se autorizó el permiso de notificaciones.");
      return;
    }
    setOcupado(true);
    try {
      await activarPushConPermiso();
      setHabilitado(true);
      toast.success("¡Este dispositivo ya puede recibir notificaciones push!");
      await cargar();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo registrar el dispositivo");
    } finally { setOcupado(false); }
  };

  const probarPush = async () => {
    setProbando(true);
    try {
      await solicitarPushDePrueba();
      toast.success("Prueba añadida a la cola. El envío depende del despachador del servidor.");
      await cargar();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo crear el aviso de prueba");
    } finally {
      setProbando(false);
    }
  };

  const probarNotificacionEnTelefono = async () => {
    try {
      await probarBannerLocal();
      toast.success("Prueba local solicitada a este dispositivo. Comprueba el aviso y el sonido.");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo mostrar la prueba local");
    }
  };

  const refrescarDiagnostico = async () => {
    try {
      setDiagnostico(await consultarEstadoPush());
      toast.success("Estado de entregas actualizado");
    } catch (e: any) {
      toast.error(e?.message ?? "Diagnóstico no disponible");
    }
  };

  const desactivar = async () => {
    setOcupado(true);
    try {
      await desactivarPush();
      setHabilitado(false);
      toast.success("Notificaciones desactivadas en este dispositivo");
    } catch (e: any) { toast.error(e?.message ?? "No se pudo desactivar"); }
    finally { setOcupado(false); }
  };

  const abrir = async (evento: EventoNotificacion) => {
    try { await marcarNotificacionLeida(evento.id); }
    catch (e) { console.warn("No se pudo marcar el aviso",e); }
    setNotificaciones((old) => old.map((e) =>
      e.id === evento.id ? { ...e, leido: true } : e
    ));
    setNoLeidas((n) => Math.max(0, n - (evento.leido ? 0 : 1)));
    if (evento.destino.startsWith("/") && !evento.destino.startsWith("//")) {
      navigate(evento.destino);
    }
  };

  const leerTodas = async () => {
    try {
      await marcarNotificacionLeida();
      setNotificaciones((old) => old.map((e) => ({ ...e, leido: true })));
      setNoLeidas(0);
      toast.success("Avisos marcados como leídos");
    } catch (e: any) { toast.error(e?.message ?? "No se pudieron marcar"); }
  };

  return (
    <div className="space-y-4 pb-8">
      <header className="alfaro-page-header flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
            <Bell className="h-5 w-5"/>
          </div>
          <div>
            <h1 className="text-xl font-extrabold">Notificaciones</h1>
            <p className="mt-1 text-xs text-muted-foreground">Avisos y preferencias de este dispositivo</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl"
          aria-label="Actualizar notificaciones" disabled={cargando} onClick={() => void cargar()}>
          <RefreshCw className={"h-4 w-4 " + (cargando ? "animate-spin" : "")}/>
        </Button>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-amber-500/40 bg-card p-3 text-sm">
          <Info className="mr-1 inline h-4 w-4"/> {error}
        </div>
      )}

      <section className="alfaro-surface space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold"><Bell className="h-4 w-4 text-secondary"/> Bandeja de avisos {noLeidas > 0 ? "(" + noLeidas + " nuevos)" : ""}</h2>
          <Button size="sm" variant="outline" disabled={notificaciones.length===0 || !!error}
            onClick={() => void leerTodas()}>
            <CheckCheck className="mr-1 h-3.5 w-3.5"/> Leídos
          </Button>
        </div>
        {notificaciones.length===0 && (
          <p className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">
            Todavía no hay avisos. Se mostrarán cuando ocurran movimientos nuevos en la nube.
          </p>
        )}
        <div className="max-h-[35rem] space-y-2 overflow-y-auto">
          {notificaciones.map((n) => (
            <button key={n.id} type="button" onClick={() => void abrir(n)}
              className={"w-full rounded-xl border p-3.5 text-left text-sm transition-colors hover:bg-muted/30 " +
                (n.leido ? "border-border/70 bg-card" : "border-secondary/40 bg-secondary/5")}>
              <div className="flex items-center justify-between gap-2">
                <strong>{n.titulo}</strong>
                {!n.leido && <span className="h-2 w-2 shrink-0 rounded-full bg-secondary"/>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{n.contenido.replace("tu iPhone está recibiendo notificaciones push", "tu dispositivo está recibiendo notificaciones push")}</p>
              <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{nombreCategoria[n.categoria]}</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3"/>{new Date(n.creado_en).toLocaleString("es")}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="alfaro-surface space-y-3 p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Smartphone className="h-4 w-4"/> Notificaciones push en este equipo
        </h2>
        <p className="text-xs text-muted-foreground">
          Los avisos pueden llegar con la app cerrada. Abre AlFaroCafé desde su icono instalado y permite las notificaciones en los ajustes del dispositivo.
          Se usa el PIN habitual y no se piden otras credenciales.
        </p>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-lg bg-muted px-2 py-1">
            {instalada ? "App instalada" : "Navegador / Vista previa"}
          </span>
          <span className="rounded-lg bg-muted px-2 py-1">
            {habilitado ? "Push activado" : "Push desactivado"}
          </span>
          {!servidorListo && <span className="rounded-lg bg-muted px-2 py-1">Envío push pendiente de configuración</span>}
        </div>
        {habilitado ? (
          <Button variant="outline" disabled={ocupado} onClick={() => void desactivar()}
            className="h-10 w-full">
            <BellOff className="mr-2 h-4 w-4"/> Desactivar en este dispositivo
          </Button>
        ) : (
          <Button disabled={ocupado || cargando || !servidorListo || !!error}
            onClick={() => { void activar(); }} className="h-11 w-full">
            <Bell className="mr-2 h-4 w-4"/> Activar notificaciones
          </Button>
        )}
        {rol === "dependiente" && (
          <p className="text-[11px] text-muted-foreground">
            Como dependiente recibirás solamente avisos relativos a tus propios turnos.
            Los eventos financieros y administrativos son exclusivos de administración.
          </p>
        )}
      </section>

      <details className="group alfaro-surface overflow-hidden">
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
          <Activity className="h-5 w-5 shrink-0 text-secondary" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Diagnóstico y pruebas</span>
            <span className="block text-xs text-muted-foreground">Comprobar los envíos a este dispositivo</span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"/>
        </summary>
        <div className="space-y-3 border-t border-border/60 p-4">

        <p className="text-xs text-muted-foreground">
          Una cifra sobre el icono solo indica avisos pendientes; no garantiza que
          el dispositivo haya recibido un push. Esta prueba permite comprobar la entrega real.
        </p>
        <Button type="button" variant="outline" disabled={!habilitado || !!error}
          onClick={() => void probarNotificacionEnTelefono()} className="h-11 w-full">
          <Bell className="mr-2 h-4 w-4" />
          Probar aviso y sonido en este dispositivo
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Esta primera prueba se muestra directamente en este dispositivo, sin depender
          del servidor. No confirma que los push remotos se estén entregando.
        </p>
        <Button type="button" variant="outline" disabled={!habilitado || probando || !!error}
          onClick={() => void probarPush()} className="h-11 w-full">
          <Send className="mr-2 h-4 w-4" />
          {probando ? "Registrando prueba…" : "Enviar prueba desde el servidor"}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="w-full"
          onClick={() => void refrescarDiagnostico()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5"/> Consultar entregas al dispositivo
        </Button>
        {diagnostico && (
          <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-xs">
            <p>Suscripción: <strong>{diagnostico.push_activo ? "Activa" : "Inactiva"}</strong>
              {" · "}{diagnostico.plataforma ?? "Dispositivo"}</p>
            {diagnostico.entregas.length === 0
              ? <p className="text-muted-foreground">Todavía no consta un envío push a este dispositivo.</p>
              : diagnostico.entregas.map((entrega, i) => (
                <div key={i} className="border-t border-border pt-2">
                  <p className="font-medium">{entrega.titulo}</p>
                  <p>Estado: <strong>{entrega.estado === "enviado" ?
                    "Aceptado por el servicio push" : entrega.estado}</strong></p>
                  {entrega.ultimo_error && <p className="text-destructive">{entrega.ultimo_error}</p>}
                </div>
              ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Los envíos se procesan desde GitHub Actions y pueden tardar más de cinco minutos.
          Si quieres forzar la prueba, abre el flujo «Enviar notificaciones push AlFaroCafé» en GitHub
          y pulsa Run workflow. Luego consulta las entregas aquí.
        </p>
        </div>
      </details>

      <section className="alfaro-surface space-y-3 p-4">
        <h2 className="text-sm font-bold">¿Qué avisos quieres recibir?</h2>
        {CATEGORIAS_NOTIFICACION.map((categoria) => {
          const soloAdmin = rol === "dependiente" && categoria.id !== "precuadres";
          return (
            <div key={categoria.id} className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
              <div className="flex-1">
                <p className="text-sm font-medium">{categoria.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {soloAdmin ? "Solo administración" : categoria.descripcion}
                </p>
              </div>
              <Switch checked={!soloAdmin && prefs[categoria.id]}
                disabled={cargando || !!error || soloAdmin}
                onCheckedChange={(check) => void guardarCategoria(categoria.id,check)}/>
            </div>
          );
        })}
      </section>


    </div>
  );
}
