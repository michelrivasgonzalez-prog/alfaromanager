import { supabase } from "@/integrations/supabase/client";
import { ensureCloudSession } from "@/lib/cloudBootstrap";
import type { PuntoVenta } from "@/store/cuadreStore";

export type InicioProductoTurno = {
  id: string;
  nombre: string;
  inicio: number;
  precio: number;
  categoria?: string;
  codigoBarras?: string;
};

export type TurnoOperativo = {
  id: string;
  punto_venta: PuntoVenta;
  usuario_id: string;
  dependiente: string;
  estado: "activo" | "entregado" | "reemplazado";
  inicio: string;
  fin?: string | null;
  inicios: InicioProductoTurno[];
  finales?: InicioProductoTurno[] | null;
  fuente: "manual" | "precuadre" | "cuadre" | "relevo";
  fuente_id?: string | null;
  precuadre_id?: string | null;
  relevo_de?: string | null;
  asignado_por?: string | null;
  observacion?: string;
};

export type AsignacionOperativa = {
  punto: PuntoVenta;
  dependienteId: string;
  inicios: InicioProductoTurno[];
  fuente: "manual" | "precuadre" | "cuadre" | "relevo";
  fuenteId?: string | null;
  observacion: string;
  reemplazar: boolean;
};

const TOKEN_KEY = "alfaro-turnos-token";
const USUARIO_KEY = "alfaro-turnos-usuario";

export const tieneSesionTurnos = (usuarioId: string): boolean =>
  sessionStorage.getItem(USUARIO_KEY) === usuarioId && !!sessionStorage.getItem(TOKEN_KEY);

export function limpiarSesionTurnos() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USUARIO_KEY);
  window.dispatchEvent(new Event("alfaro-turnos-sesion"));
}

function tokenActual(usuarioId: string): string {
  if (!tieneSesionTurnos(usuarioId)) throw new Error("Verifica tu PIN para consultar los turnos.");
  return sessionStorage.getItem(TOKEN_KEY)!;
}

async function llamadaTurnos(nombre: string, argumentos: Record<string, unknown>): Promise<any> {
  if (!(await ensureCloudSession())) throw new Error("No hay conexión con la nube. No se modificó ningún turno.");
  const { data, error } = await (supabase as any).rpc(nombre, argumentos);
  if (error) throw new Error(error.message || "No fue posible consultar los turnos.");
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export async function iniciarSesionTurnos(usuarioId: string, pin: string): Promise<void> {
  const result = await llamadaTurnos("alfaro_turnos_login", { p_usuario_id: usuarioId, p_pin: pin });
  if (!result?.token) throw new Error("No se pudo validar el PIN de turnos.");
  limpiarSesionTurnos();
  sessionStorage.setItem(USUARIO_KEY, usuarioId);
  sessionStorage.setItem(TOKEN_KEY, result.token);
  window.dispatchEvent(new Event("alfaro-turnos-sesion"));
}

export async function consultarTurnosOperativos(usuarioId: string): Promise<TurnoOperativo[]> {
  const data = await llamadaTurnos("alfaro_turnos_listar", { p_token: tokenActual(usuarioId) });
  return (data?.turnos ?? []) as TurnoOperativo[];
}

export async function asignarTurnoOperativo(usuarioId: string, a: AsignacionOperativa): Promise<TurnoOperativo> {
  const data = await llamadaTurnos("alfaro_turnos_asignar", {
    p_token: tokenActual(usuarioId),
    p_punto: a.punto,
    p_dependiente_id: a.dependienteId,
    p_inicios: a.inicios,
    p_fuente: a.fuente,
    p_fuente_id: a.fuenteId ?? null,
    p_observacion: a.observacion,
    p_reemplazar: a.reemplazar,
  });
  return data.turno as TurnoOperativo;
}

export async function relevarTurnoOperativo(
  usuarioId: string,
  turnoId: string,
  precuadreId: string,
  receptorId: string,
  pinReceptor: string,
): Promise<{ entregado: boolean; nuevo_turno?: TurnoOperativo; requiere_asignacion?: boolean }> {
  return llamadaTurnos("alfaro_turnos_relevar", {
    p_token: tokenActual(usuarioId),
    p_turno_id: turnoId,
    p_precuadre_id: precuadreId,
    p_receptor_id: receptorId,
    p_pin_receptor: pinReceptor,
  });
}

// Copia instantánea de las existencias en el momento del relevo: nunca se
// actualiza retroactivamente al conciliar un cuadre oficial atrasado.
export function iniciosDesdeProductos(productos: Array<any>, tomarFinal: boolean): InicioProductoTurno[] {
  return productos.filter((p) => p && p.id && p.nombre).map((p) => ({
    id: String(p.id),
    nombre: String(p.nombre),
    inicio: Math.max(0, Number(tomarFinal ? p.final : p.inicio) || 0),
    precio: Number(p.precio) || 0,
    categoria: p.categoria ? String(p.categoria) : undefined,
    codigoBarras: p.codigoBarras ? String(p.codigoBarras) : undefined,
  }));
}
