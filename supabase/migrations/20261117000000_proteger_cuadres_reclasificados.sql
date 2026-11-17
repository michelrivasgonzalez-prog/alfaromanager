-- Conserva la versión del servidor al recibir una instantánea anterior
-- a la reclasificación o a un cambio en sobranteGestion.
create function public.conservar_cuadre_reclasificado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.data ? 'sobranteGestion' then
        raise exception 'La clasificación del sobrante se registra desde Caja de Sobrantes'
          using errcode = '42501';
      end if;
    elsif (old.data -> 'sobranteGestion') is distinct from (new.data -> 'sobranteGestion') then
      return old;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.conservar_cuadre_reclasificado() from public;

create trigger conservar_cuadre_reclasificado
before update on public.cuadres
for each row execute function public.conservar_cuadre_reclasificado();

-- AFTER INSERT solo se ejecuta para filas nuevas. El UPDATE de un upsert
-- sigue usando el guard anterior y devuelve la versión conservada.
create trigger validar_nuevo_cuadre_reclasificado
after insert on public.cuadres
for each row execute function public.conservar_cuadre_reclasificado();
