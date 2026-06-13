-- Performance Indexes for BizManager
-- Crucial for scaling beyond the first 10,000 records

-- Fast dashboard sales aggregation
CREATE INDEX IF NOT EXISTS idx_sales_business_created ON sales(business_id, created_at DESC);
-- Fast POS product lookups
CREATE INDEX IF NOT EXISTS idx_products_business_active ON products(business_id, is_active);
-- Fast customer search during checkout
CREATE INDEX IF NOT EXISTS idx_customers_business_name ON customers(business_id, name);
-- Fast credit outstanding calculations
CREATE INDEX IF NOT EXISTS idx_credit_ledger_unsettled ON credit_ledger(customer_id, business_id) WHERE settled = false;