import { describe, expect, it } from "vitest";
import { iniciosDesdeProductos } from "./turnosOperativos";

describe("Inventario independiente del cuadre oficial", () => {
  it("importa los finales de la entrega como inicios del siguiente turno", () => {
    const anterior = [{
      id: "arroz-rey", nombre: "Arroz Bolsa Rey del Arroz 1Kg",
      inicio: 5, entradas: 30, traslados: 0, final: 28,
      precio: 450, categoria: "Alimentos",
    }];
    const inicioMiguel = iniciosDesdeProductos(anterior, true);
    expect(inicioMiguel).toEqual([{
      id: "arroz-rey", nombre: "Arroz Bolsa Rey del Arroz 1Kg",
      inicio: 28, precio: 450, categoria: "Alimentos",
      codigoBarras: undefined,
    }]);
    anterior[0].final = 10; // El cuadre oficial se corrige después.
    expect(inicioMiguel[0].inicio).toBe(28); // El relevo no cambia retroactivamente.
  });

  it("no confunde dos productos distintos por sus nombres", () => {
    const origen = [
      { id: "parejo", nombre: "Arroz Bolsa Parejo", final: 10, precio: 450 },
      { id: "rey", nombre: "Arroz Bolsa Rey del Arroz 1Kg", final: 30, precio: 500 },
    ];
    expect(iniciosDesdeProductos(origen, true).map((p) => [p.id, p.inicio]))
      .toEqual([["parejo", 10], ["rey", 30]]);
  });

  it("bloquea existencias negativas o cantidades inválidas; no las corrige en silencio", () => {
    expect(() => iniciosDesdeProductos([{ id: "x", nombre: "Producto", final: -1, precio: 100 }], true))
      .toThrow(/datos inválidos/);
    expect(() => iniciosDesdeProductos([{ id: "x", nombre: "Producto", final: "abc", precio: 100 }], true))
      .toThrow(/datos inválidos/);
  });
});
