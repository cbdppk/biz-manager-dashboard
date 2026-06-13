CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('initial', 'restock', 'sale', 'adjustment')),
  quantity_change integer NOT NULL,
  quantity_before integer NOT NULL DEFAULT 0,
  quantity_after integer NOT NULL DEFAULT 0,
  note text,
  reference_type text,
  reference_id uuid,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_business_product_created
  ON stock_movements (business_id, product_id, created_at DESC);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'stock_movements'
      AND policyname = 'service_role_all_stock_movements'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all_stock_movements" ON stock_movements FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;
