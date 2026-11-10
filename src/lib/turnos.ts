import { supabase } from "@/integrations/supabase/client";
import { PuntoVenta, Denominaciones, PrecioTramo, type GastoCategoria, type GastoItem } from "@/store/cuadreStore";

export type GastoPrecuadre = {
  id: string;
  receptor: string;
  descripcion?: string;
  categoriaSugerida?: GastoCategoria;
  items?: (GastoItem & { productoId: string })[];
  tipo: "efectivo" | "producto" | "transferencia";
  fecha?: string;
  transaccion?: string;
  porcentaje?: number;
  montoRecibido?: number;
  precioProducto?: number;
  productoId?: string;
  productoNombre?: string;
  cantidadProducto?: number;
  monto: number;
  sinClasificar?: boolean;
};

export type RecogidaPrecuadre = {
  id: string;
  hora?: string;
  fecha?: string;
  quien?: string;
  monto: number;
  nota?: string;
};

export type PrecuadreData = {
  descartadoComo?: "cancelado" | "eliminado";
  // Paso 1
  diasTrabajados: number;
  // Paso 2: Inicios
  iniciosDeTurnoAnterior: boolean;
  iniciosModificados?: boolean;
  motivoModificacionInicios?: string;
  // Paso 3 y 4: Inventario
  productos: {
    id: string;
    nombre: string;
    inicio: number;
    entradas: number;
    traslados: number;
    final: number;
    precio: number;
    categoria?: string;
    vendidas?: number;
    importe?: number;
    tramos?: Omit<PrecioTramo, "costo">[];
  }[];
  // Paso 5: Relevo & Firma
  tipoRelevo: "dependiente" | "admin";
  entranteNombre: string;
  entranteFirma?: string;
  entranteValidado?: boolean;
  // Paso 6: Resumen ventas
  totalVentas: number;
  // Paso 7: Gastos y salidas
  gastos: GastoPrecuadre[];
  totalGastos: number;
  // Paso 8: Efectivo y Recogidas
  recogidas: RecogidaPrecuadre[];
  totalRecogidas: number;
  denominaciones: Denominaciones;
  usdMonto: number;
  usdTasa: number;
  efectivoTotal: number;
};

export type TurnoDependiente = {
  id: string;
  punto_venta: PuntoVenta;
  dependiente: string;
  entrante?: string;
  dias_trabajados?: number;
  estado: "en_curso" | "precuadrado" | "conciliado" | "descartado";
  data: Partial<PrecuadreData>;
  enviado_en?: string;
  created_at?: string;
  updated_at?: string;
};

const OFFLINE_KEY = "alfaro_turnos_offline_queue";

function getOfflineQueue(): TurnoDependiente[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: TurnoDependiente[]) {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(queue));
}

// Sincroniza la cola local con la nube cuando regresa la red
export async function syncOfflineTurnos(): Promise<void> {
  if (!navigator.onLine) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  const rest: TurnoDependiente[] = [];
  for (const item of queue) {
    try {
      const { error } = await supabase
        .from("turnos_dependiente" as any)
        .upsert(item, { onConflict: "id", ignoreDuplicates: true });
      if (error) rest.push(item);
    } catch {
      rest.push(item);
    }
  }
  saveOfflineQueue(rest);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    syncOfflineTurnos().catch(() => {});
  });
}

export async function enviarPrecuadre(
  turnoId: string,
  punto: PuntoVenta,
  dependiente: string,
  precuadre: PrecuadreData
): Promise<boolean> {
  const payload: TurnoDependiente = {
    id: turnoId,
    punto_venta: punto,
    dependiente,
    entrante: precuadre.entranteNombre,
    dias_trabajados: precuadre.diasTrabajados || 1,
    estado: "precuadrado",
    data: precuadre,
    enviado_en: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!navigator.onLine) {
    const queue = getOfflineQueue().filter((q) => q.id !== turnoId);
    queue.push(payload);
    saveOfflineQueue(queue);
    return true;
  }

  try {
    const { error } = await supabase
      .from("turnos_dependiente" as any)
      .upsert(payload, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
    return true;
  } catch {
    const queue = getOfflineQueue().filter((q) => q.id !== turnoId);
    queue.push(payload);
    saveOfflineQueue(queue);
    return true;
  }
}

export async function listarPrecuadresPendientes(): Promise<TurnoDependiente[]> {
  try {
    const { data, error } = await supabase
      .from("turnos_dependiente" as any)
      .select("*")
      .eq("estado", "precuadrado")
      .order("enviado_en", { ascending: false });

    if (error) return [];
    return (data as unknown as TurnoDependiente[]) || [];
  } catch {
    return [];
  }
}

export async function listarPrecuadresEnviados(dependiente: string): Promise<TurnoDependiente[]> {
  const { data, error } = await supabase
    .from("turnos_dependiente" as any)
    .select("id, punto_venta, dependiente, estado, enviado_en, data")
    .eq("dependiente", dependiente)
    .neq("estado", "en_curso")
    .order("enviado_en", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as TurnoDependiente[];
}

export async function marcarPrecuadreConciliado(id: string): Promise<void> {
  const { error } = await supabase.from("turnos_dependiente" as any)
    .update({ estado: "conciliado", updated_at: new Date().toISOString() })
    .eq("id", id).eq("estado", "precuadrado");
  if (error) throw error;
}

export async function marcarPrecuadreDescartado(
  turno: TurnoDependiente, estado: "cancelado" | "eliminado"
): Promise<void> {
  const { error } = await supabase.from("turnos_dependiente" as any)
    .update({
      estado: "descartado",
      data: { ...turno.data, descartadoComo: estado },
      updated_at: new Date().toISOString(),
    })
    .eq("id", turno.id).eq("estado", "precuadrado").select("id").single();
  if (error) throw error;
}
