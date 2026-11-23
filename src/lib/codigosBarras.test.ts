import { describe, expect, it } from "vitest";
import {
  esCodigoBarrasValido, claveGTIN, buscarDuplicadoCatalogo,
  buscarPorCodigo, normalizarNombreProducto, codigosAdicionalesValidos, codigosDeProducto,
} from "./codigosBarras";
import type { CatalogoItem } from "@/store/cuadreStore";

const productos: CatalogoItem[] = [
  { id: "1", nombre: "Café Molido Natural Vima Foods 250g", punto: "Mipyme",
    codigoBarras: "8436017433968", codigosAdicionales: [
      { codigo: "6952243224146", etiqueta: "Tueste alternativo" },
      { codigo: "7453130922514", etiqueta: "Presentación alterna" },
    ], precio: 2800, costo: 2400 },
  { id: "2", nombre: "Cerveza Mayabe 355 ml", punto: "Cafetería",
    codigoBarras: "036000291452", precio: 800, costo: 650 },
  { id: "3", nombre: "Cerveza Mayabe 355 ml", punto: "Mipyme",
    codigoBarras: "036000291452", precio: 750, costo: 600 },
];

describe("GTIN y deduplicación por punto de venta", () => {
  it("valida los códigos de las fotografías", () => {
    for (const codigo of [
      "6924060316700", "6952243224146", "7453130922514", "8436017433968",
    ]) {
      expect(esCodigoBarrasValido(codigo)).toBe(true);
    }
    expect(esCodigoBarrasValido("8436017433969")).toBe(false);
  });

  it("no pierde los ceros al normalizar UPC/EAN", () => {
    expect(claveGTIN("036000291452")).toBe(claveGTIN("0036000291452"));
  });

  it("encuentra el producto por código en el punto correcto", () => {
    expect(buscarPorCodigo(productos, "Mipyme", "8436017433968")?.id).toBe("1");
    expect(buscarPorCodigo(productos, "Cafetería", "8436017433968")).toBeUndefined();
  });

  it("rechaza duplicados en el mismo punto y permite el otro punto", () => {
    expect(buscarDuplicadoCatalogo(productos, "Mipyme",
      { nombre: "Café Molido Natural Vima Foods 250 g" })?.id).toBe("1");
    expect(buscarDuplicadoCatalogo(productos, "Cafetería",
      { codigoBarras: "8436017433968" })).toBeUndefined();
    expect(buscarDuplicadoCatalogo(productos, "Cafetería",
      { codigoBarras: "0036000291452" })?.id).toBe("2");
  });

  it("reconoce cualquiera de los códigos del mismo producto", () => {
    expect(codigosDeProducto(productos[0])).toHaveLength(3);
    expect(buscarPorCodigo(productos, "Mipyme", "6952243224146")?.id).toBe("1");
    expect(buscarPorCodigo(productos, "Mipyme", "7453130922514")?.id).toBe("1");
    expect(buscarPorCodigo(productos, "Cafetería", "6952243224146")).toBeUndefined();
  });

  it("evita asociar códigos de variantes que pertenecen a otra ficha", () => {
    const otro = [...productos, {
      id: "4", nombre: "Café Azul 250g", punto: "Mipyme" as const,
      precio: 2000, costo: 1000,
    }];
    expect(buscarDuplicadoCatalogo(otro, "Mipyme", {
      codigosAdicionales: [{ codigo: "6952243224146", etiqueta: "Rosas" }],
    }, "4")?.id).toBe("1");
  });

  it("evita repetir el principal dentro de los adicionales", () => {
    expect(codigosAdicionalesValidos("8436017433968", [
      { codigo: "8436017433968", etiqueta: "Igual" },
    ])).toBe(false);
    expect(codigosAdicionalesValidos("036000291452", [
      { codigo: "0036000291452", etiqueta: "EAN equivalente" },
    ])).toBe(false);
    expect(codigosAdicionalesValidos("8436017433968", [
      { codigo: "6952243224146", etiqueta: "Rosas" },
    ])).toBe(true);
  });

  it("normaliza mayúsculas, acentos y espacios de nombres", () => {
    expect(normalizarNombreProducto(" CAFÉ   Vima  250 g "))
      .toBe(normalizarNombreProducto("cafe vima 250g"));
  });
});
