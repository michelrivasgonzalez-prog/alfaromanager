ALTER TABLE public.almacen_movimientos ADD COLUMN IF NOT EXISTS costo_unitario numeric;
ALTER TABLE public.almacen_productos ADD COLUMN IF NOT EXISTS costo_actual numeric;