
ALTER TABLE public.catalogo ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.dependientes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.cuadres ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_catalogo_deleted_at ON public.catalogo (deleted_at);
CREATE INDEX IF NOT EXISTS idx_dependientes_deleted_at ON public.dependientes (deleted_at);
CREATE INDEX IF NOT EXISTS idx_cuadres_deleted_at ON public.cuadres (deleted_at);
