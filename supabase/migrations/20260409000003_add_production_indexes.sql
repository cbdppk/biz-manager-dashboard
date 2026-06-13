-- ═══════════════════════════════════════════════════════════════
-- BizManager — Production indexes
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_sales_business_created_at
  ON sales (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_business_stock_qty
  ON products (business_id, stock_qty);

CREATE INDEX IF NOT EXISTS idx_customers_business_id
  ON customers (business_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id
  ON sale_items (sale_id);

CREATE INDEX IF NOT EXISTS idx_invoices_business_invoice_number
  ON invoices (business_id, invoice_number);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_business_customer_settled
  ON credit_ledger (business_id, customer_id, settled);
