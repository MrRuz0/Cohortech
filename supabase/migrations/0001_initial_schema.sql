-- Cohortech — Módulo 2: Schema inicial (multi-tenant)

-- ============================================================
-- TABLA: clinics (tenants)
-- ============================================================
CREATE TABLE clinics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  wa_session_id     TEXT,
  wa_phone_number   TEXT,
  api_provider      TEXT DEFAULT 'evolution',
  meta_waba_id      TEXT,
  meta_access_token TEXT,
  settings          JSONB DEFAULT '{}',
  plan              TEXT DEFAULT 'starter',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: patients
-- ============================================================
CREATE TABLE patients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  full_name         TEXT,
  phone_e164        TEXT NOT NULL,
  wa_contact_id     TEXT,
  status            TEXT DEFAULT 'lead',
  channel_source    TEXT,
  ltv_score         FLOAT DEFAULT 0,
  churn_risk_score  FLOAT DEFAULT 0,
  extracted_profile JSONB DEFAULT '{}',
  last_contact_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, phone_e164)
);

-- ============================================================
-- TABLA: messages
-- ============================================================
CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id        UUID REFERENCES patients(id) ON DELETE CASCADE,
  wa_message_id     TEXT UNIQUE,
  direction         TEXT NOT NULL,
  content_text      TEXT,
  media_url         TEXT,
  processing_status TEXT DEFAULT 'pending',
  nlp_result        JSONB,
  sent_at           TIMESTAMPTZ NOT NULL,
  processed_at      TIMESTAMPTZ
);

-- ============================================================
-- TABLA: cohort_definitions
-- ============================================================
CREATE TABLE cohort_definitions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id            UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  treatment_name       TEXT NOT NULL,
  treatment_slug       TEXT NOT NULL,
  bio_cycle_days       INT NOT NULL,
  reminder_offset_days INT DEFAULT -14,
  trigger_keywords     TEXT[],
  message_templates    JSONB DEFAULT '{}',
  is_active            BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- TABLA: cohort_memberships
-- ============================================================
CREATE TABLE cohort_memberships (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  cohort_id           UUID NOT NULL REFERENCES cohort_definitions(id) ON DELETE CASCADE,
  clinic_id           UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  treatment_date      DATE NOT NULL,
  next_event_date     DATE NOT NULL,
  sessions_completed  INT DEFAULT 1,
  membership_status   TEXT DEFAULT 'active',
  confidence_score    FLOAT DEFAULT 1.0,
  enrolled_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLA: scheduled_events
-- ============================================================
CREATE TABLE scheduled_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  membership_id   UUID REFERENCES cohort_memberships(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  status          TEXT DEFAULT 'pending',
  scheduled_at    TIMESTAMPTZ NOT NULL,
  executed_at     TIMESTAMPTZ,
  wa_template_id  TEXT,
  payload         JSONB DEFAULT '{}',
  attempt_count   INT DEFAULT 0,
  failure_reason  TEXT
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_patients_clinic ON patients(clinic_id);
CREATE INDEX idx_messages_patient ON messages(patient_id, sent_at DESC);
CREATE INDEX idx_scheduled_events_due ON scheduled_events(scheduled_at, status)
  WHERE status = 'pending';
CREATE INDEX idx_memberships_next_event ON cohort_memberships(next_event_date, clinic_id)
  WHERE membership_status = 'active';

-- ============================================================
-- ROW LEVEL SECURITY (aislamiento multi-tenant por clinic_id)
-- ============================================================
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON clinics
  USING (id = (auth.jwt() ->> 'clinic_id')::UUID);

CREATE POLICY tenant_isolation ON patients
  USING (clinic_id = (auth.jwt() ->> 'clinic_id')::UUID);

CREATE POLICY tenant_isolation ON messages
  USING (clinic_id = (auth.jwt() ->> 'clinic_id')::UUID);

CREATE POLICY tenant_isolation ON cohort_definitions
  USING (clinic_id = (auth.jwt() ->> 'clinic_id')::UUID);

CREATE POLICY tenant_isolation ON cohort_memberships
  USING (clinic_id = (auth.jwt() ->> 'clinic_id')::UUID);

CREATE POLICY tenant_isolation ON scheduled_events
  USING (clinic_id = (auth.jwt() ->> 'clinic_id')::UUID);

-- ============================================================
-- COHORTES PREDEFINIDAS (insertadas por clínica al crearse,
-- aquí se deja el catálogo de referencia comentado para Módulo 6)
-- ============================================================
-- Toxina Botulínica   | botox        | 150 días | -14 | {botox,toxina,dysport,bótox,xeomin}
-- Ácido Hialurónico   | ha-filler    | 180 días | -21 | {hialuronico,filler,relleno,labios,pómulos}
-- Hilos de PDO        | pdo-threads  | 365 días | -30 | {hilos,pdo,tensor,lifting}
-- Profhilo/Skinbooster| skinbooster  | 180 días | -21 | {profhilo,skinbooster,bioestimulador}
-- Sculptra            | sculptra     | 365 días | -45 | {sculptra,plla,ácido poliláctico}
-- Laser / IPL         | laser        | 90 días  | -10 | {laser,ipl,fotorejuvenecimiento}
