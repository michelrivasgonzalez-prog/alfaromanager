import { supabase } from "@/integrations/supabase/client";
import { ensureCloudSession } from "@/lib/cloudBootstrap";

export type CategoriaNotificacion = "precuadres" | "caja" | "stock" | "cxc" | "auditoria";
export type PreferenciasNotificaciones = Record<CategoriaNotificacion, boolean>;
export type EventoNotificacion = {
  id: string;
  categoria: CategoriaNotificacion;
  titulo: string;
  contenido: string;
  destino: string;
  creado_en: string;
  leido: boolean;
};

export const PREFERENCIAS_INICIALES: PreferenciasNotificaciones = {
  precuadres: true,
  caja: true,
  stock: true,
  cxc: true,
  auditoria: true,
};

export const CATEGORIAS_NOTIFICACION: { id: CategoriaNotificacion; titulo: string; descripcion: string }[] = [
  { id: "precuadres", titulo: "Precuadres y Relevos", descripcion: "Envíos, conciliaciones y turnos" },
  { id: "caja", titulo: "Faltantes y Sobrantes", descripcion: "Movimientos pendientes o confirmados del Fondo" },
  { id: "stock", titulo: "Existencias Bajas", descripcion: "Almacén bajo mínimo y productos agotados al cerrar" },
  { id: "cxc", titulo: "Cuentas por Cobrar", descripcion: "Deudas, abonos y saldos pagados" },
  { id: "auditoria", titulo: "Auditoría", descripcion: "Operaciones administrativas registradas" },
];

type SesionNotificacion = { usuario_id: string; token: string; vence: string };
const SESSION_KEY = "alfarocafe-notif-sesion-v1";
const DEVICE_KEY = "alfarocafe-notif-device-v1";

const rpc = async <T = unknown>(nombre: string, args: Record<string, unknown> = {}): Promise<T> => {
  if (!await ensureCloudSession()) throw new Error("Sin conexión con Supabase.");
  const { data, error } = await (supabase as any).rpc(nombre, args);
  if (error) throw new Error(error.message || "No se pudo conectar a las notificaciones.");
  return data as T;
};

export function idDispositivoNotificaciones(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function sesionActualNotificaciones(usuarioId?: string | null): SesionNotificacion | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const sesion = JSON.parse(raw) as SesionNotificacion;
    if (!sesion?.token || !sesion.usuario_id || !sesion.vence ||
      Date.parse(sesion.vence) <= Date.now()) return null;
    if (usuarioId && sesion.usuario_id !== usuarioId) return null;
    return sesion;
  } catch {
    return null;
  }
}

/**
 * Se verifica silenciosamente el MISMO PIN que ya se ingresó en la pantalla
 * de acceso. No pide otro PIN. Si no hay Internet, el acceso normal a la app
 * continúa funcionando y el usuario puede reintentar al volver a iniciar.
 */
export async function iniciarNotificacionesConPin(usuarioId: string, pin: string): Promise<void> {
  const anterior = sesionActualNotificaciones();
  if (anterior && anterior.usuario_id !== usuarioId) {
    localStorage.removeItem(SESSION_KEY);
  }
  const respuesta = await rpc<{token:string;usuario_id:string;vence:string}>(
    "alfaro_notif_iniciar", { p_usuario_id: usuarioId, p_pin: pin }
  );
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    token: respuesta.token,
    usuario_id: respuesta.usuario_id,
    vence: respuesta.vence,
  }));
  window.dispatchEvent(new CustomEvent("alfaro:notificaciones-sesion"));
}

export async function cerrarSesionNotificaciones(): Promise<void> {
  const sesion = sesionActualNotificaciones();
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent("alfaro:notificaciones-sesion"));
  if (sesion) {
    await rpc("alfaro_notif_cerrar", {
      p_token: sesion.token,
      p_dispositivo_id: idDispositivoNotificaciones(),
    }).catch(console.warn);
  }
}

function tokenVigente(): string {
  const sesion = sesionActualNotificaciones();
  if (!sesion) {
    throw new Error("Para activar notificaciones, sal de la app y vuelve a entrar con tu PIN habitual.");
  }
  return sesion.token;
}

export async function clavePublicaPush(): Promise<string | null> {
  return rpc<string | null>("alfaro_notif_public_key");
}

export async function configuracionNotificaciones(): Promise<{
  habilitado: boolean;
  preferencias: PreferenciasNotificaciones;
  usuario: string;
  rol: string;
}> {
  const token = tokenVigente();
  const data = await rpc<any>("alfaro_notif_configuracion", {
    p_token: token,
    p_dispositivo_id: idDispositivoNotificaciones(),
  });
  return {
    habilitado: !!data.habilitado,
    preferencias: { ...PREFERENCIAS_INICIALES, ...data.preferencias },
    usuario: data.usuario ?? "",
    rol: data.rol ?? "",
  };
}

export async function cambiarPreferenciasNotificaciones(prefs: PreferenciasNotificaciones): Promise<void> {
  await rpc("alfaro_notif_preferencias", {
    p_token: tokenVigente(),
    p_dispositivo_id: idDispositivoNotificaciones(),
    p_preferencias: prefs,
  });
}

function urlBase64ABytes(key: string): Uint8Array {
  const padded = (key + "=".repeat((4 - key.length % 4) % 4))
    .replace(/-/g, "+").replace(/_/g, "/");
  const text = atob(padded);
  const raw = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) raw[i] = text.charCodeAt(i);
  return raw;
}

export function esPWAInstalada(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || !!nav.standalone;
}

export function soportaPush(): boolean {
  return typeof Notification !== "undefined" &&
    "serviceWorker" in navigator && "PushManager" in window &&
    (typeof window.isSecureContext === "undefined" || window.isSecureContext);
}

/**
 * Llamar DESPUÉS de Notification.requestPermission(), solicitado directamente
 * desde el botón que toca el usuario (restricción de iOS/Safari).
 */
export async function activarPushConPermiso(): Promise<void> {
  if (!soportaPush() || Notification.permission !== "granted") {
    throw new Error("Autoriza las notificaciones desde la aplicación instalada.");
  }
  const key = await clavePublicaPush();
  if (!key) throw new Error("El servidor de notificaciones todavía no tiene configurada su clave pública.");
  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ABytes(key) as BufferSource,
    });
  }
  await rpc("alfaro_notif_suscribir", {
    p_token: tokenVigente(),
    p_dispositivo_id: idDispositivoNotificaciones(),
    p_subscription: subscription.toJSON(),
    p_plataforma: /iPhone|iPad|iPod/.test(navigator.userAgent) ? "iOS-PWA" : "Web-PWA",
  });
}

export async function desactivarPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  await rpc("alfaro_notif_desactivar", {
    p_token: tokenVigente(), p_dispositivo_id: idDispositivoNotificaciones(),
  });
  if (subscription) await subscription.unsubscribe();
}

export async function bandejaNotificaciones(): Promise<{items: EventoNotificacion[];no_leidos:number}> {
  const data = await rpc<any>("alfaro_notif_bandeja", {
    p_token: tokenVigente(), p_limite: 75,
  });
  return {
    items: Array.isArray(data.items) ? data.items as EventoNotificacion[] : [],
    no_leidos: Number(data.no_leidos ?? 0),
  };
}

export async function marcarNotificacionLeida(id?: string): Promise<void> {
  await rpc("alfaro_notif_leer", {
    p_token: tokenVigente(), p_evento_id: id ?? null,
  });
}
