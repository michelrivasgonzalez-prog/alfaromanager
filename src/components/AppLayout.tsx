import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, History, BarChart3, Package, Users, Settings, LogOut, Warehouse, Wallet, Cloud, CloudOff, RefreshCw, CalendarDays, Banknote, Bell, Coffee, Menu, Search, ChevronRight, ClipboardList, CheckCircle2 } from "lucide-react";
import { useCuadreStore } from "@/store/cuadreStore";
import { motion } from "framer-motion";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  const [masAbierto, setMasAbierto] = useState(false);
  const usuarioPinId = usePinStore((s) => s.currentUserId);

  const principal = role === "dependiente"
    ? tabs.filter((t) => ["/", "/cobrar", "/notificaciones"].includes(t.to))
    : [
        { to: "/", icon: Home, label: "Inicio" },
        { to: "/historial", icon: ClipboardList, label: "Cuadres" },
        { to: "/cobrar", icon: Wallet, label: "Cobros" },
        { to: "/reportes", icon: BarChart3, label: "Reportes" },
      ];

  const menuGroups = [
    { title: "Operación e inventario", routes: ["/calendario", "/caja-sobrantes", "/almacen", "/productos"] },
    { title: "Administración", routes: ["/usuarios", "/notificaciones", "/ajustes"] },
  ].map((grupo) => ({
    ...grupo,
    items: tabs.filter((t) => grupo.routes.includes(t.to)),
  })).filter((grupo) => grupo.items.length > 0);
  const estaActivo = (ruta: string) =>
    ruta === "/"
      ? location.pathname === "/"
      : ruta === "/historial"
        ? location.pathname === "/historial" ||
          location.pathname.startsWith("/historial/") ||
          location.pathname.startsWith("/cuadre/")
        : ruta === "/cobrar"
          ? location.pathname === "/cobrar" ||
            location.pathname.startsWith("/cliente/") ||
            location.pathname.startsWith("/abonar/")
          : location.pathname === ruta;
  const masActivo = !principal.some((t) => estaActivo(t.to));

  useEffect(() => setMasAbierto(false), [location.pathname]);


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
      <header className="border-b border-border/40 bg-card/65 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
              <img src="/alfaro-logo-oficial.webp" alt="Logo oficial de AlFaro Café" className="h-full w-full rounded-2xl object-cover" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold tracking-tight text-primary dark:text-foreground sm:text-lg">
                AlFaroCafé <span className="text-secondary dark:text-emerald-300">Manager</span>
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {nombre || "Administración"}
                {role && " · " + (role === "duena" ? "Dueña" : role === "admin" ? "Admin" : "Dependiente")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => { void doSync(true); }}
              aria-label={syncState === "error" ? "Reintentar sincronización" : "Sincronizar datos"}
              title={lastSync ? "Última sincronización: " + new Date(lastSync).toLocaleString("es-ES") : "Sin sincronización completada todavía"}
              className={"flex h-9 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold " +
                (syncState === "error" ? "bg-destructive/10 text-destructive" :
                  syncState === "ok" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" :
                    "bg-muted text-muted-foreground")}
            >
              {syncState === "syncing" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> :
                syncState === "error" ? <CloudOff className="h-3.5 w-3.5" /> :
                  syncState === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                    <Cloud className="h-3.5 w-3.5" />}
              <span className="hidden min-[360px]:inline">
                {syncState === "syncing" ? "Sincronizando" :
                  syncState === "ok" ? "Sincronizado" :
                    syncState === "error" ? "Error de sync" : "Sin comprobar"}
              </span>
            </button>
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-card text-primary"
              aria-label={"Notificaciones: " + avisosPendientes + " pendientes"}
              onClick={() => navigate("/notificaciones")}
            >
              <Bell className="h-5 w-5" />
              {avisosPendientes > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] font-bold text-white">
                  {avisosPendientes > 99 ? "99+" : avisosPendientes}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="mx-auto max-w-5xl px-3 pt-4 safe-bottom sm:px-5"
      >
        {role === "dependiente" && location.pathname === "/cobrar" && !tienePermisoCobrar ? (
          <MisDeudasDependiente />
        ) : (
          <Outlet />
        )}
      </motion.main>

      <nav className="alfaro-bottom-nav" aria-label="Navegación principal">
        <div className="mx-auto flex max-w-2xl items-stretch gap-1 px-2 py-1.5">
          {principal.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === "/"}
              className={"alfaro-nav-button " + (estaActivo(to) ? "alfaro-nav-active" : "hover:text-foreground")}
              aria-label={label}>
              <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
          <button type="button" onClick={() => setMasAbierto(true)}
            aria-label="Abrir más secciones" aria-haspopup="dialog" aria-expanded={masAbierto}
            className={"alfaro-nav-button " + (masActivo ? "alfaro-nav-active" : "hover:text-foreground")}>
            <Menu className="h-[19px] w-[19px]" />
            <span>Más</span>
          </button>
        </div>
      </nav>

      <Sheet open={masAbierto} onOpenChange={setMasAbierto}>
        <SheetContent side="bottom" className="max-h-[87dvh] overflow-y-auto rounded-t-3xl border-t bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5 sm:mx-auto sm:max-w-2xl">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Menu className="h-5 w-5 text-secondary" /> Más secciones
            </SheetTitle>
            <SheetDescription>Herramientas y administración según tus permisos.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            {menuGroups.map((group) => (
              <section key={group.title} className="space-y-2" aria-label={group.title}>
                <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {group.items.map(({ to, icon: Icon, label }) => (
                    <button key={to} type="button" onClick={() => { setMasAbierto(false); navigate(to); }}
                      className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/70 bg-card px-3 text-left transition-colors hover:bg-muted/40">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-semibold">{label}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <section className="space-y-2" aria-label="Herramientas">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Herramientas</h3>
              <button type="button" onClick={() => { setMasAbierto(false); navigate("/buscar"); }}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-3 text-left transition-colors hover:bg-muted/40">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                  <Search className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold">Búsqueda global</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </section>
          </div>
          <Button variant="outline" className="mt-4 h-11 w-full rounded-xl"
            onClick={async () => {
              setMasAbierto(false);
              await signOut();
              navigate("/auth", { replace: true });
            }}>
            <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
