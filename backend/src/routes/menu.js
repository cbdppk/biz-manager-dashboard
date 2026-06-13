const express = require('express');
const { z } = require('zod');
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');

const router = express.Router();
router.use(authenticate, tenantScope);
const requireOwnerOrManager = requireRole('owner', 'manager');

const categorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

router.get('/categories', async (req, res) => {
  const { data, error } = await supabase.from('menu_categories')
    .select('*').eq('business_id', req.businessId).order('sort_order').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.post('/categories', requireOwnerOrManager, validate(categorySchema), async (req, res) => {
  const { data, error } = await supabase.from('menu_categories').insert({
    business_id: req.businessId,
    name: req.body.name,
    sort_order: req.body.sort_order ?? 0,
    is_active: req.body.is_active ?? true,
  }).select('*').single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

const optionSchema = z.object({
  product_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  min_select: z.number().int().min(0).optional(),
  max_select: z.number().int().min(1).optional(),
  is_required: z.boolean().optional(),
  values: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    price_delta: z.number().min(0).optional(),
    is_default: z.boolean().optional(),
  })).min(1),
});

router.get('/items/:productId/options', async (req, res) => {
  const { data, error } = await supabase.from('menu_item_options')
    .select('*, menu_item_option_values(*)')
    .eq('business_id', req.businessId)
    .eq('product_id', req.params.productId)
    .order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.post('/items/options', requireOwnerOrManager, validate(optionSchema), async (req, res) => {
  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id')
    .eq('id', req.body.product_id)
    .eq('business_id', req.businessId)
    .single();

  if (productError || !product) {
    return res.status(404).json({ error: 'Menu item not found.' });
  }

  const { data: option, error: optionError } = await supabase.from('menu_item_options').insert({
    business_id: req.businessId,
    product_id: req.body.product_id,
    name: req.body.name,
    min_select: req.body.min_select ?? 0,
    max_select: req.body.max_select ?? 1,
    is_required: req.body.is_required ?? false,
  }).select('*').single();

  if (optionError) return res.status(400).json({ error: optionError.message });

  const valuesPayload = req.body.values.map((value, index) => ({
    option_id: option.id,
    business_id: req.businessId,
    label: value.label,
    price_delta: value.price_delta ?? 0,
    is_default: value.is_default ?? false,
    sort_order: index,
  }));

  const { data: values, error: valuesError } = await supabase.from('menu_item_option_values').insert(valuesPayload).select('*');
  if (valuesError) return res.status(400).json({ error: valuesError.message });

  res.status(201).json({ ...option, menu_item_option_values: values || [] });
});

module.exports = router;
