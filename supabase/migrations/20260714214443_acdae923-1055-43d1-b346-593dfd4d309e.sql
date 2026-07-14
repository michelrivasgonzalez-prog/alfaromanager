
-- ============ FASE 1: Fundaciones Almacén + Cuentas por Cobrar + Auditoría ============

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE public.movimiento_tipo AS ENUM ('entrada', 'salida');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.deuda_estado AS ENUM ('pendiente', 'parcial', 'pagada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- ALMACEN_PRODUCTOS ----------
CREATE TABLE IF NOT EXISTS public.almacen_productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  unidad TEXT NOT NULL DEFAULT 'u',
  stock_minimo NUMERIC NOT NULL DEFAULT 0,
  permite_negativo BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.almacen_productos TO authenticated;
GRANT ALL ON public.almacen_productos TO service_role;
ALTER TABLE public.almacen_productos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "almacen_productos_select" ON public.almacen_productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "almacen_productos_write_admin" ON public.almacen_productos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'duena'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'duena'));
CREATE TRIGGER trg_almacen_productos_updated BEFORE UPDATE ON public.almacen_productos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_almacen_productos_deleted ON public.almacen_productos(deleted_at);

-- ---------- ALMACEN_MOVIMIENTOS ----------
CREATE TABLE IF NOT EXISTS public.almacen_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES public.almacen_productos(id),
  tipo public.movimiento_tipo NOT NULL,
  cantidad NUMERIC NOT NULL CHECK (cantidad > 0),
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  receptor TEXT,
  observacion TEXT,
  reversion_de UUID REFERENCES public.almacen_movimientos(id),
  created_by UUID,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.almacen_movimientos TO authenticated;
GRANT ALL ON public.almacen_movimientos TO service_role;
ALTER TABLE public.almacen_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "almacen_mov_select" ON public.almacen_movimientos FOR SELECT TO authenticated USING (true);
CREATE POLICY "almacen_mov_write_admin" ON public.almacen_movimientos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'duena'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'duena'));
CREATE TRIGGER trg_almacen_mov_updated BEFORE UPDATE ON public.almacen_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_almacen_mov_prod_fecha ON public.almacen_movimientos(producto_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_almacen_mov_deleted ON public.almacen_movimientos(deleted_at);

-- ---------- CLIENTES ----------
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  telefono TEXT,
  observaciones TEXT,
  uso_count INT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "clientes_write_admin" ON public.clientes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'duena'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'duena'));
CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_clientes_deleted ON public.clientes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_clientes_uso ON public.clientes(uso_count DESC, nombre);

-- ---------- DEUDAS ----------
CREATE TABLE IF NOT EXISTS public.deudas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  cuadre_id UUID,
  cuadre_label TEXT,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  productos JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC NOT NULL CHECK (total >= 0),
  saldo NUMERIC NOT NULL CHECK (saldo >= 0),
  estado public.deuda_estado NOT NULL DEFAULT 'pendiente',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deudas TO authenticated;
GRANT ALL ON public.deudas TO service_role;
ALTER TABLE public.deudas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deudas_select" ON public.deudas FOR SELECT TO authenticated USING (true);
CREATE POLICY "deudas_write_admin" ON public.deudas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'duena'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'duena'));
CREATE TRIGGER trg_deudas_updated BEFORE UPDATE ON public.deudas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_deudas_cliente ON public.deudas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_deudas_cuadre ON public.deudas(cuadre_id);
CREATE INDEX IF NOT EXISTS idx_deudas_estado ON public.deudas(estado);
CREATE INDEX IF NOT EXISTS idx_deudas_deleted ON public.deudas(deleted_at);

-- ---------- ABONOS ----------
CREATE TABLE IF NOT EXISTS public.abonos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  monto NUMERIC NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id UUID,
  usuario_nombre TEXT,
  nota TEXT,
  reversa_de UUID REFERENCES public.abonos(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abonos TO authenticated;
GRANT ALL ON public.abonos TO service_role;
ALTER TABLE public.abonos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "abonos_select" ON public.abonos FOR SELECT TO authenticated USING (true);
CREATE POLICY "abonos_insert_admin" ON public.abonos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'duena'));
-- abonos son inmutables (no update/delete de usuarios normales); service_role puede todo por GRANT.
CREATE TRIGGER trg_abonos_updated BEFORE UPDATE ON public.abonos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_abonos_cliente ON public.abonos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_abonos_deleted ON public.abonos(deleted_at);

-- ---------- ABONO_APLICACIONES ----------
CREATE TABLE IF NOT EXISTS public.abono_aplicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abono_id UUID NOT NULL REFERENCES public.abonos(id) ON DELETE CASCADE,
  deuda_id UUID NOT NULL REFERENCES public.deudas(id),
  monto NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abono_aplicaciones TO authenticated;
GRANT ALL ON public.abono_aplicaciones TO service_role;
ALTER TABLE public.abono_aplicaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aplic_select" ON public.abono_aplicaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "aplic_insert_admin" ON public.abono_aplicaciones FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'duena'));
CREATE INDEX IF NOT EXISTS idx_aplic_abono ON public.abono_aplicaciones(abono_id);
CREATE INDEX IF NOT EXISTS idx_aplic_deuda ON public.abono_aplicaciones(deuda_id);

-- ---------- AUDITORIA (append-only) ----------
CREATE TABLE IF NOT EXISTS public.auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id UUID,
  usuario_nombre TEXT,
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_id TEXT,
  detalle JSONB
);
GRANT SELECT, INSERT ON public.auditoria TO authenticated;
GRANT ALL ON public.auditoria TO service_role;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select_admin" ON public.auditoria FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'duena'));
CREATE POLICY "audit_insert_any" ON public.auditoria FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON public.auditoria(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad ON public.auditoria(entidad, entidad_id);
