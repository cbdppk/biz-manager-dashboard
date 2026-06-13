-- Harden food-vendor tables with the same service-role RLS model used by the rest of BizManager.
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_target record;
BEGIN
  FOR policy_target IN
    SELECT *
    FROM (VALUES
      ('menu_categories', 'service_role_all_menu_categories'),
      ('menu_item_options', 'service_role_all_menu_item_options'),
      ('menu_item_option_values', 'service_role_all_menu_item_option_values'),
      ('orders', 'service_role_all_orders'),
      ('order_items', 'service_role_all_order_items'),
      ('recipes', 'service_role_all_recipes'),
      ('recipe_items', 'service_role_all_recipe_items')
    ) AS targets(table_name, policy_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = policy_target.table_name
        AND policyname = policy_target.policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        policy_target.policy_name,
        policy_target.table_name
      );
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_menu_categories_business_active
  ON menu_categories (business_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_menu_item_options_business_product
  ON menu_item_options (business_id, product_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_menu_item_option_values_business_option
  ON menu_item_option_values (business_id, option_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON order_items (product_id);

CREATE OR REPLACE FUNCTION ensure_food_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_business_id uuid;
  linked_business_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    IF NEW.menu_category_id IS NOT NULL THEN
      SELECT business_id INTO parent_business_id
      FROM menu_categories
      WHERE id = NEW.menu_category_id;

      IF parent_business_id IS NULL OR parent_business_id <> NEW.business_id THEN
        RAISE EXCEPTION 'Product menu category must belong to the same business';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'menu_item_options' THEN
    SELECT business_id INTO linked_business_id
    FROM products
    WHERE id = NEW.product_id;

    IF linked_business_id IS NULL OR linked_business_id <> NEW.business_id THEN
      RAISE EXCEPTION 'Menu option product must belong to the same business';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'menu_item_option_values' THEN
    SELECT business_id INTO parent_business_id
    FROM menu_item_options
    WHERE id = NEW.option_id;

    IF parent_business_id IS NULL OR parent_business_id <> NEW.business_id THEN
      RAISE EXCEPTION 'Menu option value must belong to the same business as its option';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'orders' THEN
    IF NEW.customer_id IS NOT NULL THEN
      SELECT business_id INTO linked_business_id
      FROM customers
      WHERE id = NEW.customer_id;

      IF linked_business_id IS NULL OR linked_business_id <> NEW.business_id THEN
        RAISE EXCEPTION 'Order customer must belong to the same business';
      END IF;
    END IF;

    IF NEW.cashier_id IS NOT NULL THEN
      SELECT business_id INTO linked_business_id
      FROM users
      WHERE id = NEW.cashier_id;

      IF linked_business_id IS NULL OR linked_business_id <> NEW.business_id THEN
        RAISE EXCEPTION 'Order cashier must belong to the same business';
      END IF;
    END IF;

    IF NEW.sale_id IS NOT NULL THEN
      SELECT business_id INTO linked_business_id
      FROM sales
      WHERE id = NEW.sale_id;

      IF linked_business_id IS NULL OR linked_business_id <> NEW.business_id THEN
        RAISE EXCEPTION 'Order sale must belong to the same business';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'order_items' THEN
    SELECT business_id INTO parent_business_id
    FROM orders
    WHERE id = NEW.order_id;

    IF parent_business_id IS NULL THEN
      RAISE EXCEPTION 'Order item must reference an existing order';
    END IF;

    IF NEW.product_id IS NOT NULL THEN
      SELECT business_id INTO linked_business_id
      FROM products
      WHERE id = NEW.product_id;

      IF linked_business_id IS NULL OR linked_business_id <> parent_business_id THEN
        RAISE EXCEPTION 'Order item product must belong to the same business as its order';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'recipes' THEN
    SELECT business_id INTO linked_business_id
    FROM products
    WHERE id = NEW.menu_product_id;

    IF linked_business_id IS NULL OR linked_business_id <> NEW.business_id THEN
      RAISE EXCEPTION 'Recipe menu product must belong to the same business';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'recipe_items' THEN
    SELECT business_id INTO parent_business_id
    FROM recipes
    WHERE id = NEW.recipe_id;

    IF parent_business_id IS NULL THEN
      RAISE EXCEPTION 'Recipe item must reference an existing recipe';
    END IF;

    SELECT business_id INTO linked_business_id
    FROM products
    WHERE id = NEW.ingredient_product_id;

    IF linked_business_id IS NULL OR linked_business_id <> parent_business_id THEN
      RAISE EXCEPTION 'Recipe ingredient must belong to the same business as its recipe';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_products_menu_category_tenant ON products;
CREATE TRIGGER ensure_products_menu_category_tenant
  BEFORE INSERT OR UPDATE OF business_id, menu_category_id ON products
  FOR EACH ROW
  EXECUTE FUNCTION ensure_food_tenant_integrity();

DROP TRIGGER IF EXISTS ensure_menu_item_options_tenant ON menu_item_options;
CREATE TRIGGER ensure_menu_item_options_tenant
  BEFORE INSERT OR UPDATE OF business_id, product_id ON menu_item_options
  FOR EACH ROW
  EXECUTE FUNCTION ensure_food_tenant_integrity();

DROP TRIGGER IF EXISTS ensure_menu_item_option_values_tenant ON menu_item_option_values;
CREATE TRIGGER ensure_menu_item_option_values_tenant
  BEFORE INSERT OR UPDATE OF business_id, option_id ON menu_item_option_values
  FOR EACH ROW
  EXECUTE FUNCTION ensure_food_tenant_integrity();

DROP TRIGGER IF EXISTS ensure_orders_tenant ON orders;
CREATE TRIGGER ensure_orders_tenant
  BEFORE INSERT OR UPDATE OF business_id, customer_id, cashier_id, sale_id ON orders
  FOR EACH ROW
  EXECUTE FUNCTION ensure_food_tenant_integrity();

DROP TRIGGER IF EXISTS ensure_order_items_tenant ON order_items;
CREATE TRIGGER ensure_order_items_tenant
  BEFORE INSERT OR UPDATE OF order_id, product_id ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION ensure_food_tenant_integrity();

DROP TRIGGER IF EXISTS ensure_recipes_tenant ON recipes;
CREATE TRIGGER ensure_recipes_tenant
  BEFORE INSERT OR UPDATE OF business_id, menu_product_id ON recipes
  FOR EACH ROW
  EXECUTE FUNCTION ensure_food_tenant_integrity();

DROP TRIGGER IF EXISTS ensure_recipe_items_tenant ON recipe_items;
CREATE TRIGGER ensure_recipe_items_tenant
  BEFORE INSERT OR UPDATE OF recipe_id, ingredient_product_id ON recipe_items
  FOR EACH ROW
  EXECUTE FUNCTION ensure_food_tenant_integrity();
