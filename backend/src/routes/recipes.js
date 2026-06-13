const express = require('express');
const { z } = require('zod');
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');

const router = express.Router();
router.use(authenticate, tenantScope);
const requireOwnerOrManager = requireRole('owner', 'manager');

const schema = z.object({
  menu_product_id: z.string().uuid(),
  yield_qty: z.number().positive().optional(),
  items: z.array(z.object({
    ingredient_product_id: z.string().uuid(),
    qty_required: z.number().positive(),
    unit: z.string().trim().max(40).optional(),
    waste_factor: z.number().min(0).optional(),
  })).min(1),
});

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('recipes')
    .select('*, recipe_items(*)')
    .eq('business_id', req.businessId)
    .eq('is_active', true);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.post('/', requireOwnerOrManager, validate(schema), async (req, res) => {
  const { menu_product_id, yield_qty = 1, items } = req.body;
  const productIds = [...new Set([menu_product_id, ...items.map((item) => item.ingredient_product_id)])];

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id')
    .eq('business_id', req.businessId)
    .in('id', productIds);

  if (productsError) return res.status(400).json({ error: productsError.message });

  const ownedProductIds = new Set((products || []).map((product) => product.id));
  const missing = productIds.filter((id) => !ownedProductIds.has(id));
  if (missing.length > 0) {
    return res.status(400).json({ error: 'Recipe products must belong to this business.', products: missing });
  }

  const { data: recipe, error: recipeError } = await supabase.from('recipes').upsert({
    business_id: req.businessId,
    menu_product_id,
    yield_qty,
    is_active: true,
  }, { onConflict: 'business_id,menu_product_id' }).select('*').single();

  if (recipeError) return res.status(400).json({ error: recipeError.message });

  await supabase.from('recipe_items').delete().eq('recipe_id', recipe.id);

  const payload = items.map((item) => ({
    recipe_id: recipe.id,
    ingredient_product_id: item.ingredient_product_id,
    qty_required: item.qty_required,
    unit: item.unit || null,
    waste_factor: item.waste_factor ?? 0,
  }));

  const { data: createdItems, error: itemsError } = await supabase.from('recipe_items').insert(payload).select('*');
  if (itemsError) return res.status(400).json({ error: itemsError.message });

  res.status(201).json({ ...recipe, recipe_items: createdItems || [] });
});

module.exports = router;
