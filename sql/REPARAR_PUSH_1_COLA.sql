-- Reparación 1 de 2: cola Push y fecha real de suscripción
-- No altera cuadres, salarios, stock ni la autenticación PIN existente.
-- IMPORTANTE: por seguridad, la rotación de la clave de despacho se ejecuta
-- mediante el archivo PRIVADO entregado al propietario, NO en este repositorio.
BEGIN;

-- El campo actualizado_en cambia al modificar preferencias y NO debe usarse
-- para decidir si un evento fue creado después de la suscripción Push.
ALTER TABLE public.alfaro_notif_dispositivos
  ADD COLUMN IF NOT EXISTS suscrito_en timestamptz;
UPDATE public.alfaro_notif_dispositivos
SET suscrito_en=actualizado_en
WHERE habilitado AND endpoint IS NOT NULL AND suscrito_en IS NULL;

CREATE OR REPLACE FUNCTION public.alfaro_notif_fecha_suscripcion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public,pg_catalog
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.habilitado AND NEW.endpoint IS NOT NULL THEN
      NEW.suscrito_en := now();
    END IF;
  ELSIF NEW.habilitado AND NEW.endpoint IS NOT NULL
    AND (NOT COALESCE(OLD.habilitado,false)
      OR NEW.endpoint IS DISTINCT FROM OLD.endpoint) THEN
    NEW.suscrito_en := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS alfaro_notif_fecha_suscripcion ON public.alfaro_notif_dispositivos;
CREATE TRIGGER alfaro_notif_fecha_suscripcion
BEFORE INSERT OR UPDATE OF habilitado,endpoint ON public.alfaro_notif_dispositivos
FOR EACH ROW EXECUTE FUNCTION public.alfaro_notif_fecha_suscripcion();

-- Cada evento se entrega una sola vez por dispositivo, siempre que:
-- 1. ocurrió después de la suscripción real,
-- 2. coincide el rol y el usuario,
-- 3. esa categoría está activada,
-- 4. aún no fue leído dentro de la app,
-- 5. no hay una entrega previa válida.
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
    AND e.creado_en >= now()-interval '48 hours'
    AND e.creado_en >= COALESCE(d.suscrito_en,d.actualizado_en)
    AND u.role = ANY(e.roles)
    AND COALESCE((d.preferencias->>e.categoria)::boolean,true)
    AND (e.destinatario_nombre IS NULL
      OR lower(btrim(e.destinatario_nombre))=lower(btrim(u.nombre)))
    AND NOT EXISTS (
      SELECT 1 FROM public.alfaro_notif_lecturas l
      WHERE l.evento_id=e.id AND l.usuario_id=d.usuario_id
    )
    AND (r.id IS NULL OR
      (r.estado NOT IN ('enviado','expirado') AND r.intentos < 3
        AND r.actualizado_en < now()-interval '2 minutes'))
  ORDER BY e.creado_en ASC
  LIMIT 50;
END;
$$;


COMMIT;
SELECT count(*) AS trigger_suscripcion FROM pg_trigger WHERE tgname='alfaro_notif_fecha_suscripcion' AND NOT tgisinternal;
