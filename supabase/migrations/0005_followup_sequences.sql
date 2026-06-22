-- Cohortech — Módulo: Secuencias de Seguimiento Automático

-- 1. Descuento máximo permitido por clínica (la IA elige dentro de este rango)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS max_discount_percent integer DEFAULT 10;

-- 2. Estado de seguimiento por membresía de cohorte
ALTER TABLE cohort_memberships ADD COLUMN IF NOT EXISTS followup_stage integer DEFAULT 0;
ALTER TABLE cohort_memberships ADD COLUMN IF NOT EXISTS next_followup_at timestamptz DEFAULT now();
ALTER TABLE cohort_memberships ADD COLUMN IF NOT EXISTS churned_at timestamptz;

-- 3. Histórico de mensajes de seguimiento enviados (auditoría)
CREATE TABLE IF NOT EXISTS followup_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  cohort_id       uuid NOT NULL REFERENCES cohort_definitions(id) ON DELETE CASCADE,
  stage           integer NOT NULL,
  message_text    text NOT NULL,
  discount_offered integer,
  sent_at         timestamptz DEFAULT now()
);

ALTER TABLE followup_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY followup_log_clinic ON followup_log
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'clinic_id')::uuid = clinic_id);
