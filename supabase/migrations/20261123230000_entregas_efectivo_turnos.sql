-- Entregas de efectivo por turno operativo, con conteo independiente y auditoría.
-- No altera los cuadres históricos ni las recogidas existentes.
CREATE TABLE IF NOT EXISTS public.alfaro_efectivo_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_operativo_id uuid NOT NULL REFERENCES public.alfaro_turnos_operativos(id),
  punto_venta text NOT NULL CHECK (punto_venta IN ('Cafetería','Mipyme')),
  dependiente_id uuid REFERENCES public.pin_users(id) ON DELETE SET NULL,
  dependiente text NOT NULL,
  entregado_en timestamptz NOT NULL DEFAULT now(),
  denominaciones_declaradas jsonb NOT NULL,
  total_declarado numeric(16,2) NOT NULL CHECK (total_declarado>0),
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','confirmada','diferencia','anulada')),
  observacion text NOT NULL DEFAULT '',
  denominaciones_recibidas jsonb,
  total_recibido numeric(16,2),
  recibido_por_id uuid REFERENCES public.pin_users(id) ON DELETE SET NULL,
  recibido_por text,
  recibido_en timestamptz,
  nota_conteo text,
  motivo_resolucion text,
  resuelto_en timestamptz,
  anulado_por uuid REFERENCES public.pin_users(id) ON DELETE SET NULL,
  motivo_anulacion text,
  anulado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alfaro_efectivo_turno_fecha
  ON public.alfaro_efectivo_entregas(turno_operativo_id,entregado_en DESC);
CREATE INDEX IF NOT EXISTS alfaro_efectivo_estado_fecha
  ON public.alfaro_efectivo_entregas(estado,entregado_en DESC);

CREATE TABLE IF NOT EXISTS public.alfaro_efectivo_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES public.alfaro_efectivo_entregas(id),
  accion text NOT NULL,
  actor_id uuid REFERENCES public.pin_users(id) ON DELETE SET NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.alfaro_efectivo_entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alfaro_efectivo_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alfaro_efectivo_entregas,public.alfaro_efectivo_auditoria
  FROM PUBLIC,anon,authenticated;

-- Solo denominaciones oficiales CUP y cantidades enteras no negativas.
CREATE OR REPLACE FUNCTION public.alfaro_efectivo_sumar(p_den jsonb)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_catalog AS $$
DECLARE v_key text; v_value jsonb; v_total numeric:=0;
BEGIN
  IF p_den IS NULL OR jsonb_typeof(p_den)<>'object' THEN
    RAISE EXCEPTION 'Debes registrar las cantidades de billetes CUP.';
  END IF;
  FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_den) LOOP
    IF v_key NOT IN ('20000','10000','5000','2000','1000','500','200','100','50','20','10','5')
       OR jsonb_typeof(v_value)<>'number'
       OR v_value::text !~ '^[0-9]{1,9}$' THEN
       RAISE EXCEPTION 'Denominación o cantidad de billetes no válida (%).',v_key;
    END IF;
    v_total:=v_total+(v_key::numeric)*(v_value::text::numeric);
  END LOOP;
  IF v_total<=0 OR v_total>1000000000000 THEN
    RAISE EXCEPTION 'El importe del fajo debe ser positivo y estar dentro del límite permitido.';
  END IF;
  RETURN v_total;
END $$;
REVOKE ALL ON FUNCTION public.alfaro_efectivo_sumar(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.alfaro_efectivo_enviar(
 p_token text,p_turno_id uuid,p_den jsonb,p_observacion text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_actor public.pin_users%ROWTYPE;
 v_turno public.alfaro_turnos_operativos%ROWTYPE;
 v_entrega public.alfaro_efectivo_entregas%ROWTYPE; v_total numeric;
BEGIN
  SELECT * INTO v_actor FROM public.alfaro_turnos_usuario(p_token);
  IF v_actor.id IS NULL THEN RETURN jsonb_build_object('error','Confirma tu PIN para enviar efectivo.'); END IF;
  SELECT * INTO v_turno FROM public.alfaro_turnos_operativos
    WHERE id=p_turno_id AND estado='activo' FOR UPDATE;
  IF v_turno.id IS NULL OR v_turno.usuario_id IS DISTINCT FROM v_actor.id
     OR v_actor.role<>'dependiente' THEN
    RETURN jsonb_build_object('error','Solo la dependienta del turno activo puede enviar dinero.');
  END IF;
  v_total:=public.alfaro_efectivo_sumar(p_den);
  INSERT INTO public.alfaro_efectivo_entregas(
    turno_operativo_id,punto_venta,dependiente_id,dependiente,
    denominaciones_declaradas,total_declarado,observacion)
  VALUES(v_turno.id,v_turno.punto_venta,v_actor.id,v_actor.nombre,p_den,v_total,
    left(coalesce(p_observacion,''),500)) RETURNING * INTO v_entrega;
  INSERT INTO public.alfaro_efectivo_auditoria(entrega_id,accion,actor_id,detalle)
    VALUES(v_entrega.id,'enviada',v_actor.id,
     jsonb_build_object('declarado',v_total,'denominaciones',p_den));
  RETURN jsonb_build_object('entrega',to_jsonb(v_entrega));
END $$;

CREATE OR REPLACE FUNCTION public.alfaro_efectivo_listar(
 p_token text,p_turno_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_actor public.pin_users%ROWTYPE; v_items jsonb;
BEGIN
  SELECT * INTO v_actor FROM public.alfaro_turnos_usuario(p_token);
  IF v_actor.id IS NULL THEN RETURN jsonb_build_object('error','Confirma tu PIN para consultar el efectivo.'); END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.entregado_en DESC),'[]'::jsonb)
    INTO v_items FROM (
      SELECT * FROM public.alfaro_efectivo_entregas
      WHERE (p_turno_id IS NULL OR turno_operativo_id=p_turno_id)
        AND (v_actor.role IN ('admin','duena') OR dependiente_id=v_actor.id)
      ORDER BY entregado_en DESC LIMIT 1000
    ) e;
  RETURN jsonb_build_object('entregas',v_items);
END $$;

CREATE OR REPLACE FUNCTION public.alfaro_efectivo_contar(
 p_token text,p_entrega_id uuid,p_den jsonb,p_nota text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_actor public.pin_users%ROWTYPE;
 v_entrega public.alfaro_efectivo_entregas%ROWTYPE; v_total numeric; v_estado text;
BEGIN
  SELECT * INTO v_actor FROM public.alfaro_turnos_usuario(p_token);
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('admin','duena') THEN
    RETURN jsonb_build_object('error','Solo administración o dueña puede contar y recibir efectivo.');
  END IF;
  SELECT * INTO v_entrega FROM public.alfaro_efectivo_entregas
    WHERE id=p_entrega_id FOR UPDATE;
  IF v_entrega.id IS NULL OR v_entrega.estado NOT IN ('pendiente','diferencia') THEN
    RETURN jsonb_build_object('error','Esta entrega no admite otro conteo.');
  END IF;
  v_total:=public.alfaro_efectivo_sumar(p_den);
  -- Aunque el total coincida, diferentes denominaciones requieren revisión.
  IF v_total=v_entrega.total_declarado
     AND p_den=v_entrega.denominaciones_declaradas THEN
    v_estado:='confirmada';
  ELSE
    v_estado:='diferencia';
  END IF;
  UPDATE public.alfaro_efectivo_entregas SET
    denominaciones_recibidas=p_den,total_recibido=v_total,
    recibido_por_id=v_actor.id,recibido_por=v_actor.nombre,
    recibido_en=now(),nota_conteo=left(coalesce(p_nota,''),500),
    estado=v_estado,motivo_resolucion=NULL,resuelto_en=NULL,updated_at=now()
    WHERE id=p_entrega_id RETURNING * INTO v_entrega;
  INSERT INTO public.alfaro_efectivo_auditoria(entrega_id,accion,actor_id,detalle)
    VALUES(v_entrega.id,'conteo',v_actor.id,
       jsonb_build_object('total_recibido',v_total,'denominaciones',p_den,'estado',v_estado));
  RETURN jsonb_build_object('entrega',to_jsonb(v_entrega));
END $$;

CREATE OR REPLACE FUNCTION public.alfaro_efectivo_resolver(
 p_token text,p_entrega_id uuid,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_actor public.pin_users%ROWTYPE;
 v_entrega public.alfaro_efectivo_entregas%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.alfaro_turnos_usuario(p_token);
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('admin','duena') THEN
    RETURN jsonb_build_object('error','Solo administración o dueña puede resolver diferencias.');
  END IF;
  IF length(trim(coalesce(p_motivo,'')))<10 THEN
    RETURN jsonb_build_object('error','Indica un motivo detallado de al menos 10 caracteres.');
  END IF;
  UPDATE public.alfaro_efectivo_entregas
    SET estado='confirmada',motivo_resolucion=left(trim(p_motivo),500),
      resuelto_en=now(),updated_at=now()
    WHERE id=p_entrega_id AND estado='diferencia'
      AND total_recibido IS NOT NULL AND recibido_por_id IS NOT NULL
    RETURNING * INTO v_entrega;
  IF v_entrega.id IS NULL THEN RETURN jsonb_build_object('error','La entrega no tiene una diferencia pendiente.'); END IF;
  INSERT INTO public.alfaro_efectivo_auditoria(entrega_id,accion,actor_id,detalle)
    VALUES(v_entrega.id,'diferencia_aceptada',v_actor.id,
       jsonb_build_object('motivo',v_entrega.motivo_resolucion,
        'declarado',v_entrega.total_declarado,'contado',v_entrega.total_recibido));
  RETURN jsonb_build_object('entrega',to_jsonb(v_entrega));
END $$;

CREATE OR REPLACE FUNCTION public.alfaro_efectivo_anular(
 p_token text,p_entrega_id uuid,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_actor public.pin_users%ROWTYPE;
 v_entrega public.alfaro_efectivo_entregas%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.alfaro_turnos_usuario(p_token);
  IF v_actor.id IS NULL OR v_actor.role NOT IN ('admin','duena') THEN
    RETURN jsonb_build_object('error','Solo administración puede anular entregas.');
  END IF;
  IF length(trim(coalesce(p_motivo,'')))<10 THEN
    RETURN jsonb_build_object('error','Explica la anulación en al menos 10 caracteres.');
  END IF;
  UPDATE public.alfaro_efectivo_entregas SET estado='anulada',
    motivo_anulacion=left(trim(p_motivo),500),
    anulado_por=v_actor.id,anulado_en=now(),updated_at=now()
    WHERE id=p_entrega_id AND estado IN ('pendiente','diferencia')
    RETURNING * INTO v_entrega;
  IF v_entrega.id IS NULL THEN
    RETURN jsonb_build_object('error','No se puede anular una entrega confirmada; requiere ajuste contable.');
  END IF;
  INSERT INTO public.alfaro_efectivo_auditoria(entrega_id,accion,actor_id,detalle)
    VALUES(v_entrega.id,'anulada',v_actor.id,jsonb_build_object('motivo',v_entrega.motivo_anulacion));
  RETURN jsonb_build_object('entrega',to_jsonb(v_entrega));
END $$;

REVOKE ALL ON FUNCTION public.alfaro_efectivo_enviar(text,uuid,jsonb,text),
 public.alfaro_efectivo_listar(text,uuid),
 public.alfaro_efectivo_contar(text,uuid,jsonb,text),
 public.alfaro_efectivo_resolver(text,uuid,text),
 public.alfaro_efectivo_anular(text,uuid,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.alfaro_efectivo_enviar(text,uuid,jsonb,text),
 public.alfaro_efectivo_listar(text,uuid),
 public.alfaro_efectivo_contar(text,uuid,jsonb,text),
 public.alfaro_efectivo_resolver(text,uuid,text),
 public.alfaro_efectivo_anular(text,uuid,text)
 TO authenticated;
