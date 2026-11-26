BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.alfaro_efectivo_usos (
 entrega_id uuid PRIMARY KEY REFERENCES public.alfaro_efectivo_entregas(id),
 cuadre_id uuid NOT NULL, fecha timestamptz NOT NULL
);
REVOKE ALL ON private.alfaro_efectivo_usos FROM PUBLIC,anon,authenticated;
LOCK TABLE public.cuadres IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO private.alfaro_efectivo_usos(entrega_id,cuadre_id,fecha)
SELECT (r->>'entregaEfectivoId')::uuid,c.id,c.fecha FROM public.cuadres c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.data->'recogidas','[]'::jsonb)) r WHERE c.finalizado AND nullif(r->>'entregaEfectivoId','') IS NOT NULL
ON CONFLICT(entrega_id) DO NOTHING;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.cuadres c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.data->'recogidas','[]'::jsonb)) r JOIN private.alfaro_efectivo_usos u ON u.entrega_id=(r->>'entregaEfectivoId')::uuid WHERE c.finalizado AND u.cuadre_id<>c.id) THEN RAISE EXCEPTION 'Existen recogidas históricas duplicadas; requiere revisión'; END IF; END $$;
CREATE OR REPLACE FUNCTION private.alfaro_efectivo_reservar_cuadre() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_id uuid; v_rec jsonb; v_dueño uuid; v_e public.alfaro_efectivo_entregas%ROWTYPE; v_vistos uuid[]:='{}'; 
BEGIN
 IF NOT NEW.finalizado THEN RETURN NEW; END IF;
 FOR v_rec IN SELECT value FROM jsonb_array_elements(coalesce(NEW.data->'recogidas','[]'::jsonb)) LOOP
   IF nullif(v_rec->>'entregaEfectivoId','') IS NULL THEN CONTINUE; END IF;
   v_id:=(v_rec->>'entregaEfectivoId')::uuid;
   IF v_id=ANY(v_vistos) THEN RAISE EXCEPTION 'Recogida repetida dentro del cuadre: %',v_id; END IF;
   v_vistos:=array_append(v_vistos,v_id);
   SELECT cuadre_id INTO v_dueño FROM private.alfaro_efectivo_usos WHERE entrega_id=v_id;
   IF FOUND THEN
     IF v_dueño<>NEW.id THEN RAISE EXCEPTION 'Recogida ya contabilizada en otro cuadre: %',v_id; END IF;
     CONTINUE;
   END IF;
   SELECT * INTO v_e FROM public.alfaro_efectivo_entregas WHERE id=v_id FOR UPDATE;
   IF NOT FOUND OR v_e.estado<>'confirmada' OR v_e.punto_venta<>NEW.punto_venta OR lower(trim(v_e.dependiente))<>lower(trim(coalesce(NEW.dependiente,''))) OR (NEW.data->'precuadre'->>'turnoOperativoId') IS DISTINCT FROM v_e.turno_operativo_id::text OR v_e.total_recibido IS DISTINCT FROM (v_rec->>'monto')::numeric OR v_e.denominaciones_recibidas IS DISTINCT FROM v_rec->'denominaciones' THEN
     RAISE EXCEPTION 'La recogida no coincide con el efectivo confirmado de este turno: %',v_id;
   END IF;
   INSERT INTO private.alfaro_efectivo_usos(entrega_id,cuadre_id,fecha) VALUES(v_id,NEW.id,NEW.fecha)
   ON CONFLICT(entrega_id) DO NOTHING;
   SELECT cuadre_id INTO v_dueño FROM private.alfaro_efectivo_usos WHERE entrega_id=v_id;
   IF v_dueño IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'Recogida ya contabilizada en otro cuadre: %',v_id; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.alfaro_efectivo_reservar_cuadre() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS alfaro_efectivo_reservar_cuadre ON public.cuadres;
CREATE TRIGGER alfaro_efectivo_reservar_cuadre AFTER INSERT OR UPDATE OF data,finalizado ON public.cuadres FOR EACH ROW EXECUTE FUNCTION private.alfaro_efectivo_reservar_cuadre();
CREATE OR REPLACE FUNCTION public.alfaro_efectivo_listar(
 p_token text,p_turno_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE v_actor public.pin_users%ROWTYPE; v_items jsonb;
BEGIN
  SELECT * INTO v_actor FROM public.alfaro_turnos_usuario(p_token);
  IF v_actor.id IS NULL THEN RETURN jsonb_build_object('error','Confirma tu PIN para consultar el efectivo.'); END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object('cuadre_contabilizado_id',u.cuadre_id,'cuadre_contabilizado_fecha',u.fecha) ORDER BY e.entregado_en DESC),'[]'::jsonb)
    INTO v_items FROM (
      SELECT * FROM public.alfaro_efectivo_entregas
      WHERE (p_turno_id IS NULL OR turno_operativo_id=p_turno_id)
        AND (v_actor.role IN ('admin','duena') OR dependiente_id=v_actor.id)
      ORDER BY entregado_en DESC LIMIT 1000
    ) e LEFT JOIN private.alfaro_efectivo_usos u ON u.entrega_id=e.id;
  RETURN jsonb_build_object('entregas',v_items);
END $$;


CREATE OR REPLACE FUNCTION public.alfaro_notif_cup(p numeric) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT replace(replace(replace(to_char(coalesce(p,0),'FM999,999,999,999,990.00'),',','@'),'.',','),'@','.')||' CUP' $$;
CREATE OR REPLACE FUNCTION public.alfaro_notif_evento_negocio()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE
  v_titulo text;
  v_contenido text;
  v_destino text := '/';
  v_categoria text;
  v_clave text;
  v_roles text[] := ARRAY['admin','duena']::text[];
  v_nombre_destinatario text;
  v_stock numeric;
  v_antes numeric;
  v_min numeric;
  v_nombre text;
  v_depletos integer;
  v_cliente text; v_actor text; v_punto text; v_productos text;
BEGIN
  IF TG_TABLE_NAME='turnos_dependiente' THEN
    IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado) THEN
      IF NEW.estado='precuadrado' THEN
        v_categoria:='precuadres';
        v_titulo:='Nuevo precuadre recibido';
        v_contenido:=COALESCE(NEW.dependiente,'Dependiente')||' ha enviado su precuadre de '||replace(COALESCE(NEW.punto_venta,'su punto de venta'),'Mipyme','MiPyME')||'. Pendiente de revisión.';
        v_destino:='/?precuadre='||NEW.id;
        v_clave:='turno:'||NEW.id||':precuadrado';
      ELSIF NEW.estado IN ('conciliado','descartado') THEN
        v_categoria:='precuadres';
        v_titulo:=CASE WHEN NEW.estado='conciliado' THEN 'Precuadre conciliado' ELSE 'Precuadre descartado' END;
        v_contenido:=CASE WHEN NEW.estado='conciliado' THEN 'Tu precuadre de '||COALESCE(NEW.punto_venta,'tu punto de venta')||' ha sido conciliado correctamente.' ELSE 'Tu precuadre de '||COALESCE(NEW.punto_venta,'tu punto de venta')||' fue descartado. Consulta a administración.' END;
        v_destino:='/';
        v_roles:=ARRAY['dependiente']::text[];
        v_nombre_destinatario:=NEW.dependiente;
        v_clave:='turno:'||NEW.id||':'||NEW.estado;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME='fondo_sobrantes_movimientos' THEN
    IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado) THEN
      v_categoria:='caja';
      v_titulo:=CASE
        WHEN NEW.estado='pendiente' THEN 'Movimiento pendiente del Fondo'
        WHEN NEW.estado='confirmado' THEN 'Movimiento confirmado en Fondo'
        ELSE 'Movimiento anulado del Fondo' END;
      v_contenido:=COALESCE(NEW.dependiente,'Turno')||' · '||replace(COALESCE(NEW.punto_venta,'Caja'),'Mipyme','MiPyME')||' · '||NEW.tipo||' de '||public.alfaro_notif_cup(NEW.monto)||'. Estado: '||NEW.estado||'.';
      v_destino:='/caja-sobrantes';
      v_clave:='fondo:'||NEW.id||':'||NEW.estado;
    END IF;

  ELSIF TG_TABLE_NAME='almacen_movimientos' THEN
    IF TG_OP='INSERT' AND NEW.deleted_at IS NULL THEN
      SELECT p.nombre,p.stock_minimo,
             COALESCE(SUM(
               CASE WHEN m.deleted_at IS NULL
                 THEN CASE WHEN m.tipo::text='entrada' THEN m.cantidad ELSE -m.cantidad END
                 ELSE 0 END
             ),0)
      INTO v_nombre,v_min,v_stock
      FROM public.almacen_productos p
      LEFT JOIN public.almacen_movimientos m ON m.producto_id=p.id
      WHERE p.id=NEW.producto_id AND p.deleted_at IS NULL
      GROUP BY p.id,p.nombre,p.stock_minimo;
      v_antes:=v_stock - CASE WHEN NEW.tipo::text='entrada' THEN NEW.cantidad ELSE -NEW.cantidad END;
      IF v_min IS NOT NULL AND v_min>0 AND v_antes>v_min AND v_stock<=v_min THEN
        v_categoria:='stock';
        v_titulo:='Existencia baja en Almacén';
        v_contenido:=left(COALESCE(v_nombre,'Producto'),90)||': '||v_stock||' (mínimo: '||v_min||')';
        v_destino:='/almacen';
        v_clave:='stock:almacen:'||NEW.id;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME='cuadres' THEN
    IF NEW.deleted_at IS NULL AND NEW.finalizado
      AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND NOT COALESCE(OLD.finalizado,false))) THEN
      SELECT count(*), string_agg(p->>'nombre',', ' ORDER BY p->>'nombre') INTO v_depletos,v_productos
      FROM jsonb_array_elements(COALESCE(NEW.data->'productos','[]'::jsonb)) p
      WHERE COALESCE(NULLIF(p->>'inicio','')::numeric,0)>0
        AND COALESCE(NULLIF(p->>'final','')::numeric,0)<=0;
      IF v_depletos>0 THEN
        v_categoria:='stock';
        v_titulo:='Productos agotados tras el cuadre';
        v_contenido:=replace(COALESCE(NEW.punto_venta,'Punto de venta'),'Mipyme','MiPyME')||' · '||v_depletos||' producto(s) agotados: '||left(coalesce(v_productos,''),170)||'.';
        v_destino:='/historial?cuadreId='||NEW.id;
        v_clave:='stock:cuadre:'||NEW.id;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME='abonos' THEN
    IF TG_OP='INSERT' AND NEW.deleted_at IS NULL THEN
      v_categoria:='cxc';
      v_titulo:=CASE WHEN NEW.reversa_de IS NOT NULL THEN 'Reversión de abono'
        ELSE 'Abono registrado' END;
      SELECT nombre INTO v_cliente FROM public.clientes WHERE id=NEW.cliente_id;
      v_actor:=COALESCE(NULLIF(NEW.usuario_nombre,''),'Administración');
      v_contenido:=CASE WHEN NEW.reversa_de IS NOT NULL THEN 'Se revirtió un abono de ' ELSE 'Abono de ' END||coalesce(v_cliente,'cliente')||' por '||public.alfaro_notif_cup(abs(NEW.monto))||'. Registrado por '||v_actor||'.';
      v_destino:='/cobrar/clientes/'||NEW.cliente_id||'?abono='||NEW.id;
      v_clave:='cxc:abono:'||NEW.id;
    END IF;

  ELSIF TG_TABLE_NAME='deudas' THEN
    IF TG_OP='INSERT' AND NEW.deleted_at IS NULL AND NEW.saldo>0 THEN
      v_categoria:='cxc';
      v_titulo:='Cuenta por Cobrar registrada';
      SELECT nombre INTO v_cliente FROM public.clientes WHERE id=NEW.cliente_id;
      v_contenido:='Se ha registrado una nueva deuda de '||coalesce(v_cliente,'cliente')||' por '||public.alfaro_notif_cup(NEW.total)||'.';
      v_destino:='/cobrar/clientes/'||NEW.cliente_id||'?deuda='||NEW.id;
      v_clave:='cxc:deuda:'||NEW.id||':nueva';
    ELSIF TG_OP='UPDATE' AND NEW.deleted_at IS NULL
      AND NEW.estado::text='pagada' AND OLD.estado::text IS DISTINCT FROM 'pagada' THEN
      v_categoria:='cxc';
      v_titulo:='Deuda saldada';
      SELECT nombre INTO v_cliente FROM public.clientes WHERE id=NEW.cliente_id;
      v_contenido:='La deuda de '||coalesce(v_cliente,'cliente')||' por '||public.alfaro_notif_cup(NEW.total)||' ha quedado totalmente saldada.';
      v_destino:='/cobrar/clientes/'||NEW.cliente_id||'?deuda='||NEW.id;
      v_clave:='cxc:deuda:'||NEW.id||':pagada';
    END IF;

  ELSIF TG_TABLE_NAME='alfaro_efectivo_entregas' THEN
    IF TG_OP='INSERT' OR OLD.estado IS DISTINCT FROM NEW.estado THEN
      v_categoria:='caja';
      v_punto:=replace(NEW.punto_venta,'Mipyme','MiPyME');
      v_destino:='/?entrega='||NEW.id;
      v_clave:='efectivo:'||NEW.id||':'||NEW.estado;
      IF NEW.estado='pendiente' THEN
        v_titulo:='Nueva entrega de efectivo';
        v_contenido:=NEW.dependiente||' ha declarado una entrega de '||public.alfaro_notif_cup(NEW.total_declarado)||' en '||v_punto||'. Pendiente de conteo y confirmación.';
      ELSIF NEW.estado='confirmada' THEN
        v_titulo:='Recepción de efectivo confirmada';
        v_contenido:=coalesce(NEW.recibido_por,'Administración')||' ha confirmado '||public.alfaro_notif_cup(NEW.total_recibido)||' entregados por '||NEW.dependiente||' en '||v_punto||'.';
      ELSIF NEW.estado='diferencia' THEN
        v_titulo:='Diferencia en entrega de efectivo';
        v_contenido:=NEW.dependiente||' · '||v_punto||'. Declarado: '||public.alfaro_notif_cup(NEW.total_declarado)||'; contado: '||public.alfaro_notif_cup(NEW.total_recibido)||'. Requiere revisión.';
      ELSE
        v_titulo:='Entrega de efectivo anulada';
        v_contenido:='Se anuló una entrega de '||NEW.dependiente||' en '||v_punto||'. Consulta el registro.';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME='alfaro_turnos_operativos' THEN
    IF TG_OP='INSERT' AND NEW.estado='activo' THEN
      v_categoria:='precuadres';v_titulo:='Turno asignado';
      v_contenido:=NEW.dependiente||' ha recibido el turno de '||replace(NEW.punto_venta,'Mipyme','MiPyME')||'.';
      v_destino:='/';v_clave:='operativo:'||NEW.id||':asignado';
    END IF;
  ELSIF TG_TABLE_NAME='auditoria' THEN
    IF TG_OP='INSERT' AND NEW.accion NOT IN ('registrar_abono') THEN
      v_categoria:='auditoria';
      v_titulo:='Actividad administrativa registrada';
      v_contenido:=coalesce(NEW.usuario_nombre,'Administración')||' · '||left(replace(COALESCE(NEW.accion,'Operación'), '_',' '),75)||'.';
      v_destino:='/ajustes';
      v_clave:='auditoria:'||NEW.id;
    END IF;
  END IF;

  IF v_categoria IS NOT NULL AND v_clave IS NOT NULL THEN
    INSERT INTO public.alfaro_notif_eventos(
      clave,categoria,titulo,contenido,destino,roles,destinatario_nombre
    ) VALUES(v_clave,v_categoria,v_titulo,v_contenido,v_destino,v_roles,v_nombre_destinatario)
    ON CONFLICT(clave) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Aviso AlFaroCafé no insertado (%): %',TG_TABLE_NAME,SQLERRM;
  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS alfaro_notif_efectivo ON public.alfaro_efectivo_entregas;
CREATE TRIGGER alfaro_notif_efectivo AFTER INSERT OR UPDATE OF estado ON public.alfaro_efectivo_entregas FOR EACH ROW EXECUTE FUNCTION public.alfaro_notif_evento_negocio();
DROP TRIGGER IF EXISTS alfaro_notif_operativo ON public.alfaro_turnos_operativos;
CREATE TRIGGER alfaro_notif_operativo AFTER INSERT ON public.alfaro_turnos_operativos FOR EACH ROW EXECUTE FUNCTION public.alfaro_notif_evento_negocio();
COMMIT;
