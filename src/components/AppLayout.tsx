import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, History, BarChart3, Package, Users, Settings, LogOut, Warehouse, Wallet, Cloud, CloudOff, RefreshCw, CalendarDays, Banknote, Bell } from "lucide-react";
import { useCuadreStore } from "@/store/cuadreStore";
import { motion } from "framer-motion";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { fullSync } from "@/lib/sync";
import { iniciarBorradoresNube } from "@/lib/borradores";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import MisDeudasDependiente from "@/pages/MisDeudasDependiente";
import { bandejaNotificaciones, sesionActualNotificaciones } from "@/lib/notificaciones";
import { usePinStore } from "@/store/pinStore"; // <-- Componente exclusivo y seguro para dependientes

const ALL_TABS: { to: string; icon: any; label: string; allow: AppRole[] }[] = [
  { to: "/", icon: Home, label: "Inicio", allow: ["admin", "duena", "dependiente"] },
  { to: "/calendario", icon: CalendarDays, label: "Calendario", allow: ["admin", "duena"] },
  { to: "/historial", icon: History, label: "Historial", allow: ["admin", "duena"] },
  { to: "/caja-sobrantes", icon: Banknote, label: "Caja de Sobrantes", allow: ["admin", "duena"] },
  { to: "/almacen", icon: Warehouse, label: "Almacén", allow: ["admin", "duena"] },
  { to: "/cobrar", icon: Wallet, label: "Cobrar", allow: ["admin", "duena", "dependiente"] },
  { to: "/reportes", icon: BarChart3, label: "Reportes", allow: ["admin", "duena"] },
  { to: "/productos", icon: Package, label: "Productos", allow: ["admin", "duena"] },
  { to: "/usuarios", icon: Users, label: "Usuarios", allow: ["admin", "duena"] },
  { to: "/notificaciones", icon: Bell, label: "Avisos", allow: ["admin", "duena", "dependiente"] },
  { to: "/ajustes", icon: Settings, label: "Ajustes", allow: ["admin", "duena"] },
];

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
    const { role, signOut, nombre } = useAuth();
    const settings = useCuadreStore((s) => s.settings);
  const ocultarAlmacen = settings.ocultarAlmacen ?? false;
  const tienePermisoCobrar =
    role === "dependiente" &&
    Boolean(
      nombre &&
      settings.dependientesPermisoCobrar?.some(
        (n) => n.trim().toLowerCase() === nombre.trim().toLowerCase()
      )
    );
  // Expulsar a la dependienta si la administración la marca como inactiva
  useEffect(() => {
    if (role === "dependiente" && nombre) {
      const inactivos: string[] = (settings as any).dependientesInactivos ?? [];
      const estaInactiva = inactivos.some(
        (n) => n.trim().toLowerCase() === nombre.trim().toLowerCase()
      );
      if (estaInactiva) {
        signOut();
        toast.error("Tu cuenta ha sido desactivada por la administración.");
        navigate("/auth", { replace: true });
      }
    }
  }, [role, nombre, settings, signOut, navigate]);

  const tabs = ALL_TABS.filter((t) => {
    if (!role) return false;
    if (role === "dependiente") {
      return t.to === "/" || t.to === "/cobrar" || t.to === "/notificaciones";
    }
    return t.allow.includes(role) && !(t.to === "/almacen" && ocultarAlmacen);
    }).map((t) => ({
    ...t,
    label:
      t.to === "/cobrar" && role === "dependiente"
        ? tienePermisoCobrar
          ? "Cobrar"
          : "Mis Deudas"
        : t.label,
  }));

  const qc = useQueryClient();
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "ok" | "error">("idle");
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [avisosPendientes, setAvisosPendientes] = useState(0);
  const usuarioPinId = usePinStore((s) => s.currentUserId);

  useEffect(() => {
    let activo = true;
    const actualizarAvisos = async () => {
      if (!usuarioPinId || !sesionActualNotificaciones(usuarioPinId)) {
        if (activo) setAvisosPendientes(0);
        return;
      }
      try {
        const resultado = await bandejaNotificaciones();
        if (!activo) return;
        setAvisosPendientes(resultado.no_leidos);
        const nav = navigator as Navigator & {
          setAppBadge?: (count: number) => Promise<void>;
          clearAppBadge?: () => Promise<void>;
        };
        if (resultado.no_leidos > 0) void nav.setAppBadge?.(resultado.no_leidos).catch(() => {});
        else void nav.clearAppBadge?.().catch(() => {});
      } catch {
        // No mostrar una alarma global por falta de red o expiración del PIN.
      }
    };
    void actualizarAvisos();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void actualizarAvisos();
    }, 60_000);
    window.addEventListener("alfaro:notificaciones-sesion", actualizarAvisos);
    const onVisible = () => {
      if (document.visibilityState === "visible") void actualizarAvisos();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      activo = false;
      clearInterval(t);
      window.removeEventListener("alfaro:notificaciones-sesion", actualizarAvisos);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [usuarioPinId, location.pathname]);

  const running = useRef(false);
  useAutoLogout(20);

  const doSync = async (manual = false) => {
    if (running.current || !role) return;
    running.current = true;
    setSyncState("syncing");
    try {
      await fullSync(role);
      setSyncState("ok");
      setLastSync(Date.now());
      qc.invalidateQueries();
      if (manual) toast.success("Sincronizado con la nube");
    } catch (e: any) {
      console.warn("sync error", e);
      setSyncState("error");
      if (manual) toast.error("No se pudo sincronizar");
    } finally {
      running.current = false;
    }
  };

  useEffect(() => {
    if (!role) return;
    iniciarBorradoresNube();
    
    doSync(false);

    const iv = setInterval(() => doSync(false), 30_000);
    const onVis = () => { if (document.visibilityState === "visible") doSync(false); };
    const onOnline = () => doSync(false);
    
    window.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("online", onOnline);

    return () => {
      clearInterval(iv);
      window.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  return (
    <div className="min-h-screen gradient-warm">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-3 text-xs text-muted-foreground">
        <span className="truncate">
          {nombre}
          {role && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
              {role === "duena" ? "Dueña" : role === "admin" ? "Admin" : "Dependiente"}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="relative flex h-8 w-8 items-center justify-center rounded-xl text-primary"
            aria-label={"Notificaciones: " + avisosPendientes + " pendientes"}
            onClick={() => navigate("/notificaciones")}
          >
            <Bell className="h-4 w-4"/>
            {avisosPendientes > 0 && (
              <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
                {avisosPendientes > 99 ? "99+" : avisosPendientes}
              </span>
            )}
          </button>
          <button
            onClick={() => doSync(true)}
            title={
              syncState === "syncing"
                ? "Sincronizando..."
                : syncState === "error"
                ? "Error de sincronización — toca para reintentar"
                : lastSync
                ? `Sincronizado ${new Date(lastSync).toLocaleTimeString()}`
                : "Sincronizar ahora"
            }
            className={`flex h-7 items-center gap-1 rounded-full px-2 text-[10px] font-semibold ${
              syncState === "error"
                ? "bg-destructive/10 text-destructive"
                : syncState === "syncing"
                ? "bg-primary/10 text-primary"
                : "bg-secondary/10 text-secondary"
            }`}
          >
            {syncState === "syncing" ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : syncState === "error" ? (
              <CloudOff className="h-3 w-3" />
            ) : (
              <Cloud className="h-3 w-3" />
            )}
            {syncState === "syncing" ? "Sync" : syncState === "error" ? "Sin nube" : "En nube"}
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await signOut();
              navigate("/auth", { replace: true });
            }}
            className="h-7 px-2 text-xs"
          >
            <LogOut className="mr-1 h-3 w-3" /> Salir
          </Button>
        </div>
      </div>

      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mx-auto max-w-2xl px-4 pt-4 safe-bottom"
      >
                {/* Si es dependiente con permiso ve Cobrar (<Outlet />), si no tiene permiso ve solo Mis Deudas */}
        {role === "dependiente" && location.pathname === "/cobrar" && !tienePermisoCobrar ? (
          <MisDeudasDependiente />
        ) : (
          <Outlet />
        )}
      </motion.main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg">
        <div className="mx-auto flex max-w-2xl items-center justify-around gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-smooth ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`rounded-lg p-1.5 transition-smooth ${
                      isActive ? "gradient-primary text-primary-foreground shadow-soft" : ""
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
