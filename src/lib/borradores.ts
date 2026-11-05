import { supabase } from "@/integrations/supabase/client";
import { ensureCloudSession } from "@/lib/cloudBootstrap";
import { PUNTOS, PuntoVenta, useCuadreStore, Cuadre } from "@/store/cuadreStore";

/**
 * Borradores de cuadre en la nube: el cuadre en curso de cada punto se guarda
 * en app_settings (id "borrador:<punto>") para continuarlo en otro dispositivo.
 * Gana la versión más reciente (updatedAt).
 */
type Borrador = { cuadre: Cuadre | null; step: number; updatedAt: string };

const rowId = (p: PuntoVenta) => `borrador:${p}`;
const tsKey = (p: PuntoVenta) => `alfaro-borrador-ts-${p}`;
const localTs = (p: PuntoVenta) => localStorage.getItem(tsKey(p)) ?? "";

let aplicando = false;
const timers: Partial<Record<PuntoVenta, ReturnType<typeof setTimeout>>> = {};

async function pushBorrador(p: PuntoVenta) {
  const s = useCuadreStore.getState();
  const payload: Borrador = {
    cuadre: s.currents[p] ?? null,
    step: s.lastStep[p] ?? 1,
    updatedAt: localTs(p) || new Date().toISOString(),
  };
  await ensureCloudSession();
  const { error } = await (supabase as any)
    .from("app_settings")
    .upsert({ id: rowId(p), settings: payload, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Descarga los borradores y adopta los más recientes que el local. */
export async function pullBorradores() {
  await ensureCloudSession();
  const { data, error } = await (supabase as any)
    .from("app_settings")
    .select("id, settings")
    .in("id", PUNTOS.map(rowId));
  if (error) throw error;
  for (const p of PUNTOS) {
    const row = (data ?? []).find((r: any) => r.id === rowId(p));
    const remote = row?.settings as Borrador | undefined;
    const mine = localTs(p);
    const s = useCuadreStore.getState();
    if (!mine && s.currents[p]) {
      // Borrador local sin marca: se sube como el más reciente.
      localStorage.setItem(tsKey(p), new Date().toISOString());
      await pushBorrador(p);
      continue;
    }
    if (!remote?.updatedAt || remote.updatedAt <= mine) continue;
    aplicando = true;
    useCuadreStore.setState((st) => ({
      currents: { ...st.currents, [p]: remote.cuadre ?? null },
      lastStep: { ...st.lastStep, [p]: remote.step || 1 },
    }));
    aplicando = false;
    localStorage.setItem(tsKey(p), remote.updatedAt);
  }
}

/** Escucha cambios del cuadre en curso y los sube con un pequeño retraso. */
let iniciado = false;
export function iniciarBorradoresNube() {
  if (iniciado) return;
  iniciado = true;
  useCuadreStore.subscribe((s, prev) => {
    if (aplicando) return;
    for (const p of PUNTOS) {
      if (s.currents[p] === prev.currents[p] && s.lastStep[p] === prev.lastStep[p]) continue;
      localStorage.setItem(tsKey(p), new Date().toISOString());
      clearTimeout(timers[p]);
      timers[p] = setTimeout(() => pushBorrador(p).catch(console.warn), 1500);
    }
  });
}
