import type { Cuadre } from "@/store/cuadreStore";

/** No modificar automáticamente un cuadre vinculado a una operación contable. */
export function cuadreProtegidoParaUnificacion(c: Pick<Cuadre,"abonoDeudasId"|"deudaDependienteId"|"fondoFaltante"|"fondoFaltantePropuesto"|"fondoFaltanteOperacion"|"sobranteGestion">): boolean {
  return c.abonoDeudasId != null || c.deudaDependienteId != null || c.fondoFaltante != null ||
    c.fondoFaltantePropuesto != null || c.fondoFaltanteOperacion != null || c.sobranteGestion != null;
}
export function detalleErrorSync(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return typeof error === "string" ? error : "Error de comunicación con la nube";
}
