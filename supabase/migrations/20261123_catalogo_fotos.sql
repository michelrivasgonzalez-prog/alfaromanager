-- AlfaroCafé Manager · Fotografía opcional en Catálogo de Productos.
-- Migración aditiva: no reescribe registros existentes ni cuadres.
BEGIN;

ALTER TABLE public.catalogo
  ADD COLUMN IF NOT EXISTS foto_url text;

COMMENT ON COLUMN public.catalogo.foto_url IS
  'URL pública opcional de foto comprimida (máx. 320 px) para catálogo; no forma parte del cuadre.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('catalogo-fotos', 'catalogo-fotos', true, 150000, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- Las miniaturas públicas son visibles en todos los dispositivos;
-- sólo sesiones autenticadas pueden cargar/actualizar las suyas.
DROP POLICY IF EXISTS "alfaro_catalogo_fotos_subir" ON storage.objects;
CREATE POLICY "alfaro_catalogo_fotos_subir"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'catalogo-fotos');

DROP POLICY IF EXISTS "alfaro_catalogo_fotos_ver" ON storage.objects;
CREATE POLICY "alfaro_catalogo_fotos_ver"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'catalogo-fotos');

DROP POLICY IF EXISTS "alfaro_catalogo_fotos_borrar" ON storage.objects;
CREATE POLICY "alfaro_catalogo_fotos_borrar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'catalogo-fotos');

COMMIT;

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='catalogo' AND column_name='foto_url';
