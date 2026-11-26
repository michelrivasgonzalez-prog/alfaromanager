import {describe,it,expect} from "vitest";
import {cuadreProtegidoParaUnificacion,detalleErrorSync} from "./syncSegura";
describe("Sincronización de cuadres protegidos",()=>{
  it("excluye las operaciones financieras de la unificación automática",()=>{
    expect(cuadreProtegidoParaUnificacion({abonoDeudasId:"abono"})).toBe(true);
    expect(cuadreProtegidoParaUnificacion({deudaDependienteId:"deuda"})).toBe(true);
    expect(cuadreProtegidoParaUnificacion({fondoFaltante:{monto:50,movimientoId:"fondo"}})).toBe(true);
    expect(cuadreProtegidoParaUnificacion({fondoFaltantePropuesto:0})).toBe(true);
    expect(cuadreProtegidoParaUnificacion({fondoFaltanteOperacion:"operacion"})).toBe(true);
    expect(cuadreProtegidoParaUnificacion({})).toBe(false);
    expect(cuadreProtegidoParaUnificacion({abonoDeudasId:null})).toBe(false);
  });
  it("preserva el mensaje de Supabase y de errores normales",()=>{
    expect(detalleErrorSync({message:"El cuadre requiere guardado autorizado"})).toBe("El cuadre requiere guardado autorizado");
    expect(detalleErrorSync(new Error("Sin conexión"))).toBe("Sin conexión");
  });
});
