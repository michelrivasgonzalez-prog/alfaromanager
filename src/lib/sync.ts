import { supabase } from "@/integrations/supabase/client";
import { Cuadre, sortCatalogo, useCuadreStore } from "@/store/cuadreStore";

/**
 * Sincronización simple "pull-then-push":
 * - Descarga catálogo, dependientes y cuadres desde la nube y los fusiona con el store local.
 * - Si el usuario es admin, sube cualquier cuadre/catálogo/dependiente local que no exista en remoto.
 * El modo offline sigue funcionando: el store usa zustand persist en localStorage.
 */
export async function fullSync(role: "admin" | "duena" | "dependiente" | null) {
  if (!role) return;
  const store = useCuadreStore.getState();

  // ---- Catálogo ----
  const { data: catRemote } = await (supabase as any)
    .from("catalogo")
    .select("id, nombre, precio, costo, punto, orden")
    .order("punto", { ascending: true })
    .order("orden", { ascending: true });
  if (catRemote) {
    const remoteIds = new Set(catRemote.map((c) => c.id));
    const merged = sortCatalogo([
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

    // Push faltantes si admin
    if (role === "admin") {
      const toUpload = store.catalogo.filter((c) => !remoteIds.has(c.id));
      if (toUpload.length > 0) {
        await (supabase as any).from("catalogo").insert(
          toUpload.map((c) => ({
            id: c.id,
            nombre: c.nombre,
            precio: c.precio,
            costo: c.costo,
            orden: c.orden ?? 0,
            punto: c.punto ?? null,
          })) as any
        );
      }
    }
  }

  // ---- Dependientes ----
  const { data: depRemote } = await supabase.from("dependientes").select("nombre");
  if (depRemote) {
    const remoteSet = new Set(depRemote.map((d) => d.nombre));
    const localOnly = store.dependientes.filter((n) => !remoteSet.has(n));
    const merged = Array.from(new Set([...depRemote.map((d) => d.nombre), ...store.dependientes]));
    useCuadreStore.setState({ dependientes: merged });
    if (role === "admin" && localOnly.length > 0) {
      await supabase
        .from("dependientes")
        .insert(localOnly.map((n) => ({ nombre: n })));
    }
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

    if (role === "admin" && localOnly.length > 0) {
      await supabase.from("cuadres").insert(
        localOnly.map((c) => ({
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