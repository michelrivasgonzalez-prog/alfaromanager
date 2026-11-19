import { createClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { usePinStore } from "@/store/pinStore";
import type { Cuadre } from "@/store/cuadreStore";

export type MovimientoFondo = {
  id: string;
  detalles?: { origen?: string };
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

const cajaClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { storageKey: "alfaro-caja-auth", persistSession: false, detectSessionInUrl: false } },
);

export const useSesionCaja = create<{ cuenta: string | null }>(() => ({ cuenta: null }));

cajaClient.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") useSesionCaja.setState({ cuenta: null });
});

export async function salirCaja() {
  useSesionCaja.setState({ cuenta: null });
  await cajaClient.auth.signOut({ scope: "local" });
}

usePinStore.subscribe((actual, anterior) => {
  if (actual.currentUserId !== anterior.currentUserId) void salirCaja();
});

async function operar<T>(accion: string, solicitud: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await cajaClient.rpc("operar_caja_sobrantes", { accion, solicitud });
  if (error) throw new Error(error.message);
  return data as T;
}

export async function entrarCaja(email: string, password: string) {
  const pinId = usePinStore.getState().currentUserId;
  const { data, error } = await cajaClient.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  try {
    await listarCaja();
    const pin = usePinStore.getState();
    const role = pin.users.find(({ id }) => id === pin.currentUserId)?.role;
    if (pin.currentUserId !== pinId || (role !== "admin" && role !== "duena")) {
      throw new Error("La sesión por PIN cambió. Vuelve a iniciar sesión.");
    }
    useSesionCaja.setState({ cuenta: data.user.id });
  } catch (error) {
    await salirCaja();
    throw error;
  }
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

export async function compensarDeudaFondo(operacion: string, cliente: string, deuda: string, importe: number, motivo: string) {
  const { data, error } = await cajaClient.rpc("compensar_deuda_fondo", { operacion, cliente, deuda, importe, motivo });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function vincularFaltanteKamila(cliente: string, datos: Cuadre) {
  const { data, error } = await cajaClient.rpc("vincular_faltante_kamila", { cliente, datos });
  if (error) throw new Error(error.message);
  return data as string;
}
