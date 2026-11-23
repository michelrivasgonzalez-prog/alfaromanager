-- AlFaroCafé Manager · Reparación de Push y herramientas de prueba.
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

-- Permite probar un push desde el perfil PIN actual, sin otra contraseña.
-- Solo envía al nombre/rol que creó el aviso y requiere una suscripción activa.
CREATE OR REPLACE FUNCTION public.alfaro_notif_prueba(p_token text,p_dispositivo_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_catalog
AS $$
DECLARE
  v_user record;
  v_id uuid;
BEGIN
  SELECT * INTO v_user FROM public.alfaro_notif_autorizar(p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vuelve a iniciar sesión con tu PIN habitual.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.alfaro_notif_dispositivos d
    WHERE d.usuario_id=v_user.usuario_id
      AND d.dispositivo_id=p_dispositivo_id AND d.habilitado
      AND d.endpoint IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Primero activa las notificaciones push en este dispositivo.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.alfaro_notif_eventos
    WHERE clave LIKE 'prueba_push:'||v_user.usuario_id::text||':%'
      AND creado_en>now()-interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'Ya enviaste una prueba. Espera un minuto.';
  END IF;

  INSERT INTO public.alfaro_notif_eventos(
    clave,categoria,titulo,contenido,destino,roles,destinatario_nombre
  ) VALUES(
    'prueba_push:'||v_user.usuario_id::text||':'||gen_random_uuid()::text,
    'precuadres',
    'Prueba de notificación AlFaroCafé',
    'Si aparece este aviso, tu dispositivo está recibiendo notificaciones push.',
    '/notificaciones',
    ARRAY[v_user.rol]::text[],
    v_user.nombre
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Diagnóstico por usuario y dispositivo, sin revelar endpoint ni claves.
CREATE OR REPLACE FUNCTION public.alfaro_notif_estado(p_token text,p_dispositivo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_catalog
AS $$
DECLARE
  v_user record;
  v_device uuid;
  v_habilitado boolean;
  v_plataforma text;
  v_suscrito timestamptz;
  v_entregas jsonb;
BEGIN
  SELECT * INTO v_user FROM public.alfaro_notif_autorizar(p_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inicia sesión con tu PIN habitual.';
  END IF;

  SELECT d.id,d.habilitado,d.plataforma,d.suscrito_en
  INTO v_device,v_habilitado,v_plataforma,v_suscrito
  FROM public.alfaro_notif_dispositivos d
  WHERE d.usuario_id=v_user.usuario_id AND d.dispositivo_id=p_dispositivo_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_entregas
  FROM (
    SELECT e.titulo,e.creado_en,r.estado,r.ultimo_error,r.enviado_en
    FROM public.alfaro_notif_entregas r
    JOIN public.alfaro_notif_eventos e ON e.id=r.evento_id
    WHERE r.dispositivo_id=v_device
    ORDER BY r.actualizado_en DESC LIMIT 5
  ) AS x;

  RETURN jsonb_build_object(
    'push_activo',COALESCE(v_habilitado,false),
    'plataforma',v_plataforma,
    'suscrito_en',v_suscrito,
    'entregas',v_entregas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.alfaro_notif_prueba(text,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.alfaro_notif_prueba(text,uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.alfaro_notif_estado(text,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.alfaro_notif_estado(text,uuid)
  TO authenticated;

-- Las funciones del despacho solo se exponen a quien conoce la clave
-- rotada y de alta entropía; no permiten acceso sin validarla.
REVOKE ALL ON FUNCTION
  public.alfaro_notif_claves_servidor(text),
  public.alfaro_notif_cola_despacho(text),
  public.alfaro_notif_reportar_entrega(text,uuid,uuid,text,text)
  FROM PUBLIC,authenticated,anon;
GRANT EXECUTE ON FUNCTION
  public.alfaro_notif_claves_servidor(text),
  public.alfaro_notif_cola_despacho(text),
  public.alfaro_notif_reportar_entrega(text,uuid,uuid,text,text)
  TO anon;

COMMIT;

-- Comprobación sin exponer información privada:
SELECT (SELECT count(*) FROM pg_trigger
        WHERE tgname='alfaro_notif_fecha_suscripcion' AND NOT tgisinternal) AS trigger_suscripcion,
       (SELECT count(*) FROM pg_proc WHERE proname='alfaro_notif_prueba') AS prueba_rpc,
       (SELECT count(*) FROM pg_proc WHERE proname='alfaro_notif_estado') AS diagnostico_rpc;
