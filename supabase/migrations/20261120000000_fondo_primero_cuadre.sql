-- Cierre con Fondo de Sobrantes antes de descontar salario. El comando
-- permite repetir el guardado si se pierde la respuesta de la transacción.
create table private.cierres_cuadre_fondo (
  operacion uuid primary key,
  cuadre_id uuid not null references public.cuadres(id),
  operador_id uuid not null,
  solicitud jsonb not null,
  esperado jsonb,
  resultado jsonb not null,
  creado_en timestamptz not null default now()
);
alter table private.cierres_cuadre_fondo enable row level security;
revoke all on private.cierres_cuadre_fondo from public, anon, authenticated;

create function private.localizar_deuda_faltante_cuadre(cuadre_id uuid, datos jsonb)
returns uuid language plpgsql stable set search_path = '' as $$
declare
  vinculada uuid := (datos ->> 'deudaDependienteId')::uuid;
  candidatas uuid[];
begin
  select array_agg(d.id) into candidatas from public.deudas d
  where d.cuadre_id = localizar_deuda_faltante_cuadre.cuadre_id
    and (d.id = vinculada or (d.deleted_at is null and d.cuadre_label ilike 'Faltante%'));
  if coalesce(cardinality(candidatas), 0) > 1
    or (vinculada is not null and not coalesce(vinculada = any(candidatas), false)) then
    raise exception 'Los vínculos del faltante requieren revisión antes de usar el fondo.';
  end if;
  return candidatas[1];
end;
$$;

-- Un abono previo solo cuenta si su deuda, aplicación y retiro están unidos
-- al mismo turno y la suma explica el saldo completo de la deuda.
create function private.fondo_previo_del_cuadre(cuadre_id uuid, datos jsonb, deuda_id uuid)
returns table (
  monto_aplicado numeric,
  ultimo_movimiento uuid,
  monto_heredado numeric,
  movimientos_heredados uuid[],
  abonos_heredados uuid[]
)
language plpgsql stable set search_path = '' as $$
declare
  cuenta public.deudas%rowtype;
  previo jsonb := datos -> 'fondoFaltante';
  confirmado public.fondo_sobrantes_movimientos%rowtype;
  aplicaciones integer;
  servidas integer;
begin
  monto_heredado := 0;
  movimientos_heredados := '{}'::uuid[];
  abonos_heredados := '{}'::uuid[];

  if deuda_id is not null then
    select d.* into cuenta from public.deudas d
    join public.clientes c on c.id = d.cliente_id
    where d.id = deuda_id and d.cuadre_id = fondo_previo_del_cuadre.cuadre_id
      and d.deleted_at is null and c.deleted_at is null
      and private.nombre_deudor(c.nombre) = private.nombre_deudor(datos ->> 'dependiente');
    if not found then raise exception 'La deuda del faltante no corresponde a la dependienta y al turno.'; end if;

    select count(*), count(*) filter (where valido),
      coalesce(sum(monto) filter (where valido), 0),
      coalesce(array_agg(movimiento order by creado, movimiento) filter (where valido), '{}'::uuid[]),
      coalesce(array_agg(abono order by creado, movimiento) filter (where valido), '{}'::uuid[])
    into aplicaciones, servidas, monto_heredado, movimientos_heredados, abonos_heredados
    from (
      select p.monto, m.id as movimiento, a.id as abono, m.realizado_en as creado,
        coalesce(
          a.origen = 'fondo_sobrantes' and a.deleted_at is null and a.reversa_de is null
          and a.cliente_id = cuenta.cliente_id and a.monto = p.monto
          and coalesce(a.credito_generado, 0) = 0
          and private.validar_importe_deuda(p.monto) and m.monto = p.monto
          and m.tipo = 'retiro' and m.estado = 'confirmado'
          and m.detalles ->> 'origen' = 'compensacion_deuda'
          and m.detalles ->> 'deuda_id' = fondo_previo_del_cuadre.deuda_id::text
          and m.detalles ->> 'cliente_id' = cuenta.cliente_id::text
          and not exists (
            select 1 from public.abono_aplicaciones otra
            where otra.abono_id = p.abono_id and otra.id <> p.id
          ), false
        ) as valido
      from public.abono_aplicaciones p
      left join public.abonos a on a.id = p.abono_id
      left join public.fondo_sobrantes_movimientos m on m.id = a.fondo_movimiento_id
      where p.deuda_id = fondo_previo_del_cuadre.deuda_id
    ) a;

    if aplicaciones <> servidas or cuenta.total is distinct from cuenta.saldo + monto_heredado
      or (aplicaciones > 0 and jsonb_typeof(previo) is distinct from 'object'
        and (cuenta.saldo <> 0 or cuenta.estado <> 'pagada'))
      or (aplicaciones = 0 and cuenta.saldo > 0 and cuenta.estado <> 'pendiente') then
      raise exception 'La deuda del turno tiene cobros previos o un saldo que requiere revisión.';
    end if;
  end if;

  monto_aplicado := monto_heredado;
  ultimo_movimiento := movimientos_heredados[cardinality(movimientos_heredados)];
  if jsonb_typeof(previo) = 'object' then
    monto_aplicado := (previo ->> 'monto')::numeric;
    ultimo_movimiento := (previo ->> 'movimientoId')::uuid;
    select * into confirmado from public.fondo_sobrantes_movimientos where id = ultimo_movimiento;
    if not found or confirmado.tipo <> 'retiro' or confirmado.estado <> 'confirmado'
      or not coalesce(private.validar_importe_deuda(monto_aplicado), false)
      or not coalesce(
        (ultimo_movimiento = any(movimientos_heredados) and monto_aplicado = monto_heredado)
        or (
          confirmado.detalles ->> 'origen' = 'faltante_cuadre'
          and confirmado.detalles ->> 'cuadre_id' = fondo_previo_del_cuadre.cuadre_id::text
          and (confirmado.detalles ->> 'monto_total')::numeric = monto_aplicado
          and (confirmado.detalles ->> 'monto_heredado')::numeric = monto_heredado
        ), false
      ) then
      raise exception 'El fondo aplicado al cuadre no coincide con los movimientos confirmados.';
    end if;
  end if;
  return next;
end;
$$;

create function public.consultar_fondo_para_cuadre(cuadre_id uuid, token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  datos jsonb;
  previo record;
begin
  if not exists (select 1 from private.operador_para_compensacion(token)) then raise insufficient_privilege; end if;
  select c.data into datos from public.cuadres c
  where c.id = consultar_fondo_para_cuadre.cuadre_id and c.finalizado and c.deleted_at is null;
  begin
    if datos is null then
      return jsonb_build_object('saldoDisponible', (select saldo_disponible from public.fondo_sobrantes_saldo),
        'montoAplicado', 0);
    end if;
    select * into previo from private.fondo_previo_del_cuadre(cuadre_id, datos,
      private.localizar_deuda_faltante_cuadre(cuadre_id, datos));
  exception when raise_exception then
    return jsonb_build_object(
      'saldoDisponible', (select saldo_disponible from public.fondo_sobrantes_saldo),
      'montoAplicado', 0, 'requiereRevision', sqlerrm);
  end;
  return jsonb_build_object('saldoDisponible', (select saldo_disponible from public.fondo_sobrantes_saldo),
    'montoAplicado', previo.monto_aplicado);
end;
$$;

create function public.cerrar_cuadre_con_fondo(datos jsonb, operacion uuid, esperado jsonb, token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  operador record;
  id_cuadre uuid := (datos ->> 'id')::uuid;
  propuesta numeric := (datos ->> 'fondoFaltantePropuesto')::numeric;
  solicitud jsonb := datos;
  repetido private.cierres_cuadre_fondo%rowtype;
  anterior public.cuadres%rowtype;
  cuenta public.deudas%rowtype;
  calculo record;
  previo record;
  id_deuda uuid;
  id_cliente uuid;
  id_movimiento uuid;
  id_abono uuid;
  abono public.abonos%rowtype;
  clientes uuid[];
  faltante numeric;
  bruto numeric;
  residual numeric;
  total_deuda numeric;
  disponible_salario numeric;
  diferencia_fondo numeric;
  descuento numeric;
  total_abono numeric;
  billetes jsonb := coalesce(nullif(datos -> 'salarioDenominaciones', 'null'::jsonb), '{}'::jsonb);
  pagado numeric;
  plan jsonb := datos -> 'planAbonoSalario';
  aplicaciones jsonb;
  esperadas integer;
  deuda record;
  nombre_dependiente text := btrim(datos ->> 'dependiente');
  fecha_cuadre timestamptz := (datos ->> 'fecha')::timestamptz;
  faltante_nuevo boolean;
begin
  select * into operador from private.operador_para_compensacion(token);
  if not found then raise insufficient_privilege; end if;
  if operacion is null or id_cuadre is null or (datos ->> 'finalizado')::boolean is distinct from true
    or fecha_cuadre is null or coalesce(nombre_dependiente, '') = ''
    or not coalesce(private.validar_importe_deuda(propuesta), false) then
    raise exception 'Completa el cuadre y el importe que vas a aplicar del fondo.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(operacion::text, 43149051));
  select * into repetido from private.cierres_cuadre_fondo c where c.operacion = cerrar_cuadre_con_fondo.operacion;
  if found then
    if repetido.operador_id is distinct from operador.usuario_id or repetido.solicitud is distinct from solicitud
      or repetido.esperado is distinct from nullif(esperado, 'null'::jsonb) then
      raise exception 'El identificador ya pertenece a otro guardado. Vuelve a abrir el cuadre.';
    end if;
    return repetido.resultado;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(id_cuadre::text, 43149050));
  select * into anterior from public.cuadres where id = id_cuadre for update;
  if anterior.data is distinct from nullif(esperado, 'null'::jsonb)
    or (anterior.id is not null and (not anterior.finalizado or anterior.deleted_at is not null)) then
    raise exception 'El cuadre volvió a cambiar. Actualiza el historial antes de guardar.';
  end if;
  if anterior.id is not null and (
    private.nombre_deudor(anterior.dependiente) is distinct from private.nombre_deudor(nombre_dependiente)
    or anterior.punto_venta is distinct from (datos ->> 'puntoVenta')
  ) then
    raise exception 'No se puede cambiar la dependienta ni el punto de venta al aplicar el fondo.';
  end if;

  -- No conciliar un sobrante depositado como si fuera un faltante nuevo.
  if jsonb_typeof(anterior.data -> 'sobranteGestion') = 'object' or exists (
    select 1 from public.fondo_sobrantes_movimientos m where m.cuadre_id = id_cuadre
      and m.tipo = 'ingreso' and m.estado <> 'anulado'
  ) then
    raise exception 'Este cuadre ya tiene un sobrante registrado. Revísalo antes de aplicar el fondo.';
  end if;

  select * into calculo from private.calcular_limite_salario(datos);
  faltante := greatest(0, round(-calculo.diferencia, 2));
  bruto := round(calculo.bruto, 2);
  if faltante < propuesta or bruto is null or bruto < 0 then
    raise exception 'El importe del fondo no puede exceder el faltante bruto del cuadre.';
  end if;

  -- El mismo candado que usan retiros, compensaciones y confirmaciones.
  perform pg_advisory_xact_lock(71342110);
  id_deuda := private.localizar_deuda_faltante_cuadre(id_cuadre, anterior.data);
  if id_deuda is not null then
    select * into cuenta from public.deudas where id = id_deuda for update;
  end if;
  select * into previo from private.fondo_previo_del_cuadre(id_cuadre,
    anterior.data, id_deuda);
  if propuesta < previo.monto_aplicado then
    raise exception 'No se puede bajar un importe del fondo que ya fue aplicado. Revisa la caja.';
  end if;
  diferencia_fondo := propuesta - previo.monto_aplicado;
  if diferencia_fondo > (select saldo_disponible from public.fondo_sobrantes_saldo) then
    raise exception 'El saldo confirmado del fondo ya no alcanza para este cierre.';
  end if;
  residual := greatest(0, faltante - propuesta - bruto);
  disponible_salario := greatest(0, bruto - (faltante - propuesta));
  total_deuda := previo.monto_heredado + residual;
  faltante_nuevo := id_deuda is null and residual > 0;

  if faltante_nuevo then
    -- Serializa la búsqueda y el alta también con las escrituras normales de
    -- Cuentas por cobrar. Si falla el cierre, la ficha nueva se revierte.
    lock table public.clientes in share row exclusive mode;
    select array_agg(c.id) into clientes from public.clientes c
    where private.nombre_deudor(c.nombre) = private.nombre_deudor(nombre_dependiente)
      and c.deleted_at is null;
    if coalesce(cardinality(clientes), 0) > 1 then
      raise exception 'La dependienta tiene más de una ficha activa en Cuentas por cobrar. Revisa cuál corresponde.';
    elsif coalesce(cardinality(clientes), 0) = 0 then
      insert into public.clientes(nombre) values (nombre_dependiente) returning id into id_cliente;
    else
      id_cliente := clientes[1];
    end if;
  end if;

  descuento := coalesce((datos ->> 'descuentoDeudas')::numeric, 0);
  id_abono := (anterior.data ->> 'abonoDeudasId')::uuid;
  if id_abono is not null then
    select * into abono from public.abonos a where a.id = id_abono and a.deleted_at is null
      and a.origen = 'salario' and a.cuadre_id = id_cuadre and a.reversa_de is null;
    if not found or jsonb_typeof(plan) = 'object' or descuento is distinct from abono.monto then
      raise exception 'Este cuadre ya tiene un abono salarial. Conserva ese abono o revisa su corrección.';
    end if;
  elsif jsonb_typeof(plan) = 'object' then
    id_cliente := (plan ->> 'clienteId')::uuid;
    aplicaciones := plan -> 'aplicaciones';
    if not exists (select 1 from public.clientes c where c.id = id_cliente and c.deleted_at is null
      and private.nombre_deudor(c.nombre) = private.nombre_deudor(nombre_dependiente)) then
      raise exception 'El cliente del abono salarial no corresponde a la dependienta.';
    end if;
    select count(*), sum(a.monto) into esperadas, total_abono
    from jsonb_to_recordset(aplicaciones) a(deuda_id uuid, monto numeric);
    if esperadas = 0 or descuento is distinct from total_abono or exists (
      select 1 from jsonb_to_recordset(aplicaciones) a(deuda_id uuid, monto numeric)
      group by a.deuda_id having a.deuda_id is null or count(*) <> 1
        or not bool_and(coalesce(private.validar_importe_deuda(a.monto), false))
    ) then raise exception 'Revisa los importes del abono salarial.'; end if;
    for deuda in
      select d.*, a.monto from jsonb_to_recordset(aplicaciones) a(deuda_id uuid, monto numeric)
      join public.deudas d on d.id = a.deuda_id order by d.id for update of d
    loop
      if deuda.cliente_id <> id_cliente or deuda.deleted_at is not null
        or deuda.estado = 'pagada' or deuda.saldo < deuda.monto or deuda.cuadre_id = id_cuadre then
        raise exception 'Una deuda seleccionada cambió. Revisa su saldo.';
      end if;
      esperadas := esperadas - 1;
    end loop;
    if esperadas <> 0 then raise exception 'Una cuenta del abono salarial ya no existe.'; end if;
  elsif descuento <> 0 then
    raise exception 'El descuento de deudas necesita un abono salarial válido.';
  end if;
  if descuento < 0 or descuento <> round(descuento, 2) or descuento > disponible_salario then
    raise exception 'El abono excede el salario disponible después de aplicar el fondo.';
  end if;

  if jsonb_typeof(billetes) is distinct from 'object' then
    raise exception 'El desglose de salario pagado debe estar organizado por denominaciones.';
  end if;
  if exists (
    select 1 from jsonb_each(billetes) b(denominacion, cantidad)
    where case when b.denominacion ~ '^[1-9][0-9]{0,5}$' and jsonb_typeof(b.cantidad) = 'number' then
      b.cantidad::numeric < 0 or b.cantidad::numeric <> trunc(b.cantidad::numeric)
    else true end
  ) then raise exception 'El desglose de salario pagado tiene denominaciones o cantidades inválidas.'; end if;
  select coalesce(sum(b.denominacion::numeric * b.cantidad::numeric), 0) into pagado
  from jsonb_each(billetes) b(denominacion, cantidad);
  if pagado > disponible_salario - descuento then
    raise exception 'El salario pagado excede lo disponible después de aplicar el fondo y el abono.';
  end if;

  datos := datos - 'fondoFaltantePropuesto' - 'fondoFaltanteOperacion' - 'fondoFaltante' - 'deudaDependienteId'
    - 'abonoDeudasId' - 'planAbonoSalario' - 'sobranteGestion';
  id_movimiento := previo.ultimo_movimiento;
  if diferencia_fondo > 0 then
    insert into public.fondo_sobrantes_movimientos
      (id, tipo, estado, monto, motivo, punto_venta, realizado_por, confirmado_por, confirmado_en, dependiente, detalles)
    values (operacion, 'retiro', 'confirmado', diferencia_fondo, 'Faltante del cuadre',
      datos ->> 'puntoVenta', operador.nombre, operador.nombre, now(), nombre_dependiente,
      jsonb_build_object('origen', 'faltante_cuadre', 'cuadre_id', id_cuadre,
        'monto_total', propuesta, 'monto_aplicado_anterior', previo.monto_aplicado,
        'monto_heredado', previo.monto_heredado, 'movimiento_anterior_id', previo.ultimo_movimiento,
        'movimientos_heredados', previo.movimientos_heredados, 'abonos_heredados', previo.abonos_heredados,
        'realizado_por_uid', operador.usuario_id))
    returning id into id_movimiento;
  end if;

  datos := jsonb_set(datos, '{fondoFaltante}', jsonb_build_object('monto', propuesta, 'movimientoId', id_movimiento));
  if anterior.id is null then
    insert into public.cuadres(id, punto_venta, fecha, dependiente, finalizado, data)
    values(id_cuadre, datos ->> 'puntoVenta', fecha_cuadre, nombre_dependiente, true, datos);
  end if;

  if faltante_nuevo then
    insert into public.deudas(cliente_id, cuadre_id, cuadre_label, fecha, total, saldo)
      values (id_cliente, id_cuadre, 'Faltante · ' || (datos ->> 'puntoVenta'), fecha_cuadre, residual, residual)
      returning id into id_deuda;
  elsif id_deuda is not null and (cuenta.total is distinct from total_deuda or cuenta.saldo is distinct from residual) then
    update public.deudas set total = total_deuda, saldo = residual, updated_at = now(),
      estado = case when residual = 0 then 'pagada'::public.deuda_estado
        when residual < total_deuda then 'parcial'::public.deuda_estado else 'pendiente'::public.deuda_estado end
    where id = id_deuda;
  end if;

  if jsonb_typeof(plan) = 'object' then
    id_abono := public.registrar_abono(id_cliente, descuento, aplicaciones, operador.usuario_id,
      operador.nombre, 'Descontado del salario', null);
    update public.abonos set origen = 'salario', cuadre_id = id_cuadre where id = id_abono;
  end if;
  if id_deuda is not null then datos := jsonb_set(datos, '{deudaDependienteId}', to_jsonb(id_deuda)); end if;
  if id_abono is not null then datos := jsonb_set(datos, '{abonoDeudasId}', to_jsonb(id_abono)); end if;
  update public.cuadres set data = datos, punto_venta = datos ->> 'puntoVenta',
    fecha = fecha_cuadre, dependiente = nombre_dependiente, finalizado = true
  where id = id_cuadre;

  insert into private.cierres_cuadre_fondo(operacion, cuadre_id, operador_id, solicitud, esperado, resultado)
    values (operacion, id_cuadre, operador.usuario_id, solicitud, nullif(esperado, 'null'::jsonb), datos);
  insert into public.auditoria(usuario_id, usuario_nombre, accion, entidad, entidad_id, detalle)
    values (operador.usuario_id, operador.nombre, 'cerrar_cuadre_con_fondo', 'cuadres', id_cuadre,
      jsonb_build_object('operacion', operacion, 'movimiento_id', id_movimiento,
        'monto_fondo_total', propuesta, 'monto_fondo_incremental', diferencia_fondo,
        'monto_fondo_heredado', previo.monto_heredado, 'movimientos_heredados', previo.movimientos_heredados,
        'abonos_heredados', previo.abonos_heredados, 'faltante', faltante, 'salario_bruto', bruto,
        'deuda_id', id_deuda, 'deuda_total_anterior', cuenta.total, 'saldo_deuda_anterior', cuenta.saldo,
        'saldo_deuda_nuevo', residual, 'abono_salarial_id', id_abono, 'salario_pagado', pagado));
  return datos;
end;
$$;

-- El almacenamiento directo no puede crear, cambiar ni borrar un cierre
-- con fondo. El RPC realiza la escritura una vez validado el movimiento.
create function private.conservar_cuadre_con_fondo()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'DELETE' and (new.data ->> 'fondoFaltantePropuesto' is not null
    or new.data ->> 'fondoFaltanteOperacion' is not null) then
    raise exception 'El importe propuesto debe registrarse mediante el cierre con fondo.' using errcode = '42501';
  end if;
  if current_user in ('authenticated', 'anon') then
    if (tg_op <> 'DELETE' and jsonb_typeof(new.data -> 'fondoFaltante') = 'object')
      or (tg_op <> 'INSERT' and jsonb_typeof(old.data -> 'fondoFaltante') = 'object') then
      if tg_op <> 'UPDATE' or new is distinct from old then
        raise exception 'El cuadre con fondo requiere un guardado autorizado desde Caja de Sobrantes.' using errcode = '42501';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger conservar_cuadre_con_fondo before insert or update or delete on public.cuadres
for each row execute function private.conservar_cuadre_con_fondo();

revoke execute on function private.localizar_deuda_faltante_cuadre(uuid, jsonb),
  private.fondo_previo_del_cuadre(uuid, jsonb, uuid), private.conservar_cuadre_con_fondo()
  from public, anon, authenticated;
revoke execute on function public.consultar_fondo_para_cuadre(uuid, text),
  public.cerrar_cuadre_con_fondo(jsonb, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.consultar_fondo_para_cuadre(uuid, text),
  public.cerrar_cuadre_con_fondo(jsonb, uuid, jsonb, text) to authenticated;
