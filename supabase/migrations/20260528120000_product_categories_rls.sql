-- product_categories lives in public but was omitted from harden_public_rls.
-- Backend uses service_role only; no anon/authenticated policies → default deny.

DO $$
BEGIN
  IF to_regclass('public.product_categories') IS NULL THEN
    RAISE NOTICE 'product_categories not present, skipping RLS hardening';
    RETURN;
  END IF;

  ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
  ALTER TABLE product_categories FORCE ROW LEVEL SECURITY;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'product_categories'
      AND policyname = 'service_role_all_product_categories'
  ) THEN
    CREATE POLICY service_role_all_product_categories
      ON product_categories
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
