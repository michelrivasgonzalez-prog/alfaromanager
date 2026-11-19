import { describe, expect, it } from "vitest";
import { deudaPorFaltante } from "./cajaSobrantes";

describe("Deuda de un cuadre cerrado", () => {
  it("resta el salario absorbido y el faltante al valor registrado en centavos", () => {
    expect(deudaPorFaltante(15375.004, 3456.626)).toBe(11918.37);
  });

  it("deja cero de deuda cuando el salario cubrió todo el faltante", () => {
    expect(deudaPorFaltante(150, 150)).toBe(0);
    expect(deudaPorFaltante(-200, 0)).toBe(0);
  });
});
