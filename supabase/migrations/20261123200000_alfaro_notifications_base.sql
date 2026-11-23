-- AlFaroCafé Manager · Infraestructura de notificaciones
-- Afecta solo las tablas nuevas de notificaciones. No borra datos anteriores.
BEGIN;
CREATE TABLE IF NOT EXISTS public.alfaro_notif_config (
  id text PRIMARY KEY DEFAULT 'global' CHECK (id='global'),
  vapid_public_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.alfaro_notif_config(id) VALUES ('global') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.alfaro_notif_intentos (
  auth_uid uuid PRIMARY KEY,
  intentos integer NOT NULL DEFAULT 0,
  desde timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alfaro_notif_sesiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.pin_users(id) ON DELETE CASCADE,
  auth_uid uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  creado_en timestamptz NOT NULL DEFAULT now(),
  vence timestamptz NOT NULL DEFAULT (now() + interval '180 days')
);
CREATE INDEX IF NOT EXISTS alfaro_notif_sesion_usuario ON public.alfaro_notif_sesiones(usuario_id,vence);

CREATE TABLE IF NOT EXISTS public.alfaro_notif_dispositivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispositivo_id uuid NOT NULL,
  usuario_id uuid NOT NULL REFERENCES public.pin_users(id) ON DELETE CASCADE,
  auth_uid uuid NOT NULL,
  endpoint text UNIQUE,
  p256dh text,
  auth_key text,
  plataforma text NOT NULL DEFAULT 'PWA',
  nombre_dispositivo text,
  habilitado boolean NOT NULL DEFAULT false,
  preferencias jsonb NOT NULL DEFAULT '{"precuadres":true,"caja":true,"stock":true,"cxc":true,"auditoria":true}'::jsonb,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(dispositivo_id,usuario_id)
);
CREATE INDEX IF NOT EXISTS alfaro_notif_dispositivos_activos
ON public.alfaro_notif_dispositivos (habilitado, usuario_id);

CREATE TABLE IF NOT EXISTS public.alfaro_notif_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  categoria text NOT NULL CHECK (categoria IN ('precuadres','caja','stock','cxc','auditoria')),
  titulo text NOT NULL,
  contenido text NOT NULL DEFAULT '',
  destino text NOT NULL DEFAULT '/',
  roles text[] NOT NULL DEFAULT ARRAY['admin','duena']::text[],
  destinatario_nombre text,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alfaro_notif_eventos_orden ON public.alfaro_notif_eventos(creado_en DESC);

CREATE TABLE IF NOT EXISTS public.alfaro_notif_lecturas (
  usuario_id uuid NOT NULL REFERENCES public.pin_users(id) ON DELETE CASCADE,
  evento_id uuid NOT NULL REFERENCES public.alfaro_notif_eventos(id) ON DELETE CASCADE,
  leido_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(usuario_id,evento_id)
);

CREATE TABLE IF NOT EXISTS public.alfaro_notif_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.alfaro_notif_eventos(id) ON DELETE CASCADE,
  dispositivo_id uuid NOT NULL REFERENCES public.alfaro_notif_dispositivos(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviado','error','expirado')),
  intentos integer NOT NULL DEFAULT 0,
  ultimo_error text,
  enviado_en timestamptz,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(evento_id, dispositivo_id)
);

ALTER TABLE public.alfaro_notif_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alfaro_notif_intentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alfaro_notif_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alfaro_notif_dispositivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alfaro_notif_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alfaro_notif_lecturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alfaro_notif_entregas ENABLE ROW LEVEL SECURITY;
-- El acceso de la PWA se concede únicamente a funciones verificadas por el PIN habitual.
REVOKE ALL ON public.alfaro_notif_intentos,public.alfaro_notif_sesiones,
  public.alfaro_notif_dispositivos,public.alfaro_notif_eventos,
  public.alfaro_notif_lecturas,public.alfaro_notif_entregas,
  public.alfaro_notif_config FROM anon,authenticated;
COMMIT;
