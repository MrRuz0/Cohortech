-- Cohortech — Módulo: Scoring de Pacientes (LTV + Churn Risk + Historial)

-- 1. Campos en patients para tracking de historial real
ALTER TABLE patients ADD COLUMN IF NOT EXISTS total_messages_sent     integer DEFAULT 0;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS total_messages_received integer DEFAULT 0;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS conversions_count       integer DEFAULT 0;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS first_contact_at        timestamptz;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_conversion_at      timestamptz;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_returning            boolean DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS days_since_last_contact integer;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS scored_at               timestamptz;

-- 2. Índice para el cron de scoring (solo pacientes no scorados o desactualizados)
CREATE INDEX IF NOT EXISTS idx_patients_scored_at ON patients(clinic_id, scored_at NULLS FIRST);

-- 3. Índice para buscar rápidamente pacientes recurrentes
CREATE INDEX IF NOT EXISTS idx_patients_returning ON patients(clinic_id, is_returning, status);
