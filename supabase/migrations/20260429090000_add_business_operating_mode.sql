-- Additive foundation for food-vendor mode toggling
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS operating_mode text,
  ADD COLUMN IF NOT EXISTS enabled_modules jsonb;

UPDATE businesses
SET operating_mode = CASE
  WHEN COALESCE(sector, '') = 'restaurant' THEN 'food'
  ELSE 'retail'
END
WHERE operating_mode IS NULL;

UPDATE businesses
SET enabled_modules = CASE
  WHEN operating_mode = 'food' THEN '["retail_core","food_ops"]'::jsonb
  ELSE '["retail_core"]'::jsonb
END
WHERE enabled_modules IS NULL;

ALTER TABLE businesses
  ALTER COLUMN operating_mode SET DEFAULT 'retail',
  ALTER COLUMN enabled_modules SET DEFAULT '["retail_core"]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'businesses_operating_mode_check'
  ) THEN
    ALTER TABLE businesses
      ADD CONSTRAINT businesses_operating_mode_check
      CHECK (operating_mode IN ('retail', 'food'));
  END IF;
END $$;
