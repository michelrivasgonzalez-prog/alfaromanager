-- Control de Turnos y Relevos. NO modifica cuadres existentes.
-- El turno operativo es independiente de la conciliación del cuadre oficial.
CREATE TABLE IF NOT EXISTS public.alfaro_turnos_operativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  punto_venta text NOT NULL CHECK (punto_venta IN ('Cafetería','Mipyme')),
  usuario_id uuid NOT NULL REFERENCES public.pin_users(id),
  dependiente text NOT NULL,
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','entregado','reemplazado')),
  inicio timestamptz NOT NULL DEFAULT now(),
  fin timestamptz,
  inicios jsonb NOT NULL DEFAULT '[]'::jsonb,
  finales jsonb,
  fuente text NOT NULL DEFAULT 'manual' CHECK (fuente IN ('manual','precuadre','cuadre','relevo')),
  fuente_id uuid,
  precuadre_id uuid,
  relevo_de uuid REFERENCES public.alfaro_turnos_operativos(id),
  asignado_por uuid REFERENCES public.pin_users(id),
  observacion text,
  creado timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS alfaro_turnos_solo_un_activo
  ON public.alfaro_turnos_operativos(punto_venta) WHERE estado='activo';
CREATE UNIQUE INDEX IF NOT EXISTS alfaro_turnos_una_entrega
  ON public.alfaro_turnos_operativos(precuadre_id) WHERE precuadre_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS alfaro_turnos_usuario_estado
  ON public.alfaro_turnos_operativos(usuario_id,estado,inicio DESC);

CREATE TABLE IF NOT EXISTS public.alfaro_turnos_sesiones (
  auth_uid uuid PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES public.pin_users(id),
  token_hash text NOT NULL,
  vence timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS public.alfaro_turnos_intentos (
  auth_uid uuid PRIMARY KEY,
  intentos integer NOT NULL DEFAULT 0,
  desde timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.alfaro_turnos_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid REFERENCES public.alfaro_turnos_operativos(id),
  punto_venta text NOT NULL,
  usuario_id uuid REFERENCES public.pin_users(id),
  accion text NOT NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado timestamptz NOT NULL DEFAULT now()
);

-- Nunca se exponen directamente las tablas: solo RPC con sesión de PIN validada.
ALTER TABLE public.alfaro_turnos_operativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alfaro_turnos_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alfaro_turnos_intentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alfaro_turnos_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alfaro_turnos_operativos, public.alfaro_turnos_sesiones,
  public.alfaro_turnos_intentos, public.alfaro_turnos_eventos FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.alfaro_turnos_usuario(p_token text)
RETURNS public.pin_users
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_user public.pin_users%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_token IS NULL OR length(p_token)<16 THEN
    RETURN NULL;
  END IF;
  SELECT u.* INTO v_user FROM public.alfaro_turnos_sesiones s
    JOIN public.pin_users u ON u.id=s.usuario_id
  WHERE s.auth_uid=auth.uid() AND s.vence>now() AND u.deleted_at IS NULL
    AND s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  RETURN v_user;
END $$;
REVOKE ALL ON FUNCTION public.alfaro_turnos_usuario(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.alfaro_turnos_login(p_usuario_id uuid,p_pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_uid uuid:=auth.uid(); v_usuario public.pin_users%ROWTYPE;
  v_intentos integer; v_token text;
BEGIN
  IF v_uid IS NULL OR p_pin !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('error','Es necesario un PIN válido de 6 dígitos.');
  END IF;
  INSERT INTO public.alfaro_turnos_intentos(auth_uid,intentos,desde)
    VALUES(v_uid,0,now()) ON CONFLICT(auth_uid) DO UPDATE SET
      intentos=CASE WHEN alfaro_turnos_intentos.desde<now()-interval '5 minutes'
         THEN 0 ELSE alfaro_turnos_intentos.intentos END,
      desde=CASE WHEN alfaro_turnos_intentos.desde<now()-interval '5 minutes'
         THEN now() ELSE alfaro_turnos_intentos.desde END;
  SELECT intentos INTO v_intentos FROM public.alfaro_turnos_intentos WHERE auth_uid=v_uid FOR UPDATE;
  IF v_intentos>=5 THEN
    RETURN jsonb_build_object('error','Demasiados intentos. Intenta en 5 minutos.');
  END IF;
  SELECT * INTO v_usuario FROM public.pin_users
    WHERE id=p_usuario_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_usuario.pin_hash IS DISTINCT FROM
    encode(sha256(convert_to('alfaro::'||p_usuario_id::text||'::'||p_pin,'UTF8')),'hex')
  THEN
    UPDATE public.alfaro_turnos_intentos SET intentos=intentos+1 WHERE auth_uid=v_uid;
    RETURN jsonb_build_object('error','PIN incorrecto.');
  END IF;
  UPDATE public.alfaro_turnos_intentos SET intentos=0,desde=now() WHERE auth_uid=v_uid;
  v_token:=gen_random_uuid()::text||gen_random_uuid()::text;
  INSERT INTO public.alfaro_turnos_sesiones(auth_uid,usuario_id,token_hash,vence)
    VALUES(v_uid,v_usuario.id,encode(sha256(convert_to(v_token,'UTF8')),'hex'),now()+interval '12 hours')
    ON CONFLICT(auth_uid) DO UPDATE SET
      usuario_id=excluded.usuario_id, token_hash=excluded.token_hash, vence=excluded.vence;
  RETURN jsonb_build_object('token',v_token,'usuario_id',v_usuario.id,'rol',v_usuario.role);
END $$;

CREATE OR REPLACE FUNCTION public.alfaro_turnos_listar(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_usuario public.pin_users%ROWTYPE; v_data jsonb;
BEGIN
  SELECT * INTO v_usuario FROM public.alfaro_turnos_usuario(p_token);
  IF v_usuario.id IS NULL THEN RETURN jsonb_build_object('error','Revalida tu PIN para consultar turnos.'); END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.inicio DESC),'[]'::jsonb)
    INTO v_data FROM public.alfaro_turnos_operativos t
  WHERE t.estado='activo' AND
    (v_usuario.role IN ('admin','duena') OR t.usuario_id=v_usuario.id);
  RETURN jsonb_build_object('turnos',v_data,'rol',v_usuario.role);
END $$;

CREATE OR REPLACE FUNCTION public.alfaro_turnos_asignar(
 p_token text,p_punto text,p_dependiente_id uuid,p_inicios jsonb,
 p_fuente text DEFAULT 'manual',p_fuente_id uuid DEFAULT NULL,
 p_observacion text DEFAULT '',p_reemplazar boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_actor public.pin_users%ROWTYPE; v_dependiente public.pin_users%ROWTYPE;
  v_existente public.alfaro_turnos_operativos%ROWTYPE; v_nuevo public.alfaro_turnos_operativos%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.alfaro_turnos_usuario(p_token);
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('admin','duena') THEN
    RETURN jsonb_build_object('error','Solo administración puede asignar turnos.');
  END IF;
  IF p_punto NOT IN ('Cafetería','Mipyme') OR p_fuente NOT IN ('manual','precuadre','cuadre','relevo')
     OR jsonb_typeof(p_inicios) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('error','Punto, origen o inventario inicial no válido.');
  END IF;
  SELECT * INTO v_dependiente FROM public.pin_users
    WHERE id=p_dependiente_id AND role='dependiente' AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Selecciona una dependienta activa.'); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('alfaro_turno_operativo_'||p_punto));
  SELECT * INTO v_existente FROM public.alfaro_turnos_operativos
    WHERE punto_venta=p_punto AND estado='activo' FOR UPDATE;
  IF FOUND AND NOT p_reemplazar THEN
    RETURN jsonb_build_object('error','Ya existe un turno activo. Confirma el relevo administrativo.');
  END IF;
  IF v_existente.id IS NOT NULL THEN
    UPDATE public.alfaro_turnos_operativos SET estado='reemplazado',fin=now()
      WHERE id=v_existente.id;
    INSERT INTO public.alfaro_turnos_eventos(turno_id,punto_venta,usuario_id,accion,detalle)
      VALUES(v_existente.id,p_punto,v_actor.id,'reemplazo_admin',
        jsonb_build_object('razon',coalesce(p_observacion,'')));
  END IF;
  INSERT INTO public.alfaro_turnos_operativos(
    punto_venta,usuario_id,dependiente,inicios,fuente,fuente_id,
    relevo_de,asignado_por,observacion)
  VALUES(p_punto,v_dependiente.id,v_dependiente.nombre,p_inicios,p_fuente,p_fuente_id,
    v_existente.id,v_actor.id,coalesce(p_observacion,''))
  RETURNING * INTO v_nuevo;
  INSERT INTO public.alfaro_turnos_eventos(turno_id,punto_venta,usuario_id,accion,detalle)
    VALUES(v_nuevo.id,p_punto,v_actor.id,'asignacion',
      jsonb_build_object('dependiente',v_dependiente.nombre,'fuente',p_fuente,'reemplazo',v_existente.id));
  RETURN jsonb_build_object('turno',to_jsonb(v_nuevo));
END $$;

CREATE OR REPLACE FUNCTION public.alfaro_turnos_relevar(
 p_token text,p_turno_id uuid,p_precuadre_id uuid,
 p_receptor_id uuid,p_pin_receptor text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_actor public.pin_users%ROWTYPE; v_receptor public.pin_users%ROWTYPE;
 v_actual public.alfaro_turnos_operativos%ROWTYPE;
 v_pre public.turnos_dependiente%ROWTYPE;
 v_inicios jsonb; v_nuevo public.alfaro_turnos_operativos%ROWTYPE;
 v_modo text;
BEGIN
  SELECT * INTO v_actor FROM public.alfaro_turnos_usuario(p_token);
  IF v_actor.id IS NULL THEN RETURN jsonb_build_object('error','Revalida tu PIN.'); END IF;
  SELECT * INTO v_actual FROM public.alfaro_turnos_operativos WHERE id=p_turno_id FOR UPDATE;
  IF v_actual.id IS NULL OR v_actual.estado<>'activo' THEN
    RETURN jsonb_build_object('error','Este turno ya no está activo.');
  END IF;
  IF v_actual.usuario_id<>v_actor.id AND v_actor.role NOT IN ('admin','duena') THEN
    RETURN jsonb_build_object('error','El turno no te pertenece.');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('alfaro_turno_operativo_'||v_actual.punto_venta));
  SELECT * INTO v_pre FROM public.turnos_dependiente WHERE id=p_precuadre_id
    AND estado='precuadrado' AND deleted_at IS NULL;
  IF v_pre.id IS NULL OR v_pre.punto_venta<>v_actual.punto_venta
     OR lower(trim(v_pre.dependiente))<>lower(trim(v_actual.dependiente)) THEN
    RETURN jsonb_build_object('error','El precuadre enviado no corresponde al turno activo.');
  END IF;
  v_modo:=v_pre.data->>'tipoRelevo';
  IF v_modo NOT IN ('dependiente','admin') THEN
    RETURN jsonb_build_object('error','Relevo no válido.');
  END IF;
  IF p_pin_receptor !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('error','Confirma el PIN del relevo.');
  END IF;
  SELECT * INTO v_receptor FROM public.pin_users WHERE id=p_receptor_id AND deleted_at IS NULL;
  IF v_receptor.id IS NULL OR v_receptor.pin_hash IS DISTINCT FROM
    encode(sha256(convert_to('alfaro::'||p_receptor_id::text||'::'||p_pin_receptor,'UTF8')),'hex')
    OR (v_modo='admin' AND v_receptor.role NOT IN ('admin','duena'))
    OR (v_modo='dependiente' AND (v_receptor.role<>'dependiente'
       OR lower(trim(v_receptor.nombre))<>lower(trim(v_pre.entrante)))) THEN
    RETURN jsonb_build_object('error','Identidad o PIN del relevo incorrectos.');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',item->>'id','nombre',item->>'nombre','inicio',coalesce((item->>'final')::numeric,0),
    'precio',coalesce((item->>'precio')::numeric,0),'categoria',item->>'categoria',
    'codigoBarras',item->>'codigoBarras')),'[]'::jsonb)
    INTO v_inicios
    FROM jsonb_array_elements(coalesce(v_pre.data->'productos','[]'::jsonb)) item;
  UPDATE public.alfaro_turnos_operativos SET
    estado='entregado',fin=now(),finales=v_inicios,precuadre_id=v_pre.id
    WHERE id=v_actual.id;
  INSERT INTO public.alfaro_turnos_eventos(turno_id,punto_venta,usuario_id,accion,detalle)
    VALUES(v_actual.id,v_actual.punto_venta,v_actor.id,'entrega',
      jsonb_build_object('precuadre',v_pre.id,'recibe',v_receptor.nombre,'tipo',v_modo));
  IF v_modo='admin' THEN
    RETURN jsonb_build_object('entregado',true,'requiere_asignacion',true);
  END IF;
  INSERT INTO public.alfaro_turnos_operativos(
    punto_venta,usuario_id,dependiente,inicios,fuente,fuente_id,relevo_de,asignado_por,observacion)
    VALUES(v_actual.punto_venta,v_receptor.id,v_receptor.nombre,v_inicios,
      'relevo',v_pre.id,v_actual.id,v_actor.id,'Relevo validado con PIN y firma')
    RETURNING * INTO v_nuevo;
  INSERT INTO public.alfaro_turnos_eventos(turno_id,punto_venta,usuario_id,accion,detalle)
    VALUES(v_nuevo.id,v_actual.punto_venta,v_actor.id,'recepcion',
      jsonb_build_object('desde',v_actual.id,'precuadre',v_pre.id));
  RETURN jsonb_build_object('entregado',true,'nuevo_turno',to_jsonb(v_nuevo));
END $$;

REVOKE ALL ON FUNCTION public.alfaro_turnos_login(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.alfaro_turnos_listar(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.alfaro_turnos_asignar(text,text,uuid,jsonb,text,uuid,text,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.alfaro_turnos_relevar(text,uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.alfaro_turnos_login(uuid,text),
  public.alfaro_turnos_listar(text),
  public.alfaro_turnos_asignar(text,text,uuid,jsonb,text,uuid,text,boolean),
  public.alfaro_turnos_relevar(text,uuid,uuid,uuid,text) TO authenticated;
