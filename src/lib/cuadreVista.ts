const ORDEN_CUADRE = ["alimentos cocina", "carnes embutidos", "cervezas", "rones", "bebidas", "cigarros", "confituras", "limpieza y aseo", "otros", "panaderia", "perfumeria"];
const claveCategoria = (nombre?: string) => (nombre ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const rangoCategoria = (nombre?: string) => {
  const clave = claveCategoria(nombre).replace("limpieza aseo", "limpieza y aseo").replace("carnes y embutidos","carnes embutidos");
  const i = ORDEN_CUADRE.indexOf(clave);
  return i < 0 ? ORDEN_CUADRE.length : i;
};
export const compararCategorias = (a?: string, b?: string) => rangoCategoria(a) - rangoCategoria(b) || (a ?? "").localeCompare(b ?? "", "es");
export const ordenarProductosCuadre = <T extends { nombre: string; categoria?: string }>(productos: T[]): T[] =>
  [...productos].sort((a, b) => compararCategorias(a.categoria, b.categoria) || a.nombre.localeCompare(b.nombre, "es"));


export function fechasRegistradasOtros<T extends { id: string; puntoVenta: string; diasTrabajados?: string[]; fecha: string }>(history:T[],punto:string,editando?:string) {
  return history.filter(h=>h.puntoVenta===punto && h.id!==editando).flatMap(h=>h.diasTrabajados?.length?h.diasTrabajados:[h.fecha]).map(d=>new Date(d));
}
export function separarEntregas<T extends {turno_operativo_id:string;estado:string}>(entregas:T[], activos:Set<string>) {
  const pendientes=entregas.filter(e=>e.estado==="pendiente"||e.estado==="diferencia");
  const procesadas=entregas.filter(e=>e.estado==="confirmada"||e.estado==="anulada");
  return {pendientesActuales:pendientes.filter(e=>activos.has(e.turno_operativo_id)),pendientesAnteriores:pendientes.filter(e=>!activos.has(e.turno_operativo_id)),actuales:procesadas.filter(e=>activos.has(e.turno_operativo_id)),anteriores:procesadas.filter(e=>!activos.has(e.turno_operativo_id))};
}
export const seleccionarTurnoPropio = <T extends {usuario_id:string|null;estado:string;punto_venta:string;inicio:string}>(turnos:T[],usuario:string,habitual?:string):T|undefined => {
  const propios=turnos.filter(t=>t.usuario_id===usuario&&t.estado==="activo");
  return propios.find(t=>t.punto_venta===habitual)??[...propios].sort((a,b)=>b.inicio.localeCompare(a.inicio))[0];
};
