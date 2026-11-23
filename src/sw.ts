/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{url:string;revision?:string|null}>;
};

// Nunca activar una versión nueva hasta que el usuario pulse «Actualizar ahora».
// Las notificaciones push siguen funcionando con el SW activo anterior.
clientsClaim();
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com" ||
    url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "alfaro-fuentes",
    plugins: [new ExpirationPlugin({ maxEntries: 30 })],
  })
);

type NotificacionPush = {
  id?: string;
  title?: string;
  body?: string;
  url?: string;
  category?: string;
  badge?: number;
};

self.addEventListener("push", (event: PushEvent) => {
  let mensaje: NotificacionPush = {};
  try { mensaje = event.data?.json() as NotificacionPush ?? {}; }
  catch { mensaje = { title: "AlFaroCafé Manager", body: "Tienes novedades pendientes." }; }
  const destino = mensaje.url?.startsWith("/") && !mensaje.url.startsWith("//") ?
    mensaje.url : "/notificaciones";
  event.waitUntil((async () => {
    await self.registration.showNotification(
      (mensaje.title ?? "AlFaroCafé Manager").slice(0, 120),
      {
        body: (mensaje.body ?? "Abre la aplicación para revisar el aviso.").slice(0, 180),
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: mensaje.id ?? "alfaro-" + (mensaje.category ?? "aviso"),
        renotify: false,
        data: { url: destino, id: mensaje.id ?? null },
      }
    );
    const nav = self.navigator as WorkerNavigator & {
      setAppBadge?: (count: number) => Promise<void>;
    };
    if (typeof nav.setAppBadge === "function") {
      try { await nav.setAppBadge(Math.max(1, Number(mensaje.badge) || 1)); } catch { /* opcional */ }
    }
  })());
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const path = event.notification.data?.url as string | undefined;
  const destino = path?.startsWith("/") && !path.startsWith("//") ?
    path : "/notificaciones";
  const url = new URL(destino, self.location.origin).href;
  event.waitUntil((async () => {
    const paginas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const pagina of paginas) {
      if (new URL(pagina.url).origin === self.location.origin) {
        await pagina.navigate(url);
        await pagina.focus();
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
