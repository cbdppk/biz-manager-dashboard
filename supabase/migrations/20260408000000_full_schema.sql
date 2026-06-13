-- ═══════════════════════════════════════════════════════════════
-- BizManager — Full Schema Migration
-- Run this in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Businesses
CREATE TABLE IF NOT EXISTS businesses (
  id                     uuid PRIMARY KEY,
  name                   text NOT NULL,
  phone                  text,
  sector                 text,
  owner_id               uuid,
  whatsapp_enabled       boolean DEFAULT false,
  subscription_tier      text DEFAULT 'trial',
  trial_ends_at          timestamptz DEFAULT (now() + interval '14 days'),
  subscription_expires_at timestamptz,
  low_stock_alerts       boolean DEFAULT true,
  daily_summary_sms      boolean DEFAULT false,
  created_at             timestamptz DEFAULT now()
);

-- Users for custom JWT auth
CREATE TABLE IF NOT EXISTS users (
  id          uuid PRIMARY KEY,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  email       text NOT NULL,
  password_hash text,
  name        text,
  phone       text,
  role        text DEFAULT 'cashier' CHECK (role IN ('owner', 'manager', 'cashier')),
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name           text NOT NULL,
  sku            text,
  category       text,
  selling_price  numeric NOT NULL DEFAULT 0,
  cost_price     numeric DEFAULT 0,
  stock_qty      integer DEFAULT 0,
  reorder_level  integer DEFAULT 5,
  unit           text DEFAULT 'piece',
  is_active      boolean DEFAULT true,
  needs_restock  boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name        text NOT NULL,
  phone       text,
  email       text,
  created_at  timestamptz DEFAULT now()
);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id    uuid REFERENCES customers(id) ON DELETE SET NULL,
  cashier_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  total_amount   numeric NOT NULL DEFAULT 0,
  amount_paid    numeric NOT NULL DEFAULT 0,
  balance        numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL,
  note           text,
  status         text DEFAULT 'paid' CHECK (status IN ('paid', 'partial', 'credit', 'refunded')),
  created_at     timestamptz DEFAULT now()
);

-- Sale Items
CREATE TABLE IF NOT EXISTS sale_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     uuid REFERENCES sales(id) ON DELETE CASCADE,
  product_id  uuid REFERENCES products(id) ON DELETE SET NULL,
  qty         integer NOT NULL,
  unit_price  numeric NOT NULL,
  discount    numeric DEFAULT 0,
  subtotal    numeric NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- Credit Ledger
CREATE TABLE IF NOT EXISTS credit_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  sale_id     uuid REFERENCES sales(id) ON DELETE SET NULL,
  amount      numeric NOT NULL,
  type        text DEFAULT 'debt' CHECK (type IN ('debt', 'payment')),
  due_date    date,
  settled     boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id      uuid REFERENCES sales(id) ON DELETE SET NULL,
  customer_id  uuid REFERENCES customers(id) ON DELETE SET NULL,
  amount       numeric NOT NULL,
  method       text,
  provider_ref text,
  status       text DEFAULT 'pending',
  note         text,
  created_at   timestamptz DEFAULT now()
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id    uuid REFERENCES customers(id) ON DELETE SET NULL,
  invoice_number text,
  total_amount   numeric DEFAULT 0,
  status         text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  due_date       date,
  note           text,
  created_at     timestamptz DEFAULT now()
);

-- Invoice Items
CREATE TABLE IF NOT EXISTS invoice_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid REFERENCES invoices(id) ON DELETE CASCADE,
  product_id   uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  qty          integer NOT NULL DEFAULT 1,
  unit_price   numeric NOT NULL DEFAULT 0,
  subtotal     numeric NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- AI Tool Log
CREATE TABLE IF NOT EXISTS ai_tool_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  tool_name   text NOT NULL,
  input       jsonb,
  result      text,
  created_at  timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- RPC: Decrement stock safely (no negative stock)
-- ═══════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security — enable but allow service role full access
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE businesses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tool_log    ENABLE ROW LEVEL SECURITY;

-- Allow service role (backend) to bypass RLS
CREATE POLICY "service_role_all_businesses"    ON businesses    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_users"         ON users         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_products"      ON products      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_customers"     ON customers     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_sales"         ON sales         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_sale_items"    ON sale_items    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_credit_ledger" ON credit_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_payments"      ON payments      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_invoices"      ON invoices      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_invoice_items" ON invoice_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_ai_tool_log"   ON ai_tool_log   FOR ALL TO service_role USING (true) WITH CHECK (true);
