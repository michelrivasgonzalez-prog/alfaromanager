import { describe, expect, it } from "vitest";
import {
  codigoEntrega, fajosDuplicadosEnCuadres, cuadreQueUsoEntrega, recogidaDesdeEntrega, totalDenominaciones, validarDenominaciones,
  type EntregaEfectivo,
} from "./entregasEfectivo";

const entrega: EntregaEfectivo = {
  id: "c901a002-a141-4b51-a111-7293d1234567",
  turno_operativo_id: "d901a002-a141-4b51-a111-7293d1234567",
  punto_venta: "Cafetería",
  dependiente_id: "e901a002-a141-4b51-a111-7293d1234567",
  dependiente: "Leysi Daniela",
  entregado_en: "2026-11-23T22:38:00Z",
  denominaciones_declaradas: { "1000": 20 },
  total_declarado: 20000,
  estado: "confirmada",
  observacion: "",
  denominaciones_recibidas: { "1000": 19, "500": 1 },
  total_recibido: 19500,
  recibido_por_id: "f901a002-a141-4b51-a111-7293d1234567",
  recibido_por: "Yanitza",
  recibido_en: "2026-11-23T22:45:00Z",
  nota_conteo: null,
  motivo_resolucion: "Diferencia aceptada tras verificar el fajo completo",
  resuelto_en: "2026-11-23T22:46:00Z",
  anulado_en: null,
};

describe("entregas de efectivo vinculadas al arqueo", () => {
  it("calcula los importes exclusivamente de billetes válidos", () => {
    expect(totalDenominaciones({ "1000": 2, "500": 3 })).toBe(3500);
    expect(validarDenominaciones({ "1000": 2, "500": 3 })).toBe(3500);
    expect(() => validarDenominaciones({ "1000": -1 })).toThrow(/inválida/);
    expect(() => validarDenominaciones({ "500": 1.5 })).toThrow(/inválida/);
    expect(() => validarDenominaciones({ "123": 1 })).toThrow(/inválida/);
    expect(() => validarDenominaciones({ "100": 0 })).toThrow();
    expect(validarDenominaciones({ "100": 0 }, true)).toBe(0);
  });

  it("incorpora solo el monto contado por administración, nunca el declarado", () => {
    const recogida = recogidaDesdeEntrega(entrega);
    expect(recogida.monto).toBe(19500);
    expect(recogida.denominaciones).toEqual({ "1000": 19, "500": 1 });
    expect(recogida.id).toBe(entrega.id);
    expect(recogida.entregaEfectivoId).toBe(entrega.id);
    expect(codigoEntrega(entrega.id)).toBe("EFE-C901A002");
  });

  it("detecta el mismo fajo dentro de otro cuadre o repetido en el mismo", () => {
    const r = recogidaDesdeEntrega(entrega);
    expect(fajosDuplicadosEnCuadres(
      { id: "nuevo", recogidas: [r] },
      [{ id: "anterior", recogidas: [r] }],
    )).toEqual([entrega.id]);
    expect(fajosDuplicadosEnCuadres(
      { id: "nuevo", recogidas: [r, r] }, [],
    )).toEqual([entrega.id]);
    expect(fajosDuplicadosEnCuadres(
      { id: "nuevo", recogidas: [r] },
      [{ id: "nuevo", recogidas: [r] }],
    )).toEqual([]);
  });

  it("rechaza sumar fajos pendientes o con diferencias no resueltas", () => {
    expect(() => recogidaDesdeEntrega({ ...entrega, estado: "pendiente" })).toThrow(/confirmadas/);
    expect(() => recogidaDesdeEntrega({ ...entrega, estado: "diferencia" })).toThrow(/confirmadas/);
    expect(() => recogidaDesdeEntrega({ ...entrega, estado: "anulada" })).toThrow(/confirmadas/);
  });
});

it("bloquea recogidas utilizadas en nube o historial local, excepto el mismo cuadre",()=>{const r=recogidaDesdeEntrega(entrega);expect(cuadreQueUsoEntrega({...entrega,cuadre_contabilizado_id:"otro"},[],"nuevo")).toBe("otro");expect(cuadreQueUsoEntrega({...entrega,cuadre_contabilizado_id:"mismo"},[],"mismo")).toBeUndefined();expect(cuadreQueUsoEntrega(entrega,[{id:"offline",recogidas:[r]}],"nuevo")).toBe("offline");});
