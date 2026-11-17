import { describe, expect, it } from "vitest";
import { calcCuadre, newCuadre } from "./cuadreStore";

const turno = () => ({
  ...newCuadre("Cafetería", []),
  fecha: "2026-11-12T12:00:00Z",
  diasTrabajados: ["2026-11-10", "2026-11-11", "2026-11-12"],
  salarioBase: 1000,
  salarioDenominaciones: { "1000": 4, "100": 3 },
});

describe("Sobrantes en liquidaciones", () => {
  it("separa el sobrante, el salario calculado y el pago del turno nuevo", () => {
    const r = calcCuadre({ ...turno(), denominaciones: { "100": 10 } });
    expect(r).toMatchObject({ sobrante: 1000, propina: 0, salarioReal: 3000, salarioPagado: 4300 });
  });

  it("conserva el cálculo anterior en un cuadre histórico sin revisión", () => {
    const r = calcCuadre({ ...turno(), finalizado: true, denominaciones: { "100": 10 } });
    expect(r).toMatchObject({ propina: 1000, salarioReal: 4000, reclasificado: false });
  });

  it.each([
    [9970, { "1000": 4, "100": 3 }, 4300],
    [2155, { "1000": 5, "100": 7, "20": 4 }, 5780],
  ] as const)("separa la reclasificación de %i CUP del pago", (sobrante, denominaciones, pagado) => {
    const r = calcCuadre({
      ...turno(),
      finalizado: true,
      denominaciones: { "1": sobrante },
      salarioDenominaciones: denominaciones,
      sobranteGestion: {},
    });
    expect(r).toMatchObject({ sobrante, propina: 0, salarioPagado: pagado, reclasificado: true });
  });
});
