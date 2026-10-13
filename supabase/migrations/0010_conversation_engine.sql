-- Cohortech — Motor conversacional: bloqueados, toma de control humana,
-- negociación, memoria, canales y promociones.
-- Idempotente: se puede correr más de una vez sin error.

-- ── Bloqueados / opt-out / toma de control humana ─────────────────
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS blocked_reason text;      -- opt_out | manual | spam
ALTER TABLE patients ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS bot_paused_until timestamptz;

-- ── Rotación de plantillas y protección contra bucles ─────────────
ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_template_key text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS ai_fallback_streak integer DEFAULT 0;

-- ── Negociación ───────────────────────────────────────────────────
ALTER TABLE patients ADD COLUMN IF NOT EXISTS negotiation_stage integer DEFAULT 0;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_discount_offered integer;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS negotiation_updated_at timestamptz;

-- ── Canales y origen de respuesta ─────────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel text DEFAULT 'whatsapp';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS response_source text;     -- template | negotiation | safety | ai | human

-- ── Promociones ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text,
  discount_percent integer CHECK (discount_percent IS NULL OR (discount_percent BETWEEN 1 AND 90)),
  service_name     text,                      -- null = aplica a todos los servicios
  starts_at        timestamptz DEFAULT now(),
  ends_at          timestamptz,               -- null = sin fecha de término
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotions_clinic_active
  ON promotions(clinic_id, is_active, ends_at);

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'promotions' AND policyname = 'promotions_clinic'
  ) THEN
    CREATE POLICY promotions_clinic ON promotions
      USING ((current_setting('request.jwt.claims', true)::jsonb->>'clinic_id')::uuid = clinic_id);
  END IF;
END $$;

-- ── Índices de apoyo ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_patients_blocked ON patients(clinic_id, is_blocked);
CREATE INDEX IF NOT EXISTS idx_messages_patient_sent ON messages(patient_id, sent_at DESC);
