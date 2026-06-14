-- Cohortech — Módulo 3: Autenticación de clínicas

-- ============================================================
-- Vincular clínicas a usuarios de auth
-- ============================================================
ALTER TABLE clinics ADD COLUMN owner_id UUID REFERENCES auth.users(id);

-- ============================================================
-- Trigger: al registrarse un usuario, crear su clínica
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.clinics (name, owner_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'clinic_name', 'Mi Clínica'),
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- Custom Access Token Hook: agrega clinic_id al JWT
-- (Activar en Supabase Dashboard → Authentication → Hooks
--  → Custom Access Token → seleccionar esta función)
-- ============================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  clinic_uuid uuid;
BEGIN
  SELECT id INTO clinic_uuid
  FROM public.clinics
  WHERE owner_id = (event->>'user_id')::uuid
  LIMIT 1;

  claims := event->'claims';

  IF clinic_uuid IS NOT NULL THEN
    claims := jsonb_set(claims, '{clinic_id}', to_jsonb(clinic_uuid::text));
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- Permitir que el dueño vea su propia clínica (incluso antes del primer JWT con clinic_id)
CREATE POLICY owner_select ON clinics
  FOR SELECT USING (owner_id = auth.uid());
