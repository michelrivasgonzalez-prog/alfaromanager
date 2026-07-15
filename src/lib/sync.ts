import { supabase } from "@/integrations/supabase/client";
import { Cuadre, normalizeCatalogoOrden, useCuadreStore } from "@/store/cuadreStore";
import { ensureCloudSession } from "@/lib/cloudBootstrap";

/**
 * Sincronización con SOFT-DELETE / TOMBSTONES.
 *
 * Reglas clave:
 *  - Nada se borra de forma destructiva. Las eliminaciones se marcan con
 *    `deleted_at` en la nube y con `tombstones` en el local.
 *  - Un dispositivo nuevo (local vacío, sin tombstones) NO borra nada en la
 *    nube: solo descarga lo no eliminado.
 *  - Las eliminaciones se propagan en ambos sentidos a través de tombstones.
 *  - El merge conserva siempre los datos: si un id no está en ningún
 *    tombstone, se mantiene.
 */
export async function fullSync(role: "admin" | "duena" | "dependiente" | null) {
  if (!role) return;
  const isAdmin = role === "admin";
  await ensureCloudSession();
  await syncPinUsers(isAdmin);
  await syncCatalogo(isAdmin);
  await syncDependientes(isAdmin);
  await syncCuadres(isAdmin);
}

/**
 * Sincroniza usuarios PIN (nombre, rol, hash del PIN, correo de recuperación)
 * con la nube. Estrategia: last-write-wins simple (upsert por id).
 * Usa soft-delete vía `deleted_at`.
 */
export async function syncPinUsers(isAdmin: boolean) {
  const { usePinStore } = await import("@/store/pinStore");
  const state = usePinStore.getState();

  // 1) Trae TODO (incluye eliminados) para desduplicar y detectar borrados remotos.
  const { data: all } = await (supabase as any).from("pin_users").select("*");
  const allRows: any[] = all ?? [];
  const remoteAlive = allRows.filter((r) => !r.deleted_at);
  const remoteDeletedIds = new Set(
    allRows.filter((r) => r.deleted_at).map((r) => r.id)
  );

  // 2) Dedupe: mismo (nombre|correo|rol) => conserva el más antiguo (created_at)
  //    y marca los demás como eliminados.
  const key = (r: any) =>
    `${(r.nombre || "").trim().toLowerCase()}|${(r.recovery_email || "").trim().toLowerCase()}|${r.role}`;
  const groups = new Map<string, any[]>();
  for (const r of remoteAlive) {
    const k = key(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const canonicalById = new Map<string, any>();
  const toSoftDelete: string[] = [];
  for (const rows of groups.values()) {
    rows.sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );
    const winner = rows[0];
    for (const r of rows) canonicalById.set(r.id, winner);
    for (const r of rows.slice(1)) toSoftDelete.push(r.id);
  }
  if (toSoftDelete.length > 0) {
    await (supabase as any)
      .from("pin_users")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", toSoftDelete);
    for (const id of toSoftDelete) remoteDeletedIds.add(id);
  }

  // 3) Push locales -> nube: solo si su id ya existe en la nube (evita duplicar).
  const remoteIds = new Set(allRows.map((r) => r.id));
  const existing = state.users.filter((u) => remoteIds.has(u.id));
  if (existing.length > 0) {
    await (supabase as any).from("pin_users").upsert(
      existing.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        role: u.role,
        pin_hash: u.pinHash,
        recovery_email: u.recoveryEmail ?? null,
      }))
    );
  }
  // Nuevos locales que aún NO están en la nube: solo un admin puede crearlos.
  const brandNew = state.users.filter((u) => !remoteIds.has(u.id));
  if (brandNew.length > 0 && isAdmin) {
    await (supabase as any).from("pin_users").upsert(
      brandNew.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        role: u.role,
        pin_hash: u.pinHash,
        recovery_email: u.recoveryEmail ?? null,
      }))
    );
  }

  // 4) Reconstruye local desde la nube (canónicos vivos).
  const finalAlive = allRows.filter(
    (r) => !r.deleted_at && !toSoftDelete.includes(r.id)
  );
  const merged = finalAlive.map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    role: r.role as any,
    pinHash: r.pin_hash,
    recoveryEmail: r.recovery_email ?? undefined,
  }));
  // Añade brand-new no-admin que aún no se pudieron subir, para no perderlos localmente.
  if (!isAdmin) for (const u of brandNew) merged.push({ ...u, recoveryEmail: u.recoveryEmail });

  // 5) Si el currentUserId apunta a un id eliminado, remapear al canónico.
  let nextCurrent = state.currentUserId;
  if (nextCurrent && remoteDeletedIds.has(nextCurrent)) {
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
  const { data } = await (supabase as any)
    .from("pin_users")
    .select("*")
    .is("deleted_at", null);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    role: r.role as any,
    pinHash: r.pin_hash,
    recoveryEmail: r.recovery_email ?? undefined,
  }));
}

// ---------- Catálogo ----------
async function syncCatalogo(isAdmin: boolean) {
  const state = useCuadreStore.getState();
  const { data: remote } = await (supabase as any)
    .from("catalogo")
    .select("id, nombre, precio, costo, punto, orden, deleted_at");
  const remoteRows: any[] = remote ?? [];

  // 1) Aplicar tombstones remotos al local
  const newTomb = { ...state.tombstones.catalogo };
  const removedLocally = new Set<string>();
  for (const r of remoteRows) {
    if (r.deleted_at) {
      newTomb[r.id] = newTomb[r.id] ?? r.deleted_at;
      removedLocally.add(r.id);
    }
  }

  // 2) Empujar tombstones locales al remoto (solo admin)
  if (isAdmin) {
    const remoteById = new Map(remoteRows.map((r) => [r.id, r]));
    const idsToTomb = Object.keys(state.tombstones.catalogo).filter((id) => {
      const r = remoteById.get(id);
      return r && !r.deleted_at;
    });
    if (idsToTomb.length > 0) {
      await (supabase as any)
        .from("catalogo")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", idsToTomb);
    }
  }

  // 3) Construir catálogo local mergeado
  const localById = new Map(state.catalogo.map((c) => [c.id, c]));
  // Quitar locales que la nube marca como eliminados
  for (const id of removedLocally) localById.delete(id);

  // Añadir/actualizar desde la nube los no eliminados y no tombstoneados localmente
  for (const r of remoteRows) {
    if (r.deleted_at) continue;
    if (newTomb[r.id]) continue; // eliminado localmente: no re-añadir
    localById.set(r.id, {
      id: r.id,
      nombre: r.nombre,
      precio: Number(r.precio),
      costo: Number(r.costo),
      orden: Number(r.orden ?? 0),
      punto: (r.punto as "Cafetería" | "Mipyme" | undefined) || undefined,
    });
  }
  const merged = normalizeCatalogoOrden([...localById.values()]);

  // 4) Upsert local → nube (solo admin, y solo los no tombstoneados)
  if (isAdmin && merged.length > 0) {
    await (supabase as any).from("catalogo").upsert(
      merged.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        precio: c.precio,
        costo: c.costo,
        orden: c.orden ?? 0,
        punto: c.punto ?? null,
        deleted_at: null,
      })) as any
    );
  }

  useCuadreStore.setState({
    catalogo: merged,
    tombstones: { ...state.tombstones, catalogo: newTomb },
  });
}

// ---------- Dependientes ----------
async function syncDependientes(isAdmin: boolean) {
  const state = useCuadreStore.getState();
  const { data: remote } = await (supabase as any)
    .from("dependientes")
    .select("nombre, deleted_at");
  const remoteRows: any[] = remote ?? [];

  const newTomb = { ...state.tombstones.dependientes };
  const removedLocally = new Set<string>();
  for (const r of remoteRows) {
    if (r.deleted_at) {
      newTomb[r.nombre] = newTomb[r.nombre] ?? r.deleted_at;
      removedLocally.add(r.nombre);
    }
  }

  if (isAdmin) {
    const remoteByName = new Map(remoteRows.map((r) => [r.nombre, r]));
    const namesToTomb = Object.keys(state.tombstones.dependientes).filter((n) => {
      const r = remoteByName.get(n);
      return r && !r.deleted_at;
    });
    if (namesToTomb.length > 0) {
      await (supabase as any)
        .from("dependientes")
        .update({ deleted_at: new Date().toISOString() })
        .in("nombre", namesToTomb);
    }
  }

  const localSet = new Set(state.dependientes);
  for (const n of removedLocally) localSet.delete(n);
  for (const r of remoteRows) {
    if (r.deleted_at) continue;
    if (newTomb[r.nombre]) continue;
    localSet.add(r.nombre);
  }
  const merged = Array.from(localSet).sort((a, b) => a.localeCompare(b));

  if (isAdmin && merged.length > 0) {
    await (supabase as any)
      .from("dependientes")
      .upsert(
        merged.map((n) => ({ nombre: n, deleted_at: null })),
        { onConflict: "nombre" }
      );
  }

  useCuadreStore.setState({
    dependientes: merged,
    tombstones: { ...state.tombstones, dependientes: newTomb },
  });
}

// ---------- Cuadres ----------
async function syncCuadres(isAdmin: boolean) {
  const state = useCuadreStore.getState();
  const { data: remote } = await (supabase as any)
    .from("cuadres")
    .select("id, data, deleted_at");
  const remoteRows: any[] = remote ?? [];

  const newTomb = { ...state.tombstones.cuadres };
  const removedLocally = new Set<string>();
  for (const r of remoteRows) {
    if (r.deleted_at) {
      newTomb[r.id] = newTomb[r.id] ?? r.deleted_at;
      removedLocally.add(r.id);
    }
  }

  if (isAdmin) {
    const remoteById = new Map(remoteRows.map((r) => [r.id, r]));
    const idsToTomb = Object.keys(state.tombstones.cuadres).filter((id) => {
      const r = remoteById.get(id);
      return r && !r.deleted_at;
    });
    if (idsToTomb.length > 0) {
      await (supabase as any)
        .from("cuadres")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", idsToTomb);
    }
  }

  const localById = new Map(state.history.map((c) => [c.id, c]));
  for (const id of removedLocally) localById.delete(id);
  for (const r of remoteRows) {
    if (r.deleted_at) continue;
    if (newTomb[r.id]) continue;
    localById.set(r.id, r.data as Cuadre);
  }
  const merged: Cuadre[] = [...localById.values()].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );

  if (isAdmin && merged.length > 0) {
    await (supabase as any).from("cuadres").upsert(
      merged.map((c) => ({
        id: c.id,
        punto_venta: c.puntoVenta,
        fecha: c.fecha,
        dependiente: c.dependiente || null,
        finalizado: c.finalizado,
        data: c as any,
        deleted_at: null,
      }))
    );
  }

  useCuadreStore.setState({
    history: merged,
    tombstones: { ...state.tombstones, cuadres: newTomb },
  });
}

export async function pushCuadre(c: Cuadre) {
  await supabase.from("cuadres").upsert({
    id: c.id,
    punto_venta: c.puntoVenta,
    fecha: c.fecha,
    dependiente: c.dependiente || null,
    finalizado: c.finalizado,
    data: c as any,
  });
}

export async function pushCatalogItem(c: {
  id: string;
  nombre: string;
  precio: number;
  costo: number;
  orden?: number;
  punto?: string;
}) {
  await (supabase as any).from("catalogo").upsert({
    id: c.id,
    nombre: c.nombre,
    precio: c.precio,
    costo: c.costo,
    orden: c.orden ?? 0,
    punto: c.punto ?? null,
  } as any);
}

export async function deleteCatalogItem(id: string) {
  // Soft-delete: marca tombstone en la nube en lugar de borrar.
  await (supabase as any)
    .from("catalogo")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
}

export async function pushDependiente(nombre: string) {
  await supabase.from("dependientes").upsert({ nombre }, { onConflict: "nombre" });
}

export async function deleteDependiente(nombre: string) {
  await (supabase as any)
    .from("dependientes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("nombre", nombre);
}

export async function deleteCuadreRemote(id: string) {
  await (supabase as any)
    .from("cuadres")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
}