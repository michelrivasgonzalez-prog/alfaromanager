import { supabase } from "@/integrations/supabase/client";
import { ensureCloudSession } from "@/lib/cloudBootstrap";
import { create } from "zustand";
import { usePinStore } from "@/store/pinStore";
import type { Cuadre } from "@/store/cuadreStore";

export type MovimientoFondo = {
  id: string;
  detalles?: {
    origen?: string;
    ajuste_pendiente?: { monto: number; total: number };
    ajuste_cuadre?: { registrado_por: string; registrado_en: string; total: number };
    ajuste_confirmado?: { confirmado_por: string; confirmado_en: string; total: number };
  };
  cuadre_id: string | null;
  punto_venta: string;
  tipo: "ingreso" | "retiro";
  estado: "pendiente" | "confirmado" | "anulado";
  monto: number;
  dependiente: string | null;
  periodo_desde: string | null;
  periodo_hasta: string | null;
  motivo: string;
  realizado_por: string;
  realizado_en: string;
  confirmado_por: string | null;
  confirmado_en: string | null;
};

type ResumenFondo = {
  saldo: {
    saldo_disponible: number;
    pendiente_ingresar: number;
    ingresos_confirmados: number;
    retiros_confirmados: number;
  };
  movimientos: MovimientoFondo[];
};

export type AuditoriaFondo = {
  id: string;
  fecha: string;
  tipo_accion: string;
  estado_anterior: MovimientoFondo | null;
  estado_nuevo: MovimientoFondo | null;
};

type SesionPin = { usuario_id: string; rol: "admin" | "duena"; token: string; vence: string };
type RespuestaPin = SesionPin | { limitado: true } | null;

const cliente = supabase as unknown as {
  rpc: (nombre: string, args: Record<string, unknown>) =>
    PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export const useSesionCaja = create<{ cuenta: string | null }>(() => ({ cuenta: null }));
let sesion: SesionPin | null = null;

export async function salirCaja() {
  const anterior = sesion;
  sesion = null;
  useSesionCaja.setState({ cuenta: null });
  if (anterior) await cliente.rpc("cerrar_caja_con_pin", { token: anterior.token });
}

usePinStore.subscribe((actual, anterior) => {
  if (actual.currentUserId !== anterior.currentUserId && sesion) {
    void salirCaja().catch(console.warn);
  }
});

export async function entrarConPinDeCaja(pin: string) {
  if (!await ensureCloudSession()) throw new Error("Conéctate a internet para verificar el PIN de caja.");
  const { data, error } = await cliente.rpc("iniciar_caja_con_pin", { pin });
  // Durante el despliegue, los PIN locales siguen disponibles aunque todavía
  // falte la migración de la caja.
  if (error?.code === "PGRST202") return null;
  if (error) throw new Error("No se pudo verificar el PIN de caja.");
  const respuesta = data as RespuestaPin;
  if (!respuesta) return null;
  if ("limitado" in respuesta) throw new Error("Demasiados intentos. Espera unos minutos y vuelve a probar.");

  const perfil = usePinStore.getState().activarPerfilVerificado(respuesta.usuario_id, respuesta.rol);
  if (!perfil) {
    await cliente.rpc("cerrar_caja_con_pin", { token: respuesta.token });
    throw new Error("Este perfil de caja no está disponible en el dispositivo. Sincroniza los usuarios e inténtalo de nuevo.");
  }
  sesion = respuesta;
  useSesionCaja.setState({ cuenta: respuesta.usuario_id });
  return perfil;
}

async function rpcCaja<T>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const actual = sesion;
  if (!actual || Date.parse(actual.vence) <= Date.now()) {
    void salirCaja().catch(console.warn);
    throw new Error("Vuelve a entrar a la aplicación con tu PIN de caja.");
  }
  const { data, error } = await cliente.rpc(nombre, { ...args, token: actual.token });
  if (error?.code === "42501" && sesion === actual) void salirCaja().catch(console.warn);
  if (error) throw new Error(error.message);
  return data as T;
}

function operar<T>(accion: string, solicitud: Record<string, unknown> = {}) {
  return rpcCaja<T>("operar_caja_sobrantes", { accion, solicitud });
}

export const listarCaja = () => operar<ResumenFondo>("listar");

export const consultarSobrante = (cuadreId: string) =>
  operar<{ movimiento: MovimientoFondo | null; auditoria: AuditoriaFondo[] }>("consultar", { cuadreId });

export const reclasificarSobrante = (
  cuadre: Cuadre, monto: number, salarioBruto: number, salarioPagado: number | null, motivo: string,
) => operar<MovimientoFondo>("reclasificar", {
  cuadreId: cuadre.id, datos: cuadre, monto, salarioBruto, salarioPagado, motivo,
});

export const confirmarSobrante = (movimientoId: string) =>
  operar<MovimientoFondo>("confirmar", { movimientoId });

export const retirarSobrante = (movimientoId: string, monto: number, motivo: string) =>
  operar<MovimientoFondo>("retirar", { movimientoId, monto, motivo });

export const fechaCaja = (fecha: string) => new Date(fecha).toLocaleString("es");

export const montoCaja = (monto: number) =>
  `${monto.toLocaleString("es", { maximumFractionDigits: 2 })} CUP`;

export function compensarDeudaFondo(operacion: string, cliente: string, deuda: string, importe: number, motivo: string) {
  return rpcCaja<string>("compensar_deuda_fondo", { operacion, cliente, deuda, importe, motivo });
}

export function vincularFaltanteKamila(cliente: string, datos: Cuadre) {
  return rpcCaja<string>("vincular_faltante_kamila", { cliente, datos });
}

export const TURNO_KAMILA_FALTANTE = "8fe85acf-9a34-4760-ab8e-18d746f76ea5";

export function deudaPorFaltante(faltante: number, salarioAbsorbido: number) {
  return Math.max(0, Math.round(faltante * 100) - Math.round(salarioAbsorbido * 100)) / 100;
}

export const conciliarSobranteEditado = (cuadreId: string, esperado: number) =>
  rpcCaja<MovimientoFondo>("conciliar_sobrante_editado", { cuadre_id: cuadreId, esperado });

export const confirmarAjusteSobrante = (movimientoId: string, esperado: number) =>
  rpcCaja<MovimientoFondo>("confirmar_ajuste_sobrante", { movimiento_id: movimientoId, esperado });
