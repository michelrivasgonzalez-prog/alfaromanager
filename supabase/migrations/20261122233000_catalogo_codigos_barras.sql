-- AlFaroCafé Manager · Códigos de barras (migración sin pérdida de datos)
-- No altera existencias, cuadres, precios, comisiones ni identificadores UUID.
BEGIN;

ALTER TABLE public.catalogo
  ADD COLUMN IF NOT EXISTS codigo_barras text;

-- Los códigos se almacenan como texto: no se pierden ceros iniciales.
-- Limpiar blancos existentes de forma no destructiva.
UPDATE public.catalogo
SET codigo_barras = NULL
WHERE codigo_barras IS NOT NULL AND btrim(codigo_barras) = '';

-- Nunca se asigna automáticamente un barcode basándose en nombre o fotografía.
-- Un mismo código puede usarse en Cafetería y MiPYME; no dos veces en el mismo punto.
CREATE UNIQUE INDEX IF NOT EXISTS catalogo_codigo_barras_punto_activo_idx
ON public.catalogo ((coalesce(punto, 'Cafetería')), (lpad(codigo_barras, 14, '0')))
WHERE deleted_at IS NULL AND codigo_barras IS NOT NULL;

CREATE INDEX IF NOT EXISTS catalogo_codigo_barras_busqueda_idx
ON public.catalogo (codigo_barras)
WHERE codigo_barras IS NOT NULL AND deleted_at IS NULL;

COMMIT;

-- Comprobación tras ejecución (no modifica datos)
SELECT punto, nombre, codigo_barras
FROM public.catalogo
WHERE codigo_barras IS NOT NULL AND deleted_at IS NULL
ORDER BY punto, nombre;
