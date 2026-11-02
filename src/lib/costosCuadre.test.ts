import { describe, expect, it } from "vitest";
import { productosSinCosto } from "./costosCuadre";
import type { Producto } from "@/store/cuadreStore";

const producto = (patch: Partial<Producto> = {}): Producto => ({
  id: "producto", nombre: "Cerveza", inicio: 10, entradas: 0,
  traslados: 0, final: 0, precio: 700, costo: 500, ...patch,
});

describe("Costos necesarios para cerrar y generar PDF", () => {
  it("bloquea productos vendidos con costo cero", () => {
    expect(productosSinCosto([producto({ costo: 0 })])).toHaveLength(1);
  });
  it("bloquea un tramo vendido sin costo aunque exista costo base", () => {
    expect(productosSinCosto([producto({ tramos: [{ id: "t", cantidad: 2, precio: 700, costo: 0 }] })])).toHaveLength(1);
  });
  it("permite costos completos y productos sin ventas", () => {
    expect(productosSinCosto([producto(), producto({ final: 10, costo: 0 })])).toHaveLength(0);
  });
  it("no exige costo base si todas las ventas tienen costo por tramo", () => {
    expect(productosSinCosto([producto({ costo: 0, tramos: [{ id: "t", cantidad: 10, precio: 700, costo: 500 }] })])).toHaveLength(0);
  });
});