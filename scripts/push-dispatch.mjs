import * as webpush from 'web-push';

const SUPABASE_URL = 'https://ydrmzyddlpsaojzekgmv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4K4YgbkLl70I04g_by_-QQ_9To7Q9J-';
// Se configura únicamente como secreto de GitHub Actions; nunca en Git o en el navegador.
const DISPATCH_SECRET = process.env.ALFARO_DISPATCH_SECRET?.trim();
if (!DISPATCH_SECRET || DISPATCH_SECRET.length < 40) {
  throw new Error('Falta el secreto ALFARO_DISPATCH_SECRET en GitHub Actions. No se envían notificaciones.');
}

async function callRpc(fnName, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`RPC ${fnName} falló: ${res.status} ${txt}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function run() {
  console.log('Obteniendo configuración y claves del servidor...');
  const claves = await callRpc('alfaro_notif_claves_servidor', { p_secreto: DISPATCH_SECRET });
  if (!claves?.privateKey || !claves?.publicKey) {
    throw new Error('No se encontraron las claves VAPID en la base de datos.');
  }

  webpush.setVapidDetails(claves.subject, claves.publicKey, claves.privateKey);

  console.log('Consultando cola de avisos pendientes...');
  const cola = await callRpc('alfaro_notif_cola_despacho', { p_secreto: DISPATCH_SECRET });
  
  if (!cola || cola.length === 0) {
    console.log('No hay avisos pendientes.');
    return;
  }

  console.log(`Procesando ${cola.length} avisos...`);
  let enviados = 0, errores = 0;

  for (const item of cola) {
    const sub = {
      endpoint: item.endpoint,
      keys: { p256dh: item.p256dh, auth: item.auth_key }
    };
    const payload = JSON.stringify({
      id: item.evento_id,
      title: item.titulo,
      // Los avisos de prueba históricos mencionaban iPhone aunque el destinatario fuera Android.
      // Normaliza el texto al enviar sin tocar la cola ni los datos del inventario.
      body: item.contenido?.replace(
        'tu iPhone está recibiendo notificaciones push',
        'tu dispositivo está recibiendo notificaciones push'
      ) || 'Abre AlFaroCafé para revisar un movimiento.',
      url: item.destino || '/notificaciones',
      category: item.categoria
    });

    try {
      await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 12 });
      console.log(`✓ Enviado a un dispositivo (${item.categoria})`);
      enviados++;
      await callRpc('alfaro_notif_reportar_entrega', {
        p_secreto: DISPATCH_SECRET,
        p_evento_id: item.evento_id,
        p_dispositivo_id: item.dispositivo_id,
        p_estado: 'enviado'
      });
    } catch (err) {
      console.warn(`Fallo de Web Push (${item.categoria}):`, err.statusCode || 'sin código', String(err.message || 'Error').slice(0, 160));
      errores++;
      const isExpired = err.statusCode === 404 || err.statusCode === 410;
      await callRpc('alfaro_notif_reportar_entrega', {
        p_secreto: DISPATCH_SECRET,
        p_evento_id: item.evento_id,
        p_dispositivo_id: item.dispositivo_id,
        p_estado: isExpired ? 'expirado' : 'error',
        p_error: (err.message || 'Error').slice(0, 200)
      });
    }
  }
  console.log(`Resumen: enviados=${enviados}, errores=${errores}, procesados=${cola.length}`);
  if (errores > 0) process.exitCode = 1;
}

run().catch((e) => {
  console.error('Fallo en despachador:', e);
  process.exit(1);
});
