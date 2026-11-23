import { describe, expect, it } from "vitest";
import type { Cuadre, Producto } from "@/store/cuadreStore";
import {
  filtrarKardex, hayMovimientoKardex, kardexProducto, resumenKardex,
} from "./kardex";

const producto = (patch: Partial<Producto> = {}): Producto => ({
  id: "producto-prueba",
  nombre: "Cerveza Mayabe 355 ml",
  inicio: 20, entradas: 10, traslados: 2, final: 20,
  precio: 800, costo: 600,
  ...patch,
});

const cuadre = (params: {
  id: string; fecha: string; dias?: string[]; p?: Producto; finalizado?: boolean; dependiente?: string;
}): Cuadre => ({
  id: params.id,
  puntoVenta: "Cafetería",
  fecha: params.fecha,
  diasTrabajados: params.dias ?? [params.fecha.slice(0, 10)],
  dependiente: params.dependiente ?? "Dependienta de prueba",
  productos: [params.p ?? producto()],
  finalizado: params.finalizado ?? true,
} as Cuadre);

describe("Kardex por turnos cerrados — solo consulta", () => {
  it("conserva el cálculo original y agrupa la entrada, traslado, venta y saldo en un turno", () => {
    const original = cuadre({ id: "a", fecha: "2026-11-20T18:00:00Z" });
    const before = JSON.stringify(original);
    const filas = kardexProducto([original], "Cafetería", "Cerveza Mayabe 355 ml");
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      inicio: 20, entradas: 10, traslados: 2, final: 20,
      vendido: 8, precio: 800, costo: 600,
    });
    expect(JSON.stringify(original)).toBe(before);
  });

  it("separa ventas positivas y diferencias negativas sin inventar ajustes", () => {
    const c1 = cuadre({ id: "a", fecha: "2026-11-19T18:00:00Z", p: producto({ final: 20 }) });
    const c2 = cuadre({ id: "b", fecha: "2026-11-20T18:00:00Z",
      p: producto({ inicio: 20, entradas: 0, traslados: 0, final: 23 }) });
    const filas = kardexProducto([c1, c2], "Cafetería", "Cerveza Mayabe 355 ml");
    expect(filas[0].vendido).toBe(-3);
    expect(filas[1].vendido).toBe(8);
    expect(resumenKardex(filas)).toEqual({
      entradas: 10, ventas: 8, traslados: 2, diferencia: 3, turnosConDiferencia: 1,
    });
  });

  it("incluye entradas sin ventas y omite cuadres abiertos y turnos sin movimiento", () => {
    const entrada = cuadre({ id: "entrada", fecha: "2026-11-19T18:00:00Z",
      p: producto({ inicio: 15, entradas: 5, traslados: 0, final: 20 }) });
    const sinMovimiento = cuadre({ id: "quieto", fecha: "2026-11-20T18:00:00Z",
      p: producto({ inicio: 20, entradas: 0, traslados: 0, final: 20 }) });
    const abierto = cuadre({ id: "abierto", fecha: "2026-11-21T18:00:00Z",
      finalizado: false });
    const filas = kardexProducto([entrada, sinMovimiento, abierto], "Cafetería", "Cerveza Mayabe 355 ml");
    expect(filas).toHaveLength(2);
    expect(filas[0].cuadreId).toBe("quieto");
    expect(filas[1].vendido).toBe(0);
    expect(hayMovimientoKardex(filas[1])).toBe(true);
    expect(filtrarKardex(filas, { movimiento: "todos" }).map(f => f.cuadreId)).toEqual(["entrada"]);
  });

  it("aplica fechas inclusivas, movimiento y responsable sobre los mismos turnos", () => {
    const a = cuadre({ id: "a", fecha: "2026-11-20T18:00:00Z",
      dias: ["2026-11-18", "2026-11-19", "2026-11-20"], dependiente: "A" });
    const b = cuadre({ id: "b", fecha: "2026-11-23T18:00:00Z",
      dias: ["2026-11-21", "2026-11-22", "2026-11-23"], dependiente: "B",
      p: producto({ inicio: 20, entradas: 0, traslados: 0, final: 24 }) });
    const filas = kardexProducto([b, a], "Cafetería", "Cerveza Mayabe 355 ml");
    expect(filtrarKardex(filas, {
      desde: "2026-11-20", hasta: "2026-11-20", movimiento: "ventas", dependiente: "A",
    }).map(f => f.cuadreId)).toEqual(["a"]);
    expect(filtrarKardex(filas, { movimiento: "diferencias" }).map(f => f.cuadreId)).toEqual(["b"]);
    expect(filtrarKardex(filas, { dependiente: "No existe" })).toEqual([]);
  });

  it("compara precio y costo históricos aunque el turno anterior no tenga ventas", () => {
    const a = cuadre({ id: "a", fecha: "2026-11-20T18:00:00Z",
      p: producto({ entradas: 0, traslados: 0, final: 20 }) });
    const b = cuadre({ id: "b", fecha: "2026-11-21T18:00:00Z",
      p: producto({ precio: 850, costo: 620, entradas: 0, traslados: 0, final: 20 }) });
    const filas = kardexProducto([b, a], "Cafetería", "Cerveza Mayabe 355 ml");
    expect(filas[0]).toMatchObject({
      cambioPrecio: true, cambioCosto: true, precioAnterior: 800, costoAnterior: 600,
    });
    expect(filas[1]).toMatchObject({ cambioPrecio: false, cambioCosto: false });
  });

  it("reconoce por código de barras un nombre histórico distinto y no mezcla puntos de venta", () => {
    const a = cuadre({ id: "a", fecha: "2026-11-20T18:00:00Z",
      p: producto({ nombre: "Mayabe (nombre anterior)", codigoBarras: "012345678905" }) });
    const b = { ...a, id: "mipyme", puntoVenta: "Mipyme" as const };
    expect(kardexProducto([a, b], "Cafetería", "Cerveza Mayabe 355 ml",
      ["012345678905"])).toHaveLength(1);
    expect(kardexProducto([a, b], "Cafetería", "Cerveza Mayabe 355 ml")).toHaveLength(0);
  });
});
