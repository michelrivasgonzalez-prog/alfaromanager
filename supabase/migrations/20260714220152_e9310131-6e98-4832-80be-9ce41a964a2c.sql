
-- RPC: registrar_abono (transaccional)
CREATE OR REPLACE FUNCTION public.registrar_abono(
  _cliente_id UUID,
  _monto NUMERIC,
  _aplicaciones JSONB, -- [{deuda_id, monto}, ...]
  _usuario_id UUID DEFAULT NULL,
  _usuario_nombre TEXT DEFAULT NULL,
  _nota TEXT DEFAULT NULL,
  _fecha TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  IF _monto IS NULL OR _monto <= 0 THEN
    RAISE EXCEPTION 'El monto del abono debe ser mayor que 0';
  END IF;

  -- Validar suma de aplicaciones
  FOR v_app IN SELECT * FROM jsonb_array_elements(_aplicaciones) LOOP
    v_sum := v_sum + COALESCE((v_app->>'monto')::NUMERIC, 0);
  END LOOP;
  IF ROUND(v_sum::NUMERIC, 2) > ROUND(_monto::NUMERIC, 2) THEN
    RAISE EXCEPTION 'La suma de aplicaciones (%) supera el monto del abono (%)', v_sum, _monto;
  END IF;

  -- Insertar abono
  INSERT INTO public.abonos(cliente_id, monto, fecha, usuario_id, usuario_nombre, nota)
  VALUES (_cliente_id, _monto, COALESCE(_fecha, now()), _usuario_id, _usuario_nombre, _nota)
  RETURNING id INTO v_abono_id;

  -- Aplicar a cada deuda
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

  -- Auditoría
  INSERT INTO public.auditoria(usuario_id, usuario_nombre, accion, entidad, entidad_id, detalle)
  VALUES (_usuario_id, _usuario_nombre, 'registrar_abono', 'abonos', v_abono_id,
    jsonb_build_object('cliente_id', _cliente_id, 'monto', _monto, 'aplicaciones', _aplicaciones));

  RETURN v_abono_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_abono(UUID, NUMERIC, JSONB, UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated, anon, service_role;

-- RPC: revertir_abono (crea abono espejo negativo y revierte saldos)
CREATE OR REPLACE FUNCTION public.revertir_abono(
  _abono_id UUID,
  _usuario_id UUID DEFAULT NULL,
  _usuario_nombre TEXT DEFAULT NULL,
  _nota TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente UUID;
  v_monto NUMERIC;
  v_reversa UUID;
  v_app RECORD;
  v_total NUMERIC;
  v_saldo NUMERIC;
  v_nuevo NUMERIC;
  v_estado public.deuda_estado;
BEGIN
  SELECT cliente_id, monto INTO v_cliente, v_monto
  FROM public.abonos WHERE id = _abono_id AND reversa_de IS NULL AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abono % no encontrado o ya revertido', _abono_id;
  END IF;

  INSERT INTO public.abonos(cliente_id, monto, fecha, usuario_id, usuario_nombre, nota, reversa_de)
  VALUES (v_cliente, -v_monto, now(), _usuario_id, _usuario_nombre, COALESCE(_nota,'Reversión'), _abono_id)
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

  INSERT INTO public.auditoria(usuario_id, usuario_nombre, accion, entidad, entidad_id, detalle)
  VALUES (_usuario_id, _usuario_nombre, 'revertir_abono', 'abonos', _abono_id,
    jsonb_build_object('reversa_id', v_reversa, 'monto', v_monto));

  RETURN v_reversa;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revertir_abono(UUID, UUID, TEXT, TEXT) TO authenticated, anon, service_role;
