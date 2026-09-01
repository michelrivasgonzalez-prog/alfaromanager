import { supabase } from "@/integrations/supabase/client";

export type AlmProducto = {
  id: string;
  nombre: string;
  unidad: string;
  stock_minimo: number;
  permite_negativo: boolean;
  costo_actual: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AlmMovimiento = {
  id: string;
  producto_id: string;
  tipo: "entrada" | "salida";
  cantidad: number;
  fecha: string;
  receptor: string | null;
  observacion: string | null;
  reversion_de: string | null;
  costo_unitario: number | null;
  created_at: string;
  deleted_at: string | null;
};

export async function listProductos(): Promise<AlmProducto[]> {
  const { data, error } = await supabase
    .from("almacen_productos")
    .select("*")
    .is("deleted_at", null)
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function upsertProducto(p: Partial<AlmProducto> & { nombre: string }) {
  const { data, error } = await supabase
    .from("almacen_productos")
    .upsert({
      id: p.id,
      nombre: p.nombre.trim(),
      unidad: p.unidad ?? "u",
      stock_minimo: p.stock_minimo ?? 0,
      permite_negativo: p.permite_negativo ?? false,
      costo_actual: p.costo_actual ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as any as AlmProducto;
}

export async function softDeleteProducto(id: string) {
  const { error } = await supabase
    .from("almacen_productos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function listMovimientos(filter?: {
  producto_id?: string;
  tipo?: "entrada" | "salida";
  desde?: string;
  hasta?: string;
  limit?: number;
}): Promise<AlmMovimiento[]> {
  let q = supabase
    .from("almacen_movimientos")
    .select("*")
    .is("deleted_at", null)
    .order("fecha", { ascending: false });
  if (filter?.producto_id) q = q.eq("producto_id", filter.producto_id);
  if (filter?.tipo) q = q.eq("tipo", filter.tipo);
  if (filter?.desde) q = q.gte("fecha", filter.desde);
  if (filter?.hasta) q = q.lte("fecha", filter.hasta);
  if (filter?.limit) q = q.limit(filter.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as any;
}

export async function crearMovimiento(m: {
  producto_id: string;
  tipo: "entrada" | "salida";
  cantidad: number;
  fecha?: string;
  receptor?: string | null;
  observacion?: string | null;
  reversion_de?: string | null;
  costo_unitario?: number | null;
}) {
  if (m.cantidad <= 0) throw new Error("La cantidad debe ser mayor que 0");
  // Validar stock si es salida y no permite negativo
  if (m.tipo === "salida") {
    const [{ data: prod }, movs] = await Promise.all([
      supabase.from("almacen_productos").select("permite_negativo").eq("id", m.producto_id).single(),
      listMovimientos({ producto_id: m.producto_id }),
    ]);
    const stock = calcStock(movs);
    if (!(prod as any)?.permite_negativo && stock - m.cantidad < 0) {
      throw new Error(`Stock insuficiente (actual: ${stock})`);
    }
  }
  const { data, error } = await supabase
    .from("almacen_movimientos")
    .insert({
      producto_id: m.producto_id,
      tipo: m.tipo,
      cantidad: m.cantidad,
      fecha: m.fecha ?? new Date().toISOString(),
      receptor: m.receptor ?? null,
      observacion: m.observacion ?? null,
      reversion_de: m.reversion_de ?? null,
      costo_unitario: m.costo_unitario ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  const mov = data as any as AlmMovimiento;
  if (m.tipo === "entrada" && m.costo_unitario && m.costo_unitario > 0) {
    await recalcularCosto(m.producto_id);
  }
  return mov;
}

/** Costo promedio ponderado por entradas con costo registrado. */
export async function recalcularCosto(productoId: string) {
  const movs = await listMovimientos({ producto_id: productoId });
  const entradas = movs.filter(
    (m) => m.tipo === "entrada" && m.costo_unitario && Number(m.costo_unitario) > 0
  );
  if (entradas.length === 0) return null;
  const cant = entradas.reduce((s, m) => s + Number(m.cantidad), 0);
  const importe = entradas.reduce(
    (s, m) => s + Number(m.cantidad) * Number(m.costo_unitario),
    0
  );
  const promedio = cant > 0 ? Math.round((importe / cant) * 100) / 100 : null;
  if (promedio == null) return null;
  const { error } = await supabase
    .from("almacen_productos")
    .update({ costo_actual: promedio })
    .eq("id", productoId);
  if (error) throw error;
  return promedio;
}

/** Reversion: crea un movimiento inverso apuntando al original. */
export async function corregirMovimiento(mov: AlmMovimiento, observacion?: string) {
  return crearMovimiento({
    producto_id: mov.producto_id,
    tipo: mov.tipo === "entrada" ? "salida" : "entrada",
    cantidad: mov.cantidad,
    receptor: mov.receptor,
    costo_unitario: mov.costo_unitario,
    observacion: observacion ?? `Reversión de movimiento ${mov.id.slice(0, 8)}`,
    reversion_de: mov.id,
  });
}

export function calcStock(movs: AlmMovimiento[]) {
  return movs.reduce((s, m) => s + (m.tipo === "entrada" ? m.cantidad : -m.cantidad), 0);
}

export async function stockByProducto(): Promise<Record<string, number>> {
  const movs = await listMovimientos();
  const map: Record<string, number> = {};
  for (const m of movs) {
    map[m.producto_id] = (map[m.producto_id] ?? 0) + (m.tipo === "entrada" ? m.cantidad : -m.cantidad);
  }
  return map;
}
