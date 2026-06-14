-- Cohortech — Módulo 6: Cohortes predefinidas

-- Permite upsert de membresías por paciente+cohorte
ALTER TABLE cohort_memberships ADD CONSTRAINT cohort_memberships_patient_cohort_unique UNIQUE (patient_id, cohort_id);

-- Sembrar las 6 cohortes para clínicas ya existentes
INSERT INTO cohort_definitions (clinic_id, treatment_name, treatment_slug, bio_cycle_days, reminder_offset_days, trigger_keywords)
SELECT c.id, v.treatment_name, v.treatment_slug, v.bio_cycle_days, v.reminder_offset_days, v.trigger_keywords
FROM clinics c
CROSS JOIN (
  VALUES
    ('Toxina Botulínica', 'botox', 150, -14, ARRAY['botox','toxina','dysport','bótox','xeomin']),
    ('Ácido Hialurónico', 'ha-filler', 180, -21, ARRAY['hialuronico','hialurónico','filler','relleno','labios','pómulos','pomulos']),
    ('Hilos de PDO', 'pdo-threads', 365, -30, ARRAY['hilos','pdo','tensor','lifting']),
    ('Profhilo/Skinbooster', 'skinbooster', 180, -21, ARRAY['profhilo','skinbooster','bioestimulador']),
    ('Sculptra', 'sculptra', 365, -45, ARRAY['sculptra','plla','ácido poliláctico','acido polilactico']),
    ('Laser / IPL', 'laser', 90, -10, ARRAY['laser','láser','ipl','fotorejuvenecimiento'])
) AS v(treatment_name, treatment_slug, bio_cycle_days, reminder_offset_days, trigger_keywords)
WHERE NOT EXISTS (
  SELECT 1 FROM cohort_definitions cd
  WHERE cd.clinic_id = c.id AND cd.treatment_slug = v.treatment_slug
);

-- Actualizar el trigger de creación de clínicas para sembrar las cohortes automáticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
DECLARE
  new_clinic_id UUID;
BEGIN
  INSERT INTO public.clinics (name, owner_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'clinic_name', 'Mi Clínica'),
    NEW.id
  )
  RETURNING id INTO new_clinic_id;

  INSERT INTO public.cohort_definitions (clinic_id, treatment_name, treatment_slug, bio_cycle_days, reminder_offset_days, trigger_keywords)
  VALUES
    (new_clinic_id, 'Toxina Botulínica', 'botox', 150, -14, ARRAY['botox','toxina','dysport','bótox','xeomin']),
    (new_clinic_id, 'Ácido Hialurónico', 'ha-filler', 180, -21, ARRAY['hialuronico','hialurónico','filler','relleno','labios','pómulos','pomulos']),
    (new_clinic_id, 'Hilos de PDO', 'pdo-threads', 365, -30, ARRAY['hilos','pdo','tensor','lifting']),
    (new_clinic_id, 'Profhilo/Skinbooster', 'skinbooster', 180, -21, ARRAY['profhilo','skinbooster','bioestimulador']),
    (new_clinic_id, 'Sculptra', 'sculptra', 365, -45, ARRAY['sculptra','plla','ácido poliláctico','acido polilactico']),
    (new_clinic_id, 'Laser / IPL', 'laser', 90, -10, ARRAY['laser','láser','ipl','fotorejuvenecimiento']);

  RETURN NEW;
END;
$;
