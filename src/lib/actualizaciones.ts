import { create } from "zustand";
import { useCuadreStore } from "@/store/cuadreStore";

// Vite sustituye el identificador al compilar; Vitest y otros entornos de prueba
// no siempre inyectan las constantes de build.
export const COMPILACION_INSTALADA =
  typeof __ALFARO_BUILD_ID__ !== "undefined" ? __ALFARO_BUILD_ID__ : "desarrollo";

export type EstadoActualizacion =
  | "sin_comprobar"
  | "buscando"
  | "actualizada"
  | "disponible"
  | "sin_conexion"
  | "error";

type EstadoPwa = {
  estado: EstadoActualizacion;
  disponible: boolean;
  compilacionRemota: string | null;
  ultimoChequeo: number | null;
  avisoDescartado: boolean;
  mensaje: string | null;
  marcarDisponible: () => void;
  descartarAviso: () => void;
  verificar: () => Promise<boolean>;
};

let enCurso: Promise<boolean> | null = null;

export function mostrarCompilacion(valor: string | null | undefined): string {
  if (!valor) return "Desconocida";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor.slice(0, 30);
  return `v${fecha.toISOString().slice(0, 10).replace(/-/g, ".")}.${fecha.toISOString().slice(11, 23).replace(/[:.]/g, "")}`;
}

/** Devuelve true si el servidor ofrece un build distinto al que está abierto. */
export function versionRemotaDiferente(
  instalada: string,
  remota: string | null | undefined
): boolean {
  return Boolean(remota && remota !== instalada);
}

export const useActualizacionesStore = create<EstadoPwa>((set, get) => ({
  estado: "sin_comprobar",
  disponible: false,
  compilacionRemota: null,
  ultimoChequeo: null,
  avisoDescartado: false,
  mensaje: null,
  marcarDisponible: () => set({
    disponible: true,
    estado: "disponible",
    avisoDescartado: false,
    mensaje: null,
  }),
  descartarAviso: () => set({ avisoDescartado: true }),
  verificar: async () => {
    if (enCurso) return enCurso;
    const check = async (): Promise<boolean> => {
      if (!navigator.onLine) {
        set({ estado: "sin_conexion", mensaje: "Necesitas conexión para buscar versiones nuevas." });
        return get().disponible;
      }
      set({ estado: "buscando", mensaje: null });
      try {
        // version.json NO se precachea: se consulta el despliegue real, no la versión offline.
        const url = new URL("/version.json", window.location.origin);
        url.searchParams.set("v", String(Date.now()));
        const res = await fetch(url.href, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) throw new Error("El servidor de versiones no respondió.");
        const json: unknown = await res.json();
        if (!json || typeof json !== "object" || !("buildId" in json)
          || typeof (json as { buildId: unknown }).buildId !== "string") {
          throw new Error("Este despliegue todavía no tiene el comprobador de versiones.");
        }

        const compilacionRemota = (json as { buildId: string }).buildId;
        const nueva = versionRemotaDiferente(COMPILACION_INSTALADA, compilacionRemota);
        const esVersionDistintaAAnterior = compilacionRemota !== get().compilacionRemota;
        set({
          compilacionRemota,
          ultimoChequeo: Date.now(),
          disponible: nueva,
          estado: nueva ? "disponible" : "actualizada",
          mensaje: null,
          avisoDescartado: nueva && esVersionDistintaAAnterior ? false : get().avisoDescartado,
        });

        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) await reg.update();
        }
        return nueva;
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : "No se pudo comprobar la versión.";
        set({ estado: "error", mensaje });
        return get().disponible;
      }
    };
    enCurso = check();
    try { return await enCurso; }
    finally { enCurso = null; }
  },
}));

export function hayCambiosPorSincronizar(): boolean {
  if ((useCuadreStore.getState().pendingCuadres ?? []).length > 0) return true;
  try {
    const pending = JSON.parse(localStorage.getItem("alfaro_turnos_offline_queue") || "[]");
    if (Array.isArray(pending) && pending.length > 0) return true;
    if (localStorage.getItem("alfaro-catalogo-pending") === "1") return true;
  } catch {
    // Si no se puede leer la cola, no es seguro recargar.
    return true;
  }
  return false;
}
