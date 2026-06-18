-- Cohortech — Módulo: Cohortes Dinámicas por Comportamiento

-- 1. Campos nuevos en clinics
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS receptionist_phone text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS clinic_description text;

-- 2. Cooldown de auto-respuesta en patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_auto_response_at timestamptz;

-- 3. Rediseñar cohort_definitions y cohort_memberships
DROP TABLE IF EXISTS scheduled_events CASCADE;
DROP TABLE IF EXISTS cohort_memberships CASCADE;
DROP TABLE IF EXISTS cohort_definitions CASCADE;

CREATE TABLE cohort_definitions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id              uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  behavioral_description text NOT NULL,
  pain_point             text NOT NULL,
  conversion_strategy    text NOT NULL,
  message_template       text NOT NULL,
  is_auto_generated      boolean DEFAULT true,
  is_active              boolean DEFAULT true,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

CREATE TABLE cohort_memberships (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id       uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  cohort_id        uuid NOT NULL REFERENCES cohort_definitions(id) ON DELETE CASCADE,
  membership_status text NOT NULL DEFAULT 'active',
  assigned_at      timestamptz DEFAULT now(),
  last_messaged_at timestamptz,
  converted_at     timestamptz,
  conversion_type  text,
  message_count    integer DEFAULT 0,
  UNIQUE(patient_id, cohort_id)
);

-- 4. RLS
ALTER TABLE cohort_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY cohort_definitions_clinic ON cohort_definitions
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'clinic_id')::uuid = clinic_id);

CREATE POLICY cohort_memberships_clinic ON cohort_memberships
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'clinic_id')::uuid = clinic_id);

-- 5. Helper para incrementar message_count en membresías
CREATE OR REPLACE FUNCTION public.increment_cohort_message_count(
  p_patient_id uuid,
  p_cohort_id  uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE cohort_memberships
  SET message_count   = message_count + 1,
      last_messaged_at = now()
  WHERE patient_id = p_patient_id
    AND cohort_id  = p_cohort_id;
$$;

-- 6. Simplificar handle_new_user (sin cohortes estáticas)
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
