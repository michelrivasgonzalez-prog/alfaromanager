-- 1) Ajustes compartidos de la aplicación
CREATE TABLE IF NOT EXISTS public.app_settings (
  id text PRIMARY KEY DEFAULT 'global',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = 'global')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_settings_all_auth" ON public.app_settings;
CREATE POLICY "app_settings_all_auth"
ON public.app_settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 2) Crédito por cliente para sobrepagos
ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS credito numeric NOT NULL DEFAULT 0;

-- 3) Crédito generado por cada abono
ALTER TABLE public.abonos
ADD COLUMN IF NOT EXISTS credito_generado numeric NOT NULL DEFAULT 0;

-- 4) Actualización automática updated_at para ajustes
DROP TRIGGER IF EXISTS app_settings_set_updated_at ON public.app_settings;
CREATE TRIGGER app_settings_set_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

-- 5) Reglas RLS compatibles con la app de PIN compartida.
-- La app ya controla permisos por PIN local; la sesión cloud es anónima/autenticada y compartida entre dispositivos.
DROP POLICY IF EXISTS catalogo_admin_insert ON public.catalogo;
DROP POLICY IF EXISTS catalogo_admin_update ON public.catalogo;
DROP POLICY IF EXISTS catalogo_admin_delete ON public.catalogo;
DROP POLICY IF EXISTS catalogo_select_authed ON public.catalogo;
CREATE POLICY catalogo_all_auth
ON public.catalogo
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS cuadres_admin_insert ON public.cuadres;
DROP POLICY IF EXISTS cuadres_admin_update ON public.cuadres;
DROP POLICY IF EXISTS cuadres_admin_delete ON public.cuadres;
DROP POLICY IF EXISTS cuadres_select_authed ON public.cuadres;
CREATE POLICY cuadres_all_auth
ON public.cuadres
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS dependientes_admin_insert ON public.dependientes;
DROP POLICY IF EXISTS dependientes_admin_update ON public.dependientes;
DROP POLICY IF EXISTS dependientes_admin_delete ON public.dependientes;
DROP POLICY IF EXISTS dependientes_select_authed ON public.dependientes;
CREATE POLICY dependientes_all_auth
ON public.dependientes
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 6) Asegurar acceso Data API explícito en las tablas compartidas críticas
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cuadres TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dependientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pin_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deudas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abonos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abono_aplicaciones TO authenticated;
GRANT ALL ON public.catalogo TO service_role;
GRANT ALL ON public.cuadres TO service_role;
GRANT ALL ON public.dependientes TO service_role;
GRANT ALL ON public.pin_users TO service_role;
GRANT ALL ON public.clientes TO service_role;
GRANT ALL ON public.deudas TO service_role;
GRANT ALL ON public.abonos TO service_role;
GRANT ALL ON public.abono_aplicaciones TO service_role;

-- 7) Función de abonos con soporte de crédito por sobrepago
CREATE OR REPLACE FUNCTION public.registrar_abono(
  _cliente_id uuid,
  _monto numeric,
  _aplicaciones jsonb,
  _usuario_id uuid DEFAULT NULL::uuid,
  _usuario_nombre text DEFAULT NULL::text,
  _nota text DEFAULT NULL::text,
  _fecha timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_abono_id UUID;
  v_app JSONB;
  v_deuda_id UUID;
  v_monto NUMERIC;
  v_saldo NUMERIC;
  v_total NUMERIC;
  v_nuevo_saldo NUMERIC;
  v_estado public.deuda_estado;
  v_sum NUMERIC := 0;
  v_credito NUMERIC := 0;
BEGIN
  IF _monto IS NULL OR _monto <= 0 THEN
    RAISE EXCEPTION 'El monto del abono debe ser mayor que 0';
  END IF;

  IF _aplicaciones IS NULL THEN
    _aplicaciones := '[]'::jsonb;
  END IF;

  FOR v_app IN SELECT * FROM jsonb_array_elements(_aplicaciones) LOOP
    v_sum := v_sum + COALESCE((v_app->>'monto')::NUMERIC, 0);
  END LOOP;

  IF ROUND(v_sum::NUMERIC, 2) > ROUND(_monto::NUMERIC, 2) THEN
    RAISE EXCEPTION 'La suma de aplicaciones (%) supera el monto del abono (%)', v_sum, _monto;
  END IF;

  v_credito := ROUND((_monto - v_sum)::NUMERIC, 2);

  INSERT INTO public.abonos(cliente_id, monto, fecha, usuario_id, usuario_nombre, nota, credito_generado)
  VALUES (_cliente_id, _monto, COALESCE(_fecha, now()), _usuario_id, _usuario_nombre, _nota, v_credito)
  RETURNING id INTO v_abono_id;

  FOR v_app IN SELECT * FROM jsonb_array_elements(_aplicaciones) LOOP
    v_deuda_id := (v_app->>'deuda_id')::UUID;
    v_monto := (v_app->>'monto')::NUMERIC;
    IF v_monto <= 0 THEN CONTINUE; END IF;

    SELECT saldo, total INTO v_saldo, v_total
    FROM public.deudas WHERE id = v_deuda_id AND cliente_id = _cliente_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Deuda % no encontrada para el cliente', v_deuda_id;
    END IF;
    IF v_monto > v_saldo + 0.001 THEN
      RAISE EXCEPTION 'Aplicación (%) supera el saldo (%) de la deuda %', v_monto, v_saldo, v_deuda_id;
    END IF;

    v_nuevo_saldo := ROUND((v_saldo - v_monto)::NUMERIC, 2);
    v_estado := CASE
      WHEN v_nuevo_saldo <= 0.001 THEN 'pagada'::public.deuda_estado
      WHEN v_nuevo_saldo < v_total THEN 'parcial'::public.deuda_estado
      ELSE 'pendiente'::public.deuda_estado
    END;

    INSERT INTO public.abono_aplicaciones(abono_id, deuda_id, monto)
    VALUES (v_abono_id, v_deuda_id, v_monto);

    UPDATE public.deudas
    SET saldo = v_nuevo_saldo, estado = v_estado, updated_at = now()
    WHERE id = v_deuda_id;
  END LOOP;

  IF v_credito > 0 THEN
    UPDATE public.clientes
    SET credito = COALESCE(credito, 0) + v_credito,
        updated_at = now()
    WHERE id = _cliente_id;
  END IF;

  INSERT INTO public.auditoria(usuario_id, usuario_nombre, accion, entidad, entidad_id, detalle)
  VALUES (_usuario_id, _usuario_nombre, 'registrar_abono', 'abonos', v_abono_id,
    jsonb_build_object('cliente_id', _cliente_id, 'monto', _monto, 'aplicaciones', _aplicaciones, 'credito_generado', v_credito));

  RETURN v_abono_id;
END;
$function$;

-- 8) Reversión con soporte de crédito
CREATE OR REPLACE FUNCTION public.revertir_abono(
  _abono_id uuid,
  _usuario_id uuid DEFAULT NULL::uuid,
  _usuario_nombre text DEFAULT NULL::text,
  _nota text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente UUID;
  v_monto NUMERIC;
  v_credito NUMERIC;
  v_reversa UUID;
  v_app RECORD;
  v_total NUMERIC;
  v_saldo NUMERIC;
  v_nuevo NUMERIC;
  v_estado public.deuda_estado;
BEGIN
  SELECT cliente_id, monto, COALESCE(credito_generado, 0) INTO v_cliente, v_monto, v_credito
  FROM public.abonos WHERE id = _abono_id AND reversa_de IS NULL AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abono % no encontrado o ya revertido', _abono_id;
  END IF;

  INSERT INTO public.abonos(cliente_id, monto, fecha, usuario_id, usuario_nombre, nota, reversa_de, credito_generado)
  VALUES (v_cliente, -v_monto, now(), _usuario_id, _usuario_nombre, COALESCE(_nota,'Reversión'), _abono_id, -v_credito)
  RETURNING id INTO v_reversa;

  FOR v_app IN SELECT deuda_id, monto FROM public.abono_aplicaciones WHERE abono_id = _abono_id LOOP
    SELECT saldo, total INTO v_saldo, v_total FROM public.deudas WHERE id = v_app.deuda_id FOR UPDATE;
    v_nuevo := ROUND((v_saldo + v_app.monto)::NUMERIC, 2);
    v_estado := CASE
      WHEN v_nuevo <= 0.001 THEN 'pagada'::public.deuda_estado
      WHEN v_nuevo < v_total THEN 'parcial'::public.deuda_estado
      ELSE 'pendiente'::public.deuda_estado
    END;
    UPDATE public.deudas SET saldo = v_nuevo, estado = v_estado, updated_at = now() WHERE id = v_app.deuda_id;
    INSERT INTO public.abono_aplicaciones(abono_id, deuda_id, monto)
    VALUES (v_reversa, v_app.deuda_id, -v_app.monto);
  END LOOP;

  IF v_credito <> 0 THEN
    UPDATE public.clientes
    SET credito = GREATEST(0, COALESCE(credito, 0) - v_credito),
        updated_at = now()
    WHERE id = v_cliente;
  END IF;

  INSERT INTO public.auditoria(usuario_id, usuario_nombre, accion, entidad, entidad_id, detalle)
  VALUES (_usuario_id, _usuario_nombre, 'revertir_abono', 'abonos', _abono_id,
    jsonb_build_object('reversa_id', v_reversa, 'monto', v_monto, 'credito_revertido', v_credito));

  RETURN v_reversa;
END;
$function$;