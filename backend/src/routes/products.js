const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { z } = require('zod');
const { logAudit } = require('../helpers/audit');

router.use(authenticate, tenantScope);
const requireOwnerOrManager = requireRole('owner', 'manager');

// Frontend always uses `price` — we store as `selling_price` in DB
// Returns `price` alias in every response for frontend compatibility
function normalise(product, { includeCost = true } = {}) {
  if (!product) return product;
  const p = { ...product };
  if (p.selling_price !== undefined) {
    p.price = p.selling_price;
  }
  if (!includeCost) {
    delete p.cost_price;
  }
  return p;
}

function canViewCostPrice(user) {
  return user?.role === 'owner' || user?.role === 'manager';
}

function normaliseMovement(movement) {
  if (!movement) return movement;
  return {
    ...movement,
    quantity_change: Number(movement.quantity_change || 0),
    quantity_before: Number(movement.quantity_before || 0),
    quantity_after: Number(movement.quantity_after || 0),
  };
}

async function fetchProduct(productId, businessId) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('business_id', businessId)
    .single();

  if (error || !data) return null;
  return data;
}

async function insertStockMovement(entry) {
  const { error } = await supabase.from('stock_movements').insert(entry);
  if (error && !error.message?.toLowerCase().includes('stock_movements')) {
    throw error;
  }
}

const optionalString = (max) => z.union([z.string().trim().max(max), z.null()]).optional();

const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: optionalString(80),
  category: optionalString(120),
  price: z.number().min(0),           // selling price
  cost_price: z.number().min(0).optional(),
  stock_qty: z.number().int().min(0).default(0),
  reorder_level: z.number().int().min(0).default(5),
  unit: z.string().trim().min(1).max(40).default('piece'),
  is_menu_item: z.boolean().optional(),
  menu_category_id: z.string().uuid().nullable().optional(),
  prep_time_minutes: z.number().int().min(0).nullable().optional(),
  is_available: z.boolean().optional(),
  image_url: z.string().trim().url().max(500).nullable().optional()
});

const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  sku: optionalString(80),
  category: optionalString(120),
  price: z.number().min(0).optional(),
  cost_price: z.number().min(0).nullable().optional(),
  stock_qty: z.number().int().min(0).optional(),
  reorder_level: z.number().int().min(0).optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  is_active: z.boolean().optional(),
  is_menu_item: z.boolean().optional(),
  menu_category_id: z.string().uuid().nullable().optional(),
  prep_time_minutes: z.number().int().min(0).nullable().optional(),
  is_available: z.boolean().optional(),
  image_url: z.string().trim().url().max(500).nullable().optional(),
  stock_adjustment_note: z.string().trim().max(200).optional(),
}).strict();

const restockSchema = z.object({
  quantity: z.number().int().min(1),
  note: z.string().trim().max(200).optional(),
}).strict();

// GET /api/products
router.get('/', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const low_stock = req.query.low_stock;
  const menu_only = req.query.menu_only;
  const ingredients_only = req.query.ingredients_only;
  const limit = req.query.limit;

  let query = supabase
    .from('products')
    .select('*')
    .eq('business_id', req.businessId)
    .eq('is_active', true)
    .order('name');

  if (search) query = query.ilike('name', `%${search}%`);
  if (limit) query = query.limit(Number(limit));
  if (menu_only === 'true') query = query.eq('is_menu_item', true);
  if (ingredients_only === 'true') query = query.eq('is_menu_item', false);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const includeCost = canViewCostPrice(req.user);
  let products = (data || []).map((row) => normalise(row, { includeCost }));

  // Filter low stock in-memory (avoids supabase column-compare limitation)
  if (low_stock === 'true') {
    products = products.filter(p => p.stock_qty <= (p.reorder_level ?? 5));
  }

  res.json(products);
});

// GET /api/products/:id/stock-movements
router.get('/:id/stock-movements', async (req, res) => {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('business_id', req.businessId)
    .eq('product_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    if (error.message?.toLowerCase().includes('stock_movements')) {
      return res.json([]);
    }
    return res.status(500).json({ error: error.message });
  }

  res.json((data || []).map(normaliseMovement));
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  const product = await fetchProduct(req.params.id, req.businessId);
  if (!product || !product.is_active) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  res.json(normalise(product, { includeCost: canViewCostPrice(req.user) }));
});

// POST /api/products
router.post('/', requireOwnerOrManager, validate(productSchema), async (req, res) => {
  const { name, sku, category, price, cost_price, stock_qty, reorder_level, unit, is_menu_item, menu_category_id, prep_time_minutes, is_available, image_url } = req.body;
  const insertData = {
    business_id: req.businessId,
    name,
    sku: sku || null,
    selling_price: price,
    cost_price: cost_price || null,
    stock_qty: stock_qty ?? 0,
    reorder_level: reorder_level ?? 5,
    unit: unit || 'piece',
    needs_restock: Number(stock_qty ?? 0) <= Number(reorder_level ?? 5),
    is_active: true,
    is_menu_item: is_menu_item ?? false,
    menu_category_id: menu_category_id ?? null,
    prep_time_minutes: prep_time_minutes ?? null,
    is_available: is_available ?? true,
    image_url: image_url ?? null,
  };
  // Only include category if provided (column may not exist in DB yet)
  if (category !== undefined) insertData.category = category;

  const { data, error } = await supabase.from('products').insert(insertData).select().single();

  if (error) return res.status(400).json({ error: error.message });

  if (data && Number(data.stock_qty || 0) > 0) {
    await insertStockMovement({
      business_id: req.businessId,
      product_id: data.id,
      movement_type: 'initial',
      quantity_change: Number(data.stock_qty || 0),
      quantity_before: 0,
      quantity_after: Number(data.stock_qty || 0),
      note: 'Opening stock',
      reference_type: 'product',
      reference_id: data.id,
      actor_user_id: req.user.id,
      metadata: {
        source: 'product_create',
      },
    });
  }

  await logAudit({
    businessId: req.businessId,
    userId: req.user.id,
    action: 'product.created',
    entityType: 'product',
    entityId: data.id,
    summary: `Product created: ${data.name}`,
    metadata: { stock_qty: data.stock_qty, selling_price: data.selling_price },
  });

  res.status(201).json(normalise(data));
});

// PATCH /api/products/:id
router.patch('/:id', requireOwnerOrManager, validate(productUpdateSchema), async (req, res) => {
  const existing = await fetchProduct(req.params.id, req.businessId);
  if (!existing || !existing.is_active) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const { stock_adjustment_note, ...rawPatch } = req.body;
  const patch = { ...rawPatch };
  // Remap price -> selling_price if provided
  if (patch.price !== undefined) {
    patch.selling_price = patch.price;
    delete patch.price;
  }

  const nextStockQty = patch.stock_qty ?? existing.stock_qty;
  const nextReorderLevel = patch.reorder_level ?? existing.reorder_level ?? 5;
  patch.needs_restock = Number(nextStockQty || 0) <= Number(nextReorderLevel || 5);

  const { data, error } = await supabase.from('products')
    .update(patch)
    .eq('id', req.params.id)
    .eq('business_id', req.businessId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  if (patch.stock_qty !== undefined && Number(patch.stock_qty) !== Number(existing.stock_qty || 0)) {
    const delta = Number(patch.stock_qty) - Number(existing.stock_qty || 0);
    await insertStockMovement({
      business_id: req.businessId,
      product_id: req.params.id,
      movement_type: 'adjustment',
      quantity_change: delta,
      quantity_before: Number(existing.stock_qty || 0),
      quantity_after: Number(patch.stock_qty),
      note: stock_adjustment_note || (delta > 0 ? 'Manual stock increase' : 'Manual stock reduction'),
      reference_type: 'product',
      reference_id: req.params.id,
      actor_user_id: req.user.id,
      metadata: {
        source: 'product_update',
      },
    });
  }

  await logAudit({
    businessId: req.businessId,
    userId: req.user.id,
    action: patch.stock_qty !== undefined && Number(patch.stock_qty) !== Number(existing.stock_qty || 0)
      ? 'product.stock_adjusted'
      : 'product.updated',
    entityType: 'product',
    entityId: req.params.id,
    summary: patch.stock_qty !== undefined && Number(patch.stock_qty) !== Number(existing.stock_qty || 0)
      ? `Stock adjusted for ${data.name}`
      : `Product updated: ${data.name}`,
    metadata: {
      changed_fields: Object.keys(patch),
      previous_stock: existing.stock_qty,
      next_stock: data.stock_qty,
    },
  });

  res.json(normalise(data));
});

// POST /api/products/:id/restock
router.post('/:id/restock', requireOwnerOrManager, validate(restockSchema), async (req, res) => {
  const product = await fetchProduct(req.params.id, req.businessId);
  if (!product || !product.is_active) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const quantity = Number(req.body.quantity || 0);
  const before = Number(product.stock_qty || 0);
  const after = before + quantity;
  const reorderLevel = Number(product.reorder_level || 5);

  const { data, error } = await supabase.from('products')
    .update({
      stock_qty: after,
      needs_restock: after <= reorderLevel,
    })
    .eq('id', req.params.id)
    .eq('business_id', req.businessId)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  await insertStockMovement({
    business_id: req.businessId,
    product_id: req.params.id,
    movement_type: 'restock',
    quantity_change: quantity,
    quantity_before: before,
    quantity_after: after,
    note: req.body.note?.trim() || 'Product restocked',
    reference_type: 'product',
    reference_id: req.params.id,
    actor_user_id: req.user.id,
    metadata: {
      source: 'restock',
    },
  });

  await logAudit({
    businessId: req.businessId,
    userId: req.user.id,
    action: 'product.restocked',
    entityType: 'product',
    entityId: req.params.id,
    summary: `Restocked ${product.name} by ${quantity}`,
    metadata: { quantity, previous_stock: before, next_stock: after },
  });

  res.json(normalise(data));
});

// DELETE /api/products/:id  (soft delete)
router.delete('/:id', requireOwnerOrManager, async (req, res) => {
  const existing = await fetchProduct(req.params.id, req.businessId);
  await supabase.from('products')
    .update({ is_active: false })
    .eq('id', req.params.id)
    .eq('business_id', req.businessId);

  await logAudit({
    businessId: req.businessId,
    userId: req.user.id,
    action: 'product.archived',
    entityType: 'product',
    entityId: req.params.id,
    summary: `Product archived${existing?.name ? `: ${existing.name}` : ''}`,
  });
  res.json({ success: true });
});

module.exports = router;
