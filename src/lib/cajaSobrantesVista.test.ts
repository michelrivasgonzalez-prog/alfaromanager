import { describe, expect, it } from "vitest";
import type { MovimientoFondo } from "@/lib/cajaSobrantes";
import {
  etiquetaMovimientoCaja, filtrarMovimientosCaja, requiereConfirmacionFisica,
} from "./cajaSobrantesVista";

const mov = (patch: Partial<MovimientoFondo> = {}): MovimientoFondo => ({
  id: "a",
  cuadre_id: null,
  punto_venta: "Cafetería",
  tipo: "ingreso",
  estado: "confirmado",
  monto: 9970,
  dependiente: "Dependienta",
  periodo_desde: "2026-11-10",
  periodo_hasta: "2026-11-12",
  motivo: "Sobrante",
  realizado_por: "Admin",
  realizado_en: "2026-11-12T19:00:00Z",
  confirmado_por: "Admin",
  confirmado_en: "2026-11-12T20:00:00Z",
  ...patch,
});

describe("Solo presentación de Caja de Sobrantes", () => {
  it("los ingresos pendientes requieren entrega física y los confirmados no", () => {
    expect(requiereConfirmacionFisica(mov({ estado: "pendiente" }))).toBe(true);
    expect(requiereConfirmacionFisica(mov({ estado: "confirmado" }))).toBe(false);
    expect(requiereConfirmacionFisica(mov({ tipo: "retiro", estado: "pendiente" }))).toBe(false);
  });

  it("mantiene los ajustes pendientes de ingreso físico en el filtro de pendientes", () => {
    const ajuste = mov({ id: "ajuste", detalles: {
      ajuste_pendiente: { monto: 2155, total: 12125 },
    } });
    expect(requiereConfirmacionFisica(ajuste)).toBe(true);
    expect(filtrarMovimientosCaja([ajuste], "pendientes")).toEqual([ajuste]);
  });

  it("filtra ingreso, retiro y pendiente, sin mutar ni reordenar los originales", () => {
    const ingreso = mov({ id: "ingreso", realizado_en: "2026-11-11T19:00:00Z" });
    const retiro = mov({ id: "retiro", tipo: "retiro", estado: "confirmado",
      monto: 3250, realizado_en: "2026-11-12T19:00:00Z" });
    const pendiente = mov({ id: "pendiente", estado: "pendiente",
      monto: 2155, realizado_en: "2026-11-13T19:00:00Z" });
    const todos = [ingreso, retiro, pendiente];
    const original = JSON.stringify(todos);
    expect(filtrarMovimientosCaja(todos, "todos").map(m => m.id)).toEqual(["pendiente", "retiro", "ingreso"]);
    expect(filtrarMovimientosCaja(todos, "ingresos").map(m => m.id)).toEqual(["pendiente", "ingreso"]);
    expect(filtrarMovimientosCaja(todos, "retiros").map(m => m.id)).toEqual(["retiro"]);
    expect(filtrarMovimientosCaja(todos, "pendientes").map(m => m.id)).toEqual(["pendiente"]);
    expect(JSON.stringify(todos)).toBe(original);
  });

  it("respeta la procedencia original de faltantes y compensaciones", () => {
    expect(etiquetaMovimientoCaja(mov({ detalles: { origen: "faltante_cuadre" } }))).toBe("Faltante de cuadre");
    expect(etiquetaMovimientoCaja(mov({ detalles: { origen: "compensacion_deuda" } }))).toBe("Compensación de deuda");
    expect(etiquetaMovimientoCaja(mov({ tipo: "retiro" }))).toBe("Retiro de fondos");
    expect(etiquetaMovimientoCaja(mov())).toBe("Ingreso de sobrante");
  });
});
