import { supabase } from "@/integrations/supabase/client";
import { Cuadre, normalizeCatalogoOrden, useCuadreStore } from "@/store/cuadreStore";

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

  const { data: remote } = await (supabase as any)
    .from("pin_users")
    .select("*")
    .is("deleted_at", null);
  const remoteRows: any[] = remote ?? [];

  // Push locales -> nube (cualquier dispositivo puede escribir)
  if (state.users.length > 0) {
    await (supabase as any).from("pin_users").upsert(
      state.users.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        role: u.role,
        pin_hash: u.pinHash,
        recovery_email: u.recoveryEmail ?? null,
        deleted_at: null,
      }))
    );
  }

  // Merge nube -> local
  const byId = new Map(state.users.map((u) => [u.id, u]));
  for (const r of remoteRows) {
    byId.set(r.id, {
      id: r.id,
      nombre: r.nombre,
      role: r.role as any,
      pinHash: r.pin_hash,
      recoveryEmail: r.recovery_email ?? undefined,
    });
  }
  usePinStore.setState({ users: Array.from(byId.values()) });
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