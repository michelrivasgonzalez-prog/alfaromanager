alter table public.abonos
  add column origen text check (origen in ('salario', 'fondo_sobrantes')),
  add column cuadre_id uuid references public.cuadres(id),
  add column fondo_movimiento_id uuid references public.fondo_sobrantes_movimientos(id);

create unique index abonos_un_descuento_por_cuadre on public.abonos(cuadre_id) where origen = 'salario';
create unique index abonos_un_abono_por_compensacion on public.abonos(fondo_movimiento_id);

create function private.proteger_abono_vinculado()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.abonos where id = new.reversa_de and origen is not null) then
      raise exception 'El abono vinculado requiere una reversión coordinada';
    end if;
  elsif old.origen is not null then
    raise exception 'El abono vinculado requiere una reversión coordinada';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger proteger_abono_vinculado before insert or update or delete on public.abonos
  for each row execute function private.proteger_abono_vinculado();

create function private.proteger_aplicacion_vinculada()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.abonos a where a.origen is not null and
      (a.id = case when tg_op <> 'INSERT' then old.abono_id end
       or a.id = case when tg_op <> 'DELETE' then new.abono_id end)
  ) then raise exception 'La aplicación del abono requiere una reversión coordinada'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger proteger_aplicacion_vinculada before insert or update or delete on public.abono_aplicaciones
for each row execute function private.proteger_aplicacion_vinculada();

create function private.validar_importe_deuda(importe numeric)
returns boolean language sql immutable set search_path = '' as $$
  select importe > 0 and importe <= 999999999999.99 and importe = round(importe, 2);
$$;

create function private.nombre_deudor(nombre text)
returns text language sql immutable set search_path = '' as $$
  select case when normalizado = 'camila san freeman' then 'kamila sanz friman' else normalizado end
  from (select translate(lower(btrim(nombre)), 'áéíóúü', 'aeiouu') as normalizado) n;
$$;

-- Deriva el límite desde el cierre: inventario, precios mixtos, arqueo,
-- recogidas y modalidad salarial. Los importes se mantienen como numeric.
create function private.calcular_limite_salario(datos jsonb)
returns table(diferencia numeric, bruto numeric, disponible numeric)
language sql immutable set search_path = '' as $$
  with productos as (
    select ordinal, lower(btrim(p ->> 'nombre')) nombre,
      (p ->> 'inicio')::numeric + (p ->> 'entradas')::numeric
        - (p ->> 'traslados')::numeric - (p ->> 'final')::numeric unidades,
      coalesce((p ->> 'precio')::numeric, 0) precio, p -> 'tramos' tramos
    from jsonb_array_elements(datos -> 'productos') with ordinality t(p, ordinal)
  ), ventas as (
    select ordinal, nombre, productos.unidades, (productos.unidades - mix.unidades) * precio + mix.importe importe
    from productos cross join lateral (
      select coalesce(sum((t ->> 'cantidad')::numeric), 0) unidades,
        coalesce(sum((t ->> 'cantidad')::numeric * (t ->> 'precio')::numeric), 0) importe
      from jsonb_array_elements(coalesce(nullif(tramos, 'null'), '[]')) t
      where (t ->> 'cantidad')::numeric > 0
    ) mix
  ), totales as (
    select (select coalesce(sum(importe), 0) from ventas) venta,
      (select coalesce(sum((g ->> 'monto')::numeric), 0) from jsonb_array_elements(datos -> 'gastos') g) gastos,
      (select coalesce(sum(k::numeric * v::numeric), 0) from jsonb_each_text(datos -> 'denominaciones') d(k, v))
      + (select coalesce(sum((d ->> 'denominacion')::numeric * (d ->> 'cantidad')::numeric * (d ->> 'tasa')::numeric), 0)
          from jsonb_array_elements(coalesce(nullif(datos -> 'divisas', 'null'), '[]')) d)
      + (select coalesce(sum((r ->> 'monto')::numeric), 0)
          from jsonb_array_elements(coalesce(nullif(datos -> 'recogidas', 'null'), '[]')) r) efectivo,
      coalesce((datos ->> 'porcentajeVenta')::numeric, 0) / 100 porcentaje,
      jsonb_array_length(datos -> 'diasTrabajados') * (datos ->> 'salarioBase')::numeric base,
      datos ->> 'salarioModo' modo
  ), comisiones as (
    select coalesce(sum(v.importe), 0) excluido,
      coalesce(sum(greatest(v.unidades, 0) * (e ->> 'tarifaPorUnidad')::numeric), 0) fijo
    from jsonb_array_elements(coalesce(nullif(datos -> 'salarioExcepcionesProductos', 'null'), '[]')) e
    join lateral (select * from ventas where nombre = lower(btrim(e ->> 'productoNombre')) order by ordinal limit 1) v on true
  ), calculo as (
    select efectivo - venta + gastos diferencia,
      case modo when 'porcentaje' then venta * porcentaje
        when 'mixto' then greatest(base, venta * porcentaje)
        when 'comision_producto' then greatest(0, venta - excluido) * porcentaje + fijo
        else base end bruto
    from totales cross join comisiones
  )
  select diferencia, bruto, bruto - least(greatest(0, -diferencia), bruto)
    + case when jsonb_typeof(datos -> 'sobranteGestion') = 'object' then 0
      when datos ->> 'puntoVenta' = 'Mipyme' and datos ->> 'entregarSobranteMipyme' is not null
        then case when (datos ->> 'entregarSobranteMipyme')::boolean then greatest(0, diferencia) else 0 end
      when not coalesce((datos ->> 'regimenSobrantes')::boolean, false) then greatest(0, diferencia)
      else 0 end
  from calculo;
$$;

-- El cierre con descuento y su abono se confirman juntos. El ID del cuadre
-- identifica la operación incluso si se pierde la respuesta al sincronizar.
create function public.cerrar_cuadre_con_abono(datos jsonb, cliente_id uuid, aplicaciones jsonb, disponible numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  id_cuadre uuid := (datos ->> 'id')::uuid;
  importe numeric;
  abono uuid;
  previo jsonb;
  deuda record;
  esperadas integer;
  limite numeric;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if id_cuadre is null or (datos ->> 'finalizado')::boolean is distinct from true then
    raise exception 'Se requiere un cuadre finalizado';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(id_cuadre::text, 43149050));
  select data into previo from public.cuadres where id = id_cuadre for update;
  if previo is not null then
    if previo ->> 'abonoDeudasId' is not null and
       (previo - 'abonoDeudasId') = (datos - 'abonoDeudasId' - 'planAbonoSalario') and exists (
         select 1 from public.abonos a where a.id = (previo ->> 'abonoDeudasId')::uuid
           and a.cliente_id = cerrar_cuadre_con_abono.cliente_id and a.origen = 'salario'
           and (select jsonb_agg(jsonb_build_object('deuda_id', p.deuda_id, 'monto', p.monto) order by p.deuda_id)
             from public.abono_aplicaciones p where p.abono_id = a.id)
           = (select jsonb_agg(jsonb_build_object('deuda_id', r.deuda_id, 'monto', r.monto) order by r.deuda_id)
             from jsonb_to_recordset(aplicaciones) r(deuda_id uuid, monto numeric))
       ) then
      return previo;
    end if;
    raise exception 'Este cuadre ya existe en Supabase. Revisa su cierre antes de aplicar un abono.';
  end if;
  if not exists (
    select 1 from public.clientes c where c.id = cerrar_cuadre_con_abono.cliente_id and c.deleted_at is null
      and private.nombre_deudor(c.nombre) = private.nombre_deudor(datos ->> 'dependiente')
  ) then raise exception 'El cliente no corresponde a la dependienta del cuadre'; end if;

  select round(c.disponible, 2) into limite from private.calcular_limite_salario(datos) c;
  select count(*), sum(a.monto) into esperadas, importe
  from jsonb_to_recordset(aplicaciones) a(deuda_id uuid, monto numeric);
  if esperadas = 0 or importe is null or importe is distinct from (datos ->> 'descuentoDeudas')::numeric
     or limite is null or limite is distinct from disponible or importe > limite
     or exists (
       select 1 from jsonb_to_recordset(aplicaciones) a(deuda_id uuid, monto numeric)
       group by a.deuda_id having a.deuda_id is null or count(*) <> 1
         or not bool_and(coalesce(private.validar_importe_deuda(a.monto), false))
     ) then raise exception 'Revisa los importes y el salario disponible'; end if;

  for deuda in
    select d.*, a.monto from jsonb_to_recordset(aplicaciones) a(deuda_id uuid, monto numeric)
    join public.deudas d on d.id = a.deuda_id order by d.id for update of d
  loop
    if deuda.cliente_id <> cerrar_cuadre_con_abono.cliente_id or deuda.deleted_at is not null
      or deuda.estado = 'pagada' or deuda.saldo < deuda.monto or deuda.cuadre_id = id_cuadre then
      raise exception 'Una deuda seleccionada cambió. Revisa su saldo.';
    end if;
    esperadas := esperadas - 1;
  end loop;
  if esperadas <> 0 then raise exception 'Una deuda seleccionada ya no existe'; end if;

  datos := datos - 'planAbonoSalario' - 'abonoDeudasId';
  insert into public.cuadres(id, punto_venta, fecha, dependiente, finalizado, data)
  values(id_cuadre, datos->>'puntoVenta', (datos->>'fecha')::timestamptz, datos->>'dependiente', true, datos);
  abono := public.registrar_abono(cliente_id, importe, aplicaciones, auth.uid(), null, 'Descontado del salario', null);
  update public.abonos set origen = 'salario', cuadre_id = id_cuadre where id = abono;
  datos := jsonb_set(datos, '{abonoDeudasId}', to_jsonb(abono));
  update public.cuadres set data = datos where id = id_cuadre;
  return datos;
end;
$$;

-- Usa la lista de operadores de la Caja. El mismo RPC admite el token
-- privado del acceso por PIN al instalarse esa migración.
create function private.operador_para_compensacion(token text)
returns table(usuario_id uuid, nombre text) language plpgsql security definer set search_path = '' as $$
begin
  if to_regclass('private.sesiones_caja_pin') is not null then
    return query execute
      'select o.usuario_id, o.nombre from private.pines_caja o join private.sesiones_caja_pin s
        on s.usuario_id = o.usuario_id where s.dispositivo_id = auth.uid() and s.vence > clock_timestamp()
        and s.hash_token = sha256(convert_to($1, ''UTF8''))' using token;
  else
    return query
      select o.usuario_id, o.nombre from private.operadores_caja_sobrantes o join auth.users u on u.id = o.usuario_id
      where o.usuario_id = auth.uid() and u.is_anonymous is false and u.email_confirmed_at is not null;
  end if;
end;
$$;

create function public.compensar_deuda_fondo(operacion uuid, cliente uuid, deuda uuid, importe numeric, motivo text, token text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  operador record;
  cuenta public.deudas%rowtype;
  movimiento public.fondo_sobrantes_movimientos%rowtype;
  abono uuid;
  nombre_cliente text;
begin
  select * into operador from private.operador_para_compensacion(token);
  if not found then raise insufficient_privilege; end if;
  motivo := btrim(motivo);
  if operacion is null or cliente is null or deuda is null
     or not coalesce(private.validar_importe_deuda(importe), false) or coalesce(motivo, '') = '' then
    raise exception 'Indica deuda, importe válido y motivo';
  end if;

  perform pg_advisory_xact_lock(71342110);
  select * into movimiento from public.fondo_sobrantes_movimientos where id = operacion;
  if found then
    select a.id into abono from public.abonos a join public.abono_aplicaciones p on p.abono_id = a.id
    where a.fondo_movimiento_id = operacion and a.cliente_id = cliente and p.deuda_id = deuda
      and a.monto = importe and movimiento.motivo = motivo and a.usuario_id = operador.usuario_id;
    if not found then raise exception 'El identificador ya pertenece a otra operación'; end if;
    return abono;
  end if;
  select c.nombre into nombre_cliente from public.clientes c where c.id = cliente and c.deleted_at is null;
  if not found then raise exception 'El cliente no existe o está archivado'; end if;
  select * into cuenta from public.deudas d where d.id = deuda and d.cliente_id = cliente
    and d.deleted_at is null and d.estado in ('pendiente', 'parcial') for update;
  if not found or cuenta.saldo < importe then raise exception 'La deuda no existe o su saldo es insuficiente'; end if;
  if importe > (select saldo_disponible from public.fondo_sobrantes_saldo) then
    raise exception 'El saldo confirmado del fondo es insuficiente';
  end if;

  insert into public.fondo_sobrantes_movimientos
    (id, tipo, estado, monto, motivo, realizado_por, confirmado_por, confirmado_en, dependiente, detalles)
  values (operacion, 'retiro', 'confirmado', importe, motivo, operador.nombre, operador.nombre, now(), nombre_cliente,
    jsonb_build_object('origen', 'compensacion_deuda', 'cliente_id', cliente, 'deuda_id', deuda,
      'realizado_por_uid', operador.usuario_id));

  abono := public.registrar_abono(cliente, importe, jsonb_build_array(jsonb_build_object('deuda_id', deuda, 'monto', importe)),
    operador.usuario_id, operador.nombre, motivo, null);
  update public.abonos set origen = 'fondo_sobrantes', fondo_movimiento_id = operacion where id = abono;
  return abono;
end;
$$;

revoke execute on function private.operador_para_compensacion(text) from public, anon, authenticated;
revoke execute on function public.compensar_deuda_fondo(uuid, uuid, uuid, numeric, text, text),
  public.cerrar_cuadre_con_abono(jsonb, uuid, jsonb, numeric) from public, anon;
grant execute on function public.compensar_deuda_fondo(uuid, uuid, uuid, numeric, text, text),
  public.cerrar_cuadre_con_abono(jsonb, uuid, jsonb, numeric) to authenticated;

create function private.conservar_cuadre_con_deuda()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and
     (old.data ->> 'abonoDeudasId' is not null or old.data ->> 'deudaDependienteId' is not null) then
    if tg_op = 'DELETE' then raise exception 'El cuadre tiene una deuda o un abono vinculado'; end if;
    if old.data ->> 'abonoDeudasId' is not null then
      if new.data is distinct from old.data or new.deleted_at is distinct from old.deleted_at then
        raise exception 'El cuadre con abono salarial requiere corrección coordinada';
      end if;
    elsif new.data -> 'deudaDependienteId' is distinct from old.data -> 'deudaDependienteId' then
      new.data := jsonb_set(new.data, '{deudaDependienteId}', old.data -> 'deudaDependienteId');
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger conservar_cuadre_con_deuda before update or delete on public.cuadres
for each row execute function private.conservar_cuadre_con_deuda();

-- Conciliación explícita del faltante existente. Se vincula una cuenta
-- inequívoca del turno o se crea una sola, sin tocar el salario ni el fondo.
create function public.vincular_faltante_kamila(cliente uuid, datos jsonb, token text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  origen constant uuid := '8fe85acf-9a34-4760-ab8e-18d746f76ea5';
  importe constant numeric := 11918.37;
  operador record;
  turno public.cuadres%rowtype;
  cuenta public.deudas%rowtype;
  coincidencias uuid[];
  calculo record;
begin
  select * into operador from private.operador_para_compensacion(token);
  if not found then raise insufficient_privilege; end if;
  select * into turno from public.cuadres where id = origen and finalizado and deleted_at is null for update;
  if not found or private.nombre_deudor(turno.dependiente) is distinct from 'kamila sanz friman'
     or 2 <> (select count(distinct left(dia, 10)) from jsonb_array_elements_text(turno.data -> 'diasTrabajados') dia
       where left(dia, 10) in ('2026-11-17', '2026-11-18'))
     or not exists (select 1 from public.clientes c where c.id = cliente and c.deleted_at is null
       and private.nombre_deudor(c.nombre) = 'kamila sanz friman') then
    raise exception 'El perfil o turno de Kamila no coincide con el faltante';
  end if;
  if turno.data ->> 'deudaDependienteId' is not null then
    select * into cuenta from public.deudas where id = (turno.data ->> 'deudaDependienteId')::uuid
      and cliente_id = cliente and deleted_at is null and cuadre_id = origen and total = importe;
    if found then return cuenta.id; end if;
    raise exception 'La deuda vinculada requiere revisión';
  end if;
  if datos is distinct from turno.data then
    raise exception 'Sincroniza el historial antes de vincular el faltante';
  end if;
  select * into calculo from private.calcular_limite_salario(turno.data);
  if round(-calculo.diferencia, 2) is distinct from 15375.00
    or round(calculo.bruto, 2) is distinct from 3456.63
    or round(greatest(0, -calculo.diferencia - calculo.bruto), 2) is distinct from importe then
    raise exception 'Los importes del turno ya no coinciden con la conciliación';
  end if;
  lock table public.deudas in share row exclusive mode;
  select array_agg(d.id) into coincidencias from public.deudas d where d.deleted_at is null
    and d.cuadre_id = origen and d.cuadre_label ilike 'Faltante%';
  if cardinality(coincidencias) > 1 then raise exception 'Hay más de una deuda de faltante en el turno'; end if;
  if cardinality(coincidencias) = 1 then
    select * into cuenta from public.deudas where id = coincidencias[1];
    if cuenta.cliente_id <> cliente or cuenta.total <> importe then
      raise exception 'La deuda registrada requiere conciliación de cliente e importe';
    end if;
  else
    if exists (
      select 1 from public.deudas d join public.clientes c on c.id = d.cliente_id
      where d.deleted_at is null and private.nombre_deudor(c.nombre) = 'kamila sanz friman'
        and (d.cuadre_id = origen and d.total = importe
          or d.cuadre_id is null and (d.cuadre_label ilike 'Faltante%' or d.total = importe))
    ) then raise exception 'Hay un posible faltante sin vincular. Revisa Cuentas por cobrar antes de crear otro.'; end if;
    insert into public.deudas(cliente_id, cuadre_id, cuadre_label, fecha, total, saldo)
      values (cliente, origen, 'Faltante · Cafetería · 17–18 nov 2026', turno.fecha, importe, importe)
      returning * into cuenta;
  end if;
  update public.cuadres set data = jsonb_set(data, '{deudaDependienteId}', to_jsonb(cuenta.id)) where id = origen;
  insert into public.auditoria(usuario_id, usuario_nombre, accion, entidad, entidad_id, detalle)
    values (operador.usuario_id, operador.nombre, 'vincular_faltante', 'deudas', cuenta.id,
      jsonb_build_object('cuadre_id', origen, 'importe_original', importe));
  return cuenta.id;
end;
$$;
revoke execute on function public.vincular_faltante_kamila(uuid, jsonb, text) from public, anon;
grant execute on function public.vincular_faltante_kamila(uuid, jsonb, text) to authenticated;
