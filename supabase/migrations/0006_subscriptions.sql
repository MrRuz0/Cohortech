-- Cohortech — Módulo: Suscripciones y cobro recurrente (MercadoPago)

CREATE TABLE IF NOT EXISTS subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'trialing', -- trialing | active | past_due | canceled
  trial_ends_at       timestamptz,
  current_period_end  timestamptz,
  mp_preapproval_id   text,
  payer_email         text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(clinic_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_clinic ON subscriptions
  USING ((current_setting('request.jwt.claims', true)::jsonb->>'clinic_id')::uuid = clinic_id);
