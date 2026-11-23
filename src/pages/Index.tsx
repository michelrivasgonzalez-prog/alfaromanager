import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { alertasStock } from "@/lib/kardex";
import {
  Coffee,
  Play,
  ArrowRight,
  Store,
  X,
  Search,
  Inbox,
  Clock,
  CheckCircle2,
  Trash2,
  PenLine,
  UserCheck,
  Boxes,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  TrendingUp,
  Wallet,
} from "lucide-react";
import coffeeHero from "@/assets/coffee-hero.jpg";
const mipymeHero = "/mipyme-hero.svg";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCuadreStore, PUNTOS, PuntoVenta, calcCuadre } from "@/store/cuadreStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { formatDiasTrabajados } from "@/lib/dias";
import PortalDependiente from "./PortalDependiente";
import DashboardMetricas from "@/components/DashboardMetricas";
import { PrecuadreAdminReview } from "@/components/cuadre/Precuadre";
import {
  TurnoDependiente,
  listarPrecuadresPendientes,
  marcarPrecuadreDescartado,
} from "@/lib/turnos";

export default function Index() {
  const nav = useNavigate();
  const {
    currents,
    activePunto,
    setActivePunto,
    startCuadre,
    history,
    lastStep,
    cancelar,
    cargarPrecuadre,
  } = useCuadreStore();
  const { role } = useAuth();

  // Si entra con rol de dependiente, se le muestra directamente su portal
  if (role === "dependiente") {
    return <PortalDependiente />;
  }

  const canStart = role === "admin" || role === "duena";
  const catalogo = useCuadreStore((s) => s.catalogo);
  const settings = useCuadreStore((s) => s.settings);
  const alertas = useMemo(
    () => alertasStock(history, catalogo, settings),
    [history, catalogo, settings]
  );

  // Bandeja de pre-cuadres pendientes
  const [precuadres, setPrecuadres] = useState<TurnoDependiente[]>([]);
  const [cargandoPrecuadres, setCargandoPrecuadres] = useState(false);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<TurnoDependiente | null>(null);
  const [modalRevision, setModalRevision] = useState(false);

  const cargarBandeja = async () => {
    setCargandoPrecuadres(true);
    try {
      const lista = await listarPrecuadresPendientes();
      setPrecuadres(lista);
    } catch {
      // Silencioso en offline
    } finally {
      setCargandoPrecuadres(false);
    }
  };

  useEffect(() => {
    if (canStart) {
      cargarBandeja();
    }
  }, [canStart]);

  // Historial ordenado desc
  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      const dateA = new Date(a.fecha || 0).getTime();
      const dateB = new Date(b.fecha || 0).getTime();
      return dateB - dateA;
    });
  }, [history]);

  const ultimoCerrado = useMemo(() => sortedHistory.find((c) => c.finalizado), [sortedHistory]);
  const resumenUltimo = useMemo(() => ultimoCerrado ? calcCuadre(ultimoCerrado) : null, [ultimoCerrado]);
  const [verAnalitica, setVerAnalitica] = useState(false);

  const alertaClave = alertas.map((a) => `${a.punto}|${a.nombre}|${a.existencia}`).join(";");
  const [oculta, setOculta] = useState(
    () => localStorage.getItem("alfaro-alerta-stock-oculta") ?? ""
  );

  const onStart = (punto: PuntoVenta) => {
    setActivePunto(punto);
    if (!currents[punto]) startCuadre(punto);
    const step = currents[punto] ? lastStep[punto] || 1 : 1;
    nav(`/cuadre/${step}`);
  };

  const handleDescartarPrecuadre = async (
    e: React.MouseEvent, turno: TurnoDependiente, estado: "cancelado" | "eliminado"
  ) => {
    e.stopPropagation();
    if (currents[turno.punto_venta]?.precuadre?.turnoId === turno.id) {
      toast.error("Cierra primero el borrador oficial vinculado a este precuadre.");
      return;
    }
    if (!confirm(estado === "eliminado" ? "¿Eliminar este precuadre?" : "¿Cancelar este precuadre?")) return;
    try {
      await marcarPrecuadreDescartado(turno, estado);
      setPrecuadres((prev) => prev.filter((p) => p.id !== turno.id));
      toast.info(estado === "eliminado" ? "Precuadre eliminado" : "Precuadre cancelado");
    } catch {
      toast.error("No se pudo actualizar el precuadre. Actualiza la bandeja e inténtalo de nuevo.");
    }
  };

  return (
    <div className="space-y-6 pb-4">
      {/* Cabecera compacta, sin imagen de 256px que oculte las acciones. */}
      <header className="alfaro-page-header">
        <div className="relative z-10 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
            <img src="/alfaro-logo-oficial.webp" alt="Logo oficial de AlFaro Café" className="h-full w-full rounded-2xl object-cover" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-secondary dark:text-emerald-300">AlFaroCafé Manager</p>
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Centro de Control</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">Cuadres, inventario y avisos en un solo lugar.</p>
          </div>
        </div>
      </header>

      {/* Accesos principales, con las mismas funciones del cuadre actual. */}
      {canStart && (
        <section className="grid grid-cols-2 gap-2.5 sm:gap-4" aria-label="Accesos directos a los cuadres">
          {PUNTOS.map((p) => {
            const c = currents[p];
            const Icon = p === "Cafetería" ? Coffee : Store;
            return (
              <div key={p} className={cn(
                "alfaro-action-tile min-w-0",
                p === "Cafetería" ? "bg-primary" : "bg-secondary"
              )}>
                <img src={p === "Cafetería" ? coffeeHero : mipymeHero} alt="" aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/10" />
                <button type="button" onClick={() => onStart(p)}
                  className="relative z-10 flex h-full w-full flex-col justify-between gap-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <div className="space-y-2">
                    <Icon className="h-7 w-7" aria-hidden="true" />
                    <h2 className="text-lg font-extrabold leading-tight sm:text-2xl">{p === "Mipyme" ? "MiPyME" : p}</h2>
                    <p className="text-xs leading-snug text-white/90">
                      {c ? "Borrador en curso · Paso " + (lastStep[p] || 1) :
                        p === "Cafetería" ? "Ventas y cuadre de caja" : "Punto de venta e inventario"}
                    </p>
                  </div>
                  <span className="inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-white/95 px-3 py-2 text-xs font-bold text-primary sm:text-sm">
                    {c ? "Continuar" : "Abrir cuadre"} <ChevronRight className="h-4 w-4 shrink-0" />
                  </span>
                </button>
                {c && (
                  <button type="button" aria-label={"Eliminar borrador de " + p}
                    className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur"
                    onClick={() => {
                      if (confirm("¿Eliminar el cuadre en curso de " + p + "? Esta acción no se puede deshacer.")) {
                        cancelar(p);
                        toast.success("Cuadre de " + p + " eliminado");
                      }
                    }}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {canStart && (
        <section className="space-y-2.5" aria-label="Pendientes">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <ClipboardList className="h-5 w-5 text-secondary" /> Pendientes
            </h2>
            <span className="text-xs text-muted-foreground">Atención operativa</span>
          </div>
          <div className="alfaro-surface overflow-hidden divide-y divide-border/60">
            <button type="button" className="flex min-h-16 w-full items-center gap-3 px-3.5 text-left hover:bg-muted/40"
              onClick={() => document.getElementById("precuadres-pendientes")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <ClipboardList className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Precuadres</span>
                <span className="block text-xs text-muted-foreground">
                  {cargandoPrecuadres ? "Consultando pendientes…" :
                    precuadres.length ? "Entregados para revisar" : "Sin precuadres pendientes"}
                </span>
              </span>
              <span className="rounded-full bg-secondary/10 px-2.5 py-1 text-xs font-bold text-secondary">
                {cargandoPrecuadres ? "…" : precuadres.length}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
            <button type="button" className="flex min-h-16 w-full items-center gap-3 px-3.5 text-left hover:bg-muted/40"
              onClick={() => alertas.length && alertaClave !== oculta
                ? document.getElementById("stock-bajo-inicio")?.scrollIntoView({ behavior: "smooth", block: "start" })
                : nav("/productos")}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <Boxes className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Existencias bajas</span>
                <span className="block text-xs text-muted-foreground">
                  {alertas.length ? "Productos para revisar" : "Sin alertas de stock"}
                </span>
              </span>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold",
                alertas.length ? "bg-destructive/10 text-destructive" : "bg-secondary/10 text-secondary")}>
                {alertas.length}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
            <button type="button" className="flex min-h-16 w-full items-center gap-3 px-3.5 text-left hover:bg-muted/40"
              onClick={() => nav("/cobrar")}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-foreground">
                <Wallet className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Cuentas por cobrar</span>
                <span className="block text-xs text-muted-foreground">Consultar clientes y saldos</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </div>
        </section>
      )}

      <section className="space-y-2.5" aria-label="Resumen del último cuadre">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <LayoutDashboard className="h-5 w-5 text-secondary" /> Último turno cerrado
          </h2>
          <button type="button" className="text-xs font-medium text-secondary hover:underline"
            onClick={() => nav("/reportes")}>Ver reportes</button>
        </div>
        {ultimoCerrado && resumenUltimo ? (
          <>
            <p className="text-xs text-muted-foreground">
              {ultimoCerrado.puntoVenta === "Mipyme" ? "MiPyME" : ultimoCerrado.puntoVenta}
              {" · "}{ultimoCerrado.dependiente || "Dependiente no registrado"}
              {" · "}{formatDiasTrabajados(ultimoCerrado.diasTrabajados) || ultimoCerrado.fecha}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="alfaro-surface p-3.5">
                <p className="text-xs text-muted-foreground">Ventas</p>
                <p className="mt-1 break-all text-xl font-extrabold tabular-nums text-secondary">
                  {Math.round(resumenUltimo.totalVenta).toLocaleString("es-ES")} <span className="text-xs font-medium">CUP</span>
                </p>
              </div>
              <div className="alfaro-surface p-3.5">
                <p className="text-xs text-muted-foreground">Ganancia</p>
                <p className="mt-1 break-all text-xl font-extrabold tabular-nums text-secondary">
                  {Math.round(resumenUltimo.gananciaTotal).toLocaleString("es-ES")} <span className="text-xs font-medium">CUP</span>
                </p>
              </div>
              <div className="alfaro-surface p-3.5">
                <p className="text-xs text-muted-foreground">Diferencia de caja</p>
                <p className={cn("mt-1 text-lg font-bold tabular-nums",
                  resumenUltimo.diferencia < 0 ? "text-destructive" : "text-foreground")}>
                  {Math.round(resumenUltimo.diferencia).toLocaleString("es-ES")} CUP
                </p>
              </div>
              <div className="alfaro-surface p-3.5">
                <p className="text-xs text-muted-foreground">Estado</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-bold text-secondary">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> Cuadre finalizado
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="alfaro-surface p-4 text-sm text-muted-foreground">
            Aún no hay cuadres finalizados para mostrar un resumen.
          </div>
        )}
      </section>

      {/* Buscador */}
      <button
        onClick={() => nav("/buscar")}
        className="flex h-12 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left shadow-soft transition-smooth hover:bg-muted/50"
      >
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Buscar clientes, productos, cuadres…
        </span>
      </button>

      {/* BANDEJA DE PRE-CUADRES PENDIENTES (Dueña / Admin) */}
      {canStart && (
        <div id="precuadres-pendientes" className="alfaro-surface scroll-mt-20 space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xs">
                {precuadres.length}
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Inbox className="h-4 w-4 text-primary" /> Pre-cuadres por Revisar
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Turnos entregados por dependientes pendientes de conciliar
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 rounded-xl"
              onClick={cargarBandeja}
              disabled={cargandoPrecuadres}
            >
              Actualizar
            </Button>
          </div>

          <div className="space-y-2">
            {!precuadres.length && <p className="text-xs text-muted-foreground">Sin precuadres pendientes.</p>}
            {precuadres.map((p) => {
              const d = p.data;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setTurnoSeleccionado(p);
                    setModalRevision(true);
                  }}
                  className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl border border-border bg-card shadow-soft hover:border-primary/50 transition-all cursor-pointer group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">
                        {p.dependiente}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold">
                        {p.punto_venta}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {p.enviado_en
                          ? new Date(p.enviado_en).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Reciente"}
                      </span>
                      <span>·</span>
                      <span>Efectivo: <strong className="text-foreground">${d?.efectivoTotal ?? 0}</strong></span>
                      {d?.entranteFirma && (
                        <span className="flex items-center gap-0.5 text-emerald-600 font-medium">
                          <PenLine className="h-3 w-3" /> Firmado
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="rounded-xl text-xs font-bold h-8 px-3 group-hover:bg-primary"
                    >
                      Revisar <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => handleDescartarPrecuadre(e, p, "cancelado")}>
                      Cancelar
                    </Button>
                    <button
                      onClick={(e) => handleDescartarPrecuadre(e, p, "eliminado")}
                      className="p-1.5 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Eliminar precuadre" aria-label="Eliminar precuadre"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de Revisión de Pre-cuadre */}
      <PrecuadreAdminReview
        key={turnoSeleccionado?.id}
        turno={turnoSeleccionado}
        open={modalRevision}
        onOpenChange={setModalRevision}
        onCargarAlCuadre={(cuadreData) => {
          const punto = cuadreData.puntoVenta;
          const borrador = punto ? currents[punto] : undefined;
          if (borrador) {
            if (borrador.precuadre?.turnoId === turnoSeleccionado?.id) {
              onStart(punto!);
              return true;
            }
            toast.error("Ya hay un cuadre abierto en ese punto. Ciérralo antes de cargar otro.");
            return false;
          }
          cargarPrecuadre(cuadreData);
          toast.success(
            `Pre-cuadre de ${turnoSeleccionado?.dependiente} cargado al Cuadre oficial`
          );
          nav("/cuadre/1");
          return true;
        }}
      />

      {/* Alerta de Stock Bajo */}
      {canStart && alertas.length > 0 && alertaClave !== oculta && (
        <div id="stock-bajo-inicio" className="scroll-mt-20 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-destructive">
              Stock bajo: {alertas.length} producto(s)
            </div>
            <button
              onClick={() => {
                localStorage.setItem("alfaro-alerta-stock-oculta", alertaClave);
                setOculta(alertaClave);
              }}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label="Descartar alerta"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="space-y-1 text-sm">
            {alertas.map((a) => (
              <li key={a.punto + a.nombre} className="flex justify-between gap-2">
                <span>
                  {a.nombre}{" "}
                  <span className="text-xs text-muted-foreground">· {a.punto}</span>
                </span>
                <span className="font-semibold">
                  {a.existencia} / mín. {a.minimo}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Analítica profunda disponible bajo demanda, no saturar el inicio. */}
      <section className="alfaro-surface overflow-hidden">
        <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left"
          onClick={() => setVerAnalitica((v) => !v)} aria-expanded={verAnalitica}>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-secondary" /> Análisis operativo detallado
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform",
            verAnalitica && "rotate-180")} />
        </button>
        {verAnalitica && (
          <div className="border-t border-border/60 p-3 sm:p-4">
            <DashboardMetricas history={history} />
          </div>
        )}
      </section>

      {/* Historial Reciente */}
      {sortedHistory.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Historial reciente</h2>
            <Button variant="ghost" size="sm" onClick={() => nav("/historial")}>
              Ver todo <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {sortedHistory.slice(0, 3).map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-soft"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">
                      {c.dependiente || "Sin nombre"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDiasTrabajados(c.diasTrabajados) ||
                        "Sin días registrados"}
                    </div>
                  </div>
                  <div className="rounded-full bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
                    {c.diasTrabajados.length} día(s)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
