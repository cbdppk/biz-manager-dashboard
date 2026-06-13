-- Sprint 010B: token invalidation, billing idempotency, staff invite hardening

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'paystack',
  provider_ref text NOT NULL,
  event_type text NOT NULL,
  plan text,
  amount integer,
  currency text,
  status text NOT NULL DEFAULT 'processed',
  raw_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_events_provider_ref_unique UNIQUE (provider_ref)
);

CREATE INDEX IF NOT EXISTS idx_billing_events_business_created
  ON billing_events (business_id, created_at DESC);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'billing_events' AND policyname = 'service_role_all_billing_events'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all_billing_events" ON billing_events FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;
