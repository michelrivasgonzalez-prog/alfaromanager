import { useState, useMemo } from "react";
import { 
  Cuadre, 
  PuntoVenta, 
  PUNTOS, 
  calcCuadre 
} from "@/store/cuadreStore";
import { fmtDinero, fmtCant } from "@/lib/format";
import { formatDiasTrabajados } from "@/lib/dias";
import { 
  TrendingUp, 
  TrendingDown, 
  Package, 
  ShieldCheck, 
  AlertTriangle, 
  Flame, 
  Coins, 
  Store, 
  Coffee,
  Minus
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardMetricasProps {
  history: Cuadre[];
}

export default function DashboardMetricas({ history }: DashboardMetricasProps) {
  const [puntoFiltro, setPuntoFiltro] = useState<PuntoVenta | "Todos">("Todos");

  // Filtrar y ordenar turnos finalizados (del más reciente al más antiguo)
  const turnos = useMemo(() => {
    return history
      .filter((c) => (puntoFiltro === "Todos" ? true : c.puntoVenta === puntoFiltro))
      .sort((a, b) => {
        const dateA = new Date(a.fecha || 0).getTime();
        const dateB = new Date(b.fecha || 0).getTime();
        return dateB - dateA;
      });
  }, [history, puntoFiltro]);

  // Si no hay turnos registrados en este filtro
  if (turnos.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft text-center text-sm text-muted-foreground">
        No hay turnos finalizados suficientes para calcular analíticas en este punto de venta.
      </div>
    );
  }

  // Cálculos del turno más reciente y del anterior
  const ultimoCuadre = turnos[0];
  const anteriorCuadre = turnos[1] || null;

  const resUltimo = calcCuadre(ultimoCuadre);
  const resAnterior = anteriorCuadre ? calcCuadre(anteriorCuadre) : null;

  // 1. Comparativa de Ventas
  const ventaUltima = resUltimo.totalVenta;
  const ventaAnterior = resAnterior ? resAnterior.totalVenta : null;
  const difVenta = ventaAnterior !== null ? ventaUltima - ventaAnterior : 0;
  const pctVenta = ventaAnterior && ventaAnterior > 0 
    ? Math.round((difVenta / ventaAnterior) * 100) 
    : 0;

  // Promedio de ventas de los últimos hasta 4 turnos
  const muestraTurnos = turnos.slice(0, 4);
  const promedioVenta = Math.round(
    muestraTurnos.reduce((acc, c) => acc + calcCuadre(c).totalVenta, 0) / muestraTurnos.length
  );

  // 2. Volumen de Inventario
  const unidadesVendidas = resUltimo.productos.reduce((sum, p) => sum + (p.venta || 0), 0);
  const productosConVenta = resUltimo.productos.filter((p) => (p.venta || 0) > 0).length;
  const unidadesAnteriores = resAnterior 
    ? resAnterior.productos.reduce((sum, p) => sum + (p.venta || 0), 0) 
    : null;
  const difUnidades = unidadesAnteriores !== null ? unidadesVendidas - unidadesAnteriores : 0;

  // 3. Eficiencia en Caja
  const diferenciaCaja = resUltimo.diferencia; // > 0 propina/sobrante, < 0 faltante
  const esFaltante = diferenciaCaja < -1;
  const esSobrante = diferenciaCaja > 1;
  const efectividadArqueo = ventaUltima > 0
    ? Math.max(0, Math.min(100, Math.round(((ventaUltima - Math.abs(diferenciaCaja)) / ventaUltima) * 100)))
    : 100;

  // 4. Margen Comercial
  const margenBrutoPct = ventaUltima > 0 
    ? Math.round((resUltimo.gananciaTotal / ventaUltima) * 100) 
    : 0;

  // 5. Rotación de Productos Clave (Top 5 del último turno)
  const topProductos = [...resUltimo.productos]
    .filter((p) => p.venta > 0)
    .sort((a, b) => b.importe - a.importe)
    .slice(0, 5);

  const maxImporteTop = topProductos[0]?.importe || 1;

  return (
    <div className="space-y-4">
      {/* Encabezado y Selector de Punto de Venta */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-primary">Rendimiento Operativo</h2>
          <p className="text-xs text-muted-foreground">
            Último turno: {ultimoCuadre.dependiente || "Sin asignar"} ({formatDiasTrabajados(ultimoCuadre.diasTrabajados) || ultimoCuadre.fecha})
          </p>
        </div>

        {/* Pestañas de Filtro */}
        <div className="flex items-center rounded-xl border border-border bg-muted/40 p-0.5 text-xs font-semibold">
          <button
            onClick={() => setPuntoFiltro("Todos")}
            className={cn(
              "rounded-lg px-2.5 py-1 transition-smooth",
              puntoFiltro === "Todos" 
                ? "bg-card text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Todos
          </button>
          {PUNTOS.map((p) => (
            <button
              key={p}
              onClick={() => setPuntoFiltro(p)}
              className={cn(
                "flex items-center gap-1 rounded-lg px-2.5 py-1 transition-smooth",
                puntoFiltro === p 
                  ? "bg-card text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p === "Cafetería" ? <Coffee className="h-3 w-3" /> : <Store className="h-3 w-3" />}
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Métricas Principales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Tarjeta 1: Ventas y Comparativa */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">Ventas Turno</span>
            {ventaAnterior !== null && (
              <span
                className={cn(
                  "flex items-center text-[11px] font-bold",
                  difVenta >= 0 ? "text-secondary" : "text-destructive"
                )}
              >
                {difVenta >= 0 ? <TrendingUp className="mr-0.5 h-3 w-3" /> : <TrendingDown className="mr-0.5 h-3 w-3" />}
                {difVenta >= 0 ? `+${pctVenta}%` : `${pctVenta}%`}
              </span>
            )}
          </div>
          <div className="mt-1 text-xl font-bold text-primary font-mono tabular-nums">
            {fmtDinero(ventaUltima)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Promedio: <span className="font-semibold text-foreground">{fmtDinero(promedioVenta)}</span>
          </div>
        </div>

        {/* Tarjeta 2: Volumen de Inventario */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">Unidades Vendidas</span>
            <Package className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-1 text-xl font-bold text-primary font-mono tabular-nums">
            {fmtCant(unidadesVendidas)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {productosConVenta} productos rotados{" "}
            {unidadesAnteriores !== null && (
              <span className={difUnidades >= 0 ? "text-secondary font-semibold" : "text-muted-foreground"}>
                ({difUnidades >= 0 ? `+${fmtCant(difUnidades)}` : fmtCant(difUnidades)})
              </span>
            )}
          </div>
        </div>

        {/* Tarjeta 3: Eficiencia en Caja */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">Exactitud Caja</span>
            {esFaltante ? (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-secondary" />
            )}
          </div>
          <div
            className={cn(
              "mt-1 text-xl font-bold font-mono tabular-nums",
              esFaltante ? "text-destructive" : "text-secondary"
            )}
          >
            {efectividadArqueo}%
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground truncate">
            {esFaltante ? (
              <span className="text-destructive font-semibold">Faltante: {fmtDinero(Math.abs(diferenciaCaja))}</span>
            ) : esSobrante ? (
              <span className="text-secondary font-semibold">Sobrante: +{fmtDinero(diferenciaCaja)}</span>
            ) : (
              "Arqueo exacto ($0)"
            )}
          </div>
        </div>

        {/* Tarjeta 4: Margen Bruto */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">Margen Bruto</span>
            <Coins className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-1 text-xl font-bold text-primary font-mono tabular-nums">
            {margenBrutoPct}%
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Ganancia: <span className="font-semibold text-foreground">{fmtDinero(resUltimo.gananciaTotal)}</span>
          </div>
        </div>
      </div>

      {/* Desglose de Recaudación en Efectivo */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-muted/20 p-3 text-xs">
        <div>
          <span className="text-muted-foreground">Entregado en Recogidas:</span>
          <div className="font-mono text-sm font-semibold text-primary">
            {fmtDinero(resUltimo.efectivoRecogido)}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Efectivo final en Arqueo:</span>
          <div className="font-mono text-sm font-semibold text-primary">
            {fmtDinero(resUltimo.efectivoCajaFinal)}
          </div>
        </div>
      </div>

      {/* Top Productos con Mayor Rotación */}
      {topProductos.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <Flame className="h-4 w-4 text-warning" />
              Líderes de Venta del Turno
            </div>
            <span className="text-[11px] text-muted-foreground">Por volumen de importe</span>
          </div>

          <div className="space-y-2.5">
            {topProductos.map((p, idx) => {
              const anchoPct = Math.max(8, Math.round((p.importe / maxImporteTop) * 100));
              return (
                <div key={p.id || p.nombre} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate pr-2">
                      <span className="text-muted-foreground mr-1.5 font-mono">{idx + 1}.</span>
                      {p.nombre}
                    </span>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-primary">{fmtDinero(p.importe)}</span>
                      <span className="ml-1.5 text-[11px] text-muted-foreground">({fmtCant(p.venta)} u.)</span>
                    </div>
                  </div>
                  {/* Barra visual de rotación relativa */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-secondary transition-all"
                      style={{ width: `${anchoPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
