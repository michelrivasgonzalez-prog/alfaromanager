-- La deuda es la diferencia entre el faltante y el salario contabilizados a dos decimales.
create or replace function public.vincular_faltante_kamila(cliente uuid, datos jsonb, token text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  origen constant uuid := '8fe85acf-9a34-4760-ab8e-18d746f76ea5';
  importe constant numeric := 11918.37;
  operador record;
  turno public.cuadres%rowtype;
  cuenta public.deudas%rowtype;
  coincidencias uuid[];
  calculo record;
  faltante_contabilizado numeric;
  salario_contabilizado numeric;
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
  faltante_contabilizado := round(-calculo.diferencia, 2);
  salario_contabilizado := round(calculo.bruto, 2);
  if faltante_contabilizado is distinct from 15375.00
    or salario_contabilizado is distinct from 3456.63
    or greatest(0, faltante_contabilizado - salario_contabilizado) is distinct from importe then
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
