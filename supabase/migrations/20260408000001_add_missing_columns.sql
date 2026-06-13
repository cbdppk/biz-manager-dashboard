-- ═══════════════════════════════════════════════════════════════
-- BizManager — Add Missing Columns
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Products: add category + needs_restock
ALTER TABLE products ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS needs_restock boolean DEFAULT false;

-- Businesses: add notification settings + subscription dates
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS low_stock_alerts boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS daily_summary_sms boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz DEFAULT (now() + interval '14 days');
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

-- Invoice items: add product_name for display
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS product_name text;

-- AI Tool Log table
CREATE TABLE IF NOT EXISTS ai_tool_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  tool_name   text NOT NULL,
  input       jsonb,
  result      text,
  created_at  timestamptz DEFAULT now()
);

-- RPC: Decrement stock (safe, no negative)
CREATE OR REPLACE FUNCTION decrement_stock(
  p_product_id  uuid,
  p_qty         integer,
  p_business_id uuid
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE products
  SET stock_qty = GREATEST(0, stock_qty - p_qty)
  WHERE id = p_product_id
    AND business_id = p_business_id;
$$;

-- RLS policy for ai_tool_log (service role full access)
ALTER TABLE ai_tool_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_ai_tool_log" ON ai_tool_log;
CREATE POLICY "service_role_all_ai_tool_log" ON ai_tool_log FOR ALL TO service_role USING (true) WITH CHECK (true);
