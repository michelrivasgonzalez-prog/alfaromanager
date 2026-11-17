-- Ejecutar con permisos administrativos desde SQL Editor. Solo lectura.
select saldo_disponible, pendiente_ingresar, ingresos_confirmados, retiros_confirmados
from public.fondo_sobrantes_saldo;

select
  c.id,
  c.dependiente,
  c.data -> 'diasTrabajados' as dias_trabajados,
  (c.data #>> '{sobranteGestion,importe}')::numeric as sobrante_revisado,
  m.monto as importe_movimiento,
  m.estado as estado_ingreso,
  c.data #>> '{sobranteGestion,estadoFisico}' as estado_fisico_en_cuadre,
  (
    select sum(billete::numeric * cantidad::numeric)
    from jsonb_each_text(coalesce(c.data -> 'salarioDenominaciones', '{}'::jsonb))
       as d(billete, cantidad)
  ) as salario_por_denominaciones,
  (c.data #>> '{sobranteGestion,salarioPagadoReal}')::numeric as salario_pagado_revisado
from public.cuadres c
left join public.fondo_sobrantes_movimientos m on m.cuadre_id = c.id and m.tipo = 'ingreso'
where c.id in ('d4018fca-b3a2-4b80-a6c5-e2b0584782d5', '7497cf01-f5d3-42b2-9e9e-de9dc4f029a5')
order by c.fecha;

-- Busca diferencias y orígenes ausentes sin tocar los movimientos registrados.
select c.id, m.id as movimiento_id, m.estado, m.monto, c.data #>> '{sobranteGestion,importe}' as importe_revisado
from public.cuadres c
left join public.fondo_sobrantes_movimientos m on m.cuadre_id = c.id and m.tipo = 'ingreso'
where (jsonb_typeof(c.data -> 'sobranteGestion') = 'object' or m.id is not null)
  and (m.id is null
    or (c.data #>> '{sobranteGestion,importe}')::numeric is distinct from m.monto
    or (m.estado = 'confirmado') is distinct from coalesce(c.data #>> '{sobranteGestion,estadoFisico}' = 'confirmado', false));
