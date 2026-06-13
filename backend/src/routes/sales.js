const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { z } = require('zod');
const { sendWhatsAppMessage } = require('../helpers/whatsapp');
const { createSale, assertSaleCustomerOwnership } = require('../services/sales');
const { roundMoney, roundPercent } = require('../helpers/profit');

router.use(authenticate, tenantScope);
const requireOwnerOrManager = requireRole('owner', 'manager');

// ── WhatsApp receipt helper ──────────────────────────────────────
async function sendWhatsAppReceipt({ businessId, customer_id, saleId, total, amount_paid, balance, payment_method }) {
  if (!customer_id) return;

  const [{ data: business }, { data: customer }, { data: saleItems }] = await Promise.all([
    supabase.from('businesses').select('name, whatsapp_enabled').eq('id', businessId).single(),
    supabase.from('customers').select('phone').eq('id', customer_id).eq('business_id', businessId).single(),
    supabase.from('sale_items').select('qty, unit_price, discount, products(name)').eq('sale_id', saleId)
  ]);

  if (!business?.whatsapp_enabled || !customer?.phone) return;

  const date = new Date().toLocaleString('en-GH', { timeZone: 'Africa/Accra', dateStyle: 'medium', timeStyle: 'short' });

  const itemLines = (saleItems || []).map(i => {
    const subtotal = (i.qty * i.unit_price) - (i.discount || 0);
    return `- ${i.products?.name || 'Item'} x${i.qty} = GHS ${subtotal.toFixed(2)}`;
  }).join('\n');

  let msg = `BizManager Receipt\nBusiness: ${business.name}\nDate: ${date}\nItems:\n${itemLines}\nTotal: GHS ${total.toFixed(2)}\nPaid: GHS ${amount_paid.toFixed(2)} (${payment_method})`;
  if (balance > 0) msg += `\nBalance owed: GHS ${balance.toFixed(2)}`;
  msg += '\nThank you for your purchase!';

  await sendWhatsAppMessage(customer.phone, msg);
}

const saleSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    qty: z.number().int().min(1),
    unit_price: z.number().min(0),
    discount: z.number().min(0).default(0)
  })).min(1),
  payment_method: z.enum(['cash', 'momo', 'card', 'credit', 'Cash', 'MoMo', 'Card', 'Credit']),
  amount_paid: z.number().min(0),
  note: z.string().optional()
});

// POST /api/sales
router.post('/', validate(saleSchema), async (req, res) => {
  const { customer_id, items, payment_method, amount_paid, note } = req.body;

  try {
    await assertSaleCustomerOwnership(supabase, customer_id || null, req.businessId);

    const { saleId, sale, method, total, balance } = await createSale({
      supabase,
      businessId: req.businessId,
      userId: req.user.id,
      customerId: customer_id || null,
      items,
      paymentMethod: payment_method,
      amountPaid: amount_paid,
      note,
    });

    res.status(201).json(normaliseSale(sale));

    // WhatsApp receipt (fire-and-forget)
    sendWhatsAppReceipt({ businessId: req.businessId, customer_id, saleId, total, amount_paid, balance, payment_method: method }).catch(() => {});
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      error: err.message || 'Failed to record sale.',
      ...(err.code ? { code: err.code } : {}),
      ...(err.products ? { products: err.products } : {}),
    });
  }
});

// ── Normalise raw sale row to frontend-expected shape ────────────
function normaliseSale(row) {
  if (!row) return row;
  return {
    ...row,
    total: row.total_amount,
    payment_status: row.status,
    customer_name: row.customers?.name ?? null,
  };
}

// GET /api/sales
router.get('/', requireOwnerOrManager, async (req, res) => {
  const { from, to, date_from, date_to, payment_method, customer_id, limit = 50 } = req.query;
  const startDate = from || date_from;
  const endDate = to || date_to;

  let query = supabase.from('sales')
    .select('*, customers(name)')
    .eq('business_id', req.businessId)
    .order('created_at', { ascending: false })
    .limit(Number(limit));

  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);
  if (payment_method) query = query.eq('payment_method', payment_method);
  if (customer_id) query = query.eq('customer_id', customer_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json((data || []).map(normaliseSale));
});

// GET /api/sales/summary — returns data matching dashboard expectations
router.get('/summary', requireOwnerOrManager, async (req, res) => {
  const { period = 'today' } = req.query;
  const now = new Date();
  let from;

  if (period === 'today') {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  } else if (period === 'week') {
    from = new Date(now - 7 * 86400000).toISOString();
  } else if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }

  const [salesRes, productsRes] = await Promise.all([
    supabase.from('sales')
      .select('id, total_amount, amount_paid, balance, payment_method, created_at, customers(name)')
      .eq('business_id', req.businessId)
      .gte('created_at', from)
      .order('created_at', { ascending: false }),
    supabase.from('products')
      .select('id, name, stock_qty, reorder_level')
      .eq('business_id', req.businessId)
      .eq('is_active', true)
  ]);

  if (salesRes.error) return res.status(500).json({ error: salesRes.error.message });

  const rows = salesRes.data || [];
  const revenue = rows.reduce((s, r) => s + r.total_amount, 0);
  const transactions = rows.length;
  const avg_order = transactions > 0 ? revenue / transactions : 0;
  const total_collected = rows.reduce((s, r) => s + r.amount_paid, 0);
  const total_credit = rows.reduce((s, r) => s + r.balance, 0);

  let cost_of_goods_sold = 0;
  let gross_profit = 0;
  const saleIds = rows.map((row) => row.id);
  if (saleIds.length > 0) {
    const { data: itemRows, error: itemsError } = await supabase
      .from('sale_items')
      .select('line_cost, line_profit')
      .in('sale_id', saleIds);

    if (itemsError) return res.status(500).json({ error: itemsError.message });

    cost_of_goods_sold = roundMoney((itemRows || []).reduce((sum, row) => sum + Number(row.line_cost || 0), 0));
    gross_profit = roundMoney((itemRows || []).reduce((sum, row) => sum + Number(row.line_profit || 0), 0));
  }

  const gross_margin = revenue > 0 ? roundPercent((gross_profit / revenue) * 100) : 0;

  const recent = rows.slice(0, 5).map(r => ({
    id: r.id,
    customer_name: r.customers?.name ?? null,
    created_at: r.created_at,
    total: r.total_amount,
    payment_method: r.payment_method,
  }));

  const allProducts = productsRes.data || [];
  const low_stock = allProducts
    .filter(p => p.stock_qty <= (p.reorder_level ?? 5))
    .slice(0, 10)
    .map(p => ({ id: p.id, name: p.name, stock_qty: p.stock_qty }));

  res.json({
    revenue,
    transactions,
    avg_order,
    recent,
    low_stock,
    cost_of_goods_sold,
    gross_profit,
    gross_margin,
    // also include legacy fields in case anything uses them
    total_sales: revenue,
    total_collected,
    total_credit,
    count: transactions,
  });
});

// GET /api/sales/:id
router.get('/:id', requireOwnerOrManager, async (req, res) => {
  const { data, error } = await supabase.from('sales')
    .select('*, customers(name, phone, email), sale_items(qty, unit_price, discount, subtotal, cost_price_snapshot, line_cost, line_profit, profit_margin, products(name))')
    .eq('id', req.params.id)
    .eq('business_id', req.businessId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Sale not found.' });

  res.json({
    ...normaliseSale(data),
    customer: data.customers || null,
    items: (data.sale_items || []).map((item) => ({
      name: item.products?.name || 'Item',
      qty: item.qty,
      unit_price: item.unit_price,
      discount: item.discount || 0,
      subtotal: item.subtotal,
      cost_price_snapshot: item.cost_price_snapshot,
      line_cost: item.line_cost,
      line_profit: item.line_profit,
      profit_margin: item.profit_margin,
    })),
  });
});

module.exports = router;
