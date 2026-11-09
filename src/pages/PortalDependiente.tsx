import { useState, useMemo } from "react";
import { useCuadreStore, calcCuadre, puntoHabitual } from "@/store/cuadreStore";
import { useAuth } from "@/hooks/useAuth";
import { Calendar, Scale, Clock, Send, Wallet, ArrowLeft } from "lucide-react";
import { formatDiasTrabajados } from "@/lib/dias";
import Avatar from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrecuadreDependiente } from "@/components/cuadre/Precuadre";

export default function PortalDependiente() {
  const { nombre } = useAuth();
  const { history, currents, activePunto, catalogo, settings } = useCuadreStore();
  
  // 1. Inicia directamente en "historial" (Mis Liquidaciones)
  const [tab, setTab] = useState<"historial" | "turno">("historial");
  // 2. Control de página completa para el pre-cuadre (sin modal flotante)
  const [entregandoTurno, setEntregandoTurno] = useState(false);

  const cuadreActual = currents[activePunto];

  const ultimoCuadre = useMemo(() => {
    return history
      .filter((c) => c.puntoVenta === activePunto)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];
  }, [history, activePunto]);

  // Cuadres trabajados históricamente por la dependienta
  const misCuadres = useMemo(() => {
    if (!nombre) return [];
    return history.filter(
      (c) => c.dependiente.trim().toLowerCase() === nombre.trim().toLowerCase()
    );
  }, [history, nombre]);

  // Métricas acumuladas
  const metricas = useMemo(() => {
    let salarioTotal = 0;
    let salarioRealTotal = 0;
    let diferenciasSumadas = 0;

    misCuadres.forEach((c) => {
      const res = calcCuadre(c);
      salarioTotal += res.salarioBruto;
      salarioRealTotal += res.salarioReal;
      diferenciasSumadas += res.diferencia;
    });

    return { salarioTotal, salarioRealTotal, diferenciasSumadas };
  }, [misCuadres]);

  // Productos del turno: ÚNICAMENTE los que tienen existencias al inicio (> 0)
  const productosTurno = useMemo(() => {
    let prods: {
      id: string;
      nombre: string;
      inicio: number;
      entradas: number;
      traslados: number;
      precio: number;
      categoria?: string;
    }[] = [];

    if (cuadreActual?.productos && cuadreActual.productos.length > 0) {
      prods = cuadreActual.productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        inicio: p.inicio || 0,
        entradas: p.entradas || 0,
        traslados: p.traslados || 0,
        precio: p.precio || 0,
        categoria: p.categoria,
      }));
    } else {
      prods = catalogo
        .filter((c) => !c.punto || c.punto === activePunto)
        .map((c) => {
          const anterior = ultimoCuadre?.productos?.find(
            (p) => p.id === c.id || p.nombre === c.nombre
          );
          return {
            id: c.id,
            nombre: c.nombre,
            inicio: anterior?.final ?? 0,
            entradas: 0,
            traslados: 0,
            precio: c.precio,
            categoria: c.categoria,
          };
        });
    }

    // Regla estricta: sólo los productos con existencias en el inicio del turno
    return prods.filter((p) => (p.inicio || 0) > 0);
  }, [cuadreActual, catalogo, activePunto, ultimoCuadre]);

  // Si está entregando turno, se renderiza la página completa de Precuadre
  if (entregandoTurno) {
    return (
      <PrecuadreDependiente
        puntoInicial={activePunto}
        dependienteActual={nombre || ""}
        onSalir={() => {
          if (window.confirm("¿Segura que deseas volver al portal? Los cambios no guardados se perderán.")) {
            setEntregandoTurno(false);
          }
        }}
        onCompletado={() => {
          setEntregandoTurno(false);
          setTab("historial");
        }}
      />
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Cabecera con Avatar de 64px */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <Avatar nombre={nombre || "Dependiente"} size={64} className="rounded-2xl shadow-sm" />
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Portal del Dependiente
              </span>
              <h1 className="text-2xl font-bold">{nombre || "Dependiente"}</h1>
            </div>
          </div>
          <Badge variant="outline" className="text-xs px-3 py-1 font-bold">
            📍 {activePunto}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-2xl border border-border bg-muted/40 p-1">
        <button
          onClick={() => setTab("historial")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
            tab === "historial" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Calendar className="h-4 w-4" /> Mis Liquidaciones
        </button>
        <button
          onClick={() => setTab("turno")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
            tab === "turno" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Clock className="h-4 w-4" /> Turno en Curso
        </button>
      </div>

      {/* Vista de Historial / Liquidaciones (Principal) */}
      {tab === "historial" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Calendar className="h-4 w-4 text-primary" /> Turnos
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">{misCuadres.length}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">completados</div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Wallet className="h-4 w-4 text-emerald-500" /> Salarios Reales
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">${Math.round(metricas.salarioRealTotal)}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">cobrados</div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft col-span-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Scale className="h-4 w-4 text-amber-500" /> Balance de Faltantes / Sobrantes
              </div>
              <div
                className={`mt-2 text-2xl font-bold ${
                  metricas.diferenciasSumadas < 0
                    ? "text-destructive"
                    : metricas.diferenciasSumadas > 0
                    ? "text-emerald-600"
                    : "text-foreground"
                }`}
              >
                {metricas.diferenciasSumadas > 0
                  ? `+$${Math.round(metricas.diferenciasSumadas)}`
                  : `$${Math.round(metricas.diferenciasSumadas)}`}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {misCuadres.map((c) => {
              const res = calcCuadre(c);
              const diff = res.diferencia;
              return (
                <div key={c.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-border/40">
                    <div>
                      <div className="text-sm font-semibold text-foreground">📍 {c.puntoVenta}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDiasTrabajados(c.diasTrabajados) || "Fecha no especificada"}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        diff < 0
                          ? "bg-destructive/10 text-destructive"
                          : diff > 0
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {diff < 0
                        ? `Faltante: -$${Math.abs(Math.round(diff))}`
                        : diff > 0
                        ? `Sobrante: +$${Math.round(diff)}`
                        : "Sin diferencias"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/40 p-2.5 rounded-xl space-y-0.5">
                      <span className="text-muted-foreground text-[11px]">Ventas Totales</span>
                      <div className="font-semibold text-sm text-foreground">${Math.round(res.totalVenta)}</div>
                    </div>
                    <div className="bg-muted/40 p-2.5 rounded-xl space-y-0.5">
                      <span className="text-muted-foreground text-[11px]">Salario Cobrado</span>
                      <div className="font-semibold text-sm text-primary">${Math.round(res.salarioReal)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vista de Turno en Curso */}
      {tab === "turno" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Inventario con Inicio ({productosTurno.length} productos)
              </h2>
              <p className="text-xs text-muted-foreground">Productos activos en mostrador</p>
            </div>
            <Button
              className="rounded-2xl font-bold text-xs"
              onClick={() => setEntregandoTurno(true)}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" /> Entregar Turno
            </Button>
          </div>

          <div className="space-y-2">
            {productosTurno.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-dashed border-border text-muted-foreground text-xs">
                No hay productos con existencias iniciales mayores a 0 en este turno.
              </div>
            ) : (
              productosTurno.map((p) => {
                const disponible = (p.inicio || 0) + (p.entradas || 0) - (p.traslados || 0);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl border border-border bg-card shadow-soft"
                  >          
                  <div>
            <div className="font-semibold text-sm">{p.nombre}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Inicio: <span className="font-semibold text-foreground">{p.inicio ?? 0} und</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground block">Precio de venta</span>
            <span className="text-base font-bold text-primary">${p.precio}</span>
          </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
