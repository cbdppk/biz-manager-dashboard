-- Store selected add-ons/extras on food order items as a snapshot.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS selected_options jsonb NOT NULL DEFAULT '[]'::jsonb;
