-- Eventos de negocio para las 5 categorías de notificación.
-- Dedupe por clave; nunca se interrumpe un cierre de caja si falla la alerta.
BEGIN;

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
BEGIN
  IF TG_TABLE_NAME='turnos_dependiente' THEN
    IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado) THEN
      IF NEW.estado='precuadrado' THEN
        v_categoria:='precuadres';
        v_titulo:='Precuadre enviado';
        v_contenido:=COALESCE(NEW.punto_venta,'Punto de venta')||' · '||COALESCE(NEW.dependiente,'Dependiente');
        v_destino:='/cuadre/1';
        v_clave:='turno:'||NEW.id||':precuadrado';
      ELSIF NEW.estado IN ('conciliado','descartado') THEN
        v_categoria:='precuadres';
        v_titulo:=CASE WHEN NEW.estado='conciliado' THEN 'Precuadre conciliado' ELSE 'Precuadre descartado' END;
        v_contenido:='Revisa el resultado de tu turno en '||COALESCE(NEW.punto_venta,'el punto de venta');
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
      v_contenido:=COALESCE(NEW.punto_venta,'Caja')||' · Revisión de sobrantes/faltantes';
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
      SELECT count(*) INTO v_depletos
      FROM jsonb_array_elements(COALESCE(NEW.data->'productos','[]'::jsonb)) p
      WHERE COALESCE(NULLIF(p->>'inicio','')::numeric,0)>0
        AND COALESCE(NULLIF(p->>'final','')::numeric,0)<=0;
      IF v_depletos>0 THEN
        v_categoria:='stock';
        v_titulo:='Productos agotados tras el cuadre';
        v_contenido:=COALESCE(NEW.punto_venta,'Punto de venta')||
          ' · '||v_depletos||' artículo(s) llegaron a cero';
        v_destino:='/productos';
        v_clave:='stock:cuadre:'||NEW.id;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME='abonos' THEN
    IF TG_OP='INSERT' AND NEW.deleted_at IS NULL THEN
      v_categoria:='cxc';
      v_titulo:=CASE WHEN NEW.reversa_de IS NOT NULL THEN 'Reversión de abono'
        ELSE 'Abono registrado' END;
      v_contenido:='Se registró un movimiento en Cuentas por Cobrar';
      v_destino:='/cobrar';
      v_clave:='cxc:abono:'||NEW.id;
    END IF;

  ELSIF TG_TABLE_NAME='deudas' THEN
    IF TG_OP='INSERT' AND NEW.deleted_at IS NULL AND NEW.saldo>0 THEN
      v_categoria:='cxc';
      v_titulo:='Cuenta por Cobrar registrada';
      v_contenido:='Nueva deuda pendiente en cartera';
      v_destino:='/cobrar';
      v_clave:='cxc:deuda:'||NEW.id||':nueva';
    ELSIF TG_OP='UPDATE' AND NEW.deleted_at IS NULL
      AND NEW.estado::text='pagada' AND OLD.estado::text IS DISTINCT FROM 'pagada' THEN
      v_categoria:='cxc';
      v_titulo:='Deuda saldada';
      v_contenido:='Una cuenta pendiente quedó pagada';
      v_destino:='/cobrar';
      v_clave:='cxc:deuda:'||NEW.id||':pagada';
    END IF;

  ELSIF TG_TABLE_NAME='auditoria' THEN
    IF TG_OP='INSERT' AND NEW.accion NOT IN ('registrar_abono') THEN
      v_categoria:='auditoria';
      v_titulo:='Actividad administrativa registrada';
      v_contenido:=left(replace(COALESCE(NEW.accion,'Operación'), '_',' '),75);
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

DROP TRIGGER IF EXISTS alfaro_notif_turnos ON public.turnos_dependiente;
CREATE TRIGGER alfaro_notif_turnos AFTER INSERT OR UPDATE OF estado
  ON public.turnos_dependiente FOR EACH ROW EXECUTE FUNCTION public.alfaro_notif_evento_negocio();

DROP TRIGGER IF EXISTS alfaro_notif_fondo ON public.fondo_sobrantes_movimientos;
CREATE TRIGGER alfaro_notif_fondo AFTER INSERT OR UPDATE OF estado
  ON public.fondo_sobrantes_movimientos FOR EACH ROW EXECUTE FUNCTION public.alfaro_notif_evento_negocio();

DROP TRIGGER IF EXISTS alfaro_notif_almacen ON public.almacen_movimientos;
CREATE TRIGGER alfaro_notif_almacen AFTER INSERT
  ON public.almacen_movimientos FOR EACH ROW EXECUTE FUNCTION public.alfaro_notif_evento_negocio();

DROP TRIGGER IF EXISTS alfaro_notif_cuadres ON public.cuadres;
CREATE TRIGGER alfaro_notif_cuadres AFTER INSERT OR UPDATE OF finalizado
  ON public.cuadres FOR EACH ROW EXECUTE FUNCTION public.alfaro_notif_evento_negocio();

DROP TRIGGER IF EXISTS alfaro_notif_abonos ON public.abonos;
CREATE TRIGGER alfaro_notif_abonos AFTER INSERT
  ON public.abonos FOR EACH ROW EXECUTE FUNCTION public.alfaro_notif_evento_negocio();

DROP TRIGGER IF EXISTS alfaro_notif_deudas ON public.deudas;
CREATE TRIGGER alfaro_notif_deudas AFTER INSERT OR UPDATE OF estado
  ON public.deudas FOR EACH ROW EXECUTE FUNCTION public.alfaro_notif_evento_negocio();

DROP TRIGGER IF EXISTS alfaro_notif_auditoria ON public.auditoria;
CREATE TRIGGER alfaro_notif_auditoria AFTER INSERT
  ON public.auditoria FOR EACH ROW EXECUTE FUNCTION public.alfaro_notif_evento_negocio();

COMMIT;
