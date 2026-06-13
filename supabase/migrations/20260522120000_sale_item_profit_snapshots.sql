-- Phase 1: preserve product cost at time of sale for accurate historical profit.

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS cost_price_snapshot numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_profit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_margin numeric NOT NULL DEFAULT 0;
