import { supabase } from "@/integrations/supabase/client";
import { Cuadre, normalizeCatalogoOrden, useCuadreStore } from "@/store/cuadreStore";

/**
 * Sincronización:
 * - Admin: el estado LOCAL es la fuente de verdad. Sube todo lo local (upsert)
 *   y borra en remoto lo que ya no existe localmente (propaga eliminaciones).
 * - No admin: solo descarga desde la nube y fusiona en el local.
 * Modo offline sigue funcionando: zustand persist en localStorage.
 */
export async function fullSync(role: "admin" | "duena" | "dependiente" | null) {
  if (!role) return;
  const store = useCuadreStore.getState();

  if (role === "admin") {
    await pushAllLocal(store);
    return;
  }

  // -------- Modo lectura (no admin): pull y merge --------
  // ---- Catálogo ----
  const { data: catRemote } = await (supabase as any)
    .from("catalogo")
    .select("id, nombre, precio, costo, punto, orden")
    .order("punto", { ascending: true })
    .order("orden", { ascending: true });
  if (catRemote) {
    const remoteIds = new Set(catRemote.map((c) => c.id));
    const merged = normalizeCatalogoOrden([
      ...catRemote.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        precio: Number(c.precio),
        costo: Number(c.costo),
        orden: Number((c as any).orden ?? 0),
        punto: (c.punto as "Cafetería" | "Mipyme" | undefined) || undefined,
      })),
      ...store.catalogo.filter((c) => !remoteIds.has(c.id)),
    ]);
    useCuadreStore.setState({ catalogo: merged });
  }

  // ---- Dependientes ----
  const { data: depRemote } = await supabase.from("dependientes").select("nombre");
  if (depRemote) {
    const merged = Array.from(new Set([...depRemote.map((d) => d.nombre), ...store.dependientes]));
    useCuadreStore.setState({ dependientes: merged });
  }

  // ---- Cuadres ----
  const { data: cuadresRemote } = await supabase
    .from("cuadres")
    .select("id, data")
    .order("fecha", { ascending: false });
  if (cuadresRemote) {
    const remoteIds = new Set(cuadresRemote.map((c) => c.id));
    const remoteCuadres = cuadresRemote.map((r) => r.data as unknown as Cuadre);
    const localOnly = store.history.filter((c) => !remoteIds.has(c.id));
    const merged: Cuadre[] = [...remoteCuadres, ...localOnly].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );
    useCuadreStore.setState({ history: merged });
  }
}

/**
 * Empuja el estado local completo a la nube (fuente de verdad = local).
 * - Upsert de todo lo local.
 * - Borra en remoto los registros cuya clave ya no existe localmente.
 */
async function pushAllLocal(store: ReturnType<typeof useCuadreStore.getState>) {
  // ---- Catálogo ----
  const localCatIds = new Set(store.catalogo.map((c) => c.id));
  const { data: catRemote } = await (supabase as any)
    .from("catalogo")
    .select("id");
  const catToDelete = (catRemote ?? [])
    .map((r: any) => r.id as string)
    .filter((id: string) => !localCatIds.has(id));
  if (catToDelete.length > 0) {
    await supabase.from("catalogo").delete().in("id", catToDelete);
  }
  if (store.catalogo.length > 0) {
    await (supabase as any).from("catalogo").upsert(
      store.catalogo.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        precio: c.precio,
        costo: c.costo,
        orden: c.orden ?? 0,
        punto: c.punto ?? null,
      })) as any
    );
  }

  // ---- Dependientes ----
  const localDep = new Set(store.dependientes);
  const { data: depRemote } = await supabase.from("dependientes").select("nombre");
  const depToDelete = (depRemote ?? [])
    .map((r) => r.nombre)
    .filter((n) => !localDep.has(n));
  if (depToDelete.length > 0) {
    await supabase.from("dependientes").delete().in("nombre", depToDelete);
  }
  if (store.dependientes.length > 0) {
    await supabase
      .from("dependientes")
      .upsert(store.dependientes.map((n) => ({ nombre: n })), { onConflict: "nombre" });
  }

  // ---- Cuadres ----
  const localCuadreIds = new Set(store.history.map((c) => c.id));
  const { data: cuadresRemote } = await supabase.from("cuadres").select("id");
  const cuadresToDelete = (cuadresRemote ?? [])
    .map((r) => r.id)
    .filter((id) => !localCuadreIds.has(id));
  if (cuadresToDelete.length > 0) {
    await supabase.from("cuadres").delete().in("id", cuadresToDelete);
  }
  if (store.history.length > 0) {
    await supabase.from("cuadres").upsert(
      store.history.map((c) => ({
        id: c.id,
        punto_venta: c.puntoVenta,
        fecha: c.fecha,
        dependiente: c.dependiente || null,
        finalizado: c.finalizado,
        data: c as any,
      }))
    );
  }
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
  await supabase.from("catalogo").delete().eq("id", id);
}

export async function pushDependiente(nombre: string) {
  await supabase.from("dependientes").upsert({ nombre }, { onConflict: "nombre" });
}

export async function deleteDependiente(nombre: string) {
  await supabase.from("dependientes").delete().eq("nombre", nombre);
}

export async function deleteCuadreRemote(id: string) {
  await supabase.from("cuadres").delete().eq("id", id);
}