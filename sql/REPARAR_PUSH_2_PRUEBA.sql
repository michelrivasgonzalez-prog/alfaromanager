-- Reparación 2 de 2: prueba de notificaciones y diagnóstico
BEGIN;

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
    'Si aparece este aviso, tu iPhone está recibiendo notificaciones push.',
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
