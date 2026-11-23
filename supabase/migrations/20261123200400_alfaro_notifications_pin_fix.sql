-- Corrige el contador de intentos: los intentos fallidos no deben perderse
-- por un RAISE EXCEPTION que revierte la transacción.
CREATE OR REPLACE FUNCTION public.alfaro_notif_iniciar(p_usuario_id uuid,p_pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user public.pin_users%ROWTYPE;
  v_token text;
  v_vence timestamptz := now()+interval '180 days';
  v_intentos integer;
BEGIN
  IF v_uid IS NULL OR p_pin IS NULL OR length(p_pin) < 4 OR length(p_pin)>12 THEN
    RETURN jsonb_build_object('error','Sesión o PIN no válido.');
  END IF;

  INSERT INTO public.alfaro_notif_intentos(auth_uid,intentos,desde)
  VALUES(v_uid,0,now())
  ON CONFLICT(auth_uid) DO UPDATE SET
    intentos=CASE WHEN alfaro_notif_intentos.desde < now()-interval '5 min' THEN 0 ELSE alfaro_notif_intentos.intentos END,
    desde=CASE WHEN alfaro_notif_intentos.desde < now()-interval '5 min' THEN now() ELSE alfaro_notif_intentos.desde END;

  SELECT intentos INTO v_intentos FROM public.alfaro_notif_intentos WHERE auth_uid=v_uid;
  IF v_intentos >= 5 THEN
    RETURN jsonb_build_object('error','Demasiados intentos. Espera cinco minutos.');
  END IF;

  SELECT * INTO v_user FROM public.pin_users WHERE id=p_usuario_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_user.pin_hash IS DISTINCT FROM
    encode(sha256(convert_to('alfaro::'||p_usuario_id::text||'::'||p_pin,'UTF8')),'hex')
  THEN
    UPDATE public.alfaro_notif_intentos SET intentos=intentos+1 WHERE auth_uid=v_uid;
    RETURN jsonb_build_object('error','PIN no válido para notificaciones.');
  END IF;
  UPDATE public.alfaro_notif_intentos SET intentos=0,desde=now() WHERE auth_uid=v_uid;
  v_token := gen_random_uuid()::text || gen_random_uuid()::text;
  DELETE FROM public.alfaro_notif_sesiones WHERE auth_uid=v_uid AND usuario_id=v_user.id;
  INSERT INTO public.alfaro_notif_sesiones(usuario_id,auth_uid,token_hash,vence)
  VALUES(v_user.id,v_uid,encode(sha256(convert_to(v_token,'UTF8')),'hex'),v_vence);
  RETURN jsonb_build_object('token',v_token,'usuario_id',v_user.id,'rol',v_user.role,'vence',v_vence);
END;
$$;
REVOKE ALL ON FUNCTION public.alfaro_notif_iniciar(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.alfaro_notif_iniciar(uuid,text) TO authenticated;
