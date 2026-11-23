-- Funciones para el PIN existente, sin un segundo inicio de sesión.
BEGIN;

CREATE OR REPLACE FUNCTION public.alfaro_notif_autorizar(p_token text)
RETURNS TABLE(usuario_id uuid, rol text, nombre text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_catalog AS $$
  SELECT u.id,u.role,u.nombre
  FROM public.alfaro_notif_sesiones s JOIN public.pin_users u ON u.id=s.usuario_id
  WHERE s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
    AND s.auth_uid=auth.uid() AND s.vence>now()
    AND u.deleted_at IS NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.alfaro_notif_autorizar(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.alfaro_notif_iniciar(p_usuario_id uuid,p_pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user public.pin_users%ROWTYPE;
  v_token text;
  v_vence timestamptz := now()+interval '180 days';
  v_intentos integer;
BEGIN
  IF v_uid IS NULL OR p_pin IS NULL OR length(p_pin) < 4 OR length(p_pin)>12 THEN
    RAISE EXCEPTION 'Sesión o PIN no válido.';
  END IF;

  INSERT INTO public.alfaro_notif_intentos(auth_uid,intentos,desde)
  VALUES(v_uid,0,now())
  ON CONFLICT(auth_uid) DO UPDATE SET
    intentos=CASE WHEN alfaro_notif_intentos.desde < now()-interval '5 min' THEN 0 ELSE alfaro_notif_intentos.intentos END,
    desde=CASE WHEN alfaro_notif_intentos.desde < now()-interval '5 min' THEN now() ELSE alfaro_notif_intentos.desde END;

  SELECT intentos INTO v_intentos FROM public.alfaro_notif_intentos WHERE auth_uid=v_uid;
  IF v_intentos >= 5 THEN
    RAISE EXCEPTION 'Demasiados intentos. Espera cinco minutos.';
  END IF;
  SELECT * INTO v_user FROM public.pin_users WHERE id=p_usuario_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_user.pin_hash IS DISTINCT FROM
    encode(sha256(convert_to('alfaro::'||p_usuario_id::text||'::'||p_pin,'UTF8')),'hex')
  THEN
    UPDATE public.alfaro_notif_intentos SET intentos=intentos+1 WHERE auth_uid=v_uid;
    RAISE EXCEPTION 'PIN no válido para notificaciones.';
  END IF;
  UPDATE public.alfaro_notif_intentos SET intentos=0,desde=now() WHERE auth_uid=v_uid;

  v_token := gen_random_uuid()::text || gen_random_uuid()::text;
  DELETE FROM public.alfaro_notif_sesiones WHERE auth_uid=v_uid AND usuario_id=v_user.id;
  INSERT INTO public.alfaro_notif_sesiones(usuario_id,auth_uid,token_hash,vence)
  VALUES(v_user.id,v_uid,encode(sha256(convert_to(v_token,'UTF8')),'hex'),v_vence);

  RETURN jsonb_build_object('token',v_token,'usuario_id',v_user.id,'rol',v_user.role,'vence',v_vence);
END;
$$;

CREATE OR REPLACE FUNCTION public.alfaro_notif_public_key()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_catalog AS $$
 SELECT vapid_public_key FROM public.alfaro_notif_config WHERE id='global' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.alfaro_notif_configuracion(p_token text,p_dispositivo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE
  v_user record;
  v_dev public.alfaro_notif_dispositivos%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.alfaro_notif_autorizar(p_token);
  IF NOT FOUND THEN RAISE EXCEPTION 'Inicia sesión con el PIN habitual para configurar avisos.'; END IF;
  SELECT * INTO v_dev FROM public.alfaro_notif_dispositivos
  WHERE usuario_id=v_user.usuario_id AND dispositivo_id=p_dispositivo_id;
  RETURN jsonb_build_object(
    'habilitado',COALESCE(v_dev.habilitado,false),
    'preferencias',COALESCE(v_dev.preferencias,
      '{"precuadres":true,"caja":true,"stock":true,"cxc":true,"auditoria":true}'::jsonb),
    'usuario',v_user.nombre,
    'rol',v_user.rol
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.alfaro_notif_preferencias(
  p_token text,p_dispositivo_id uuid,p_preferencias jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE
  v_user record;
  v_prefs jsonb;
BEGIN
  SELECT * INTO v_user FROM public.alfaro_notif_autorizar(p_token);
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión de notificaciones vencida. Inicia sesión con tu PIN.'; END IF;
  v_prefs:=jsonb_build_object(
    'precuadres',COALESCE((p_preferencias->>'precuadres')::boolean,true),
    'caja',COALESCE((p_preferencias->>'caja')::boolean,true),
    'stock',COALESCE((p_preferencias->>'stock')::boolean,true),
    'cxc',COALESCE((p_preferencias->>'cxc')::boolean,true),
    'auditoria',COALESCE((p_preferencias->>'auditoria')::boolean,true)
  );
  INSERT INTO public.alfaro_notif_dispositivos(dispositivo_id,usuario_id,auth_uid,preferencias)
  VALUES(p_dispositivo_id,v_user.usuario_id,auth.uid(),v_prefs)
  ON CONFLICT(dispositivo_id,usuario_id) DO UPDATE SET
    preferencias=excluded.preferencias,auth_uid=excluded.auth_uid,actualizado_en=now();
  RETURN v_prefs;
END;
$$;

CREATE OR REPLACE FUNCTION public.alfaro_notif_suscribir(
  p_token text,p_dispositivo_id uuid,p_subscription jsonb,p_plataforma text DEFAULT 'PWA'
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE
  v_user record;
  v_endpoint text := p_subscription->>'endpoint';
  v_p256 text := p_subscription#>>'{keys,p256dh}';
  v_auth text := p_subscription#>>'{keys,auth}';
BEGIN
  SELECT * INTO v_user FROM public.alfaro_notif_autorizar(p_token);
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión de PIN no válida para registrar dispositivo.'; END IF;
  IF length(COALESCE(v_endpoint,'')) < 30 OR v_endpoint !~ '^https://'
    OR length(COALESCE(v_p256,'')) < 20 OR length(COALESCE(v_auth,'')) < 10
  THEN RAISE EXCEPTION 'Suscripción push incompleta.'; END IF;

  -- Un endpoint físico solo puede pertenecer al perfil PIN actualmente activo.
  UPDATE public.alfaro_notif_dispositivos
  SET habilitado=false,endpoint=NULL,p256dh=NULL,auth_key=NULL,actualizado_en=now()
  WHERE (dispositivo_id=p_dispositivo_id OR endpoint=v_endpoint)
    AND (usuario_id<>v_user.usuario_id OR dispositivo_id<>p_dispositivo_id);

  INSERT INTO public.alfaro_notif_dispositivos(
    dispositivo_id,usuario_id,auth_uid,endpoint,p256dh,auth_key,plataforma,habilitado
  ) VALUES(
    p_dispositivo_id,v_user.usuario_id,auth.uid(),v_endpoint,v_p256,v_auth,
    left(COALESCE(p_plataforma,'PWA'),100),true
  )
  ON CONFLICT(dispositivo_id,usuario_id) DO UPDATE SET
    auth_uid=excluded.auth_uid,endpoint=excluded.endpoint,p256dh=excluded.p256dh,
    auth_key=excluded.auth_key,plataforma=excluded.plataforma,
    habilitado=true,actualizado_en=now();
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.alfaro_notif_desactivar(p_token text,p_dispositivo_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_user record;
BEGIN
  SELECT * INTO v_user FROM public.alfaro_notif_autorizar(p_token);
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.alfaro_notif_dispositivos SET habilitado=false,actualizado_en=now()
  WHERE dispositivo_id=p_dispositivo_id AND usuario_id=v_user.usuario_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.alfaro_notif_bandeja(p_token text,p_limite integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_user record; v_items jsonb; v_no_leidos integer;
BEGIN
  SELECT * INTO v_user FROM public.alfaro_notif_autorizar(p_token);
  IF NOT FOUND THEN RAISE EXCEPTION 'Vuelve a entrar con el PIN habitual para ver las notificaciones.'; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.creado_en DESC),'[]'::jsonb)
  INTO v_items
  FROM (
    SELECT e.id,e.categoria,e.titulo,e.contenido,e.destino,e.creado_en,
      l.leido_en IS NOT NULL AS leido
    FROM public.alfaro_notif_eventos e
    LEFT JOIN public.alfaro_notif_lecturas l
      ON l.evento_id=e.id AND l.usuario_id=v_user.usuario_id
    WHERE e.roles @> ARRAY[v_user.rol]::text[]
      AND (e.destinatario_nombre IS NULL
        OR lower(btrim(e.destinatario_nombre))=lower(btrim(v_user.nombre)))
    ORDER BY e.creado_en DESC LIMIT LEAST(GREATEST(COALESCE(p_limite,50),1),100)
  ) AS x;

  SELECT count(*) INTO v_no_leidos FROM public.alfaro_notif_eventos e
  WHERE e.roles @> ARRAY[v_user.rol]::text[]
    AND (e.destinatario_nombre IS NULL
      OR lower(btrim(e.destinatario_nombre))=lower(btrim(v_user.nombre)))
    AND NOT EXISTS (
      SELECT 1 FROM public.alfaro_notif_lecturas l
      WHERE l.usuario_id=v_user.usuario_id AND l.evento_id=e.id
    ) AND e.creado_en>now()-interval '60 days';

  RETURN jsonb_build_object('items',v_items,'no_leidos',v_no_leidos);
END;
$$;

CREATE OR REPLACE FUNCTION public.alfaro_notif_leer(p_token text,p_evento_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_user record;
BEGIN
  SELECT * INTO v_user FROM public.alfaro_notif_autorizar(p_token);
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión vencida.'; END IF;

  INSERT INTO public.alfaro_notif_lecturas(usuario_id,evento_id)
  SELECT v_user.usuario_id,e.id FROM public.alfaro_notif_eventos e
  WHERE (p_evento_id IS NULL OR e.id=p_evento_id)
    AND e.roles @> ARRAY[v_user.rol]::text[]
    AND (e.destinatario_nombre IS NULL
      OR lower(btrim(e.destinatario_nombre))=lower(btrim(v_user.nombre)))
    AND e.creado_en>now()-interval '90 days'
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.alfaro_notif_cerrar(p_token text,p_dispositivo_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_user record;
BEGIN
  SELECT * INTO v_user FROM public.alfaro_notif_autorizar(p_token);
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.alfaro_notif_dispositivos SET habilitado=false,actualizado_en=now()
  WHERE usuario_id=v_user.usuario_id AND dispositivo_id=p_dispositivo_id;
  DELETE FROM public.alfaro_notif_sesiones
    WHERE usuario_id=v_user.usuario_id AND auth_uid=auth.uid()
      AND token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  RETURN true;
END;
$$;

-- Solo las funciones reciben llamadas desde la app: nunca las tablas con claves.
REVOKE ALL ON FUNCTION public.alfaro_notif_iniciar(uuid,text),
  public.alfaro_notif_configuracion(text,uuid),
  public.alfaro_notif_preferencias(text,uuid,jsonb),
  public.alfaro_notif_suscribir(text,uuid,jsonb,text),
  public.alfaro_notif_desactivar(text,uuid),
  public.alfaro_notif_bandeja(text,integer),
  public.alfaro_notif_leer(text,uuid),
  public.alfaro_notif_cerrar(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.alfaro_notif_iniciar(uuid,text),
  public.alfaro_notif_configuracion(text,uuid),
  public.alfaro_notif_preferencias(text,uuid,jsonb),
  public.alfaro_notif_suscribir(text,uuid,jsonb,text),
  public.alfaro_notif_desactivar(text,uuid),
  public.alfaro_notif_bandeja(text,integer),
  public.alfaro_notif_leer(text,uuid),
  public.alfaro_notif_cerrar(text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.alfaro_notif_public_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alfaro_notif_public_key() TO authenticated;
COMMIT;
