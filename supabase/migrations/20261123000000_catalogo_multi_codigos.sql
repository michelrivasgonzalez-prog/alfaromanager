-- AlFaroCafé Manager · Varios códigos (sabores/variantes) por un mismo producto
-- No separa existencias, no cambia UUID, costos, comisiones ni cuadres históricos.
-- Ejecutar en Database > SQL editor de Lovable, una sola vez.
BEGIN;

ALTER TABLE public.catalogo
  ADD COLUMN IF NOT EXISTS codigo_barras text;

ALTER TABLE public.catalogo
  ADD COLUMN IF NOT EXISTS codigos_barras jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.catalogo.codigos_barras IS
  'Variantes de códigos del mismo producto: [{ "codigo": "EAN", "etiqueta": "Rosas" }]. La existencia permanece única.';

-- Cada código puede figurar en un único producto ACTIVO por punto de venta.
-- Se verifica el principal, los adicionales y los equivalentes UPC-A/EAN-13.
CREATE OR REPLACE FUNCTION public.alfaro_validar_codigos_producto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  claves text[];
  n_total int;
  n_unicos int;
  raw text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.codigos_barras IS NULL THEN
    NEW.codigos_barras := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(NEW.codigos_barras) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Los códigos asociados deben ser una lista JSON.';
  END IF;

  -- Serializa escrituras por punto para impedir carreras entre dispositivos.
  PERFORM pg_advisory_xact_lock(hashtext('alfaro_codigos_' || COALESCE(NEW.punto, 'Cafetería')));

  SELECT count(*),
         count(DISTINCT lpad(codigo, 14, '0')),
         array_agg(lpad(codigo, 14, '0'))
    INTO n_total, n_unicos, claves
  FROM (
    SELECT btrim(NEW.codigo_barras) AS codigo
    UNION ALL
    SELECT btrim(a->>'codigo') AS codigo
    FROM jsonb_array_elements(NEW.codigos_barras) AS a
  ) AS t
  WHERE codigo IS NOT NULL AND codigo <> '';

  IF n_total > n_unicos THEN
    RAISE EXCEPTION 'Este producto contiene códigos de barras duplicados.';
  END IF;

  FOR raw IN
    SELECT codigo
    FROM (
      SELECT btrim(NEW.codigo_barras) AS codigo
      UNION ALL
      SELECT btrim(a->>'codigo') AS codigo
      FROM jsonb_array_elements(NEW.codigos_barras) a
    ) t
    WHERE codigo IS NOT NULL AND codigo <> ''
  LOOP
    IF raw !~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$' THEN
      RAISE EXCEPTION 'Código de barras no válido: %', raw;
    END IF;
  END LOOP;

  IF n_total > 0 AND EXISTS (
    SELECT 1
    FROM public.catalogo c
    WHERE c.id <> NEW.id
      AND c.deleted_at IS NULL
      AND COALESCE(c.punto, 'Cafetería') = COALESCE(NEW.punto, 'Cafetería')
      AND EXISTS (
        SELECT 1
        FROM (
          SELECT c.codigo_barras AS codigo
          UNION ALL
          SELECT a->>'codigo' AS codigo
          FROM jsonb_array_elements(COALESCE(c.codigos_barras, '[]'::jsonb)) a
        ) listado
        WHERE listado.codigo IS NOT NULL
          AND listado.codigo <> ''
          AND lpad(btrim(listado.codigo), 14, '0') = ANY (claves)
      )
  ) THEN
    RAISE EXCEPTION 'El código ya pertenece a otro producto del mismo punto de venta.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alfaro_evitar_codigos_duplicados ON public.catalogo;

CREATE TRIGGER alfaro_evitar_codigos_duplicados
BEFORE INSERT OR UPDATE OF codigo_barras, codigos_barras, punto, deleted_at
ON public.catalogo
FOR EACH ROW
EXECUTE FUNCTION public.alfaro_validar_codigos_producto();

COMMIT;

-- Confirmación de estructura (sin cambios a datos):
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'catalogo'
  AND column_name IN ('codigo_barras', 'codigos_barras')
ORDER BY column_name;
