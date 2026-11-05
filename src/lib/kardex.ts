import type { CatalogoItem, Cuadre, PuntoVenta, Settings } from "@/store/cuadreStore";
import { nombreCanonico } from "@/lib/unificar";

export type KardexFila = {
  cuadreId: string;
  fecha: string;
  dependiente: string;
  inicio: number;
  entradas: number;
  traslados: number;
  final: number;
  vendido: number;
  precio: number;
  costo: number;
  cambioPrecio: boolean;
};

const k = (s: string) => nombreCanonico(s).toLowerCase();
export const stockKey = (punto: PuntoVenta, nombre: string) => `${punto}|${k(nombre)}`;

/** Movimientos de un producto en todos los cuadres cerrados (más reciente primero). */
export function kardexProducto(history: Cuadre[], punto: PuntoVenta, nombre: string): KardexFila[] {
  const filas: KardexFila[] = [];
  const asc = [...history]
    .filter((c) => c.puntoVenta === punto)
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  let prev: { precio: number; costo: number } | null = null;
  for (const c of asc) {
    const ps = c.productos.filter((p) => k(p.nombre) === k(nombre));
    if (!ps.length) continue;
    const sum = (f: (p: (typeof ps)[number]) => number) => ps.reduce((s, p) => s + Number(f(p) || 0), 0);
    const inicio = sum((p) => p.inicio);
    const entradas = sum((p) => p.entradas);
    const traslados = sum((p) => p.traslados);
    const final = sum((p) => p.final);
    const precio = Number(ps[0].precio || 0);
    const costo = Number(ps[0].costo || 0);
    filas.push({
      cuadreId: c.id,
      fecha: c.fecha,
      dependiente: c.dependiente,
      inicio,
      entradas,
      traslados,
      final,
      vendido: inicio + entradas - traslados - final,
      precio,
      costo,
      cambioPrecio: !!prev && (prev.precio !== precio || prev.costo !== costo),
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
