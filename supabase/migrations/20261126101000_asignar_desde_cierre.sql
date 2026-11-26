-- Asignación segura desde cierre oficial. No altera registros contables.
BEGIN;
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
  IF v_actor.id IS NULL OR v_actor.role IS DISTINCT FROM 'admin' THEN
    RETURN jsonb_build_object('error','Solo el administrador puede asignar turnos.');
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


CREATE OR REPLACE FUNCTION public.alfaro_turnos_asignar_desde_cuadre(p_token text,p_cuadre_id uuid,p_dependiente_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_actor public.pin_users%ROWTYPE; v_cuadre public.cuadres%ROWTYPE;
 v_activo public.alfaro_turnos_operativos%ROWTYPE; v_inicios jsonb; v_res jsonb;
 v_settings jsonb; v_nombre text; v_habitual text;
BEGIN
 SELECT * INTO v_actor FROM public.alfaro_turnos_usuario(p_token);
 IF v_actor.id IS NULL OR v_actor.role IS DISTINCT FROM 'admin' THEN
   RETURN jsonb_build_object('error','Solo el administrador puede asignar turnos.');
 END IF;
 SELECT * INTO v_cuadre FROM public.cuadres WHERE id=p_cuadre_id AND finalizado AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','El cuadre aún no está confirmado en la nube.'); END IF;
 SELECT nombre INTO v_nombre FROM public.pin_users WHERE id=p_dependiente_id AND role='dependiente' AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Dependiente no disponible.'); END IF;
 SELECT settings INTO v_settings FROM public.app_settings WHERE id='global';
 IF coalesce(v_settings->'dependientesInactivos','[]'::jsonb) ? v_nombre THEN RETURN jsonb_build_object('error','Dependiente inactivo.'); END IF;
 IF NOT (coalesce(v_settings->'dependientesAmbosPuntos','[]'::jsonb) ? v_nombre) THEN
   v_habitual:=v_settings->'dependientePunto'->>v_nombre;
   IF v_habitual IS NULL THEN SELECT punto_venta INTO v_habitual FROM public.cuadres WHERE dependiente=v_nombre AND finalizado AND deleted_at IS NULL GROUP BY punto_venta ORDER BY count(*) DESC, max(fecha) DESC LIMIT 1; END IF;
   IF v_habitual IS DISTINCT FROM v_cuadre.punto_venta THEN RETURN jsonb_build_object('error','El dependiente no tiene autorizado este punto de venta.'); END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('alfaro_turno_operativo_'||v_cuadre.punto_venta));
 IF EXISTS(SELECT 1 FROM public.alfaro_turnos_operativos WHERE fuente='cuadre' AND fuente_id=p_cuadre_id) THEN
   RETURN jsonb_build_object('error','Este cuadre ya se utilizó para asignar un turno.');
 END IF;
 IF EXISTS(SELECT 1 FROM public.cuadres c WHERE c.punto_venta=v_cuadre.punto_venta AND c.finalizado AND c.deleted_at IS NULL AND c.id<>v_cuadre.id AND c.fecha>v_cuadre.fecha) THEN
   RETURN jsonb_build_object('error','Hay un cuadre posterior. No se asignará desde un inventario antiguo.');
 END IF;
 IF jsonb_typeof(v_cuadre.data->'productos') IS DISTINCT FROM 'array' THEN
   RETURN jsonb_build_object('error','No hay inventario válido en el cuadre.');
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_cuadre.data->'productos') p WHERE coalesce((p->>'final')::numeric,0)<0 OR coalesce((p->>'precio')::numeric,0)<0 OR coalesce(p->>'id','')='' OR coalesce(p->>'nombre','')='') THEN
   RETURN jsonb_build_object('error','Inventario final inválido.');
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p->>'id','nombre',p->>'nombre','inicio',coalesce((p->>'final')::numeric,0),'precio',coalesce((p->>'precio')::numeric,0),'categoria',p->>'categoria','codigoBarras',p->>'codigoBarras')),'[]'::jsonb)
 INTO v_inicios FROM jsonb_array_elements(v_cuadre.data->'productos') p;
 SELECT * INTO v_activo FROM public.alfaro_turnos_operativos WHERE punto_venta=v_cuadre.punto_venta AND estado='activo' FOR UPDATE;
 IF FOUND THEN
   IF (v_cuadre.data->'precuadre'->>'turnoOperativoId') IS DISTINCT FROM v_activo.id::text AND
      NOT (lower(trim(coalesce(v_cuadre.dependiente,'')))=lower(trim(v_activo.dependiente)) AND v_activo.inicio<=v_cuadre.fecha AND coalesce(v_cuadre.data->'precuadre'->>'turnoOperativoId','')='') THEN
     RETURN jsonb_build_object('error','Ya existe otro turno activo. Se conserva su inventario.');
   END IF;
   UPDATE public.alfaro_turnos_operativos SET estado='entregado',fin=now(),finales=v_inicios WHERE id=v_activo.id;
   INSERT INTO public.alfaro_turnos_eventos(turno_id,punto_venta,usuario_id,accion,detalle)
     VALUES(v_activo.id,v_activo.punto_venta,v_actor.id,'entrega',jsonb_build_object('cuadre',p_cuadre_id,'origen','cierre oficial'));
 END IF;
 v_res:=public.alfaro_turnos_asignar(p_token,v_cuadre.punto_venta,p_dependiente_id,v_inicios,'cuadre',p_cuadre_id,'Asignado desde el cierre oficial',false);
 IF v_res ? 'error' THEN RAISE EXCEPTION '%',v_res->>'error'; END IF;
 IF v_activo.id IS NOT NULL THEN
   UPDATE public.alfaro_turnos_operativos SET relevo_de=v_activo.id WHERE id=(v_res->'turno'->>'id')::uuid;
 END IF;
 RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.alfaro_turnos_asignar_desde_cuadre(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alfaro_turnos_asignar_desde_cuadre(text,uuid,uuid) TO authenticated,anon;
COMMIT;
