import { supabase } from "@/integrations/supabase/client";
import { ensureCloudSession } from "@/lib/cloudBootstrap";

export type AuditoriaRow = {
  id: string;
  fecha: string;
  usuario_id: string | null;
  usuario_nombre: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: Record<string, any> | null;
  tipo: "abonos" | "fondo" | "otros";
  punto: string | null;
};

export type AuditoriaFilter = {
  entidad?: string;
  usuario?: string;
  accion?: string;
  tipo?: "abonos" | "fondo" | "otros";
  punto?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
  porPagina?: number;
  limit?: number;
};

export type AuditoriaPagina = {
  registros: AuditoriaRow[];
  total: number;
  pagina: number;
  porPagina: number;
};

/** Lee el historial unificado; el PIN existente decide quién ve Ajustes. */
export async function paginaAuditoria(
  filter: AuditoriaFilter = {}
): Promise<AuditoriaPagina> {
  const ok = await ensureCloudSession();
  if (!ok) throw new Error("No hay sesión con la nube. Revisa tu conexión.");

  const pagina = Math.max(1, Math.floor(filter.pagina ?? 1));
  const porPagina = Math.max(
    1,
    Math.min(100, Math.floor(filter.porPagina ?? filter.limit ?? 50))
  );
  const inicio = (pagina - 1) * porPagina;

  let q = (supabase as any)
    .from("auditoria_unificada")
    .select("*", { count: "exact" })
    .order("fecha", { ascending: false })
    .order("id", { ascending: false });

  if (filter.entidad) q = q.eq("entidad", filter.entidad);
  if (filter.tipo) q = q.eq("tipo", filter.tipo);
  if (filter.punto && filter.punto !== "todos") q = q.eq("punto", filter.punto);
  if (filter.usuario?.trim()) {
    q = q.ilike("usuario_nombre", "%" + filter.usuario.trim() + "%");
  }
  if (filter.accion && filter.accion !== "todas") {
    q = q.eq("accion", filter.accion);
  }
  if (filter.desde) {
    q = q.gte("fecha", new Date(filter.desde + "T00:00:00").toISOString());
  }
  if (filter.hasta) {
    q = q.lte("fecha", new Date(filter.hasta + "T23:59:59.999").toISOString());
  }

  const { data, count, error } = await q.range(
    inicio,
    inicio + porPagina - 1
  );
  if (error) throw new Error(error.message);

  return {
    registros: (data ?? []).map((r: any) => ({
      ...r,
      detalle: r.detalle && typeof r.detalle === "object" ? r.detalle : {},
    })) as AuditoriaRow[],
    total: count ?? 0,
    pagina,
    porPagina,
  };
}

/** Compatibilidad con las consultas antiguas. */
export async function listAuditoria(
  filter?: AuditoriaFilter
): Promise<AuditoriaRow[]> {
  const pagina = await paginaAuditoria({
    ...filter,
    pagina: 1,
    porPagina: filter?.limit ?? 100,
  });
  return pagina.registros;
}
