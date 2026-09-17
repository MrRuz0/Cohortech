-- Cohortech — Módulo: Reactivación real por inactividad (reemplaza el
-- sistema viejo de ciclos por tratamiento, que quedó roto en 0004).

-- Contador de intentos de reactivación en el ciclo actual (máximo 2).
ALTER TABLE patients ADD COLUMN IF NOT EXISTS reactivation_attempts_count integer DEFAULT 0;

-- Cuándo se mandó el último intento de reactivación — se compara contra
-- last_contact_at para saber si el paciente respondió o no.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_reactivation_sent_at timestamptz;

-- Cooldown extendido: si agotó los 2 intentos sin respuesta, se excluye
-- de reactivaciones por 12 meses en vez de reintentar cada ciclo.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS reactivation_paused_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_patients_reactivation
  ON patients(clinic_id, last_contact_at, reactivation_paused_until);
