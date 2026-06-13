-- Phase 2: business expenses for net profit tracking.

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  amount numeric NOT NULL CHECK (amount >= 0),
  payment_method text NOT NULL DEFAULT 'cash',
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_business_date
  ON expenses (business_id, expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_business_category
  ON expenses (business_id, category);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'expenses'
      AND policyname = 'service_role_all_expenses'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all_expenses" ON expenses FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;
