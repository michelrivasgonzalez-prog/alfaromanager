-- Conserva las columnas, tipos y permisos de la vista instalada. Solo la
-- cuenta de efectivo pendiente se amplía con los ajustes por confirmar.
do $$
declare
  vista_original text := pg_get_viewdef('public.fondo_sobrantes_saldo'::regclass);
  columnas text;
begin
  select string_agg(
    case when a.attname = 'pendiente_ingresar' then
      format('(coalesce(s.%1$I, 0) + coalesce(ajustes.monto, 0))::%2$s as %1$I',
        a.attname, format_type(a.atttypid, a.atttypmod))
    else format('s.%I', a.attname) end,
    ', ' order by a.attnum
  ) into columnas
  from pg_attribute a
  where a.attrelid = 'public.fondo_sobrantes_saldo'::regclass and a.attnum > 0 and not a.attisdropped;

  execute format(
    $vista$create or replace view public.fondo_sobrantes_saldo as
      select %s
      from (%s) s
      cross join (
        select sum((m.detalles #>> '{ajuste_pendiente,monto}')::numeric) as monto
        from public.fondo_sobrantes_movimientos m
        where m.tipo = 'ingreso' and m.estado = 'confirmado'
          and jsonb_typeof(m.detalles #> '{ajuste_pendiente,monto}') = 'number'
      ) ajustes$vista$,
    columnas, regexp_replace(btrim(vista_original), ';$', '')
  );
end;
$$;

create function public.conciliar_sobrante_editado(cuadre_id uuid, esperado numeric, token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  operador record;
  movimiento public.fondo_sobrantes_movimientos%rowtype;
  cuadre public.cuadres%rowtype;
  gestion jsonb;
  calculado numeric;
  ajuste_previo numeric;
  ajuste numeric;
  nuevo_monto numeric;
  fisico text;
  registrado jsonb;
begin
  select * into operador from private.operador_para_compensacion(token);
  if not found then raise insufficient_privilege; end if;

  -- Se usa el mismo orden de bloqueo que para confirmar un depósito.
  select m.* into movimiento from public.fondo_sobrantes_movimientos m
    where m.cuadre_id = conciliar_sobrante_editado.cuadre_id and m.tipo = 'ingreso'
    for update;
  if not found or movimiento.estado not in ('pendiente', 'confirmado') then
    raise exception 'El cuadre no tiene un ingreso de sobrante activo';
  end if;

  select c.* into cuadre from public.cuadres c
    where c.id = movimiento.cuadre_id and c.finalizado and c.deleted_at is null for update;
  gestion := cuadre.data -> 'sobranteGestion';
  if not found or jsonb_typeof(gestion) is distinct from 'object'
    or gestion ->> 'destino' is distinct from 'fondo_sobrantes' then
    raise exception 'El cuadre cerrado no tiene un sobrante registrado';
  end if;

  select round(c.diferencia, 2) into calculado from private.calcular_limite_salario(cuadre.data) c;
  if not coalesce(private.validar_importe_deuda(calculado), false) then
    raise exception 'El cuadre revisado no tiene un sobrante positivo válido';
  end if;
  if calculado is distinct from esperado then
    raise exception 'El sobrante cambió o el cuadre aún no se sincronizó. Actualiza Historial y revisa el importe.';
  end if;
  if movimiento.estado = 'confirmado' and calculado < movimiento.monto then
    raise exception 'El importe revisado es menor al efectivo confirmado. Revisa el movimiento antes de ajustarlo.';
  end if;

  ajuste_previo := coalesce((movimiento.detalles #>> '{ajuste_pendiente,monto}')::numeric, 0);
  ajuste := case when movimiento.estado = 'confirmado' then calculado - movimiento.monto else 0 end;
  nuevo_monto := case when movimiento.estado = 'pendiente' then calculado else movimiento.monto end;
  fisico := case when movimiento.estado = 'confirmado' and ajuste = 0 then 'confirmado' else 'pendiente_confirmacion' end;

  if nuevo_monto = movimiento.monto and ajuste = ajuste_previo
    and (gestion ->> 'importe')::numeric is not distinct from calculado
    and gestion ->> 'estadoFisico' is not distinct from fisico then
    return to_jsonb(movimiento);
  end if;

  registrado := jsonb_build_object(
    'monto', ajuste,
    'total', calculado,
    'total_anterior', movimiento.monto + ajuste_previo,
    'registrado_por', operador.nombre,
    'registrado_por_uid', operador.usuario_id,
    'registrado_en', now()
  );
  update public.fondo_sobrantes_movimientos m
    set monto = nuevo_monto,
      detalles = (m.detalles - 'ajuste_pendiente')
        || jsonb_build_object('ajuste_cuadre', registrado)
        || case when ajuste > 0 then jsonb_build_object('ajuste_pendiente', registrado) else '{}'::jsonb end
    where m.id = movimiento.id returning m.* into movimiento;
  update public.cuadres c
    set data = jsonb_set(c.data, '{sobranteGestion}',
      gestion || jsonb_build_object('importe', calculado, 'estadoFisico', fisico))
    where c.id = cuadre.id;
  return to_jsonb(movimiento);
end;
$$;

create function public.confirmar_ajuste_sobrante(movimiento_id uuid, esperado numeric, token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  operador record;
  movimiento public.fondo_sobrantes_movimientos%rowtype;
  cuadre public.cuadres%rowtype;
  pendiente jsonb;
  delta numeric;
  total numeric;
  calculado numeric;
begin
  select * into operador from private.operador_para_compensacion(token);
  if not found then raise insufficient_privilege; end if;

  select m.* into movimiento from public.fondo_sobrantes_movimientos m
    where m.id = confirmar_ajuste_sobrante.movimiento_id and m.tipo = 'ingreso' and m.estado = 'confirmado'
    for update;
  if not found then raise exception 'El movimiento no tiene un ingreso confirmado'; end if;

  pendiente := movimiento.detalles -> 'ajuste_pendiente';
  if pendiente is null then
    if esperado = movimiento.monto
      and esperado = (movimiento.detalles #>> '{ajuste_confirmado,total}')::numeric then
      return to_jsonb(movimiento);
    end if;
    raise exception 'El movimiento ya no tiene ese ajuste pendiente';
  end if;

  delta := (pendiente ->> 'monto')::numeric;
  total := (pendiente ->> 'total')::numeric;
  if not coalesce(private.validar_importe_deuda(delta), false)
    or total is distinct from movimiento.monto + delta
    or total is distinct from esperado then
    raise exception 'El importe del ajuste cambió. Actualiza el movimiento y revisa el efectivo.';
  end if;

  select c.* into cuadre from public.cuadres c
    where c.id = movimiento.cuadre_id and c.finalizado and c.deleted_at is null for update;
  if not found or jsonb_typeof(cuadre.data -> 'sobranteGestion') is distinct from 'object'
    or (cuadre.data #>> '{sobranteGestion,importe}')::numeric is distinct from total then
    raise exception 'El ajuste requiere conciliación con su cuadre';
  end if;
  select round(c.diferencia, 2) into calculado from private.calcular_limite_salario(cuadre.data) c;
  if calculado is distinct from total then
    raise exception 'El cuadre se editó después del ajuste. Concilia el nuevo importe antes de confirmar.';
  end if;

  perform pg_advisory_xact_lock(71342110);
  update public.fondo_sobrantes_movimientos m
    set monto = total,
      detalles = (m.detalles - 'ajuste_pendiente') || jsonb_build_object('ajuste_confirmado',
        pendiente || jsonb_build_object(
          'confirmado_por', operador.nombre,
          'confirmado_por_uid', operador.usuario_id,
          'confirmado_en', now()
        ))
    where m.id = movimiento.id returning m.* into movimiento;
  update public.cuadres c
    set data = jsonb_set(c.data, '{sobranteGestion,estadoFisico}', '"confirmado"'::jsonb)
    where c.id = cuadre.id;
  return to_jsonb(movimiento);
end;
$$;

revoke execute on function public.conciliar_sobrante_editado(uuid, numeric, text),
  public.confirmar_ajuste_sobrante(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.conciliar_sobrante_editado(uuid, numeric, text),
  public.confirmar_ajuste_sobrante(uuid, numeric, text) to authenticated;
