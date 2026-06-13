CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  menu_product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  yield_qty numeric NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (business_id, menu_product_id)
);

CREATE TABLE IF NOT EXISTS recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty_required numeric NOT NULL CHECK (qty_required > 0),
  unit text,
  waste_factor numeric NOT NULL DEFAULT 0 CHECK (waste_factor >= 0),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipes_business_menu_product ON recipes (business_id, menu_product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe_id ON recipe_items (recipe_id);
