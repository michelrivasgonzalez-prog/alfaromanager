import type { CatalogoItem, Cuadre, PuntoVenta, Settings } from "@/store/cuadreStore";
import { nombreCanonico } from "@/lib/unificar";

export type KardexFila = {
  cuadreId: string;
  /** Fecha del cuadre guardada, nunca una hora inventada para cada movimiento. */
  fecha: string;
  /** Día final trabajado, o fecha del cuadre si no hay días específicos. */
  fechaFiltro: string;
  diasTrabajados: string[];
  dependiente: string;
  inicio: number;
  entradas: number;
  traslados: number;
  final: number;
  /** Resultado algebraico original: puede ser negativo y exigir revisión. */
  vendido: number;
  precio: number;
  costo: number;
  precioAnterior?: number;
  costoAnterior?: number;
  cambioPrecio: boolean;
  cambioCosto: boolean;
};

const k = (s: string) => nombreCanonico(s).toLowerCase();
export const stockKey = (punto: PuntoVenta, nombre: string) => `${punto}|${k(nombre)}`;

const cantidad = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Fecha de referencia contable: último día trabajado, o fecha guardada. */
export function fechaKardex(fila: Pick<KardexFila, "fecha" | "fechaFiltro">): string {
  return fila.fechaFiltro;
}

/** No mostrar turnos sin entradas, traslados, ventas calculadas ni diferencias. */
export function hayMovimientoKardex(fila: Pick<KardexFila, "entradas" | "traslados" | "vendido">): boolean {
  return Math.abs(fila.entradas) > 0.0000001 ||
    Math.abs(fila.traslados) > 0.0000001 ||
    Math.abs(fila.vendido) > 0.0000001;
}

export type TipoMovimientoKardex = "todos" | "ventas" | "entradas" | "traslados" | "diferencias";

export function filtrarKardex(
  filas: KardexFila[],
  filtros: { desde?: string; hasta?: string; movimiento?: TipoMovimientoKardex; dependiente?: string }
): KardexFila[] {
  return filas.filter((fila) => {
    if (!hayMovimientoKardex(fila)) return false;
    if (filtros.desde && fila.fechaFiltro < filtros.desde) return false;
    if (filtros.hasta && fila.fechaFiltro > filtros.hasta) return false;
    if (filtros.dependiente && fila.dependiente !== filtros.dependiente) return false;
    switch (filtros.movimiento ?? "todos") {
      case "entradas": return fila.entradas > 0;
      case "traslados": return fila.traslados > 0;
      case "ventas": return fila.vendido > 0;
      case "diferencias": return fila.vendido < 0;
      default: return true;
    }
  });
}

export function resumenKardex(filas: KardexFila[]) {
  return filas.reduce((totales, fila) => ({
    entradas: totales.entradas + fila.entradas,
    ventas: totales.ventas + Math.max(0, fila.vendido),
    traslados: totales.traslados + fila.traslados,
    diferencia: totales.diferencia + Math.max(0, -fila.vendido),
    turnosConDiferencia: totales.turnosConDiferencia + Number(fila.vendido < 0),
  }), { entradas: 0, ventas: 0, traslados: 0, diferencia: 0, turnosConDiferencia: 0 });
}

/**
 * Reconstruye únicamente los resúmenes de cuadres oficiales finalizados.
 * No atribuye tiempos ni movimientos individuales a las personas.
 * Se mantiene la comparación histórica de precios, incluso si el turno no tuvo ventas.
 */
export function kardexProducto(
  history: Cuadre[], punto: PuntoVenta, nombre: string, codigos: string[] = []
): KardexFila[] {
  const filas: KardexFila[] = [];
  const codigoSet = new Set(codigos.filter(Boolean));
  const asc = [...history]
    .filter((c) => c.puntoVenta === punto && c.finalizado)
    .sort((a, b) => {
      const key = (c: Cuadre) => [...(c.diasTrabajados ?? [])].sort().at(-1) || c.fecha;
      return key(a).localeCompare(key(b)) || a.fecha.localeCompare(b.fecha);
    });
  let prev: { precio: number; costo: number } | null = null;
  for (const c of asc) {
    const ps = (c.productos ?? []).filter((p) =>
      k(p.nombre) === k(nombre) ||
      (!!p.codigoBarras && codigoSet.has(p.codigoBarras)) ||
      (p.codigosAdicionales ?? []).some((x) => codigoSet.has(x.codigo))
    );
    if (!ps.length) continue;

    const sum = (field: "inicio" | "entradas" | "traslados" | "final") =>
      ps.reduce((total, p) => total + cantidad(p[field]), 0);
    const inicio = sum("inicio");
    const entradas = sum("entradas");
    const traslados = sum("traslados");
    const final = sum("final");
    const precio = cantidad(ps[0].precio);
    const costo = cantidad(ps[0].costo);
    const diasTrabajados = [...(c.diasTrabajados ?? [])].filter(Boolean).sort();
    const fechaFiltro = (diasTrabajados.at(-1) || c.fecha || "").slice(0, 10);

    filas.push({
      cuadreId: c.id,
      fecha: c.fecha,
      fechaFiltro,
      diasTrabajados,
      dependiente: c.dependiente?.trim() || "",
      inicio,
      entradas,
      traslados,
      final,
      vendido: inicio + entradas - traslados - final,
      precio,
      costo,
      precioAnterior: prev?.precio,
      costoAnterior: prev?.costo,
      cambioPrecio: prev !== null && prev.precio !== precio,
      cambioCosto: prev !== null && prev.costo !== costo,
    });
    prev = { precio, costo };
  }
  return filas.reverse();
}

export type AlertaStock = { punto: PuntoVenta; nombre: string; existencia: number; minimo: number };

/** Productos cuya existencia final del último cuadre del punto está en o bajo su mínimo. */
export function alertasStock(history: Cuadre[], catalogo: CatalogoItem[], settings: Settings): AlertaStock[] {
  const minimos = settings.stockMinimo ?? {};
  const out: AlertaStock[] = [];
  for (const punto of ["Cafetería", "Mipyme"] as PuntoVenta[]) {
    const ultimo = history
      .filter((c) => c.puntoVenta === punto)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];
    if (!ultimo) continue;
    for (const it of catalogo.filter((c) => (c.punto ?? "Cafetería") === punto)) {
      const minimo = Number(minimos[stockKey(punto, it.nombre)] || 0);
      if (minimo <= 0) continue;
      const existencia = ultimo.productos
        .filter((p) => k(p.nombre) === k(it.nombre))
        .reduce((s, p) => s + Number(p.final || 0), 0);
      if (existencia <= minimo) out.push({ punto, nombre: it.nombre, existencia, minimo });
    }
  }
  return out;
}
