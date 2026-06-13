-- Sprint 009: support requests and audit logs for beta operations.

CREATE TABLE IF NOT EXISTS support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (char_length(type) <= 60),
  area text NOT NULL CHECK (char_length(area) <= 80),
  message text NOT NULL CHECK (char_length(message) >= 10 AND char_length(message) <= 2000),
  contact text CHECK (contact IS NULL OR char_length(contact) <= 120),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed')),
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_support_requests_business_created
  ON support_requests (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_requests_business_status
  ON support_requests (business_id, status);

ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'support_requests'
      AND policyname = 'service_role_all_support_requests'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all_support_requests" ON support_requests FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) <= 100),
  entity_type text NOT NULL CHECK (char_length(entity_type) <= 80),
  entity_id text CHECK (entity_id IS NULL OR char_length(entity_id) <= 120),
  summary text CHECK (summary IS NULL OR char_length(summary) <= 500),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created
  ON audit_logs (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_entity
  ON audit_logs (business_id, entity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_action
  ON audit_logs (business_id, action, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs'
      AND policyname = 'service_role_all_audit_logs'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all_audit_logs" ON audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;
