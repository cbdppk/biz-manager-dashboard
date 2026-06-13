-- Beta hardening: tables referenced by optional workers / future AI memory.
-- Safe for existing production data (IF NOT EXISTS only).

CREATE TABLE IF NOT EXISTS ai_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  content text NOT NULL,
  type text,
  date date,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_embeddings_business_type_date_uidx
  ON ai_embeddings (business_id, type, date);

CREATE INDEX IF NOT EXISTS idx_ai_embeddings_business_created
  ON ai_embeddings (business_id, created_at DESC);

ALTER TABLE ai_embeddings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_embeddings' AND policyname = 'service_role_all_ai_embeddings'
  ) THEN
    CREATE POLICY service_role_all_ai_embeddings
      ON ai_embeddings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
