import * as webpush from 'web-push';

const SUPABASE_URL = 'https://ydrmzyddlpsaojzekgmv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4K4YgbkLl70I04g_by_-QQ_9To7Q9J-';
const DISPATCH_SECRET = 'alfaro_push_secreto_2026';

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

  for (const item of cola) {
    const sub = {
      endpoint: item.endpoint,
      keys: { p256dh: item.p256dh, auth: item.auth_key }
    };
    const payload = JSON.stringify({
      id: item.evento_id,
      title: item.titulo,
      body: item.contenido || 'Abre AlFaroCafé para revisar un movimiento.',
      url: item.destino || '/notificaciones',
      category: item.categoria
    });

    try {
      await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 12 });
      console.log(`✓ Enviado a dispositivo ${item.dispositivo_id}`);
      await callRpc('alfaro_notif_reportar_entrega', {
        p_secreto: DISPATCH_SECRET,
        p_evento_id: item.evento_id,
        p_dispositivo_id: item.dispositivo_id,
        p_estado: 'enviado'
      });
    } catch (err) {
      console.warn(`Error enviando a ${item.dispositivo_id}:`, err.message);
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
}

run().catch((e) => {
  console.error('Fallo en despachador:', e);
  process.exit(1);
});
