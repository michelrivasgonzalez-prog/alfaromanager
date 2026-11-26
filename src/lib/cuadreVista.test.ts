import {describe,it,expect} from "vitest";
import {ordenarProductosCuadre,fechasRegistradasOtros,separarEntregas,seleccionarTurnoPropio} from "./cuadreVista";
describe("Vista del cuadre y turnos",()=>{
 it("respeta el orden de categorías real y conserva las desconocidas",()=>{
 const categorias=["Perfumería","Carnes y embutidos","Cervezas","Alimentos/Cocina","Otros","Desconocida"];
 expect(ordenarProductosCuadre(categorias.map(c=>({nombre:c,categoria:c}))).map(x=>x.nombre)).toEqual(["Alimentos/Cocina","Carnes y embutidos","Cervezas","Otros","Perfumería","Desconocida"]);
 });
 it("excluye solo el cuadre editado y mantiene otras fechas registradas",()=>{
 const history=[{id:"a",puntoVenta:"Cafetería",fecha:"2026-11-23T12:00:00Z"},{id:"b",puntoVenta:"Cafetería",fecha:"2026-11-25T12:00:00Z"},{id:"c",puntoVenta:"Mipyme",fecha:"2026-11-24T12:00:00Z"}];
 expect(fechasRegistradasOtros(history,"Cafetería","a").map(d=>d.toISOString())).toEqual(["2026-11-25T12:00:00.000Z"]);
 });
 it("separa entregas anteriores por id, conservando pendientes",()=>{
 const a={id:"a",turno_operativo_id:"anterior",estado:"confirmada"},b={id:"b",turno_operativo_id:"nuevo",estado:"confirmada"},c={id:"c",turno_operativo_id:"anterior",estado:"pendiente"};
 const r=separarEntregas([a,b,c],new Set(["nuevo"]));
 expect(r.actuales).toEqual([b]);expect(r.anteriores).toEqual([a]);expect(r.pendientesAnteriores).toEqual([c]);
 });
 it("nunca selecciona el turno de otra persona ni uno entregado",()=>{
 const a={usuario_id:"otro",estado:"activo",punto_venta:"Cafetería",inicio:"2026-11-25"},b={usuario_id:"yo",estado:"entregado",punto_venta:"Cafetería",inicio:"2026-11-24"},c={usuario_id:"yo",estado:"activo",punto_venta:"Mipyme",inicio:"2026-11-26"};
 expect(seleccionarTurnoPropio([a,b,c],"yo","Cafetería")).toEqual(c);
 expect(seleccionarTurnoPropio([a,b],"yo")).toBeUndefined();
 });
});
