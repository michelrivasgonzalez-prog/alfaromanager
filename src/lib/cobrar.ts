import { supabase } from "@/integrations/supabase/client";

export type Cliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  observaciones: string | null;
  credito: number;
  uso_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DeudaProducto = { nombre: string; cantidad: number; precio: number };

export type Deuda = {
  id: string;
  cliente_id: string;
  cuadre_id: string | null;
  cuadre_label: string | null;
  fecha: string;
  productos: DeudaProducto[];
  total: number;
  saldo: number;
  estado: "pendiente" | "parcial" | "pagada";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Abono = {
  id: string;
  cliente_id: string;
  monto: number;
  fecha: string;
  usuario_nombre: string | null;
  nota: string | null;
  reversa_de: string | null;
  created_at: string;
};

export type AbonoAplicacion = {
  id: string;
  abono_id: string;
  deuda_id: string;
  monto: number;
  abono?: Abono | null;
};

export async function listClientes(): Promise<Cliente[]> {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .is("deleted_at", null)
    .order("uso_count", { ascending: false })
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function upsertCliente(c: Partial<Cliente> & { nombre: string }) {
  const { data, error } = await supabase
    .from("clientes")
    .upsert({
      id: c.id,
      nombre: c.nombre.trim(),
      telefono: c.telefono ?? null,
      observaciones: c.observaciones ?? null,
      uso_count: c.uso_count ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data as any as Cliente;
}

export async function softDeleteCliente(id: string) {
  const { error } = await supabase
    .from("clientes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function listDeudas(clienteId?: string): Promise<Deuda[]> {
  let q = supabase.from("deudas").select("*").is("deleted_at", null).order("fecha", { ascending: false });
  if (clienteId) q = q.eq("cliente_id", clienteId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, productos: r.productos ?? [] })) as any;
}

export async function crearDeuda(input: {
  cliente_id: string;
  cuadre_id?: string | null;
  cuadre_label?: string | null;
  productos: DeudaProducto[];
  total: number;
  fecha?: string;
}) {
  const { data, error } = await supabase
    .from("deudas")
    .insert({
      cliente_id: input.cliente_id,
      cuadre_id: input.cuadre_id ?? null,
      cuadre_label: input.cuadre_label ?? null,
      productos: input.productos as any,
      total: input.total,
      saldo: input.total,
      fecha: input.fecha ?? new Date().toISOString(),
      estado: "pendiente",
    })
    .select()
    .single();
  if (error) throw error;
  // increment uso_count
  await supabase.rpc as any; // no-op if RPC missing
  const { data: cli } = await supabase.from("clientes").select("uso_count").eq("id", input.cliente_id).single();
  const nextUso = ((cli as any)?.uso_count ?? 0) + 1;
  await supabase.from("clientes").update({ uso_count: nextUso }).eq("id", input.cliente_id);
  return data as any as Deuda;
}

export async function listAbonos(clienteId: string): Promise<Abono[]> {
  const { data, error } = await supabase
    .from("abonos")
    .select("*")
    .is("deleted_at", null)
    .eq("cliente_id", clienteId)
    .order("fecha", { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function listAbonosPorDeuda(clienteId: string): Promise<Record<string, AbonoAplicacion[]>> {
  const { data: abonos, error: abonosError } = await supabase
    .from("abonos")
    .select("*")
    .is("deleted_at", null)
    .eq("cliente_id", clienteId)
    .order("fecha", { ascending: false });
  if (abonosError) throw abonosError;

  const ids = (abonos ?? []).map((a: any) => a.id);
  if (ids.length === 0) return {};

  const { data: apps, error } = await (supabase as any)
    .from("abono_aplicaciones")
    .select("*")
    .in("abono_id", ids);
  if (error) throw error;

  const abonoById = new Map((abonos ?? []).map((a: any) => [a.id, a]));
  return (apps ?? []).reduce((acc: Record<string, AbonoAplicacion[]>, app: any) => {
    const row = { ...app, abono: abonoById.get(app.abono_id) ?? null } as AbonoAplicacion;
    acc[row.deuda_id] = [...(acc[row.deuda_id] ?? []), row];
    return acc;
  }, {});
}

export async function registrarAbono(input: {
  cliente_id: string;
  monto: number;
  aplicaciones: { deuda_id: string; monto: number }[];
  usuario_id?: string | null;
  usuario_nombre?: string | null;
  nota?: string | null;
}) {
  const { data, error } = await supabase.rpc("registrar_abono" as any, {
    _cliente_id: input.cliente_id,
    _monto: input.monto,
    _aplicaciones: input.aplicaciones as any,
    _usuario_id: input.usuario_id ?? null,
    _usuario_nombre: input.usuario_nombre ?? null,
    _nota: input.nota ?? null,
    _fecha: null,
  } as any);
  if (error) throw error;
  return data as string;
}

export async function revertirAbono(input: {
  abono_id: string;
  usuario_id?: string | null;
  usuario_nombre?: string | null;
  nota?: string | null;
}) {
  const { data, error } = await supabase.rpc("revertir_abono" as any, {
    _abono_id: input.abono_id,
    _usuario_id: input.usuario_id ?? null,
    _usuario_nombre: input.usuario_nombre ?? null,
    _nota: input.nota ?? null,
  } as any);
  if (error) throw error;
  return data as string;
}

export const fmt = (n: number) =>
  `$${Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
