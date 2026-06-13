const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { sendSMS } = require('../helpers/arkesel');
const validate = require('../middleware/validate');
const { z } = require('zod');
const { logAudit } = require('../helpers/audit');

router.use(authenticate, tenantScope);
const requireOwnerOrManager = requireRole('owner', 'manager');

const optionalText = (max) => z.union([z.string().trim().max(max), z.null()]).optional();

const customerCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  phone: optionalText(30),
  email: z.union([z.string().trim().toLowerCase().email(), z.null()]).optional(),
  address: optionalText(250),
  credit_limit: z.number().min(0).optional(),
}).strict();

const customerUpdateSchema = customerCreateSchema.partial();

function buildCustomerPayload(input) {
  const payload = {};

  if (input.name !== undefined) payload.name = input.name;
  if (input.phone !== undefined) payload.phone = input.phone || null;
  if (input.email !== undefined) payload.email = input.email || null;
  if (input.address !== undefined) payload.address = input.address || null;
  if (input.credit_limit !== undefined) payload.credit_limit = input.credit_limit;

  return payload;
}

async function runCustomerMutation(builder, payload) {
  let result = await builder(payload);

  if (!result.error) {
    return result;
  }

  const missingOptionalColumn = ['address', 'credit_limit'].some((column) => result.error.message?.includes(column));
  if (!missingOptionalColumn) {
    return result;
  }

  const fallbackPayload = { ...payload };
  delete fallbackPayload.address;
  delete fallbackPayload.credit_limit;
  return builder(fallbackPayload);
}

router.get('/', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  let query = supabase.from('customers')
    .select('id, name, phone, email, created_at')
    .eq('business_id', req.businessId)
    .order('name');
  if (search) query = query.ilike('name', `%${search}%`);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Compute credit balance for each customer from credit_ledger
  const ids = (data || []).map(c => c.id);
  let ledger = [];
  if (ids.length > 0) {
    const { data: ledgerData } = await supabase
      .from('credit_ledger')
      .select('customer_id, amount')
      .eq('business_id', req.businessId)
      .eq('type', 'debt')
      .eq('settled', false)
      .in('customer_id', ids);
    ledger = ledgerData || [];
  }

  const balanceMap = {};
  ledger.forEach(l => {
    balanceMap[l.customer_id] = (balanceMap[l.customer_id] || 0) + l.amount;
  });

  res.json((data || []).map(c => ({
    ...c,
    total_unpaid_credit: balanceMap[c.id] || 0,
  })));
});

router.post('/', validate(customerCreateSchema), async (req, res) => {
  const payload = { ...buildCustomerPayload(req.body), business_id: req.businessId };
  const { data, error } = await runCustomerMutation(
    (insertData) => supabase.from('customers').insert(insertData).select().single(),
    payload
  );
  if (error) return res.status(400).json({ error: error.message });
  await logAudit({
    businessId: req.businessId,
    userId: req.user.id,
    action: 'customer.created',
    entityType: 'customer',
    entityId: data.id,
    summary: `Customer created: ${data.name}`,
    metadata: { has_phone: Boolean(data.phone), has_email: Boolean(data.email) },
  });
  res.status(201).json(data);
});

router.patch('/:id', validate(customerUpdateSchema), async (req, res) => {
  const payload = buildCustomerPayload(req.body);
  const { data, error } = await runCustomerMutation(
    (patch) => supabase.from('customers')
      .update(patch)
      .eq('id', req.params.id)
      .eq('business_id', req.businessId)
      .select()
      .single(),
    payload
  );
  if (error) return res.status(400).json({ error: error.message });
  await logAudit({
    businessId: req.businessId,
    userId: req.user.id,
    action: 'customer.updated',
    entityType: 'customer',
    entityId: req.params.id,
    summary: `Customer updated: ${data.name}`,
    metadata: { changed_fields: Object.keys(payload) },
  });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data: customer, error } = await supabase.from('customers')
    .select('id, name, phone, email, address, credit_limit, created_at')
    .eq('id', req.params.id)
    .eq('business_id', req.businessId)
    .single();

  if (error || !customer) return res.status(404).json({ error: 'Customer not found.' });

  const { data: debts } = await supabase.from('credit_ledger')
    .select('amount')
    .eq('customer_id', req.params.id)
    .eq('business_id', req.businessId)
    .eq('type', 'debt')
    .eq('settled', false);

  const total_unpaid_credit = (debts || []).reduce((sum, debt) => sum + Number(debt.amount || 0), 0);
  res.json({
    ...customer,
    total_unpaid_credit,
  });
});

router.get('/:id/credit', async (req, res) => {
  const { data, error } = await supabase.from('credit_ledger')
    .select('*, sales(created_at, total_amount)')
    .eq('customer_id', req.params.id)
    .eq('business_id', req.businessId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/customers/:id/remind
router.post('/:id/remind', requireOwnerOrManager, async (req, res) => {
  const { data: customer } = await supabase.from('customers')
    .select('name, phone').eq('id', req.params.id).eq('business_id', req.businessId).single();
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });

  const { data: business } = await supabase.from('businesses')
    .select('name').eq('id', req.businessId).single();

  const { data: credit } = await supabase.from('credit_ledger')
    .select('amount')
    .eq('business_id', req.businessId)
    .eq('customer_id', req.params.id)
    .eq('type', 'debt')
    .eq('settled', false);

  const totalDebt = (credit || []).reduce((s, c) => s + c.amount, 0);
  const message = `Dear ${customer.name}, you have an outstanding balance of GHS ${totalDebt.toFixed(2)} at ${business?.name || 'our store'}. Please settle at your earliest convenience. Thank you.`;

  try {
    await sendSMS(customer.phone, message);
    await logAudit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'customer.reminder_sent',
      entityType: 'customer',
      entityId: req.params.id,
      summary: `Credit reminder sent to ${customer.name}`,
      metadata: { total_debt: totalDebt },
    });
    res.json({ success: true, message_sent: message });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to send SMS.', detail: err.message });
  }
});

module.exports = router;
