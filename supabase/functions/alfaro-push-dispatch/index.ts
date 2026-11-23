// AlFaroCafé Manager · Web Push real para iPhone instalado y otros dispositivos.
// Requiere SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY y VAPID_SUBJECT en Supabase Edge Functions Secrets.
// NO colocar llaves privadas en GitHub ni en variables VITE_*.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildPushPayload,
  type VapidKeys,
  type PushSubscription,
} from "npm:@block65/webcrypto-web-push@2.0.0";

type Device = {
  id: string;
  usuario_id: string;
  endpoint: string | null;
  p256dh: string | null;
  auth_key: string | null;
  habilitado: boolean;
  preferencias: Record<string, boolean> | null;
  actualizado_en: string;
};
type Event = {
  id: string;
  categoria: string;
  titulo: string;
  contenido: string;
  destino: string;
  roles: string[];
  destinatario_nombre: string | null;
  creado_en: string;
};
type User = {id:string; nombre:string; role:string;deleted_at:string|null};
type Receipt = {id:string;estado:string;intentos:number;actualizado_en:string};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response({ error: "Método no permitido" }, 405);

  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");

  // Se llama solo desde tarea programada del servidor con service-role.
  if (!key || req.headers.get("authorization") !== "Bearer " + key) {
    return response({ error: "No autorizado" }, 401);
  }
  if (!url || !vapidPublic || !vapidPrivate || !vapidSubject) {
    return response({ error: "Configura primero las claves VAPID en los secretos del servidor" }, 503);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const vapid: VapidKeys = {
    subject: vapidSubject,
    publicKey: vapidPublic,
    privateKey: vapidPrivate,
  };
  const [eventosR,dispositivosR,usuariosR] = await Promise.all([
    db.from("alfaro_notif_eventos")
      .select("id,categoria,titulo,contenido,destino,roles,destinatario_nombre,creado_en")
      .gte("creado_en",new Date(Date.now()-48*3600000).toISOString())
      .order("creado_en",{ascending:true}).limit(120),
    db.from("alfaro_notif_dispositivos")
      .select("id,usuario_id,endpoint,p256dh,auth_key,habilitado,preferencias,actualizado_en")
      .eq("habilitado",true).not("endpoint","is",null).limit(200),
    db.from("pin_users").select("id,nombre,role,deleted_at").is("deleted_at",null),
  ]);
  if (eventosR.error || dispositivosR.error || usuariosR.error) {
    console.error("No se pudo leer cola de avisos",eventosR.error,dispositivosR.error,usuariosR.error);
    return response({error:"No se pudieron consultar los avisos"},500);
  }

  const eventos = (eventosR.data ?? []) as Event[];
  const dispositivos = (dispositivosR.data ?? []) as Device[];
  const usuarios = new Map(((usuariosR.data ?? []) as User[]).map((u) => [u.id,u]));
  let enviados = 0, errores = 0, omitidos = 0;

  for (const device of dispositivos) {
    const user = usuarios.get(device.usuario_id);
    if (!user || !device.endpoint || !device.p256dh || !device.auth_key) continue;

    for (const evento of eventos) {
      if (!evento.roles.includes(user.role) ||
        device.preferencias?.[evento.categoria] === false ||
        (evento.destinatario_nombre &&
          evento.destinatario_nombre.trim().toLocaleLowerCase("es") !==
          user.nombre.trim().toLocaleLowerCase("es")) ||
        Date.parse(evento.creado_en) < Date.parse(device.actualizado_en)) {
        omitidos++;
        continue;
      }

      const { data: previous } = await db.from("alfaro_notif_entregas")
        .select("id,estado,intentos,actualizado_en")
        .eq("evento_id",evento.id).eq("dispositivo_id",device.id)
        .maybeSingle();
      const previa = previous as Receipt | null;
      if (previa && (previa.estado==="enviado" || previa.estado==="expirado" ||
          previa.intentos>=3 ||
          Date.now()-Date.parse(previa.actualizado_en)<120000)) {
        omitidos++;
        continue;
      }

      const reserva = previa
        ? await db.from("alfaro_notif_entregas")
          .update({estado:"pendiente",intentos:previa.intentos+1,actualizado_en:new Date().toISOString()})
          .eq("id",previa.id).eq("estado",previa.estado).select("id").maybeSingle()
        : await db.from("alfaro_notif_entregas")
          .insert({evento_id:evento.id,dispositivo_id:device.id,estado:"pendiente",intentos:1})
          .select("id").maybeSingle();

      if (reserva.error || !reserva.data) {
        omitidos++;
        continue;
      }

      const receiptId = reserva.data.id as string;
      try {
        const subscription: PushSubscription = {
          endpoint:device.endpoint,expirationTime:null,
          keys:{p256dh:device.p256dh,auth:device.auth_key},
        };
        const data = JSON.stringify({
          id:evento.id,
          title:evento.titulo,
          body:evento.contenido || "Abre AlFaroCafé para revisar un movimiento.",
          url:evento.destino || "/notificaciones",
          category:evento.categoria,
        });
        const payload = await buildPushPayload(
          { data, options:{ttl:60*60*12} },subscription,vapid
        );
        const result = await fetch(device.endpoint,payload);
        if (!result.ok) {
          if (result.status===404 || result.status===410) {
            await db.from("alfaro_notif_dispositivos")
              .update({habilitado:false,actualizado_en:new Date().toISOString()})
              .eq("id",device.id);
            await db.from("alfaro_notif_entregas")
              .update({estado:"expirado",ultimo_error:"Suscripción caducada"})
              .eq("id",receiptId);
            break;
          }
          throw new Error("Push HTTP "+result.status);
        }
        await db.from("alfaro_notif_entregas")
          .update({estado:"enviado",enviado_en:new Date().toISOString(),actualizado_en:new Date().toISOString()})
          .eq("id",receiptId);
        enviados++;
      } catch (e) {
        console.warn("No se pudo entregar Web Push:", e instanceof Error ? e.message : "error");
        await db.from("alfaro_notif_entregas")
          .update({estado:"error",ultimo_error:(e instanceof Error?e.message:"Error").slice(0,200),
            actualizado_en:new Date().toISOString()})
          .eq("id",receiptId);
        errores++;
      }
    }
  }

  return response({ok:true,eventos:eventos.length,dispositivos:dispositivos.length,enviados,errores,omitidos});
});
