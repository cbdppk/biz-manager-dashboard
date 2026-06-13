-- ═══════════════════════════════════════════════════════════════
-- BizManager — Production support columns and invoice sequence
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS invoice_sequence integer NOT NULL DEFAULT 0;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_limit numeric DEFAULT 0;

CREATE OR REPLACE FUNCTION next_invoice_number(p_business_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_seq integer;
BEGIN
  UPDATE businesses
  SET invoice_sequence = COALESCE(invoice_sequence, 0) + 1
  WHERE id = p_business_id
  RETURNING invoice_sequence INTO next_seq;

  IF next_seq IS NULL THEN
    RAISE EXCEPTION 'Business % not found for invoice sequencing', p_business_id;
  END IF;

  RETURN 'INV-' || LPAD(next_seq::text, 4, '0');
END;
$$;
