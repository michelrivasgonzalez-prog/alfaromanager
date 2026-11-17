create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table private.pines_caja (
  usuario_id uuid primary key,
  nombre text not null check (btrim(nombre) <> ''),
  rol text not null check (rol in ('admin', 'duena')),
  hash text not null
);

create table private.sesiones_caja_pin (
  hash_token bytea primary key,
  usuario_id uuid not null references private.pines_caja(usuario_id) on delete cascade,
  dispositivo_id uuid not null references auth.users(id) on delete cascade,
  vence timestamptz not null
);

create unique index sesiones_caja_pin_dispositivo on private.sesiones_caja_pin(dispositivo_id);

create table private.intentos_caja_pin (
  id boolean primary key check (id),
  fallos timestamptz[] not null default '{}'
);
insert into private.intentos_caja_pin(id) values (true);

alter table private.pines_caja enable row level security;
alter table private.sesiones_caja_pin enable row level security;
alter table private.intentos_caja_pin enable row level security;
revoke all on private.pines_caja, private.sesiones_caja_pin, private.intentos_caja_pin from public, anon, authenticated;

-- Aprovisionamiento exclusivo del SQL Editor. El PIN privado nunca se copia
-- a pin_users, cuyo hash de compatibilidad se sincroniza con los dispositivos.
create function private.configurar_pin_caja(perfil uuid, nombre_operador text, rol_operador text, pin text)
returns void language plpgsql set search_path = '' as $$
begin
  if pin is null or pin !~ '^[0-9]{6}$' or nombre_operador is null or btrim(nombre_operador) = ''
    or rol_operador is null or rol_operador not in ('admin', 'duena') then
    raise exception 'Indica un perfil, nombre, rol autorizado y PIN de seis dígitos';
  end if;
  if not exists (select 1 from public.pin_users where id = perfil and role = rol_operador and deleted_at is null) then
    raise exception 'El UUID no corresponde a un perfil activo con ese rol';
  end if;
  perform pg_advisory_xact_lock(71342111);
  if exists (
    select 1 from public.pin_users p
    where p.pin_hash = encode(sha256(convert_to('alfaro::' || p.id::text || '::' || pin, 'UTF8')), 'hex')
  ) or exists (
    select 1 from private.pines_caja p where p.hash = extensions.crypt(pin, p.hash)
  ) then
    raise exception 'Elige un PIN nuevo que no se haya usado en la aplicación';
  end if;
  insert into private.pines_caja(usuario_id, nombre, rol, hash)
    values (perfil, btrim(nombre_operador), rol_operador, extensions.crypt(pin, extensions.gen_salt('bf', 10)))
    on conflict (usuario_id) do update
      set nombre = excluded.nombre, rol = excluded.rol, hash = excluded.hash;
  delete from private.sesiones_caja_pin where usuario_id = perfil;
end;
$$;
revoke execute on function private.configurar_pin_caja(uuid, text, text, text) from public, anon, authenticated;

-- Genera el PIN inicial sin escribirlo en la consulta ni en GitHub.
create function private.emitir_pin_caja(perfil uuid)
returns text language plpgsql set search_path = '' as $$
declare
  operador public.pin_users%rowtype;
  bytes bytea := extensions.gen_random_bytes(4);
  numero bigint;
  pin_nuevo text;
begin
  select * into operador from public.pin_users where id = perfil and deleted_at is null;
  if not found then
    raise exception 'No se encontró el perfil activo';
  end if;
  numero := get_byte(bytes, 0)::bigint * 16777216
    + get_byte(bytes, 1) * 65536 + get_byte(bytes, 2) * 256 + get_byte(bytes, 3);
  pin_nuevo := (100000 + numero % 900000)::text;
  perform private.configurar_pin_caja(perfil, operador.nombre, operador.role, pin_nuevo);
  return pin_nuevo;
end;
$$;
revoke execute on function private.emitir_pin_caja(uuid) from public, anon, authenticated;

create function public.iniciar_caja_con_pin(pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  dispositivo uuid := auth.uid();
  operador private.pines_caja%rowtype;
  token text;
  ahora timestamptz := clock_timestamp();
  intentos timestamptz[];
  vencimiento timestamptz;
begin
  if dispositivo is null or pin is null or pin !~ '^[0-9]{6}$' then
    return null;
  end if;

  -- Límite compartido: abrir otra sesión anónima no restablece los intentos.
  perform pg_advisory_xact_lock(71342111);
  select array(select f from unnest(i.fallos) f where f > ahora - interval '5 minutes')
    into intentos from private.intentos_caja_pin i where i.id;
  if cardinality(intentos) >= 12 then
    return jsonb_build_object('limitado', true);
  end if;

  select p.* into operador from private.pines_caja p
    where p.hash = extensions.crypt(pin, p.hash);
  if not found then
    update private.intentos_caja_pin set fallos = array_append(intentos, ahora);
    return null;
  end if;

  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  vencimiento := ahora + interval '8 hours';
  delete from private.sesiones_caja_pin where dispositivo_id = dispositivo or vence <= ahora;
  insert into private.sesiones_caja_pin(hash_token, usuario_id, dispositivo_id, vence)
    values (sha256(convert_to(token, 'UTF8')), operador.usuario_id, dispositivo, vencimiento);
  return jsonb_build_object('usuario_id', operador.usuario_id, 'rol', operador.rol,
                            'token', token, 'vence', vencimiento);
end;
$$;

create function public.cerrar_caja_con_pin(token text)
returns void language sql security definer set search_path = '' as $$
  delete from private.sesiones_caja_pin
  where dispositivo_id = auth.uid() and hash_token = sha256(convert_to(token, 'UTF8'));
$$;

revoke execute on function public.iniciar_caja_con_pin(text), public.cerrar_caja_con_pin(text)
  from public, anon, authenticated;
grant execute on function public.iniciar_caja_con_pin(text), public.cerrar_caja_con_pin(text)
  to authenticated;

-- El inicio por correo queda deshabilitado una vez aplicado el cambio.
drop function public.operar_caja_sobrantes(text, jsonb);

create function public.operar_caja_sobrantes(accion text, solicitud jsonb, token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operador private.pines_caja%rowtype;
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
    from private.pines_caja o
    join private.sesiones_caja_pin s on s.usuario_id = o.usuario_id
    where s.dispositivo_id = auth.uid()
      and s.vence > clock_timestamp()
      and s.hash_token = sha256(convert_to(token, 'UTF8'));
  if not found then
    raise exception 'Vuelve a entrar a la aplicación con un PIN autorizado' using errcode = '42501';
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

revoke execute on function public.operar_caja_sobrantes(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.operar_caja_sobrantes(text, jsonb, text) to authenticated;
