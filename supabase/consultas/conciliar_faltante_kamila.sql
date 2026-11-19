-- Solo lectura. Ejecutar después de instalar la migración de deudas.
begin read only;

select c.id, c.dependiente, c.finalizado, c.data -> 'diasTrabajados' dias,
  round(-s.diferencia, 2) faltante_bruto,
  round(s.bruto, 2) salario_bruto,
  greatest(0, round(-s.diferencia, 2) - round(s.bruto, 2)) deuda_restante,
  c.data ->> 'deudaDependienteId' deuda_vinculada
from public.cuadres c cross join lateral private.calcular_limite_salario(c.data) s
where c.id = '8fe85acf-9a34-4760-ab8e-18d746f76ea5';

select d.id, c.nombre, d.cuadre_id, d.cuadre_label, d.fecha, d.total, d.saldo, d.estado
from public.deudas d join public.clientes c on c.id = d.cliente_id
where d.deleted_at is null and (
  d.cuadre_id = '8fe85acf-9a34-4760-ab8e-18d746f76ea5'
  or private.nombre_deudor(c.nombre) = 'kamila sanz friman'
)
order by d.fecha desc;

select * from public.fondo_sobrantes_saldo;
commit;
