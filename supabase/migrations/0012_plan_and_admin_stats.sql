-- Cohortech — Plan por clínica (cobro manual) y estadísticas para el panel de administrador.
-- Idempotente: se puede correr más de una vez.

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS plan_status text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz;

-- Las clínicas que ya existen quedan activas y SIN vencimiento (nada se apaga de golpe).
UPDATE clinics SET plan_status = 'active' WHERE plan_status IS NULL;

-- Las clínicas nuevas parten en prueba de 7 días.
ALTER TABLE clinics ALTER COLUMN plan_status SET DEFAULT 'trial';
ALTER TABLE clinics ALTER COLUMN plan_status SET NOT NULL;
ALTER TABLE clinics ALTER COLUMN plan_expires_at SET DEFAULT (now() + interval '7 days');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinics_plan_status_check'
  ) THEN
    ALTER TABLE clinics
      ADD CONSTRAINT clinics_plan_status_check CHECK (plan_status IN ('trial', 'active', 'suspended'));
  END IF;
END $$;

-- Estadísticas por clínica desde una fecha (solo el rol de servicio puede ejecutarla).
CREATE OR REPLACE FUNCTION public.admin_clinic_stats(p_since timestamptz)
RETURNS TABLE (
  clinic_id           uuid,
  inbound             bigint,
  template            bigint,
  negotiation         bigint,
  ai                  bigint,
  safety              bigint,
  human               bigint,
  bookings            bigint,
  booking_patient_ids uuid[],
  last_message_at     timestamptz,
  errors_7d           bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    count(*) FILTER (WHERE m.direction = 'inbound'),
    count(*) FILTER (WHERE m.direction = 'outbound' AND m.response_source = 'template'),
    count(*) FILTER (WHERE m.direction = 'outbound' AND m.response_source = 'negotiation'),
    count(*) FILTER (WHERE m.direction = 'outbound' AND m.response_source = 'ai'),
    count(*) FILTER (WHERE m.direction = 'outbound' AND m.response_source = 'safety'),
    count(*) FILTER (WHERE m.direction = 'outbound' AND m.response_source = 'human'),
    count(DISTINCT m.patient_id) FILTER (
      WHERE m.direction = 'inbound' AND m.nlp_result ->> 'intent' = 'booking'
    ),
    coalesce(
      array_agg(DISTINCT m.patient_id) FILTER (
        WHERE m.direction = 'inbound' AND m.nlp_result ->> 'intent' = 'booking' AND m.patient_id IS NOT NULL
      ),
      '{}'::uuid[]
    ),
    max(m.sent_at),
    (
      SELECT count(*) FROM system_events e
      WHERE e.clinic_id = c.id AND e.level = 'error' AND e.resolved_at IS NULL
        AND e.created_at >= now() - interval '7 days'
    )
  FROM clinics c
  LEFT JOIN messages m ON m.clinic_id = c.id AND m.sent_at >= p_since
  GROUP BY c.id;
$$;

REVOKE ALL ON FUNCTION public.admin_clinic_stats(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clinic_stats(timestamptz) TO service_role;
