
-- 1) pin_users: sincroniza usuarios PIN en la nube
CREATE TABLE IF NOT EXISTS public.pin_users (
  id UUID PRIMARY KEY,
  nombre TEXT NOT NULL,
  role TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  recovery_email TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pin_users TO authenticated;
GRANT ALL ON public.pin_users TO service_role;
ALTER TABLE public.pin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pin_users_all_auth" ON public.pin_users FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE TRIGGER trg_pin_users_updated BEFORE UPDATE ON public.pin_users
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Relajar RLS: cuenta compartida, cualquier usuario autenticado puede
--    leer y escribir en almacén y cuentas por cobrar. Auditoría sigue restringida.

DROP POLICY IF EXISTS "almacen_productos_select" ON public.almacen_productos;
DROP POLICY IF EXISTS "almacen_productos_write_admin" ON public.almacen_productos;
CREATE POLICY "almacen_productos_all_auth" ON public.almacen_productos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "almacen_mov_select" ON public.almacen_movimientos;
DROP POLICY IF EXISTS "almacen_mov_write_admin" ON public.almacen_movimientos;
CREATE POLICY "almacen_mov_all_auth" ON public.almacen_movimientos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
DROP POLICY IF EXISTS "clientes_write_admin" ON public.clientes;
CREATE POLICY "clientes_all_auth" ON public.clientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "deudas_select" ON public.deudas;
DROP POLICY IF EXISTS "deudas_write_admin" ON public.deudas;
CREATE POLICY "deudas_all_auth" ON public.deudas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "abonos_select" ON public.abonos;
DROP POLICY IF EXISTS "abonos_insert_admin" ON public.abonos;
CREATE POLICY "abonos_select_auth" ON public.abonos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "abonos_insert_auth" ON public.abonos
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "aplic_select" ON public.abono_aplicaciones;
DROP POLICY IF EXISTS "aplic_insert_admin" ON public.abono_aplicaciones;
CREATE POLICY "aplic_select_auth" ON public.abono_aplicaciones
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "aplic_insert_auth" ON public.abono_aplicaciones
  FOR INSERT TO authenticated WITH CHECK (true);
