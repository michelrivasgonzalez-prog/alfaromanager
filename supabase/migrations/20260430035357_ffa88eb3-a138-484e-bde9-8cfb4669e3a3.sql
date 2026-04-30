-- Enum de roles
CREATE TYPE public.app_role AS ENUM ('admin', 'duena', 'dependiente');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Función has_role (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Dependientes (lista compartida)
CREATE TABLE public.dependientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dependientes ENABLE ROW LEVEL SECURITY;

-- Catálogo (lista compartida)
CREATE TABLE public.catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  precio NUMERIC NOT NULL DEFAULT 0,
  costo NUMERIC NOT NULL DEFAULT 0,
  punto TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.catalogo ENABLE ROW LEVEL SECURITY;

-- Cuadres (documento JSON por turno finalizado)
CREATE TABLE public.cuadres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  punto_venta TEXT NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  dependiente TEXT,
  finalizado BOOLEAN NOT NULL DEFAULT true,
  data JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cuadres ENABLE ROW LEVEL SECURITY;
CREATE INDEX cuadres_fecha_idx ON public.cuadres (fecha DESC);
CREATE INDEX cuadres_punto_idx ON public.cuadres (punto_venta);

-- ============ POLICIES ============

-- profiles: cada usuario ve/edita el suyo; admin ve todos
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles_insert_self" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_self" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- user_roles: cualquiera autenticado puede ver SU rol; admin gestiona todo
CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_insert" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_update" ON public.user_roles
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_delete" ON public.user_roles
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- dependientes
CREATE POLICY "dependientes_select_authed" ON public.dependientes
FOR SELECT TO authenticated USING (true);
CREATE POLICY "dependientes_admin_insert" ON public.dependientes
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "dependientes_admin_update" ON public.dependientes
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "dependientes_admin_delete" ON public.dependientes
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- catalogo
CREATE POLICY "catalogo_select_authed" ON public.catalogo
FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalogo_admin_insert" ON public.catalogo
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "catalogo_admin_update" ON public.catalogo
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "catalogo_admin_delete" ON public.catalogo
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- cuadres: todos los autenticados ven; solo admin puede crear/editar/borrar
CREATE POLICY "cuadres_select_authed" ON public.cuadres
FOR SELECT TO authenticated USING (true);
CREATE POLICY "cuadres_admin_insert" ON public.cuadres
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cuadres_admin_update" ON public.cuadres
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cuadres_admin_delete" ON public.cuadres
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ TRIGGERS ============

-- updated_at helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER catalogo_updated BEFORE UPDATE ON public.catalogo
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER cuadres_updated BEFORE UPDATE ON public.cuadres
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto-crear profile y rol por defecto al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nombre)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email));

  -- Si es el PRIMER usuario => admin; si no => dependiente
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'dependiente');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();