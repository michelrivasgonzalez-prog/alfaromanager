import { useMemo, useState } from "react";
import {
  useCuadreStore,
  calcCuadre,
  Cuadre,
  PuntoVenta,
  PUNTOS,
  catLabel,
} from "@/store/cuadreStore";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fmtDinero, fmtCant } from "@/lib/format";
import {
  ChevronLeft,
  ChevronRight,
  Receipt,
  CreditCard,
  Building2,
  User,
  ArrowUpRight,
  Wallet,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Search,
  Award,
  DollarSign,
  ShoppingBag,
  Users,
  BarChart3,
  Coffee,
  Store,
  Percent,
  Flame,
  ArrowUpDown,
} from "lucide-react";

const fmt = fmtDinero;
const fechaTrabajada = (c: Cuadre) => c.diasTrabajados?.[0] ?? c.fecha;
const mesKey = (d: string | Date) => format(new Date(d), "yyyy-MM");

type VistaPeriodo = "mes" | "ultimos10" | "todos";
type SeccionActiva = "ventas" | "dependientes" | "productos" | "gastos";
type OrdenProducto = "ganancia" | "venta" | "margen" | "cantidad";

export default function Reportes() {
  const { history } = useCuadreStore();

  // Estados de control y filtros
  const [puntoFiltro, setPuntoFiltro] = useState<"Todos" | PuntoVenta>("Todos");
  const [modoPeriodo, setModoPeriodo] = useState<VistaPeriodo>("mes");
  const [seccion, setSeccion] = useState<SeccionActiva>("ventas");

  // Filtro de productos
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [ordenProducto, setOrdenProducto] = useState<OrdenProducto>("ganancia");
  const [puntoProducto, setPuntoProducto] = useState<"Todos" | PuntoVenta>("Todos");

  // Meses disponibles con cuadres (más reciente primero)
  const meses = useMemo(() => {
    const set = new Set(history.map((c) => mesKey(fechaTrabajada(c))));
    const arr = [...set].sort();
    if (arr.length === 0) arr.push(mesKey(new Date()));
    return arr;
  }, [history]);

  const [idxMes, setIdxMes] = useState(meses.length - 1);
  const mesSeleccionado = meses[Math.min(idxMes, meses.length - 1)] ?? meses[0];

  // Cuadres filtrados por punto y por período
  const cuadresFiltrados = useMemo(() => {
    let base = history.filter((c) => c.finalizado !== false);

    // Filtro por punto si no es 'Todos'
    if (puntoFiltro !== "Todos") {
      base = base.filter((c) => c.puntoVenta === puntoFiltro);
    }

    if (modoPeriodo === "mes") {
      base = base.filter((c) => mesKey(fechaTrabajada(c)) === mesSeleccionado);
    } else if (modoPeriodo === "ultimos10") {
      // Ordenar por fecha desc y tomar 10
      base = [...base]
        .sort((a, b) => new Date(fechaTrabajada(b)).getTime() - new Date(fechaTrabajada(a)).getTime())
        .slice(0, 10);
    }

    // Retornar en orden cronológico ascendente para gráficos
    return [...base].sort(
      (a, b) => new Date(fechaTrabajada(a)).getTime() - new Date(fechaTrabajada(b)).getTime()
    );
  }, [history, puntoFiltro, modoPeriodo, mesSeleccionado]);

  // Cuadres calculados
  const cuadresCalculados = useMemo(() => {
    return cuadresFiltrados.map((c) => ({
      cuadre: c,
      calc: calcCuadre(c),
      fecha: fechaTrabajada(c),
    }));
  }, [cuadresFiltrados]);

  // 1. Métricas generales de ventas
  const metricasVentas = useMemo(() => {
    const totalVenta = cuadresCalculados.reduce((s, x) => s + x.calc.totalVenta, 0);
    const totalCosto = cuadresCalculados.reduce((s, x) => s + x.calc.totalCosto, 0);
    const gananciaBruta = cuadresCalculados.reduce((s, x) => s + x.calc.gananciaTotal, 0);
    const gananciaNeta = cuadresCalculados.reduce((s, x) => s + x.calc.gananciaNeta, 0);
    const totalGastos = cuadresCalculados.reduce((s, x) => s + x.calc.totalGastos, 0);
    const turnosCount = cuadresCalculados.length;
    const promedioVentaTurno = turnosCount > 0 ? totalVenta / turnosCount : 0;
    const margenNeto = totalVenta > 0 ? (gananciaNeta / totalVenta) * 100 : 0;
    const margenBruto = totalVenta > 0 ? (gananciaBruta / totalVenta) * 100 : 0;

    // Desglose comparativo por punto
    const porPunto = PUNTOS.map((p) => {
      const items = cuadresCalculados.filter((x) => x.cuadre.puntoVenta === p);
      const v = items.reduce((s, x) => s + x.calc.totalVenta, 0);
      const g = items.reduce((s, x) => s + x.calc.gananciaNeta, 0);
      return {
        punto: p,
        turnos: items.length,
        venta: v,
        ganancia: g,
        margen: v > 0 ? (g / v) * 100 : 0,
      };
    });

    return {
      totalVenta,
      totalCosto,
      gananciaBruta,
      gananciaNeta,
      totalGastos,
      turnosCount,
      promedioVentaTurno,
      margenNeto,
      margenBruto,
      porPunto,
    };
  }, [cuadresCalculados]);

  // Datos para gráfico de ventas
  const dataGrafico = useMemo(() => {
    return cuadresCalculados.map(({ cuadre, calc, fecha }) => ({
      name: format(new Date(fecha), "dd/MM", { locale: es }),
      Venta: Math.round(calc.totalVenta),
      Ganancia: Math.round(calc.gananciaNeta),
      punto: cuadre.puntoVenta,
      dependiente: cuadre.dependiente,
    }));
  }, [cuadresCalculados]);

  // 2. Comportamiento de Faltantes y Dependientes
  const metricasDependientes = useMemo(() => {
    const mapa = new Map<
      string,
      {
        nombre: string;
        turnos: number;
        ventas: number;
        faltanteTotal: number;
        sobranteTotal: number;
        deudaGenerada: number;
        turnosConFaltante: number;
        turnosSinFaltante: number;
        ultimoFaltante: number;
        puntos: Set<PuntoVenta>;
      }
    >();

    for (const { cuadre, calc } of cuadresCalculados) {
      const dep = (cuadre.dependiente || "Sin asignar").trim();
      const dif = calc.diferencia;
      const faltante = dif < 0 ? Math.abs(dif) : 0;
      const sobrante = dif > 0 ? dif : 0;
      const deuda = Math.max(0, faltante - calc.salarioBruto);

      const actual = mapa.get(dep) || {
        nombre: dep,
        turnos: 0,
        ventas: 0,
        faltanteTotal: 0,
        sobranteTotal: 0,
        deudaGenerada: 0,
        turnosConFaltante: 0,
        turnosSinFaltante: 0,
        ultimoFaltante: 0,
        puntos: new Set<PuntoVenta>(),
      };

      actual.turnos += 1;
      actual.ventas += calc.totalVenta;
      actual.faltanteTotal += faltante;
      actual.sobranteTotal += sobrante;
      actual.deudaGenerada += deuda;
      if (faltante > 0) {
        actual.turnosConFaltante += 1;
        actual.ultimoFaltante = faltante;
      } else {
        actual.turnosSinFaltante += 1;
      }
      actual.puntos.add(cuadre.puntoVenta);

      mapa.set(dep, actual);
    }

    return Array.from(mapa.values())
      .map((d) => ({
        ...d,
        tasaExactitud: d.turnos > 0 ? (d.turnosSinFaltante / d.turnos) * 100 : 100,
        faltantePromedio: d.turnos > 0 ? d.faltanteTotal / d.turnos : 0,
      }))
      .sort((a, b) => b.faltanteTotal - a.faltanteTotal || b.ventas - a.ventas);
  }, [cuadresCalculados]);

  // 3. Mejores Productos Históricamente (con márgenes y clasificados por punto)
  const rankingProductos = useMemo(() => {
    // Si estamos en modo "todos" o "mes", analizamos según filtro o global
    const fuenteCuadres =
      modoPeriodo === "todos"
        ? history.filter((c) => c.finalizado !== false)
        : cuadresFiltrados;

    const mapa = new Map<
      string,
      {
        id: string;
        nombre: string;
        categoria: string;
        punto: PuntoVenta;
        cantidad: number;
        venta: number;
        costo: number;
        ganancia: number;
        precios: number[];
        costos: number[];
        apariciones: number;
      }
    >();

    for (const c of fuenteCuadres) {
      if (puntoProducto !== "Todos" && c.puntoVenta !== puntoProducto) continue;

      const calc = calcCuadre(c);
      for (const p of calc.productos) {
        if (!p.venta || p.venta <= 0) continue;

        const key = `${c.puntoVenta}__${p.nombre.trim().toLowerCase()}`;
        const actual = mapa.get(key) || {
          id: key,
          nombre: p.nombre.trim(),
          categoria: p.categoria || "Varios",
          punto: c.puntoVenta,
          cantidad: 0,
          venta: 0,
          costo: 0,
          ganancia: 0,
          precios: [],
          costos: [],
          apariciones: 0,
        };

        actual.cantidad += p.venta;
        actual.venta += p.importe;
        actual.costo += p.costoTotal;
        actual.ganancia += p.ganancia;
        actual.apariciones += 1;
        if (p.precio > 0) actual.precios.push(p.precio);
        if (p.costo > 0) actual.costos.push(p.costo);

        mapa.set(key, actual);
      }
    }

    let arr = Array.from(mapa.values()).map((p) => {
      const margen = p.venta > 0 ? (p.ganancia / p.venta) * 100 : 0;
      const precioPromedio =
        p.precios.length > 0
          ? p.precios.reduce((a, b) => a + b, 0) / p.precios.length
          : p.cantidad > 0
          ? p.venta / p.cantidad
          : 0;
      const costoPromedio =
        p.costos.length > 0
          ? p.costos.reduce((a, b) => a + b, 0) / p.costos.length
          : p.cantidad > 0
          ? p.costo / p.cantidad
          : 0;

      return {
        ...p,
        margen,
        precioPromedio,
        costoPromedio,
      };
    });

    // Filtro por búsqueda
    if (busquedaProducto.trim()) {
      const q = busquedaProducto.toLowerCase().trim();
      arr = arr.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.categoria.toLowerCase().includes(q)
      );
    }

    // Ordenación
    arr.sort((a, b) => {
      if (ordenProducto === "ganancia") return b.ganancia - a.ganancia;
      if (ordenProducto === "venta") return b.venta - a.venta;
      if (ordenProducto === "margen") return b.margen - a.margen;
      if (ordenProducto === "cantidad") return b.cantidad - a.cantidad;
      return 0;
    });

    return arr;
  }, [history, cuadresFiltrados, modoPeriodo, puntoProducto, busquedaProducto, ordenProducto]);

  // 4. Desglose de Gastos
  const desgloseGastos = useMemo(() => {
    const mapa: Record<string, { total: number; cantidad: number }> = {
      Local: { total: 0, cantidad: 0 },
      Yanitza: { total: 0, cantidad: 0 },
      "Salida de efectivo": { total: 0, cantidad: 0 },
      "Cuentas por Cobrar": { total: 0, cantidad: 0 },
      Transferencia: { total: 0, cantidad: 0 },
    };

    let total = 0;
    for (const { cuadre } of cuadresCalculados) {
      for (const g of cuadre.gastos) {
        const catNorm = catLabel(g.categoria);
        if (!mapa[catNorm]) {
          mapa[catNorm] = { total: 0, cantidad: 0 };
        }
        const m = Number(g.monto || 0);
        mapa[catNorm].total += m;
        mapa[catNorm].cantidad += 1;
        total += m;
      }
    }
    return { mapa, total };
  }, [cuadresCalculados]);

  const etiquetaMes = format(new Date(`${mesSeleccionado}-01T12:00:00`), "MMMM yyyy", {
    locale: es,
  });

  return (
    <div className="space-y-4 pb-12">
      {/* Título y Filtros Maestros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes Analíticos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Métricas de turnos, exactitud de dependientes y rentabilidad de productos
          </p>
        </div>

        {/* Selector de Punto */}
        <div className="flex items-center gap-1 p-1 bg-muted/60 border border-border rounded-xl self-start sm:self-auto">
          {(["Todos", "Cafetería", "Mipyme"] as const).map((p) => {
            const activo = puntoFiltro === p;
            return (
              <button
                key={p}
                onClick={() => setPuntoFiltro(p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activo
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "Cafetería" && <Coffee className="h-3.5 w-3.5 text-primary" />}
                {p === "Mipyme" && <Store className="h-3.5 w-3.5 text-secondary" />}
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selector de Rango Temporal */}
      <div className="rounded-2xl border border-border bg-card p-3 shadow-soft space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={modoPeriodo === "mes" ? "default" : "outline"}
              className="h-7 text-xs rounded-lg px-2.5"
              onClick={() => setModoPeriodo("mes")}
            >
              Mensual
            </Button>
            <Button
              size="sm"
              variant={modoPeriodo === "ultimos10" ? "default" : "outline"}
              className="h-7 text-xs rounded-lg px-2.5"
              onClick={() => setModoPeriodo("ultimos10")}
            >
              Últimos 10 Turnos
            </Button>
            <Button
              size="sm"
              variant={modoPeriodo === "todos" ? "default" : "outline"}
              className="h-7 text-xs rounded-lg px-2.5"
              onClick={() => setModoPeriodo("todos")}
            >
              Histórico Completo
            </Button>
          </div>

          <Badge variant="secondary" className="font-mono text-[11px] px-2 py-0.5">
            {cuadresCalculados.length} turno(s)
          </Badge>
        </div>

        {modoPeriodo === "mes" && (
          <div className="flex items-center justify-between pt-1 border-t border-dashed border-border/80">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              disabled={idxMes <= 0}
              onClick={() => setIdxMes((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <span className="text-sm font-bold capitalize text-primary">
                {etiquetaMes}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              disabled={idxMes >= meses.length - 1}
              onClick={() => setIdxMes((i) => Math.min(meses.length - 1, i + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Pestañas Temáticas de Navegación */}
      <div className="grid grid-cols-4 gap-1.5 p-1 bg-muted/50 border border-border rounded-2xl">
        {[
          { key: "ventas", label: "Ventas", icon: BarChart3 },
          { key: "dependientes", label: "Faltantes", icon: Users },
          { key: "productos", label: "Productos", icon: Award },
          { key: "gastos", label: "Gastos", icon: Receipt },
        ].map((tab) => {
          const Icon = tab.icon;
          const activo = seccion === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSeccion(tab.key as SeccionActiva)}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-2 px-1 rounded-xl text-xs font-semibold transition-all ${
                activo
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${activo ? "text-primary" : ""}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================
          SECCIÓN 1: COMPORTAMIENTO DE VENTAS
         ======================================================== */}
      {seccion === "ventas" && (
        <div className="space-y-4">
          {/* KPI Cards Maestras */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl gradient-primary p-4 text-primary-foreground shadow-soft">
              <div className="flex items-center justify-between opacity-80 text-[10px] uppercase tracking-wider font-semibold">
                <span>Venta Total</span>
                <DollarSign className="h-4 w-4" />
              </div>
              <div className="mt-1 text-2xl font-black tracking-tight">
                {fmt(metricasVentas.totalVenta)}
              </div>
              <div className="mt-1 text-[11px] opacity-85">
                {metricasVentas.turnosCount} turnos analizados
              </div>
            </div>

            <div className="rounded-2xl gradient-emerald p-4 text-secondary-foreground shadow-soft">
              <div className="flex items-center justify-between opacity-80 text-[10px] uppercase tracking-wider font-semibold">
                <span>Ganancia Neta</span>
                <TrendingUp className="h-4 w-4" />
              </div>
              <div className="mt-1 text-2xl font-black tracking-tight">
                {fmt(metricasVentas.gananciaNeta)}
              </div>
              <div className="mt-1 text-[11px] font-semibold opacity-85">
                Margen neto: {metricasVentas.margenNeto.toFixed(1)}%
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">
                <span>Promedio / Turno</span>
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums">
                {fmt(metricasVentas.promedioVentaTurno)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Gto. promedio: {fmt(metricasVentas.turnosCount > 0 ? metricasVentas.totalGastos / metricasVentas.turnosCount : 0)}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">
                <span>Ganancia Bruta</span>
                <Percent className="h-4 w-4 text-secondary" />
              </div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-secondary">
                {fmt(metricasVentas.gananciaBruta)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Margen bruto: {metricasVentas.margenBruto.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Comparativa Cafetería vs Mipyme si estamos en Todos */}
          {puntoFiltro === "Todos" && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Desglose Comparativo por Punto
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {metricasVentas.porPunto.map((pt) => {
                  const pctVenta =
                    metricasVentas.totalVenta > 0
                      ? Math.round((pt.venta / metricasVentas.totalVenta) * 100)
                      : 0;
                  return (
                    <div
                      key={pt.punto}
                      className="rounded-xl border border-border bg-muted/30 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-sm">
                          {pt.punto === "Cafetería" ? (
                            <Coffee className="h-4 w-4 text-primary" />
                          ) : (
                            <Store className="h-4 w-4 text-secondary" />
                          )}
                          <span>{pt.punto}</span>
                        </div>
                        <Badge variant="outline" className="font-mono text-xs">
                          {pt.turnos} turnos
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-[10px] text-muted-foreground">Venta Total</div>
                          <div className="font-mono font-bold text-sm">{fmt(pt.venta)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">Ganancia Neta</div>
                          <div className="font-mono font-bold text-sm text-secondary">
                            {fmt(pt.ganancia)}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                          <span>Aporte a ventas: <b>{pctVenta}%</b></span>
                          <span>Margen neto: <b>{pt.margen.toFixed(1)}%</b></span>
                        </div>
                        <div className="h-2 rounded-full bg-border overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              pt.punto === "Cafetería" ? "bg-primary" : "bg-secondary"
                            }`}
                            style={{ width: `${pctVenta}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Gráfico de Ventas y Ganancias */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold">Comportamiento Turno a Turno</h2>
                <p className="text-[11px] text-muted-foreground">
                  Comparativa de Venta vs Ganancia Neta
                </p>
              </div>
            </div>

            {dataGrafico.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No hay turnos registrados en este período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dataGrafico} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} />
                  <XAxis dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [fmt(value), ""]}
                  />
                  <Bar dataKey="Venta" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Venta" />
                  <Bar dataKey="Ganancia" fill="hsl(var(--secondary))" radius={[6, 6, 0, 0]} name="Ganancia Neta" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          SECCIÓN 2: COMPORTAMIENTO DE FALTANTES & DEPENDIENTES
         ======================================================== */}
      {seccion === "dependientes" && (
        <div className="space-y-4">
          {/* Tarjeta de Resumen de Faltantes */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h2 className="text-sm font-bold">Auditoría de Faltantes y Caja</h2>
              </div>
              <Badge variant="outline" className="text-xs">
                {metricasDependientes.length} dependientes
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-xl border border-border bg-muted/30 p-2.5">
                <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Faltante Acumulado
                </div>
                <div className="font-mono text-base font-bold tabular-nums text-destructive mt-0.5">
                  {fmt(metricasDependientes.reduce((s, d) => s + d.faltanteTotal, 0))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-2.5">
                <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Sobrantes / Propina
                </div>
                <div className="font-mono text-base font-bold tabular-nums text-secondary mt-0.5">
                  {fmt(metricasDependientes.reduce((s, d) => s + d.sobranteTotal, 0))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-2.5">
                <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Deudas de Faltante
                </div>
                <div className="font-mono text-base font-bold tabular-nums text-amber-500 mt-0.5">
                  {fmt(metricasDependientes.reduce((s, d) => s + d.deudaGenerada, 0))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-2.5">
                <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Exactitud Promedio
                </div>
                <div className="font-mono text-base font-bold tabular-nums mt-0.5">
                  {metricasDependientes.length > 0
                    ? (
                        metricasDependientes.reduce((s, d) => s + d.tasaExactitud, 0) /
                        metricasDependientes.length
                      ).toFixed(1)
                    : "100"}
                  %
                </div>
              </div>
            </div>
          </div>

          {/* Lista Detallada de Dependientes */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Rendimiento Individual por Dependiente
            </h3>

            {metricasDependientes.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground rounded-2xl border border-border bg-card">
                No hay registros de dependientes en este período
              </div>
            ) : (
              metricasDependientes.map((d) => {
                const tieneFaltante = d.faltanteTotal > 0;
                const tieneDeuda = d.deudaGenerada > 0;

                return (
                  <div
                    key={d.nombre}
                    className="rounded-2xl border border-border bg-card p-3.5 shadow-soft space-y-2.5 transition-all hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{d.nombre}</span>
                          {tieneFaltante ? (
                            tieneDeuda ? (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                Deuda activa
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0">
                                Faltante descontado
                              </Badge>
                            )
                          ) : (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0 flex items-center gap-0.5">
                              <CheckCircle2 className="h-3 w-3" /> Caja exacta
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {d.turnos} turnos • Puntos: {Array.from(d.puntos).join(", ")}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground">Ventas aportadas</div>
                        <div className="font-mono font-bold text-sm tabular-nums">
                          {fmt(d.ventas)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-dashed border-border/80 text-xs">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Faltante total</span>
                        <span
                          className={`font-mono font-bold tabular-nums ${
                            tieneFaltante ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {fmt(d.faltanteTotal)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">
                          Turnos sin falta
                        </span>
                        <span className="font-mono font-semibold tabular-nums">
                          {d.turnosSinFaltante} de {d.turnos} ({d.tasaExactitud.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block">Sobrante</span>
                        <span className="font-mono font-semibold tabular-nums text-secondary">
                          {fmt(d.sobranteTotal)}
                        </span>
                      </div>
                    </div>

                    {/* Barra de exactitud */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Exactitud en arqueos</span>
                        <span className="font-bold">{d.tasaExactitud.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            d.tasaExactitud >= 90
                              ? "bg-secondary"
                              : d.tasaExactitud >= 70
                              ? "bg-amber-500"
                              : "bg-destructive"
                          }`}
                          style={{ width: `${Math.max(5, d.tasaExactitud)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          SECCIÓN 3: MEJORES PRODUCTOS, MÁRGENES Y GANANCIAS
         ======================================================== */}
      {seccion === "productos" && (
        <div className="space-y-3">
          {/* Cabecera y Controles de Productos */}
          <div className="rounded-2xl border border-border bg-card p-3 shadow-soft space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold">Top Productos y Rentabilidad</h2>
              </div>

              {/* Filtro específico por punto */}
              <div className="flex items-center gap-1 p-0.5 bg-muted/60 border border-border rounded-lg self-start sm:self-auto">
                {(["Todos", "Cafetería", "Mipyme"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPuntoProducto(p)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                      puntoProducto === p
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Buscador y Criterio de Orden */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto o categoría..."
                  value={busquedaProducto}
                  onChange={(e) => setBusquedaProducto(e.target.value)}
                  className="pl-8 h-8 text-xs rounded-xl"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1 shrink-0">
                  <ArrowUpDown className="h-3 w-3" /> Ordenar:
                </span>
                {[
                  { key: "ganancia", label: "Mayor Ganancia" },
                  { key: "venta", label: "Mayor Venta" },
                  { key: "margen", label: "Mayor Margen %" },
                  { key: "cantidad", label: "Volumen" },
                ].map((o) => (
                  <Button
                    key={o.key}
                    size="sm"
                    variant={ordenProducto === o.key ? "default" : "ghost"}
                    className="h-7 text-[10px] px-2 rounded-lg shrink-0"
                    onClick={() => setOrdenProducto(o.key as OrdenProducto)}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Listado de Productos Ranking */}
          <div className="space-y-2">
            {rankingProductos.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground rounded-2xl border border-border bg-card">
                No se encontraron productos con ventas en los turnos analizados
              </div>
            ) : (
              rankingProductos.map((p, index) => {
                const esTop3 = index < 3;
                const medalColor =
                  index === 0
                    ? "text-amber-500 bg-amber-500/10 border-amber-500/30"
                    : index === 1
                    ? "text-slate-400 bg-slate-400/10 border-slate-400/30"
                    : index === 2
                    ? "text-amber-700 bg-amber-700/10 border-amber-700/30"
                    : "text-muted-foreground bg-muted/40 border-border";

                return (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-border bg-card p-3 shadow-soft space-y-2 transition-all hover:border-primary/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <div
                          className={`w-6 h-6 rounded-lg border flex items-center justify-center font-bold text-xs shrink-0 ${medalColor}`}
                        >
                          #{index + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-sm truncate flex items-center gap-1.5">
                            <span>{p.nombre}</span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] px-1 py-0 uppercase font-semibold ${
                                p.punto === "Cafetería"
                                  ? "text-primary border-primary/30"
                                  : "text-secondary border-secondary/30"
                              }`}
                            >
                              {p.punto}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                            <span>{p.categoria}</span>
                            <span>•</span>
                            <span>
                              Cant: <b className="text-foreground">{fmtCant(p.cantidad)}</b>
                            </span>
                            <span>•</span>
                            <span>{p.apariciones} turno(s)</span>
                          </div>
                        </div>
                      </div>

                      {/* Importe Ganancia */}
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-muted-foreground">Ganancia Neta</div>
                        <div className="font-mono text-sm font-bold text-secondary tabular-nums">
                          {fmt(p.ganancia)}
                        </div>
                      </div>
                    </div>

                    {/* Desglose de Ventas, Costos y Margen */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-dashed border-border/80 text-xs">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Venta Total</span>
                        <span className="font-mono font-semibold tabular-nums">{fmt(p.venta)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Costo Total</span>
                        <span className="font-mono font-semibold tabular-nums text-muted-foreground">
                          {fmt(p.costo)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block">
                          Margen Ganancia
                        </span>
                        <span
                          className={`font-mono font-bold tabular-nums ${
                            p.margen >= 25
                              ? "text-secondary"
                              : p.margen >= 15
                              ? "text-primary"
                              : "text-amber-500"
                          }`}
                        >
                          {p.margen.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Barra de Margen */}
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          p.margen >= 25
                            ? "bg-secondary"
                            : p.margen >= 15
                            ? "bg-primary"
                            : "bg-amber-500"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(5, p.margen))}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          SECCIÓN 4: GASTOS POR CATEGORÍA
         ======================================================== */}
      {seccion === "gastos" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Gastos del período por categoría</h2>
              </div>
              <span className="font-mono text-base font-bold tabular-nums text-destructive">
                {fmt(desgloseGastos.total)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { key: "Local", label: "Local", icon: Building2, color: "text-amber-500 bg-amber-500/10" },
                { key: "Yanitza", label: "Yanitza", icon: User, color: "text-purple-500 bg-purple-500/10" },
                { key: "Salida de efectivo", label: "Salidas / Compras", icon: Wallet, color: "text-blue-500 bg-blue-500/10" },
                { key: "Cuentas por Cobrar", label: "Cuentas por Cobrar", icon: ArrowUpRight, color: "text-orange-500 bg-orange-500/10" },
                { key: "Transferencia", label: "Transferencias", icon: CreditCard, color: "text-cyan-500 bg-cyan-500/10" },
              ].map((cat) => {
                const dataCat = desgloseGastos.mapa[cat.key] ?? { total: 0, cantidad: 0 };
                const pct =
                  desgloseGastos.total > 0
                    ? Math.round((dataCat.total / desgloseGastos.total) * 100)
                    : 0;
                const Icon = cat.icon;

                return (
                  <div
                    key={cat.key}
                    className="rounded-xl border border-border bg-muted/40 p-2.5 flex flex-col justify-between space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground truncate" title={cat.label}>
                        {cat.label}
                      </span>
                      <div className={`p-1 rounded-md shrink-0 ${cat.color}`}>
                        <Icon className="h-3 w-3" />
                      </div>
                    </div>
                    <div>
                      <div className="font-mono text-sm font-bold tabular-nums">
                        {fmt(dataCat.total)}
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-0.5">
                        <span>{dataCat.cantidad} op.</span>
                        <span className="font-semibold">{pct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
