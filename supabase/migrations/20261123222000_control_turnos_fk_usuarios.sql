-- Conservar el historial al eliminar o unificar usuarios PIN.
-- Las sesiones sí deben desaparecer al eliminar una cuenta.
BEGIN;
ALTER TABLE public.alfaro_turnos_operativos ALTER COLUMN usuario_id DROP NOT NULL;
ALTER TABLE public.alfaro_turnos_operativos
  DROP CONSTRAINT IF EXISTS alfaro_turnos_operativos_usuario_id_fkey;
ALTER TABLE public.alfaro_turnos_operativos
  ADD CONSTRAINT alfaro_turnos_operativos_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES public.pin_users(id) ON DELETE SET NULL;
ALTER TABLE public.alfaro_turnos_operativos
  DROP CONSTRAINT IF EXISTS alfaro_turnos_operativos_asignado_por_fkey;
ALTER TABLE public.alfaro_turnos_operativos
  ADD CONSTRAINT alfaro_turnos_operativos_asignado_por_fkey
  FOREIGN KEY (asignado_por) REFERENCES public.pin_users(id) ON DELETE SET NULL;
ALTER TABLE public.alfaro_turnos_eventos
  DROP CONSTRAINT IF EXISTS alfaro_turnos_eventos_usuario_id_fkey;
ALTER TABLE public.alfaro_turnos_eventos
  ADD CONSTRAINT alfaro_turnos_eventos_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES public.pin_users(id) ON DELETE SET NULL;
ALTER TABLE public.alfaro_turnos_sesiones
  DROP CONSTRAINT IF EXISTS alfaro_turnos_sesiones_usuario_id_fkey;
ALTER TABLE public.alfaro_turnos_sesiones
  ADD CONSTRAINT alfaro_turnos_sesiones_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES public.pin_users(id) ON DELETE CASCADE;
COMMIT;
