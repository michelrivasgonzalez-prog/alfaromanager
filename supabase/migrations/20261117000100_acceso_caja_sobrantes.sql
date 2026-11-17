-- Aprovisionar las cuentas de caja desde SQL Editor después de crear
-- usuarios de Auth individuales y verificar sus correos.
create table private.operadores_caja_sobrantes (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (btrim(nombre) <> ''),
  rol text not null check (rol in ('admin', 'duena'))
);

alter table private.operadores_caja_sobrantes enable row level security;
revoke all on private.operadores_caja_sobrantes from public, anon, authenticated;
revoke all on public.fondo_sobrantes_movimientos from public, anon, authenticated;
revoke all on public.fondo_sobrantes_auditoria from public, anon, authenticated;
revoke all on public.fondo_sobrantes_saldo from public, anon, authenticated;

create function public.operar_caja_sobrantes(accion text, solicitud jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operador private.operadores_caja_sobrantes%rowtype;
  movimiento public.fondo_sobrantes_movimientos%rowtype;
  cuadre public.cuadres%rowtype;
  gestion jsonb;
  importe numeric;
  motivo_operacion text;
  identificador uuid;
  actor text;
  fecha_operacion timestamptz := now();
  desde date;
  hasta date;
begin
  select o.* into operador
    from private.operadores_caja_sobrantes o
    join auth.users u on u.id = o.usuario_id
    where o.usuario_id = auth.uid()
      and u.is_anonymous is false
      and u.email_confirmed_at is not null;
  if not found then
    raise exception 'Se requiere una cuenta de caja autorizada' using errcode = '42501';
  end if;
  actor := operador.nombre;

  if accion = 'listar' then
    return jsonb_build_object(
      'saldo', (select to_jsonb(s) from public.fondo_sobrantes_saldo s),
      'movimientos', coalesce((
        select jsonb_agg(to_jsonb(m) order by m.realizado_en desc, m.id)
        from public.fondo_sobrantes_movimientos m
      ), '[]'::jsonb)
    );
  end if;

  if accion in ('consultar', 'reclasificar') then
    identificador := (solicitud ->> 'cuadreId')::uuid;
    select * into movimiento from public.fondo_sobrantes_movimientos
      where cuadre_id = identificador and tipo = 'ingreso';
    if accion = 'consultar' then
      return jsonb_build_object(
        'movimiento', case when movimiento.id is not null then to_jsonb(movimiento) end,
        'auditoria', coalesce((
          select jsonb_agg(to_jsonb(a) order by a.fecha desc, a.id)
          from public.fondo_sobrantes_auditoria a where a.movimiento_id = movimiento.id
        ), '[]'::jsonb)
      );
    end if;

    select * into cuadre from public.cuadres
      where id = identificador and finalizado and deleted_at is null for update;
    if not found then
      raise exception 'El cuadre cerrado no está disponible';
    end if;
    select * into movimiento from public.fondo_sobrantes_movimientos
      where cuadre_id = identificador and tipo = 'ingreso';
    if found then
      return to_jsonb(movimiento);
    end if;
    if jsonb_typeof(cuadre.data -> 'sobranteGestion') = 'object' then
      raise exception 'El cuadre ya fue revisado y requiere conciliación de su movimiento';
    end if;
    if (solicitud -> 'datos') is distinct from cuadre.data then
      raise exception 'El cuadre cambió. Sincroniza el historial y vuelve a revisar.';
    end if;
  end if;

  if accion in ('reclasificar', 'retirar') then
    importe := (solicitud ->> 'monto')::numeric;
    motivo_operacion := btrim(solicitud ->> 'motivo');
    if importe is null or importe <= 0 or importe > 999999999999.99 or importe <> round(importe, 2)
      or coalesce(motivo_operacion, '') = '' then
      raise exception 'Indica un importe válido en CUP y un motivo';
    end if;
  end if;

  if accion = 'reclasificar' then
    select min(dia::date), max(dia::date) into desde, hasta
      from jsonb_array_elements_text(coalesce(cuadre.data -> 'diasTrabajados', '[]'::jsonb)) dia;
    gestion := jsonb_build_object(
      'version', 1,
      'destino', 'fondo_sobrantes',
      'importe', importe,
      'estadoFisico', 'pendiente_confirmacion',
      'salarioBrutoCalculado', (solicitud ->> 'salarioBruto')::numeric,
      'salarioPagadoReal', (solicitud ->> 'salarioPagado')::numeric,
      'regimenDesde', '2026-11-10',
      'revisadoPor', actor,
      'revisadoEn', fecha_operacion,
      'nota', motivo_operacion
    );
    insert into public.fondo_sobrantes_movimientos (
      cuadre_id, punto_venta, tipo, estado, monto, dependiente, periodo_desde, periodo_hasta,
      motivo, realizado_por, detalles
    ) values (
      cuadre.id, cuadre.punto_venta, 'ingreso', 'pendiente', importe, cuadre.dependiente,
      coalesce(desde, (cuadre.fecha at time zone 'America/Havana')::date),
      coalesce(hasta, (cuadre.fecha at time zone 'America/Havana')::date),
      motivo_operacion, actor, jsonb_build_object('realizado_por_uid', operador.usuario_id)
    ) returning * into movimiento;
    update public.cuadres set data = jsonb_set(data, '{sobranteGestion}', gestion) where id = cuadre.id;
    return to_jsonb(movimiento);
  end if;

  if accion = 'confirmar' then
    identificador := (solicitud ->> 'movimientoId')::uuid;
    select * into movimiento from public.fondo_sobrantes_movimientos
      where id = identificador and tipo = 'ingreso' for update;
    if not found or movimiento.estado = 'anulado' then
      raise exception 'El ingreso no se puede confirmar';
    end if;
    if movimiento.estado = 'confirmado' then
      return to_jsonb(movimiento);
    end if;
    select * into cuadre from public.cuadres where id = movimiento.cuadre_id for update;
    if jsonb_typeof(cuadre.data -> 'sobranteGestion') is distinct from 'object'
       or (cuadre.data #>> '{sobranteGestion,importe}')::numeric is distinct from movimiento.monto then
      raise exception 'El importe del movimiento requiere conciliación con su cuadre';
    end if;
    perform pg_advisory_xact_lock(71342110);
    update public.fondo_sobrantes_movimientos
      set estado = 'confirmado', confirmado_por = actor, confirmado_en = fecha_operacion,
          detalles = detalles || jsonb_build_object('confirmado_por_uid', operador.usuario_id)
      where id = identificador returning * into movimiento;
    update public.cuadres
      set data = jsonb_set(data, '{sobranteGestion,estadoFisico}', '"confirmado"'::jsonb)
      where id = cuadre.id;
    return to_jsonb(movimiento);
  end if;

  if accion = 'retirar' then
    identificador := (solicitud ->> 'movimientoId')::uuid;
    if identificador is null then
      raise exception 'Falta el identificador del retiro';
    end if;
    perform pg_advisory_xact_lock(71342110);
    select * into movimiento from public.fondo_sobrantes_movimientos where id = identificador;
    if found then
      if movimiento.tipo = 'retiro' and movimiento.monto = importe
        and movimiento.motivo = motivo_operacion
        and movimiento.detalles ->> 'realizado_por_uid' = operador.usuario_id::text then
        return to_jsonb(movimiento);
      end if;
      raise exception 'El identificador del retiro ya está en uso';
    end if;
    insert into public.fondo_sobrantes_movimientos (
      id, tipo, estado, monto, motivo, realizado_por, confirmado_por, confirmado_en, detalles
    ) values (
      identificador, 'retiro', 'confirmado', importe, motivo_operacion, actor, actor, fecha_operacion,
      jsonb_build_object('realizado_por_uid', operador.usuario_id, 'confirmado_por_uid', operador.usuario_id)
    ) returning * into movimiento;
    return to_jsonb(movimiento);
  end if;

  raise exception 'Operación de caja desconocida';
end;
$$;

revoke execute on function public.operar_caja_sobrantes(text, jsonb) from public, anon, authenticated;
grant execute on function public.operar_caja_sobrantes(text, jsonb) to authenticated;
