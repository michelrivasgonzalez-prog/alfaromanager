import { marcarPrecuadreConciliado } from "@/lib/turnos";
import { supabase } from "@/integrations/supabase/client";
import { CatalogoItem, Cuadre, Settings, normalizeCatalogoOrden, useCuadreStore } from "@/store/cuadreStore";
import { ensureCloudSession } from "@/lib/cloudBootstrap";
import type { PinUser } from "@/store/pinStore";
import { unificarCatalogo, unificarCuadre } from "@/lib/unificar";
import { pullBorradores } from "@/lib/borradores";

/**
 * Sincronización cloud-first con borrado real.
 *
 * Reglas clave:
 *  - La nube es la fuente de verdad al abrir/sincronizar.
 *  - Las altas/ediciones se empujan en el momento de hacerlas.
 *  - Las eliminaciones son DELETE reales, sin guardar tombstones en la nube.
 *  - Si una tabla remota está vacía y el dispositivo tiene datos locales, el admin la siembra.
 */
export async function fullSync(role: "admin" | "duena" | "dependiente" | null) {
  if (!role) return;
  // La dueña tiene los mismos privilegios que el admin.
  const isAdmin = role === "admin" || role === "duena";
  await ensureCloudSession();
  await syncPinUsers(isAdmin);
  await syncSettings(isAdmin);
  await syncCatalogo(isAdmin);
  await syncDependientes(isAdmin);
  await syncCuadres(isAdmin);
  if (isAdmin) await aplicarUnificacion();
  await pullBorradores();
}

/** Unifica productos repetidos/renombrados en catálogo e historial y sube los cambios. */
async function aplicarUnificacion() {
  const st = useCuadreStore.getState();
  const cats = st.settings.categorias ?? [];
  const { catalogo, cambiado } = unificarCatalogo(st.catalogo);
  if (cambiado) {
    useCuadreStore.setState({ catalogo: normalizeCatalogoOrden(catalogo) });
    await pushAllCatalogo();
  }
  const cat = useCuadreStore.getState().catalogo;
  const cambiados: Cuadre[] = [];
  const history = useCuadreStore.getState().history.map((c) => {
    const n = unificarCuadre(c, cat, cats);
    if (n) cambiados.push(n);
    return n ?? c;
  });
  if (cambiados.length) {
    useCuadreStore.setState({ history });
    await upsertCuadres(cambiados);
  }
}

/**
 * Sincroniza usuarios PIN y elimina duplicados reales.
 */
export async function syncPinUsers(isAdmin: boolean) {
  const { usePinStore } = await import("@/store/pinStore");
  const state = usePinStore.getState();

  const { data: all, error } = await (supabase as any).from("pin_users").select("*");
  if (error) throw error;
  const allRows: any[] = all ?? [];
  const remoteAlive = allRows.filter((r) => !r.deleted_at);

  const key = (r: any) =>
    `${(r.nombre || "").trim().toLowerCase()}|${(r.recovery_email || "").trim().toLowerCase()}|${r.role}`;
  const groups = new Map<string, any[]>();
  for (const r of remoteAlive) {
    const k = key(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const canonicalById = new Map<string, any>();
  const toDelete: string[] = allRows.filter((r) => r.deleted_at).map((r) => r.id);
  for (const rows of groups.values()) {
    rows.sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );
    const winner = rows[0];
    for (const r of rows) canonicalById.set(r.id, winner);
    for (const r of rows.slice(1)) toDelete.push(r.id);
  }
  if (toDelete.length > 0) {
    const { error: delError } = await (supabase as any).from("pin_users").delete().in("id", toDelete);
    if (delError) throw delError;
  }

  const aliveAfterDedupe = remoteAlive.filter((r) => !toDelete.includes(r.id));
  const remoteIds = new Set(aliveAfterDedupe.map((r) => r.id));
  const existing = state.users.filter((u) => remoteIds.has(u.id));
  if (existing.length > 0) {
    const { error: upError } = await (supabase as any).from("pin_users").upsert(
      existing.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        role: u.role,
        pin_hash: u.pinHash,
        recovery_email: u.recoveryEmail ?? null,
      }))
    );
    if (upError) throw upError;
  }
  const brandNew = state.users.filter((u) => !remoteIds.has(u.id));
  if (brandNew.length > 0 && isAdmin) {
    const { error: newError } = await (supabase as any).from("pin_users").upsert(
      brandNew.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        role: u.role,
        pin_hash: u.pinHash,
        recovery_email: u.recoveryEmail ?? null,
      }))
    );
    if (newError) throw newError;
  }

  const finalRows = [...aliveAfterDedupe, ...(isAdmin ? brandNew.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    role: u.role,
    pin_hash: u.pinHash,
    recovery_email: u.recoveryEmail ?? null,
  })) : [])];
  const merged: any[] = finalRows.map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    role: r.role as any,
    pinHash: r.pin_hash,
    recoveryEmail: r.recovery_email ?? undefined,
  }));
  if (!isAdmin) for (const u of brandNew) merged.push(u);

  let nextCurrent = state.currentUserId;
  if (nextCurrent && toDelete.includes(nextCurrent)) {
    const canonical = canonicalById.get(nextCurrent);
    nextCurrent = canonical ? canonical.id : null;
  }
  usePinStore.setState({ users: merged, currentUserId: nextCurrent });
}

/**
 * Descarga usuarios PIN desde la nube. Se usa al abrir la app en un
 * dispositivo nuevo (local vacío) para saber si ya hay una cuenta creada
 * y mostrar la pantalla de PIN en lugar del registro.
 */
export async function pullPinUsers() {
  await ensureCloudSession();
  const { data, error } = await (supabase as any)
    .from("pin_users")
    .select("*")
    .is("deleted_at", null);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    role: r.role as any,
    pinHash: r.pin_hash,
    recoveryEmail: r.recovery_email ?? undefined,
  }));
}

export async function pushPinUser(u: PinUser) {
  await ensureCloudSession();
  const { error } = await (supabase as any).from("pin_users").upsert({
    id: u.id,
    nombre: u.nombre,
    role: u.role,
    pin_hash: u.pinHash,
    recovery_email: u.recoveryEmail ?? null,
    deleted_at: null,
  });
  if (error) throw error;
}

export async function deletePinUserRemote(id: string) {
  await ensureCloudSession();
  const { error } = await (supabase as any).from("pin_users").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Ajustes ----------
async function syncSettings(isAdmin: boolean) {
  const state = useCuadreStore.getState() as any;
  const localUpdated = new Date(state.settingsUpdatedAt ?? "1970-01-01T00:00:00.000Z").getTime();
  const { data, error } = await (supabase as any)
    .from("app_settings")
    .select("settings, updated_at")
    .eq("id", "global")
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    if (isAdmin) await pushSettings(state.settings);
    return;
  }

  const remoteUpdated = new Date(data.updated_at ?? 0).getTime();
  if (isAdmin && localUpdated > remoteUpdated + 1000) {
    await pushSettings(state.settings);
    return;
  }

  useCuadreStore.setState({
    settings: { ...state.settings, ...(data.settings ?? {}) },
    settingsUpdatedAt: data.updated_at,
  } as any);
}

export async function pushSettings(settings?: Settings) {
  await ensureCloudSession();
  const next = settings ?? useCuadreStore.getState().settings;
  const { error } = await (supabase as any).from("app_settings").upsert({
    id: "global",
    settings: next as any,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ---------- Catálogo ----------
async function syncCatalogo(isAdmin: boolean) {
  // Si un cuadre se cerró sin conexión, su catálogo actualizado se sube primero.
  if (localStorage.getItem("alfaro-catalogo-pending") === "1") {
    await pushAllCatalogo();
    localStorage.removeItem("alfaro-catalogo-pending");
  }
  const state = useCuadreStore.getState();
  const { data: remote, error } = await (supabase as any)
    .from("catalogo")
    .select("id, nombre, precio, costo, punto, orden, categoria")
    .is("deleted_at", null);
  if (error) throw error;
  const remoteRows: any[] = remote ?? [];

  if (remoteRows.length === 0 && isAdmin && state.catalogo.length > 0) {
    await upsertCatalogItems(state.catalogo);
    return;
  }

  const merged = normalizeCatalogoOrden(
    remoteRows.map((r: any) => ({
      id: r.id,
      nombre: r.nombre,
      precio: Number(r.precio),
      costo: Number(r.costo),
      orden: Number(r.orden ?? 0),
      categoria: r.categoria ?? undefined,
      punto: (r.punto as "Cafetería" | "Mipyme" | undefined) || undefined,
    }))
  );

  useCuadreStore.setState({
    catalogo: merged,
    tombstones: { ...state.tombstones, catalogo: {} },
  });
}


// ---------- Dependientes ----------
async function syncDependientes(isAdmin: boolean) {
  const state = useCuadreStore.getState();
  const { data: remote, error } = await (supabase as any)
    .from("dependientes")
    .select("nombre")
    .is("deleted_at", null);
  if (error) throw error;
  const remoteRows: any[] = remote ?? [];

  if (remoteRows.length === 0 && isAdmin && state.dependientes.length > 0) {
    const { error: upError } = await (supabase as any)
      .from("dependientes")
      .upsert(state.dependientes.map((n) => ({ nombre: n })), { onConflict: "nombre" });
    if (upError) throw upError;
    return;
  }

  const merged = Array.from(new Set(remoteRows.map((r) => String(r.nombre)))).sort((a, b) =>
    a.localeCompare(b)
  );

  useCuadreStore.setState({
    dependientes: merged,
    tombstones: { ...state.tombstones, dependientes: {} },
  });
}

// ---------- Cuadres ----------
async function syncCuadres(isAdmin: boolean) {
  // 1) Subir primero los cuadres guardados sin conexión, para no perderlos.
  await flushPendingCuadres();

  const state = useCuadreStore.getState();
  const { data: remote, error } = await (supabase as any)
    .from("cuadres")
    .select("id, data")
    .is("deleted_at", null);
  if (error) throw error;
  const remoteRows: any[] = remote ?? [];

  if (remoteRows.length === 0 && isAdmin && state.history.length > 0) {
    await upsertCuadres(state.history);
    return;
  }

  const remoteList: Cuadre[] = remoteRows.map((r) => r.data as Cuadre);
  const remoteIds = new Set(remoteList.map((c) => c.id));
  // Conservar los cuadres locales que todavía no se pudieron subir.
  const pending = new Set(useCuadreStore.getState().pendingCuadres ?? []);
  const localPendientes = useCuadreStore
    .getState()
    .history.filter((c) => pending.has(c.id) && !remoteIds.has(c.id));

  const merged: Cuadre[] = [...remoteList, ...localPendientes].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );

  useCuadreStore.setState({
    history: merged,
    tombstones: { ...state.tombstones, cuadres: {} },
  });
}

/** Sube los cuadres marcados como pendientes (guardados sin conexión). */
export async function flushPendingCuadres() {
  const st = useCuadreStore.getState();
  const ids = st.pendingCuadres ?? [];
  if (ids.length === 0) return;
  for (const id of ids) {
    const c = useCuadreStore.getState().history.find((h) => h.id === id);
    if (!c) {
      useCuadreStore.getState().clearPendingCuadre(id);
      continue;
    }
    await pushCuadre(c); // si falla, lanza y se reintenta en la próxima sincronización
    useCuadreStore.getState().clearPendingCuadre(id);
  }
}

export async function pushCuadre(c: Cuadre) {
  await ensureCloudSession();
  const { error } = await supabase.from("cuadres").upsert({
    id: c.id,
    punto_venta: c.puntoVenta,
    fecha: c.fecha,
    dependiente: c.dependiente || null,
    finalizado: c.finalizado,
    data: c as any,
    deleted_at: null,
  });
  if (error) throw error;
  if (c.finalizado && c.precuadre?.turnoId) {
    await marcarPrecuadreConciliado(c.precuadre.turnoId);
  }
}

async function upsertCuadres(cuadres: Cuadre[]) {
  if (cuadres.length === 0) return;
  const { error } = await (supabase as any).from("cuadres").upsert(
    cuadres.map((c) => ({
      id: c.id,
      punto_venta: c.puntoVenta,
      fecha: c.fecha,
      dependiente: c.dependiente || null,
      finalizado: c.finalizado,
      data: c as any,
      deleted_at: null,
    }))
  );
  if (error) throw error;
}

export async function pushCatalogItem(c: {
  id: string;
  nombre: string;
  precio: number;
  costo: number;
  orden?: number;
  categoria?: string;
  punto?: string;
}) {
  await ensureCloudSession();
  const { error } = await (supabase as any).from("catalogo").upsert({
    id: c.id,
    nombre: c.nombre,
    precio: c.precio,
    costo: c.costo,
    orden: c.orden ?? 0,
    categoria: c.categoria ?? null,
    punto: c.punto ?? null,
    deleted_at: null,
  } as any);
  if (error) throw error;
}

async function upsertCatalogItems(items: CatalogoItem[]) {
  const rows = (items as any[]).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    precio: c.precio,
    costo: c.costo,
    orden: c.orden ?? 0,
    categoria: c.categoria ?? null,
    punto: c.punto ?? null,
    deleted_at: null,
  }));
  if (rows.length === 0) return;
  const { error } = await (supabase as any).from("catalogo").upsert(rows);
  if (error) throw error;
}

export async function deleteCatalogItem(id: string) {
  await ensureCloudSession();
  const { error } = await (supabase as any).from("catalogo").delete().eq("id", id);
  if (error) throw error;
}

export async function pushDependiente(nombre: string) {
  await ensureCloudSession();
  const { error } = await supabase.from("dependientes").upsert({ nombre }, { onConflict: "nombre" });
  if (error) throw error;
}

export async function deleteDependiente(nombre: string) {
  await ensureCloudSession();
  const { error } = await (supabase as any).from("dependientes").delete().eq("nombre", nombre);
  if (error) throw error;
}

export async function deleteCuadreRemote(id: string) {
  await ensureCloudSession();
  const { error } = await (supabase as any).from("cuadres").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Sube todo el catálogo local y borra en la nube los productos que ya no
 * existen localmente (evita duplicados tras renombrar o eliminar productos).
 */
export async function pushAllCatalogo() {
  await ensureCloudSession();
  const local = useCuadreStore.getState().catalogo;
  await upsertCatalogItems(local);
  const { data: remote, error } = await (supabase as any).from("catalogo").select("id");
  if (error) throw error;
  const localIds = new Set(local.map((c) => c.id));
  const sobrantes = (remote ?? []).map((r: any) => r.id).filter((id: string) => !localIds.has(id));
  if (sobrantes.length > 0) {
    const { error: delError } = await (supabase as any)
      .from("catalogo")
      .delete()
      .in("id", sobrantes);
    if (delError) throw delError;
  }
}
