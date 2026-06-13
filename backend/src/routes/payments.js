const express = require('express');
const router = express.Router();
const { initiateMoMoPayment, checkMoMoStatus } = require('../helpers/momo');
const { authenticate } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const supabase = require('../config/supabase');
const { z } = require('zod');
const { logAudit } = require('../helpers/audit');

router.use(authenticate, tenantScope);

const paymentSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  sale_id: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  method: z.enum(['cash', 'momo', 'card', 'credit', 'Cash', 'MoMo', 'Card', 'Credit']).default('cash'),
  note: z.string().trim().max(300).optional(),
  type: z.enum(['credit_payment']).optional(),
}).strict();

const momoCollectSchema = z.object({
  phone: z.string().trim().min(8).max(30),
  amount: z.number().positive(),
  sale_id: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(300).optional(),
}).strict();

async function insertPaymentRecord(payload) {
  let result = await supabase.from('payments').insert(payload).select().single();

  if (!result.error) {
    return result;
  }

  const missingOptionalColumn = ['customer_id', 'note'].some((column) => result.error.message?.includes(column));
  if (!missingOptionalColumn) {
    return result;
  }

  const fallbackPayload = { ...payload };
  delete fallbackPayload.customer_id;
  delete fallbackPayload.note;

  return supabase.from('payments').insert(fallbackPayload).select().single();
}

async function applyPaymentToOutstandingDebt({ customerId, businessId, amount }) {
  let remaining = Number(amount);

  if (!customerId || remaining <= 0) return;

  const { data: debts, error } = await supabase.from('credit_ledger')
    .select('id, amount')
    .eq('customer_id', customerId)
    .eq('business_id', businessId)
    .eq('type', 'debt')
    .eq('settled', false)
    .order('created_at', { ascending: true });

  if (error || !debts?.length) return;

  for (const debt of debts) {
    if (remaining <= 0) break;

    const debtAmount = Number(debt.amount || 0);
    if (remaining >= debtAmount) {
      remaining -= debtAmount;
      await supabase.from('credit_ledger')
        .update({ settled: true })
        .eq('id', debt.id)
        .eq('business_id', businessId);
      continue;
    }

    await supabase.from('credit_ledger')
      .update({ amount: debtAmount - remaining })
      .eq('id', debt.id)
      .eq('business_id', businessId);
    remaining = 0;
  }
}

async function assertBusinessReference(table, id, businessId, label) {
  if (!id) return true;
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('business_id', businessId)
    .single();
  if (error || !data) {
    const err = new Error(`${label} does not belong to this business.`);
    err.status = 400;
    throw err;
  }
  return true;
}

router.post('/', validate(paymentSchema), async (req, res) => {
  const { customer_id, sale_id = null, amount, method = 'cash', note, type } = req.body;
  const parsedAmount = Number(amount);

  if (!parsedAmount || parsedAmount <= 0) {
    return res.status(400).json({ error: 'A valid payment amount is required.' });
  }

  try {
    await assertBusinessReference('customers', customer_id, req.businessId, 'Customer');
    await assertBusinessReference('sales', sale_id, req.businessId, 'Sale');

    const { data, error } = await insertPaymentRecord({
      business_id: req.businessId,
      customer_id: customer_id || null,
      sale_id,
      amount: parsedAmount,
      method: String(method).toLowerCase(),
      status: 'completed',
      note: note || null,
    });

    if (error) return res.status(400).json({ error: error.message });

    if (type === 'credit_payment' && customer_id) {
      await applyPaymentToOutstandingDebt({
        customerId: customer_id,
        businessId: req.businessId,
        amount: parsedAmount,
      });

      await supabase.from('credit_ledger').insert({
        business_id: req.businessId,
        customer_id,
        amount: parsedAmount,
        type: 'payment',
        settled: true,
        due_date: null,
      });
    }

    await logAudit({
      businessId: req.businessId,
      userId: req.user.id,
      action: type === 'credit_payment' ? 'customer.credit_payment_recorded' : 'payment.recorded',
      entityType: type === 'credit_payment' ? 'credit_payment' : 'payment',
      entityId: data.id,
      summary: type === 'credit_payment' ? 'Credit payment recorded' : 'Payment recorded',
      metadata: { amount: parsedAmount, method: String(method).toLowerCase(), customer_id: customer_id || null, sale_id },
    });

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to record payment.' });
  }
});

router.post('/momo/collect', validate(momoCollectSchema), async (req, res) => {
  const { phone, amount, sale_id, note } = req.body;
  try {
    await assertBusinessReference('sales', sale_id, req.businessId, 'Sale');

    const result = await initiateMoMoPayment(phone, amount, note || 'BizManager payment');
    await supabase.from('payments').insert({
      business_id: req.businessId,
      sale_id: sale_id || null,
      amount,
      method: 'momo', provider_ref: result.referenceId, status: 'pending'
    });
    res.json({ reference: result.referenceId });
  } catch (err) {
    const status = err.code === 'MOMO_CONFIG' ? 503 : err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

router.get('/momo/status/:reference', async (req, res) => {
  try {
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('id')
      .eq('provider_ref', req.params.reference)
      .eq('business_id', req.businessId)
      .eq('method', 'momo')
      .single();

    if (paymentError || !payment) {
      return res.status(404).json({ error: 'Payment reference not found for this business.' });
    }

    const status = await checkMoMoStatus(req.params.reference);
    const rawStatus = String(status.status || '').toUpperCase();
    const normalizedStatus = rawStatus === 'SUCCESSFUL'
      ? 'success'
      : rawStatus === 'FAILED'
        ? 'failed'
        : 'pending';

    if (rawStatus === 'SUCCESSFUL') {
      await supabase.from('payments')
        .update({ status: 'completed' })
        .eq('provider_ref', req.params.reference)
        .eq('business_id', req.businessId);
    }

    res.json({
      ...status,
      raw_status: rawStatus,
      status: normalizedStatus,
    });
  } catch (err) {
    const status = err.code === 'MOMO_CONFIG' ? 503 : err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
