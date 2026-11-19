import { describe, expect, it } from "vitest";
import { resumirAbonos, type Abono } from "./cobrar";

function abono(id: string, monto: number, fields: Partial<Abono> = {}): Abono {
  return {
    id, monto, cliente_id: "dependiente", fecha: "2026-11-19", created_at: "2026-11-19",
    usuario_nombre: null, nota: null, reversa_de: null, ...fields,
  };
}

describe("Resumen de abonos en la cartera de dependientes", () => {
  it("separa salario, fondo y pago directo sin sumar dos veces una compensación", () => {
    expect(resumirAbonos([
      abono("salario", 100.50, { origen: "salario" }),
      abono("compensacion", 80.11, { origen: "fondo_sobrantes" }),
      abono("efectivo", 250.24),
      abono("reversion", -250.24, { reversa_de: "efectivo" }),
      abono("salario-antiguo", 30, { nota: "Descontado del salario · Cafetería" }),
      abono("efectivo-nuevo", 20.21),
    ])).toEqual({ salario: 130.50, fondo: 80.11, directo: 20.21 });
  });
});
