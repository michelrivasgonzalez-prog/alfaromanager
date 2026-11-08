import { supabase } from "@/integrations/supabase/client";
import { PuntoVenta, Producto, Gasto, Denominaciones } from "@/store/cuadreStore";

export type PrecuadreData = {
  productos: {
    id: string;
    nombre: string;
    inicio: number;
    entradas: number;
    traslados: number;
    final: number;
    precio: number;
    categoria?: string;
  }[];
  gastos: {
    id: string;
    descripcion: string;
    monto: number;
    nombre?: string;
  }[];
  denominaciones: Denominaciones;
  efectivoTotal: number;
  tipoRelevo: "dependiente" | "admin";
  entranteNombre?: string;
  entranteFirma?: string;
  notas?: string;
};

export type TurnoDependiente = {
  id: string;
  punto_venta: PuntoVenta;
  dependiente: string;
  entrante?: string;
  estado: "en_curso" | "precuadrado" | "conciliado" | "descartado";
  data: Partial<PrecuadreData>;
  enviado_en?: string;
  created_at?: string;
  updated_at?: string;
};

const OFFLINE_KEY = "alfaro_turnos_offline_queue";

// Helper de cola offline
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

// Vacía la cola offline cuando vuelve la conexión
export async function syncOfflineTurnos(): Promise<void> {
  if (!navigator.onLine) return;
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  const rest: TurnoDependiente[] = [];
  for (const item of queue) {
    try {
      const { error } = await supabase
        .from("turnos_dependiente" as any)
        .upsert(item);
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

// API de Turnos
export async function getTurnoEnCurso(
  punto: PuntoVenta,
  dependiente: string
): Promise<TurnoDependiente | null> {
  try {
    const { data, error } = await supabase
      .from("turnos_dependiente" as any)
      .select("*")
      .eq("punto_venta", punto)
      .eq("dependiente", dependiente)
      .eq("estado", "en_curso")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as TurnoDependiente;
  } catch {
    return null;
  }
}

export async function guardarTurnoEnCurso(
  turno: Partial<TurnoDependiente> & { punto_venta: PuntoVenta; dependiente: string }
): Promise<TurnoDependiente> {
  const record: TurnoDependiente = {
    id: turno.id || crypto.randomUUID(),
    punto_venta: turno.punto_venta,
    dependiente: turno.dependiente,
    estado: "en_curso",
    data: turno.data || {},
    updated_at: new Date().toISOString(),
  };

  if (!navigator.onLine) {
    const queue = getOfflineQueue().filter((q) => q.id !== record.id);
    queue.push(record);
    saveOfflineQueue(queue);
    return record;
  }

  try {
    const { data, error } = await supabase
      .from("turnos_dependiente" as any)
      .upsert(record)
      .select()
      .single();

    if (error) throw error;
    return data as TurnoDependiente;
  } catch {
    const queue = getOfflineQueue().filter((q) => q.id !== record.id);
    queue.push(record);
    saveOfflineQueue(queue);
    return record;
  }
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
      .upsert(payload);
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
    return (data as TurnoDependiente[]) || [];
  } catch {
    return [];
  }
}

export async function marcarPrecuadreConciliado(id: string): Promise<void> {
  await supabase
    .from("turnos_dependiente" as any)
    .update({ estado: "conciliado", updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function marcarPrecuadreDescartado(id: string): Promise<void> {
  await supabase
    .from("turnos_dependiente" as any)
    .update({ estado: "descartado", updated_at: new Date().toISOString() })
    .eq("id", id);
}
