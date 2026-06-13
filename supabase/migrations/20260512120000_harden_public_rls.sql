-- Enable RLS on all BizManager public tables and allow only the backend service role.
-- Safe for this app: API uses SUPABASE_SECRET_KEY (service_role), not the anon key.
-- anon / authenticated roles get no policies → default deny.

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT *
    FROM (VALUES
      ('businesses'),
      ('users'),
      ('products'),
      ('customers'),
      ('sales'),
      ('sale_items'),
      ('credit_ledger'),
      ('payments'),
      ('invoices'),
      ('invoice_items'),
      ('ai_tool_log'),
      ('stock_movements'),
      ('menu_categories'),
      ('menu_item_options'),
      ('menu_item_option_values'),
      ('orders'),
      ('order_items'),
      ('recipes'),
      ('recipe_items'),
      ('product_categories')
    ) AS tables(table_name)
  LOOP
    IF to_regclass(format('public.%I', target.table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target.table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target.table_name
        AND policyname = format('service_role_all_%s', target.table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        format('service_role_all_%s', target.table_name),
        target.table_name
      );
    END IF;
  END LOOP;
END $$;
