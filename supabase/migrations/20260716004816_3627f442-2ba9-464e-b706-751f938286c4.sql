-- Recalcula estado de una deuda a partir del saldo actual
CREATE OR REPLACE FUNCTION public.deuda_estado_por_saldo(_saldo numeric, _total numeric)
RETURNS public.deuda_estado
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _saldo <= 0.001 THEN 'pagada'::public.deuda_estado
    WHEN _saldo < _total THEN 'parcial'::public.deuda_estado
    ELSE 'pendiente'::public.deuda_estado
  END
$$;

-- Al borrar un abono, restaura automáticamente los saldos de sus deudas.
CREATE OR REPLACE FUNCTION public.tg_revertir_saldo_al_borrar_abono()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app RECORD;
  v_total NUMERIC;
  v_saldo NUMERIC;
  v_nuevo NUMERIC;
BEGIN
  FOR v_app IN SELECT deuda_id, monto FROM public.abono_aplicaciones WHERE abono_id = OLD.id LOOP
    SELECT total, saldo INTO v_total, v_saldo
    FROM public.deudas
    WHERE id = v_app.deuda_id
    FOR UPDATE;

    IF FOUND THEN
      v_nuevo := ROUND((v_saldo + v_app.monto)::NUMERIC, 2);
      UPDATE public.deudas
      SET saldo = v_nuevo,
          estado = public.deuda_estado_por_saldo(v_nuevo, v_total),
          updated_at = now()
      WHERE id = v_app.deuda_id;
    END IF;
  END LOOP;

  IF COALESCE(OLD.credito_generado, 0) <> 0 THEN
    UPDATE public.clientes
    SET credito = GREATEST(0, COALESCE(credito, 0) - OLD.credito_generado),
        updated_at = now()
    WHERE id = OLD.cliente_id;
  END IF;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS revertir_saldo_al_borrar_abono ON public.abonos;
CREATE TRIGGER revertir_saldo_al_borrar_abono
BEFORE DELETE ON public.abonos
FOR EACH ROW
EXECUTE FUNCTION public.tg_revertir_saldo_al_borrar_abono();

-- Relaciones para integridad. Se crean solo si no existen.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deudas_cliente_id_fkey') THEN
    ALTER TABLE public.deudas
      ADD CONSTRAINT deudas_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'abonos_cliente_id_fkey') THEN
    ALTER TABLE public.abonos
      ADD CONSTRAINT abonos_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'abono_aplicaciones_abono_id_fkey') THEN
    ALTER TABLE public.abono_aplicaciones
      ADD CONSTRAINT abono_aplicaciones_abono_id_fkey
      FOREIGN KEY (abono_id) REFERENCES public.abonos(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'abono_aplicaciones_deuda_id_fkey') THEN
    ALTER TABLE public.abono_aplicaciones
      ADD CONSTRAINT abono_aplicaciones_deuda_id_fkey
      FOREIGN KEY (deuda_id) REFERENCES public.deudas(id) ON DELETE CASCADE;
  END IF;
END $$;

DROP POLICY IF EXISTS abonos_delete_auth ON public.abonos;
CREATE POLICY abonos_delete_auth
ON public.abonos
FOR DELETE
TO authenticated
USING (true);

DROP POLICY IF EXISTS aplic_delete_auth ON public.abono_aplicaciones;
CREATE POLICY aplic_delete_auth
ON public.abono_aplicaciones
FOR DELETE
TO authenticated
USING (true);