-- AlFaroCafé Manager: CORRECCIÓN DE COLA Web Push (tercer script).
-- La lectura en la bandeja y el número del icono nunca deben impedir
-- que se envíe una notificación push que aún no se ha entregado.
-- Se mantienen filtro por rol, punto de suscripción y preferencia.
-- No toca cuadres, existencias, salarios, ni datos históricos.
BEGIN;

CREATE OR REPLACE FUNCTION public.alfaro_notif_cola_despacho(p_secreto text)
RETURNS TABLE(
  evento_id uuid,
  titulo text,
  contenido text,
  destino text,
  categoria text,
  dispositivo_id uuid,
  endpoint text,
  p256dh text,
  auth_key text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_catalog
AS $$
DECLARE v_secret text;
BEGIN
  SELECT c.dispatch_secret INTO v_secret
  FROM public.alfaro_notif_config c WHERE c.id='global';
  IF p_secreto IS NULL OR v_secret IS NULL OR p_secreto <> v_secret THEN
    RAISE EXCEPTION 'Acceso no autorizado al despachador.';
  END IF;

  RETURN QUERY
  SELECT e.id, e.titulo, e.contenido, e.destino, e.categoria,
    d.id, d.endpoint, d.p256dh, d.auth_key
  FROM public.alfaro_notif_eventos e
  CROSS JOIN public.alfaro_notif_dispositivos d
  JOIN public.pin_users u ON u.id=d.usuario_id
  LEFT JOIN public.alfaro_notif_entregas r
    ON r.evento_id=e.id AND r.dispositivo_id=d.id
  WHERE d.habilitado
    AND d.endpoint IS NOT NULL AND d.p256dh IS NOT NULL AND d.auth_key IS NOT NULL
    AND u.deleted_at IS NULL
    AND e.creado_en >= now()-interval '24 hours'
    AND e.creado_en >= COALESCE(d.suscrito_en,d.actualizado_en)
    AND u.role = ANY(e.roles)
    AND COALESCE((d.preferencias->>e.categoria)::boolean,true)
    AND (e.destinatario_nombre IS NULL
      OR lower(btrim(e.destinatario_nombre))=lower(btrim(u.nombre)))
    AND (r.id IS NULL OR
      (r.estado NOT IN ('enviado','expirado') AND r.intentos < 3
        AND r.actualizado_en < now()-interval '2 minutes'))
  ORDER BY e.creado_en ASC
  LIMIT 50;
END;
$$;

COMMIT;

SELECT pg_get_functiondef(p.oid) ILIKE '%alfaro_notif_lecturas%' AS filtra_leidos
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='alfaro_notif_cola_despacho';
-- Resultado esperado: filtra_leidos = false.
