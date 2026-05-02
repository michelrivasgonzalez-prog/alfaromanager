ALTER TABLE public.catalogo
ADD COLUMN IF NOT EXISTS orden integer NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY COALESCE(punto, 'Cafetería')
      ORDER BY created_at ASC, nombre ASC, id ASC
    ) AS rn
  FROM public.catalogo
)
UPDATE public.catalogo AS c
SET orden = ranked.rn
FROM ranked
WHERE c.id = ranked.id
  AND c.orden = 0;

CREATE INDEX IF NOT EXISTS idx_catalogo_punto_orden
ON public.catalogo (punto, orden);