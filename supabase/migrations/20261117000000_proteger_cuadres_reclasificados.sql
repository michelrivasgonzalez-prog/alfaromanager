-- Conserva la versión del servidor al recibir una instantánea anterior
-- a la reclasificación o a un cambio en sobranteGestion.
create function public.conservar_cuadre_reclasificado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and jsonb_typeof(old.data -> 'sobranteGestion') = 'object'
     and old.data -> 'sobranteGestion' is distinct from new.data -> 'sobranteGestion' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.conservar_cuadre_reclasificado() from public;

create trigger conservar_cuadre_reclasificado
before update on public.cuadres
for each row execute function public.conservar_cuadre_reclasificado();
