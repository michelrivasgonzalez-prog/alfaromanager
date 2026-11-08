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
} from "lucide-react";
import coffeeHero from "@/assets/coffee-hero.jpg";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCuadreStore, PUNTOS, PuntoVenta } from "@/store/cuadreStore";
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
  marcarPrecuadreConciliado,
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

  const handleDescartarPrecuadre = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("¿Deseas descartar este pre-cuadre?")) return;
    await marcarPrecuadreDescartado(id);
    setPrecuadres((prev) => prev.filter((p) => p.id !== id));
    toast.info("Pre-cuadre descartado");
  };

  return (
    <div className="space-y-6 pb-4">
      {/* Banner Principal */}
      <div className="relative overflow-hidden rounded-3xl shadow-elegant">
        <img
          src={coffeeHero}
          alt="Café AlFaro"
          width={1280}
          height={896}
          className="h-64 w-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ background: "var(--gradient-hero)" }}
        />
        <div className="absolute inset-x-0 bottom-0 p-5 text-primary-foreground">
          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-widest opacity-90">
            <Coffee className="h-3.5 w-3.5" />
            AlFaroCafé
          </div>
          <h1 className="text-3xl font-bold leading-tight">
            Bienvenido al cuadre del día
          </h1>
          <p className="mt-1 text-sm opacity-90">
            Gestiona inventario, ventas y caja en un solo lugar.
          </p>
        </div>
      </div>

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
      {canStart && precuadres.length > 0 && (
        <div className="rounded-3xl border border-primary/30 bg-primary/5 p-4 shadow-soft space-y-3">
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
            {precuadres.map((p) => {
              const d = p.data;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setTurnoSeleccionado(p);
                    setModalRevision(true);
                  }}
                  className="flex items-center justify-between p-3.5 rounded-2xl border border-border bg-card shadow-soft hover:border-primary/50 transition-all cursor-pointer group"
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
                    <button
                      onClick={(e) => handleDescartarPrecuadre(e, p.id)}
                      className="p-1.5 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Descartar pre-cuadre"
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
        turno={turnoSeleccionado}
        open={modalRevision}
        onOpenChange={setModalRevision}
        onCargarAlCuadre={async (cuadreData) => {
          cargarPrecuadre(cuadreData);
          if (turnoSeleccionado) {
            await marcarPrecuadreConciliado(turnoSeleccionado.id);
            setPrecuadres((prev) =>
              prev.filter((p) => p.id !== turnoSeleccionado.id)
            );
          }
          toast.success(
            `Pre-cuadre de ${turnoSeleccionado?.dependiente} cargado al Cuadre oficial`
          );
          nav("/cuadre/1");
        }}
      />

      {/* Alerta de Stock Bajo */}
      {canStart && alertas.length > 0 && alertaClave !== oculta && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
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

      {/* Tarjetas Iniciar/Continuar Cuadre Oficial */}
      <div className="grid grid-cols-1 gap-3">
        {canStart &&
          PUNTOS.map((p) => {
            const c = currents[p];
            const Icon = p === "Cafetería" ? Coffee : Store;
            return (
              <div
                key={p}
                className={cn(
                  "group relative w-full overflow-hidden rounded-3xl p-5 text-left shadow-emerald transition-smooth",
                  p === "Cafetería"
                    ? "gradient-emerald text-secondary-foreground"
                    : "gradient-primary text-primary-foreground"
                )}
              >
                <button
                  onClick={() => onStart(p)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-80">
                      <Icon className="h-3.5 w-3.5" /> {p}
                    </div>
                    <div className="text-2xl font-bold">
                      {c ? "Continuar cuadre" : "Iniciar cuadre"}
                    </div>
                    <div className="mt-1 text-sm opacity-80">
                      {c
                        ? `Dependiente: ${c.dependiente || "—"} · Paso ${
                            lastStep[p] || 1
                          }`
                        : "Nuevo turno"}
                    </div>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                    <Play className="h-5 w-5 fill-current" />
                  </div>
                </button>
                {c && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        confirm(
                          `¿Eliminar el cuadre en curso de ${p}? Esta acción no se puede deshacer.`
                        )
                      ) {
                        cancelar(p);
                        toast.success(`Cuadre de ${p} eliminado`);
                      }
                    }}
                    className="absolute right-3 top-3 rounded-full bg-white/20 p-1.5 text-current backdrop-blur hover:bg-white/30"
                    aria-label={`Eliminar cuadre de ${p}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
      </div>

      {/* Bloque de Métricas Analíticas Avanzadas */}
      <DashboardMetricas history={history} />

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
