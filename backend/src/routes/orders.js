const express = require('express');
const { z } = require('zod');
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { createSale } = require('../services/sales');
const { buildRecipeDeductions } = require('../helpers/foodOrders');

const router = express.Router();
router.use(authenticate, tenantScope);

const createOrderSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  order_type: z.enum(['dine_in', 'takeaway', 'delivery']),
  table_ref: z.string().trim().max(80).optional(),
  note: z.string().trim().max(400).optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    qty: z.number().int().min(1),
    unit_price: z.number().min(0),
    selected_options: z.array(z.object({
      option_id: z.string().uuid().optional(),
      option_name: z.string().trim().max(120).optional(),
      value_id: z.string().uuid().optional(),
      label: z.string().trim().min(1).max(120),
      price_delta: z.number().min(0).optional(),
    })).optional(),
    item_note: z.string().trim().max(240).optional(),
  })).min(1),
});

const dailyCloseSchema = z.object({
  payment_method: z.enum(['cash', 'momo', 'card', 'credit']).default('cash'),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    qty: z.number().int().min(1),
    unit_price: z.number().min(0),
  })).min(1),
  note: z.string().trim().max(300).optional(),
});

async function createFoodSaleFromItems({ businessId, userId, customerId = null, items, paymentMethod, amountPaid, note }) {
  const soldProductIds = items.map((item) => item.product_id).filter(Boolean);
  let recipes = [];

  if (soldProductIds.length > 0) {
    const { data, error: recipesError } = await supabase
      .from('recipes')
      .select('id, menu_product_id, yield_qty, recipe_items(ingredient_product_id, qty_required, waste_factor)')
      .eq('business_id', businessId)
      .in('menu_product_id', soldProductIds)
      .eq('is_active', true);

    if (recipesError) throw recipesError;
    recipes = data || [];
  }

  const recipeBackedProductIds = recipes.map((recipe) => recipe.menu_product_id);
  const total = items.reduce((sum, item) => sum + (Number(item.unit_price || 0) * Number(item.qty || 0)), 0);

  const result = await createSale({
    supabase,
    businessId,
    userId,
    customerId,
    items,
    paymentMethod,
    amountPaid: amountPaid ?? total,
    note,
    skipStockProductIds: recipeBackedProductIds,
  });

  const deductions = buildRecipeDeductions(items, recipes);
  const appliedDeductions = [];
  for (const deduction of deductions) {
    const { error: deductionError } = await supabase.rpc('decrement_stock', {
      p_product_id: deduction.ingredient_product_id,
      p_qty: deduction.qty,
      p_business_id: businessId,
    });
    if (deductionError) {
      // Log which deductions already applied so staff can manually correct stock.
      console.error(
        '[orders] partial deduction failure — sale rolled back.',
        { saleId: result.saleId, failed: deduction, applied: appliedDeductions }
      );
      // Roll back the sale record to prevent a ghost sale with no inventory update.
      try {
        const { error: rollbackError } = await supabase
          .from('sales')
          .delete()
          .eq('id', result.saleId)
          .eq('business_id', businessId);
        if (rollbackError) {
          console.error('[orders] sale rollback failed:', result.saleId, rollbackError);
        }
      } catch (rollbackErr) {
        console.error('[orders] sale rollback failed:', result.saleId, rollbackErr);
      }
      const err = new Error('Inventory deduction failed. The order was not completed — please try again.');
      err.code = 'DEDUCTION_FAILED';
      err.status = 500;
      throw err;
    }
    appliedDeductions.push(deduction);
  }

  return {
    ...result,
    recipeBackedProductIds,
    deductions,
  };
}

router.post('/', validate(createOrderSchema), async (req, res) => {
  const items = req.body.items;
  if (req.body.customer_id) {
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', req.body.customer_id)
      .eq('business_id', req.businessId)
      .single();
    if (customerError || !customer) return res.status(400).json({ error: 'Customer does not belong to this business.' });
  }

  const productIds = [...new Set(items.map((item) => item.product_id))];
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, business_id')
    .eq('business_id', req.businessId)
    .in('id', productIds);

  if (productsError) return res.status(400).json({ error: productsError.message });
  const productMap = new Map((products || []).map((product) => [product.id, product]));
  const missing = productIds.filter((id) => !productMap.has(id));
  if (missing.length > 0) {
    return res.status(400).json({ error: 'Some order items are invalid for this business.', products: missing });
  }

  const subtotal = items.reduce((s, i) => {
    const optionsTotal = (i.selected_options || []).reduce((sum, option) => sum + Number(option.price_delta || 0), 0);
    return s + ((Number(i.unit_price) + optionsTotal) * Number(i.qty));
  }, 0);

  const { data: order, error: orderError } = await supabase.from('orders').insert({
    business_id: req.businessId,
    customer_id: req.body.customer_id || null,
    cashier_id: req.user.id,
    order_type: req.body.order_type,
    status: 'confirmed',
    table_ref: req.body.table_ref || null,
    note: req.body.note || null,
    subtotal,
    total_amount: subtotal,
  }).select('*').single();

  if (orderError) return res.status(400).json({ error: orderError.message });

  const payload = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    item_name_snapshot: productMap.get(item.product_id)?.name || 'Item',
    qty: item.qty,
    unit_price: item.unit_price + (item.selected_options || []).reduce((sum, option) => sum + Number(option.price_delta || 0), 0),
    line_total: item.qty * (item.unit_price + (item.selected_options || []).reduce((sum, option) => sum + Number(option.price_delta || 0), 0)),
    selected_options: item.selected_options || [],
    item_note: item.item_note || null,
    kitchen_status: 'queued',
  }));

  const { data: createdItems, error: itemsError } = await supabase.from('order_items').insert(payload).select('*');
  if (itemsError) return res.status(400).json({ error: itemsError.message });

  res.status(201).json({ ...order, items: createdItems || [] });
});

router.get('/', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  let query = supabase.from('orders').select('*, order_items(*)').eq('business_id', req.businessId).order('created_at', { ascending: false }).limit(100);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.patch('/:id/status', validate(z.object({ status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']) })), async (req, res) => {
  const { data, error } = await supabase.from('orders').update({ status: req.body.status, updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('business_id', req.businessId).select('*').single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

const KITCHEN_STATUS_ORDER = ['queued', 'cooking', 'ready', 'served'];

router.patch('/:id/items/:itemId/kitchen-status', validate(z.object({ kitchen_status: z.enum(['queued', 'cooking', 'ready', 'served']) })), async (req, res) => {
  const { data: order } = await supabase.from('orders').select('id').eq('id', req.params.id).eq('business_id', req.businessId).single();
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const { data: item } = await supabase.from('order_items').select('kitchen_status').eq('id', req.params.itemId).eq('order_id', req.params.id).single();
  if (!item) return res.status(404).json({ error: 'Order item not found.' });

  const currentIdx = KITCHEN_STATUS_ORDER.indexOf(item.kitchen_status);
  const nextIdx = KITCHEN_STATUS_ORDER.indexOf(req.body.kitchen_status);
  if (nextIdx < currentIdx) {
    return res.status(400).json({ error: `Cannot move item backwards from "${item.kitchen_status}" to "${req.body.kitchen_status}".` });
  }

  const { data, error } = await supabase.from('order_items').update({ kitchen_status: req.body.kitchen_status }).eq('id', req.params.itemId).eq('order_id', req.params.id).select('*').single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.get('/kitchen/queue', async (req, res) => {
  const { data, error } = await supabase.from('orders')
    .select('id, order_type, table_ref, note, status, total_amount, created_at, order_items(id, item_name_snapshot, qty, item_note, kitchen_status, selected_options)')
    .eq('business_id', req.businessId)
    .in('status', ['confirmed', 'preparing', 'ready'])
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.post('/daily-close', validate(dailyCloseSchema), async (req, res) => {
  const productIds = [...new Set(req.body.items.map((item) => item.product_id))];
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name')
    .eq('business_id', req.businessId)
    .eq('is_menu_item', true)
    .in('id', productIds);

  if (productsError) return res.status(400).json({ error: productsError.message });

  const productMap = new Map((products || []).map((product) => [product.id, product]));
  const missing = productIds.filter((id) => !productMap.has(id));
  if (missing.length > 0) {
    return res.status(400).json({ error: 'Daily close items must be menu meals for this business.', products: missing });
  }

  try {
    const result = await createFoodSaleFromItems({
      businessId: req.businessId,
      userId: req.user.id,
      items: req.body.items.map((item) => ({ ...item, discount: 0 })),
      paymentMethod: req.body.payment_method,
      note: req.body.note || `End-of-day food sales ${new Date().toISOString().slice(0, 10)}`,
    });

    res.status(201).json({
      success: true,
      sale_id: result.saleId,
      total: result.total,
      deductions: result.deductions,
    });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.products ? { products: err.products } : {}),
    });
  }
});

router.post('/:id/complete', validate(z.object({ payment_method: z.enum(['cash', 'momo', 'card', 'credit']), amount_paid: z.number().min(0), customer_id: z.string().uuid().nullable().optional() })), async (req, res) => {
  const { data: order, error: orderError } = await supabase.from('orders').select('*, order_items(product_id, qty, unit_price)').eq('id', req.params.id).eq('business_id', req.businessId).single();
  if (orderError || !order) return res.status(404).json({ error: 'Order not found.' });

  if (order.sale_id) return res.status(409).json({ error: 'Order already completed.' });

  if (req.body.customer_id) {
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', req.body.customer_id)
      .eq('business_id', req.businessId)
      .single();
    if (customerError || !customer) return res.status(400).json({ error: 'Customer does not belong to this business.' });
  }

  const salePayloadItems = (order.order_items || []).map((it) => ({ product_id: it.product_id, qty: it.qty, unit_price: it.unit_price, discount: 0 }));
  try {
    const result = await createFoodSaleFromItems({
      businessId: req.businessId,
      userId: req.user.id,
      customerId: req.body.customer_id || order.customer_id || null,
      items: salePayloadItems,
      paymentMethod: req.body.payment_method,
      amountPaid: req.body.amount_paid,
      note: `Food order ${order.id}`,
    });

    await supabase.from('orders').update({ status: 'completed', sale_id: result.saleId, updated_at: new Date().toISOString() }).eq('id', order.id).eq('business_id', req.businessId);
    await supabase.from('order_items').update({ kitchen_status: 'served' }).eq('order_id', order.id);

    res.json({ success: true, order_id: order.id, sale_id: result.saleId });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.products ? { products: err.products } : {}),
    });
  }
});

module.exports = router;
