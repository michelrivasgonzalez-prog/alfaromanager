import { useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle, ArrowDownToLine, ArrowLeftRight, CalendarDays,
  ChevronDown, ChevronUp, ClipboardCopy, Download, History,
  Package, Settings2, ShoppingCart, SlidersHorizontal, TrendingDown, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import type { CatalogoItem, PuntoVenta } from "@/store/cuadreStore";
import { useCuadreStore } from "@/store/cuadreStore";
import {
  filtrarKardex, kardexProducto, resumenKardex, stockKey,
  type KardexFila, type TipoMovimientoKardex,
} from "@/lib/kardex";
import { pushSettings } from "@/lib/sync";
import { codigosDeProducto } from "@/lib/codigosBarras";

type Periodo = "todos" | "7" | "30" | "90" | "mes" | "personalizado";

const numero = (valor: number) =>
  Number(valor || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function fechaLegible(fecha: string): string {
  if (!fecha) return "Fecha no disponible";
  const fechaSegura = /^\d{4}-\d{2}-\d{2}$/.test(fecha)
    ? new Date(fecha + "T12:00:00")
    : new Date(fecha);
  return Number.isNaN(fechaSegura.getTime())
    ? fecha.slice(0, 10)
    : format(fechaSegura, "d MMM yyyy", { locale: es });
}

function periodoTurno(fila: KardexFila) {
  const dias = fila.diasTrabajados;
  if (!dias.length) return fechaLegible(fila.fecha);
  if (dias.length === 1) return fechaLegible(dias[0]);
  return fechaLegible(dias[0]) + " — " + fechaLegible(dias[dias.length - 1]);
}

function obtenerFechas(periodo: Periodo, desde: string, hasta: string) {
  const hoy = new Date();
  switch (periodo) {
    case "7": return { desde: format(subDays(hoy, 6), "yyyy-MM-dd"), hasta: format(hoy, "yyyy-MM-dd") };
    case "30": return { desde: format(subDays(hoy, 29), "yyyy-MM-dd"), hasta: format(hoy, "yyyy-MM-dd") };
    case "90": return { desde: format(subDays(hoy, 89), "yyyy-MM-dd"), hasta: format(hoy, "yyyy-MM-dd") };
    case "mes": return { desde: format(hoy, "yyyy-MM") + "-01", hasta: format(hoy, "yyyy-MM-dd") };
    case "personalizado": return { desde, hasta };
    default: return { desde: "", hasta: "" };
  }
}

function ResumenCard({
  titulo, valor, icono: Icon, tono = "normal",
}: {
  titulo: string;
  valor: string;
  icono: typeof Package;
  tono?: "normal" | "positivo" | "negativo";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={"h-4 w-4 shrink-0 " +
          (tono === "positivo" ? "text-emerald-600" : tono === "negativo" ? "text-rose-600" : "text-primary")}
        />
        <span>{titulo}</span>
      </div>
      <p className={"mt-1 text-lg font-bold tabular-nums sm:text-xl " +
        (tono === "positivo" ? "text-emerald-700 dark:text-emerald-400" :
          tono === "negativo" ? "text-rose-700 dark:text-rose-400" : "text-foreground")}>
        {valor}
      </p>
    </div>
  );
}

function DatoMovimiento({
  titulo, cantidad, tono,
}: {
  titulo: string; cantidad: number; tono?: "positivo" | "negativo";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{titulo}</p>
      <p className={"text-sm font-semibold tabular-nums " +
        (tono === "positivo" && cantidad > 0 ? "text-emerald-700 dark:text-emerald-400" :
          tono === "negativo" && cantidad > 0 ? "text-rose-700 dark:text-rose-400" : "")}>
        {tono === "positivo" && cantidad > 0 ? "+" : tono === "negativo" && cantidad > 0 ? "−" : ""}
        {numero(cantidad)}
      </p>
    </div>
  );
}

export function KardexDialog({
  nombre, punto, producto, onClose,
}: {
  nombre: string | null;
  punto: PuntoVenta;
  producto?: CatalogoItem | null;
  onClose: () => void;
}) {
  const history = useCuadreStore((s) => s.history);
  const settings = useCuadreStore((s) => s.settings);
  const updateSettings = useCuadreStore((s) => s.updateSettings);
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [movimiento, setMovimiento] = useState<TipoMovimientoKardex>("todos");
  const [dependiente, setDependiente] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [editarMinimo, setEditarMinimo] = useState(false);
  const [minimoBorrador, setMinimoBorrador] = useState(0);
  const [guardandoMinimo, setGuardandoMinimo] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [imagenErronea, setImagenErronea] = useState(false);

  const codigos = useMemo(() => producto ? codigosDeProducto(producto) : [], [producto]);
  const filas = useMemo(
    () => nombre ? kardexProducto(history, punto, nombre, codigos) : [],
    [history, punto, nombre, codigos]
  );
  const key = nombre ? stockKey(punto, nombre) : "";
  const minimo = settings.stockMinimo?.[key] ?? 0;

  useEffect(() => {
    setPeriodo("todos");
    setDesde("");
    setHasta("");
    setMovimiento("todos");
    setDependiente("");
    setExpandido(null);
    setEditarMinimo(false);
    setImagenErronea(false);
  }, [nombre, punto]);

  useEffect(() => setMinimoBorrador(minimo), [minimo, key]);

  const fechas = obtenerFechas(periodo, desde, hasta);
  const rangoInvalido = Boolean(fechas.desde && fechas.hasta && fechas.desde > fechas.hasta);
  const opcionesDependientes = useMemo(
    () => Array.from(new Set(filas.map(f => f.dependiente).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "es")),
    [filas]
  );
  const visibles = useMemo(
    () => rangoInvalido ? [] : filtrarKardex(filas, {
      ...fechas, movimiento, dependiente,
    }),
    [filas, fechas.desde, fechas.hasta, movimiento, dependiente, rangoInvalido]
  );
  const totales = useMemo(() => resumenKardex(visibles), [visibles]);

  // Esta cifra no depende del filtro de fechas: procede del último cuadre
  // finalizado donde se registró el producto (no de una existencia supuesta).
  const existenciaUltimoCuadre = filas[0]?.final;

  const guardarMinimo = async () => {
    if (!Number.isFinite(minimoBorrador) || minimoBorrador < 0) {
      toast.error("La existencia mínima debe ser cero o mayor.");
      return;
    }
    setGuardandoMinimo(true);
    const anteriores = { ...(useCuadreStore.getState().settings.stockMinimo ?? {}) };
    try {
      updateSettings({ stockMinimo: { ...anteriores, [key]: minimoBorrador } });
      await pushSettings({ ...useCuadreStore.getState().settings });
      toast.success("Existencia mínima actualizada.");
      setEditarMinimo(false);
    } catch (error: any) {
      updateSettings({ stockMinimo: anteriores });
      toast.error(error?.message ?? "No se pudo guardar la alerta de stock.");
    } finally {
      setGuardandoMinimo(false);
    }
  };

  const exportarExcel = async () => {
    if (!nombre || !visibles.length) return;
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const cabeceras = [
        "Fecha del cuadre", "Días trabajados", "Responsable", "Punto",
        "Inventario inicial", "Entradas", "Traslados", "Resultado ventas (original)",
        "Ventas positivas", "Diferencia por revisar", "Inventario final",
        "Precio venta CUP", "Costo CUP", "Precio anterior CUP", "Costo anterior CUP",
        "Cambio de precio", "Cambio de costo", "ID cuadre",
      ];
      const datos = visibles.map((f) => [
        f.fecha, f.diasTrabajados.join(", "), f.dependiente, punto,
        f.inicio, f.entradas, f.traslados, f.vendido, Math.max(0, f.vendido),
        Math.max(0, -f.vendido), f.final, f.precio, f.costo,
        f.precioAnterior ?? "", f.costoAnterior ?? "",
        f.cambioPrecio ? "Sí" : "No", f.cambioCosto ? "Sí" : "No", f.cuadreId,
      ]);
      const ws = XLSX.utils.aoa_to_sheet([
        ["Historial de movimientos — " + nombre, punto],
        ["Período", periodo === "todos" ? "Todo el historial" : periodo, "Movimiento", movimiento, "Dependiente", dependiente || "Todos"],
        ["Entradas", totales.entradas, "Ventas positivas", totales.ventas,
          "Traslados", totales.traslados, "Diferencias por revisar", totales.diferencia],
        [],
        cabeceras,
        ...datos,
      ]);
      ws["!cols"] = [
        { wch: 24 }, { wch: 32 }, { wch: 27 }, { wch: 14 },
        ...Array.from({ length: 13 }, () => ({ wch: 18 })), { wch: 38 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
      XLSX.writeFile(wb, "historial-movimientos-" + punto.toLowerCase().replace(/[^a-z]/g, "") +
        "-" + new Date().toISOString().slice(0, 10) + ".xlsx");
      toast.success("Historial exportado a Excel.");
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo exportar el historial.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <Dialog open={Boolean(nombre)} onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
      <DialogContent className="w-[calc(100vw-0.75rem)] max-w-3xl max-h-[94dvh] overflow-y-auto rounded-2xl p-3 pb-5 sm:p-6">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <History className="h-5 w-5 text-primary" />
            Historial de Movimientos
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Resumen de cuadres oficiales, sin modificar sus datos.
          </p>
        </DialogHeader>

        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
            {producto?.fotoUrl && !imagenErronea
              ? <img src={producto.fotoUrl} alt={nombre || "Producto"} className="h-full w-full object-contain"
                  onError={() => setImagenErronea(true)} />
              : <Package className="h-7 w-7 text-muted-foreground" aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold leading-snug">{nombre || "Producto"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {producto?.categoria || "Sin categoría"} · {punto}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {filas.length} {filas.length === 1 ? "cuadre registrado" : "cuadres registrados"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] text-muted-foreground">Existencia</p>
            <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {existenciaUltimoCuadre === undefined ? "—" : numero(existenciaUltimoCuadre)}
            </p>
            <p className="max-w-24 text-[10px] leading-tight text-muted-foreground">Último cuadre del producto</p>
            <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 gap-1 px-1 text-xs"
              onClick={() => setEditarMinimo(v => !v)} aria-label="Configurar existencia mínima">
              <Settings2 className="h-3.5 w-3.5" /> Mínimo
            </Button>
          </div>
        </div>

        {editarMinimo && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-primary/20 bg-muted/40 p-3">
            <label className="min-w-0 flex-1 space-y-1 text-xs">
              <span>Existencia mínima para alerta en Inicio</span>
              <NumberInput value={minimoBorrador} min={0} disabled={guardandoMinimo}
                onChange={setMinimoBorrador} className="h-9 rounded-lg" />
            </label>
            <Button className="h-9 rounded-lg" size="sm" disabled={guardandoMinimo}
              onClick={() => void guardarMinimo()}>
              {guardandoMinimo ? "Guardando…" : "Guardar mínimo"}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <ResumenCard titulo="Entradas" valor={"+" + numero(totales.entradas)}
            icono={ArrowDownToLine} tono="positivo" />
          <ResumenCard titulo="Ventas" valor={"−" + numero(totales.ventas)}
            icono={ShoppingCart} tono="negativo" />
          <ResumenCard titulo="Traslados" valor={"−" + numero(totales.traslados)}
            icono={ArrowLeftRight} />
          <ResumenCard titulo="Ajustes" valor="Sin registros"
            icono={SlidersHorizontal} />
        </div>
        {totales.turnosConDiferencia > 0 && (
          <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="font-semibold">Diferencias por revisar: {numero(totales.diferencia)} unidades</p>
              <p className="mt-1 text-muted-foreground">
                {totales.turnosConDiferencia} turno(s) presentan ventas calculadas negativas.
                Se conserva el resultado original y no se suma a las ventas ni a ajustes.
              </p>
            </div>
          </div>
        )}

        <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3" aria-label="Filtrar historial">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <CalendarDays className="h-4 w-4 text-primary" /> Filtros
            </p>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
              onClick={() => {
                setPeriodo("todos"); setDesde(""); setHasta("");
                setMovimiento("todos"); setDependiente(""); setExpandido(null);
              }}>Limpiar filtros</Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="min-w-0 space-y-1 text-xs">
              <span className="text-muted-foreground">Período</span>
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}
                className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm">
                <option value="todos">Todo el historial</option>
                <option value="7">Últimos 7 días</option>
                <option value="30">Últimos 30 días</option>
                <option value="90">Últimos 90 días</option>
                <option value="mes">Mes actual</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </label>
            <label className="min-w-0 space-y-1 text-xs">
              <span className="text-muted-foreground">Movimiento</span>
              <select value={movimiento} onChange={(e) => setMovimiento(e.target.value as TipoMovimientoKardex)}
                className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm">
                <option value="todos">Todos</option>
                <option value="ventas">Ventas</option>
                <option value="entradas">Entradas</option>
                <option value="traslados">Traslados</option>
                <option value="diferencias">Diferencias por revisar</option>
              </select>
            </label>
            <label className="min-w-0 space-y-1 text-xs">
              <span className="text-muted-foreground">Dependiente</span>
              <select value={dependiente} onChange={(e) => setDependiente(e.target.value)}
                className="h-10 w-full rounded-lg border border-input bg-background px-2 text-sm">
                <option value="">Todos</option>
                {opcionesDependientes.map(nombreDependiente =>
                  <option value={nombreDependiente} key={nombreDependiente}>{nombreDependiente}</option>
                )}
              </select>
            </label>
          </div>
          {periodo === "personalizado" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="min-w-0 space-y-1 text-xs">
                <span className="text-muted-foreground">Desde</span>
                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                  className="h-10 min-w-0 rounded-lg text-sm" />
              </label>
              <label className="min-w-0 space-y-1 text-xs">
                <span className="text-muted-foreground">Hasta</span>
                <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                  className="h-10 min-w-0 rounded-lg text-sm" />
              </label>
            </div>
          )}
          {rangoInvalido && (
            <p className="text-xs text-destructive">La fecha inicial no puede ser posterior a la final.</p>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Movimientos por turno <span className="text-muted-foreground">({visibles.length})</span></h3>
            <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg"
              disabled={!visibles.length || exportando} onClick={() => void exportarExcel()}>
              <Download className="mr-1.5 h-4 w-4" /> {exportando ? "Exportando…" : "Exportar Excel"}
            </Button>
          </div>
          {visibles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <History className="mx-auto mb-2 h-6 w-6 text-muted-foreground"/>
              <p className="text-sm text-muted-foreground">
                {filas.length ? "No hay turnos con movimientos para los filtros seleccionados." :
                  "Todavía no hay cuadres oficiales de este producto."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibles.map((f) => {
                const abierto = expandido === f.cuadreId;
                const diferencia = f.vendido < 0;
                return (
                  <div key={f.cuadreId}
                    className={"overflow-hidden rounded-xl border bg-card " +
                      (diferencia ? "border-amber-500/40" : "border-border")}>
                    <button type="button" aria-expanded={abierto}
                      className="flex w-full min-w-0 items-center gap-3 p-3 text-left hover:bg-muted/30"
                      onClick={() => setExpandido(abierto ? null : f.cuadreId)}>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-semibold">{periodoTurno(f)}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {f.dependiente || "Dependiente no registrado"} · {punto}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
                          {f.entradas !== 0 && <span className="text-emerald-700 dark:text-emerald-400">
                            Entrada {f.entradas > 0 ? "+" : ""}{numero(f.entradas)}
                          </span>}
                          {f.traslados !== 0 && <span>Traslado −{numero(f.traslados)}</span>}
                          {f.vendido > 0 && <span className="text-rose-700 dark:text-rose-400">
                            Venta −{numero(f.vendido)}
                          </span>}
                          {diferencia && <span className="font-medium text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="mr-1 inline h-3 w-3" />
                            Diferencia por revisar
                          </span>}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                          Final {numero(f.final)}
                        </span>
                        {abierto ? <ChevronUp className="h-4 w-4 text-muted-foreground"/> :
                          <ChevronDown className="h-4 w-4 text-muted-foreground"/>}
                      </div>
                    </button>
                    {abierto && (
                      <div className="space-y-3 border-t border-border/70 bg-muted/10 p-3">
                        <div className="grid grid-cols-2 gap-3">
                          <DatoMovimiento titulo="Existencia inicial" cantidad={f.inicio} />
                          <DatoMovimiento titulo="Entradas" cantidad={f.entradas} tono="positivo" />
                          <DatoMovimiento titulo="Traslados" cantidad={f.traslados} tono="negativo" />
                          <DatoMovimiento titulo="Ventas calculadas" cantidad={f.vendido}
                            tono={f.vendido > 0 ? "negativo" : undefined} />
                        </div>
                        {diferencia && (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
                            <p className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="h-4 w-4" /> Diferencia por revisar
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              Resultado original: {numero(f.vendido)} unidades.
                              No se interpreta como devolución ni se modifica el cuadre.
                            </p>
                          </div>
                        )}
                        <div className="flex items-center justify-between border-t border-border/70 pt-2">
                          <span className="text-sm font-semibold">Existencia final</span>
                          <span className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {numero(f.final)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/70 p-2.5">
                          <div>
                            <p className="text-[11px] text-muted-foreground">Precio de venta del turno</p>
                            <p className="font-semibold tabular-nums">{numero(f.precio)} CUP</p>
                            {f.cambioPrecio && (
                              <p className="mt-1 flex items-center gap-1 text-[11px] text-primary">
                                {f.precio > (f.precioAnterior ?? 0) ?
                                  <TrendingUp className="h-3 w-3"/> : <TrendingDown className="h-3 w-3"/>}
                                Antes: {numero(f.precioAnterior ?? 0)} CUP
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground">Costo del turno</p>
                            <p className="font-semibold tabular-nums">{numero(f.costo)} CUP</p>
                            {f.cambioCosto && (
                              <p className="mt-1 flex items-center gap-1 text-[11px] text-primary">
                                {f.costo > (f.costoAnterior ?? 0) ?
                                  <TrendingUp className="h-3 w-3"/> : <TrendingDown className="h-3 w-3"/>}
                                Antes: {numero(f.costoAnterior ?? 0)} CUP
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span className="min-w-0 truncate">
                            Cuadre oficial · {fechaLegible(f.fecha)}
                          </span>
                          <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 gap-1 px-2 text-[11px]"
                            title={"Referencia: " + f.cuadreId}
                            onClick={() => {
                              if (navigator.clipboard?.writeText) {
                                void navigator.clipboard.writeText(f.cuadreId)
                                  .then(() => toast.success("Referencia copiada."))
                                  .catch(() => toast.error("No se pudo copiar la referencia."));
                              } else toast.info("Referencia: " + f.cuadreId);
                            }}>
                            <ClipboardCopy className="h-3.5 w-3.5" /> Referencia
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Las ventas se calculan por cuadre: inicio + entradas − traslados − final.
            Los resultados negativos se señalan como diferencias por revisar; los ajustes
            individuales no están identificados en los cuadres antiguos.
          </p>
        </section>
      </DialogContent>
    </Dialog>
  );
}
