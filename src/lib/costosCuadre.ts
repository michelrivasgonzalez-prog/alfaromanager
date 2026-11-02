import { calcProducto, type Producto } from "@/store/cuadreStore";

/** Only prices applying to sold units must have a finite, positive cost. */
export function productosSinCosto(productos: Producto[]): Producto[] {
  return productos.filter((producto) => {
    const { venta, resto } = calcProducto(producto);
    if (venta <= 0) return false;
    const falta = (costo: number) => !Number.isFinite(costo) || costo <= 0;
    return (resto > 0 && falta(producto.costo)) ||
      (producto.tramos ?? []).some((tramo) => tramo.cantidad > 0 && falta(tramo.costo));
  });
}