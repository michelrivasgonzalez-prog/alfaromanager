import { supabase } from "@/integrations/supabase/client";

export type AuditoriaRow = {
  id: string;
  fecha: string;
  usuario_id: string | null;
  usuario_nombre: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: Record<string, any> | null;
};

export async function listAuditoria(filter?: {
  entidad?: string;
  usuario?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
}): Promise<AuditoriaRow[]> {
  let q = supabase
    .from("auditoria")
    .select("*")
    .order("fecha", { ascending: false });
  if (filter?.entidad) q = q.eq("entidad", filter.entidad);
  if (filter?.usuario) q = q.ilike("usuario_nombre", `%${filter.usuario}%`);
  if (filter?.desde) q = q.gte("fecha", filter.desde);
  if (filter?.hasta) q = q.lte("fecha", filter.hasta);
  if (filter?.limit) q = q.limit(filter.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, detalle: r.detalle ?? {} })) as AuditoriaRow[];
}
