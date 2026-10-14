-- Cohortech — Registro de eventos del sistema y auditoría diaria (solo administrador).
-- Idempotente: se puede correr más de una vez.

CREATE TABLE IF NOT EXISTS system_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  level       text NOT NULL CHECK (level IN ('error', 'warn', 'info')),
  source      text NOT NULL,                 -- wa-webhook | dispatch | followups | ai | deliver | notify | schema | admin ...
  message     text NOT NULL,                 -- qué ocurrió
  detail      jsonb NOT NULL DEFAULT '{}',   -- contexto: error original, ids, payload resumido
  clinic_id   uuid REFERENCES clinics(id) ON DELETE SET NULL,
  patient_id  uuid REFERENCES patients(id) ON DELETE SET NULL,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_open
  ON system_events(level, created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_system_events_clinic ON system_events(clinic_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_reports (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day        date NOT NULL UNIQUE,           -- día auditado (hora de Lima)
  created_at timestamptz NOT NULL DEFAULT now(),
  summary    jsonb NOT NULL
);

-- Solo el rol de servicio las lee/escribe: sin políticas, RLS bloquea a todos los demás.
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;
