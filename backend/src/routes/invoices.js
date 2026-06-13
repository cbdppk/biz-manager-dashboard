const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { v4: uuidv4 } = require('uuid');
const { buildInvoicePdfBuffer, sendInvoiceEmail } = require('../helpers/invoices');
const validate = require('../middleware/validate');
const { z } = require('zod');

router.use(authenticate, tenantScope);
router.use(requireRole('owner', 'manager'));

function normaliseInvoiceItem(item) {
  return {
    id: item.id,
    name: item.product_name || item.description || item.products?.name || 'Item',
    quantity: Number(item.qty || 0),
    price: Number(item.unit_price || 0),
    subtotal: Number(item.subtotal || 0),
  };
}

function normaliseInvoice(row) {
  if (!row) return row;

  return {
    ...row,
    total: Number(row.total_amount || 0),
    customer_name: row.customers?.name || null,
    customer_phone: row.customers?.phone || null,
    customer_email: row.customers?.email || null,
    items: (row.invoice_items || []).map(normaliseInvoiceItem),
  };
}

async function getNextInvoiceNumber(businessId) {
  const { data, error } = await supabase.rpc('next_invoice_number', {
    p_business_id: businessId,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Failed to generate the next invoice number.');
  }

  return data;
}

async function fetchInvoiceRecord(invoiceId, businessId) {
  const { data, error } = await supabase.from('invoices')
    .select('*, customers(name, phone, email), invoice_items(*, products(name))')
    .eq('id', invoiceId)
    .eq('business_id', businessId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

function buildInvoiceItems(items, invoiceId) {
  return (items || []).map((item) => ({
    id: item.id || undefined,
    invoice_id: invoiceId,
    product_id: item.product_id || null,
    product_name: item.product_name || item.name || null,
    qty: Number(item.qty || item.quantity || 1),
    unit_price: Number(item.unit_price || item.price || 0),
    subtotal: Number(item.qty || item.quantity || 1) * Number(item.unit_price || item.price || 0),
  }));
}

async function assertInvoiceReferences({ businessId, customerId, items = [] }) {
  if (customerId) {
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('business_id', businessId)
      .single();

    if (customerError || !customer) {
      const err = new Error('Customer does not belong to this business.');
      err.status = 400;
      throw err;
    }
  }

  const productIds = [...new Set((items || []).map((item) => item.product_id).filter(Boolean))];
  if (productIds.length === 0) return;

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id')
    .eq('business_id', businessId)
    .in('id', productIds);

  if (productsError) {
    const err = new Error(productsError.message);
    err.status = 400;
    throw err;
  }

  const ownedProductIds = new Set((products || []).map((product) => product.id));
  const missing = productIds.filter((id) => !ownedProductIds.has(id));
  if (missing.length > 0) {
    const err = new Error('Invoice items must belong to this business.');
    err.status = 400;
    throw err;
  }
}

const invoiceItemSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid().nullable().optional(),
  product_name: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().max(200).optional(),
  qty: z.number().int().min(1).optional(),
  quantity: z.number().int().min(1).optional(),
  unit_price: z.number().min(0).optional(),
  price: z.number().min(0).optional(),
}).refine((item) => item.qty !== undefined || item.quantity !== undefined, {
  message: 'Invoice item quantity is required.',
}).refine((item) => item.unit_price !== undefined || item.price !== undefined, {
  message: 'Invoice item price is required.',
});

const invoiceCreateSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  due_date: z.string().trim().max(40).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(['draft', 'sent']).default('draft').optional(),
  items: z.array(invoiceItemSchema).min(1),
}).strict();

const invoiceUpdateSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  due_date: z.string().trim().max(40).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
  items: z.array(invoiceItemSchema).optional(),
}).strict();

const invoiceStatusSchema = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']),
}).strict();

// POST /api/invoices
router.post('/', validate(invoiceCreateSchema), async (req, res) => {
  const { customer_id, items, due_date, note, status = 'draft' } = req.body;
  let invoiceNumber;

  try {
    invoiceNumber = await getNextInvoiceNumber(req.businessId);
    await assertInvoiceReferences({ businessId: req.businessId, customerId: customer_id, items });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const calculatedTotal = items.reduce((s, i) => {
    const qty = i.qty ?? i.quantity ?? 1;
    const unitPrice = i.unit_price ?? i.price ?? 0;
    return s + (qty * unitPrice);
  }, 0);

  const { data, error } = await supabase.from('invoices').insert({
    id: uuidv4(),
    business_id: req.businessId,
    customer_id: customer_id || null,
    invoice_number: invoiceNumber,
    total_amount: calculatedTotal,
    due_date,
    note,
    status
  }).select().single();

  if (error) return res.status(400).json({ error: error.message });

  if (items && items.length > 0) {
    const itemRows = buildInvoiceItems(items, data.id);
    const { error: itemsErr } = await supabase.from('invoice_items').insert(itemRows);
    if (itemsErr && itemsErr.message?.includes('product_name')) {
      // Fallback: insert without product_name
      const fallbackRows = itemRows.map(({ product_name, ...itemRow }) => itemRow);
      await supabase.from('invoice_items').insert(fallbackRows);
    }
  }

  const invoice = await fetchInvoiceRecord(data.id, req.businessId);
  res.status(201).json(normaliseInvoice(invoice || data));
});

// GET /api/invoices
router.get('/', async (req, res) => {
  const { status } = req.query;
  let query = supabase.from('invoices')
    .select('*, customers(name, phone, email), invoice_items(*, products(name))')
    .eq('business_id', req.businessId)
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(normaliseInvoice));
});

// GET /api/invoices/:id/pdf
router.get('/:id/pdf', async (req, res) => {
  const invoice = await fetchInvoiceRecord(req.params.id, req.businessId);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

  const { data: business } = await supabase
    .from('businesses')
    .select('name, phone')
    .eq('id', req.businessId)
    .single();

  try {
    const normalized = normaliseInvoice(invoice);
    const pdfBuffer = await buildInvoicePdfBuffer({ business, invoice: normalized });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${normalized.invoice_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate invoice PDF.' });
  }
});

// POST /api/invoices/:id/send
router.post('/:id/send', async (req, res) => {
  const invoice = await fetchInvoiceRecord(req.params.id, req.businessId);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

  const { data: business } = await supabase
    .from('businesses')
    .select('name, phone')
    .eq('id', req.businessId)
    .single();

  try {
    const normalized = normaliseInvoice(invoice);
    const pdfBuffer = await buildInvoicePdfBuffer({ business, invoice: normalized });
    await sendInvoiceEmail({ invoice: normalized, pdfBuffer });

    if (normalized.status === 'draft') {
      await supabase.from('invoices')
        .update({ status: 'sent' })
        .eq('id', req.params.id)
        .eq('business_id', req.businessId);
    }

    res.json({ success: true });
  } catch (err) {
    const status = err.code === 'EMAIL_CONFIG' ? 503 : err.code === 'EMAIL_RECIPIENT' ? 400 : 500;
    res.status(status).json({ error: err.message || 'Failed to send invoice email.' });
  }
});

// GET /api/invoices/:id
router.get('/:id', async (req, res) => {
  const data = await fetchInvoiceRecord(req.params.id, req.businessId);
  if (!data) return res.status(404).json({ error: 'Invoice not found.' });
  res.json(normaliseInvoice(data));
});

// PATCH /api/invoices/:id
router.patch('/:id', validate(invoiceUpdateSchema), async (req, res) => {
  const { items, ...invoicePatch } = req.body;

  try {
    await assertInvoiceReferences({ businessId: req.businessId, customerId: invoicePatch.customer_id, items });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  if (items) {
    const itemRows = buildInvoiceItems(items, req.params.id);
    invoicePatch.total_amount = itemRows.reduce((sum, item) => sum + item.subtotal, 0);
  }

  const { error } = await supabase.from('invoices')
    .update(invoicePatch)
    .eq('id', req.params.id)
    .eq('business_id', req.businessId)
    .select('id')
    .single();
  if (error) return res.status(400).json({ error: error.message });

  if (items) {
    await supabase.from('invoice_items').delete().eq('invoice_id', req.params.id);

    const itemRows = buildInvoiceItems(items, req.params.id);
    if (itemRows.length > 0) {
      const { error: itemsErr } = await supabase.from('invoice_items').insert(itemRows);
      if (itemsErr && itemsErr.message?.includes('product_name')) {
        const fallbackRows = itemRows.map(({ product_name, ...itemRow }) => itemRow);
        await supabase.from('invoice_items').insert(fallbackRows);
      }
    }
  }

  const invoice = await fetchInvoiceRecord(req.params.id, req.businessId);
  res.json(normaliseInvoice(invoice));
});

// PATCH /api/invoices/:id/status
router.patch('/:id/status', validate(invoiceStatusSchema), async (req, res) => {
  const { status } = req.body;
  const { error } = await supabase.from('invoices')
    .update({ status })
    .eq('id', req.params.id)
    .eq('business_id', req.businessId)
    .select('id')
    .single();
  if (error) return res.status(400).json({ error: error.message });

  const invoice = await fetchInvoiceRecord(req.params.id, req.businessId);
  res.json(normaliseInvoice(invoice));
});

// DELETE /api/invoices/:id
router.delete('/:id', async (req, res) => {
  const existing = await fetchInvoiceRecord(req.params.id, req.businessId);
  if (!existing) return res.status(404).json({ error: 'Invoice not found.' });

  const { error } = await supabase.from('invoices')
    .delete()
    .eq('id', req.params.id)
    .eq('business_id', req.businessId);
  if (error) return res.status(400).json({ error: error.message });

  await supabase.from('invoice_items').delete().eq('invoice_id', req.params.id);
  res.json({ success: true });
});

module.exports = router;
