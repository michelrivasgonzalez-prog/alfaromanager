import { describe, it, expect } from "vitest";
import { ajustarDeuda } from "./corregirDeudas";

describe("ajustarDeuda", () => {
  it("sube el saldo cuando la deuda aumenta sin abonos", () => {
    expect(ajustarDeuda({ total: 1000, saldo: 1000 }, 1500)).toMatchObject({ total: 1500, saldo: 1500, estado: "pendiente" });
  });
  it("respeta lo ya abonado", () => {
    expect(ajustarDeuda({ total: 1000, saldo: 600 }, 800)).toMatchObject({ total: 800, saldo: 400, estado: "parcial" });
  });
  it("no deja saldo negativo si lo abonado supera el nuevo total", () => {
    expect(ajustarDeuda({ total: 1000, saldo: 200 }, 500)).toMatchObject({ total: 800, saldo: 0, estado: "pagada", excedente: 300 });
  });
  it("elimina la deuda sin abonos cuando su total queda en 0", () => {
    expect(ajustarDeuda({ total: 1000, saldo: 1000 }, 0).eliminar).toBe(true);
  });
});
