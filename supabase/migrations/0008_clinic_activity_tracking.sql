-- Cohortech — Módulo: Tracking de actividad por clínica (para panel de retención admin)

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS owner_last_login_at  timestamptz;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS last_wa_message_at   timestamptz;

-- Índice para ordenar por riesgo rápidamente
CREATE INDEX IF NOT EXISTS idx_clinics_activity
  ON clinics(owner_last_login_at, last_wa_message_at);
