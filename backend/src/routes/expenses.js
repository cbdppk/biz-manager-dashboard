const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { z } = require('zod');
const { roundMoney } = require('../helpers/profit');
const { logAudit } = require('../helpers/audit');

router.use(authenticate, tenantScope);
const requireOwnerOrManager = requireRole('owner', 'manager');

const expenseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(80).default('general'),
  amount: z.number().min(0),
  payment_method: z.enum(['cash', 'momo', 'card', 'bank', 'other']).default('cash'),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).optional().nullable(),
});

const expenseUpdateSchema = expenseSchema.partial();

function normaliseExpense(row) {
  if (!row) return row;
  return {
    ...row,
    amount: Number(row.amount || 0),
  };
}

router.get('/', requireOwnerOrManager, async (req, res) => {
  const { from, to, category, limit = 100 } = req.query;

  let query = supabase
    .from('expenses')
    .select('*')
    .eq('business_id', req.businessId)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(Number(limit));

  if (from) query = query.gte('expense_date', from);
  if (to) query = query.lte('expense_date', to);
  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json((data || []).map(normaliseExpense));
});

router.get('/summary', requireOwnerOrManager, async (req, res) => {
  const { from, to } = req.query;

  let query = supabase
    .from('expenses')
    .select('amount, category')
    .eq('business_id', req.businessId);

  if (from) query = query.gte('expense_date', from);
  if (to) query = query.lte('expense_date', to);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const rows = data || [];
  const total = roundMoney(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const by_category = rows.reduce((acc, row) => {
    const key = row.category || 'general';
    acc[key] = roundMoney((acc[key] || 0) + Number(row.amount || 0));
    return acc;
  }, {});

  res.json({ total, count: rows.length, by_category });
});

router.get('/:id', requireOwnerOrManager, async (req, res) => {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', req.params.id)
    .eq('business_id', req.businessId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Expense not found.' });
  res.json(normaliseExpense(data));
});

router.post('/', requireOwnerOrManager, validate(expenseSchema), async (req, res) => {
  const payload = {
    business_id: req.businessId,
    recorded_by: req.user.id,
    title: req.body.title,
    category: req.body.category || 'general',
    amount: req.body.amount,
    payment_method: req.body.payment_method || 'cash',
    expense_date: req.body.expense_date,
    note: req.body.note || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('expenses').insert(payload).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logAudit({
    businessId: req.businessId,
    userId: req.user.id,
    action: 'expense.created',
    entityType: 'expense',
    entityId: data.id,
    summary: `Expense recorded: ${data.title}`,
    metadata: { amount: data.amount, category: data.category, payment_method: data.payment_method },
  });
  res.status(201).json(normaliseExpense(data));
});

router.patch('/:id', requireOwnerOrManager, validate(expenseUpdateSchema), async (req, res) => {
  const updates = { ...req.body, updated_at: new Date().toISOString() };

  const { data, error } = await supabase
    .from('expenses')
    .update(updates)
    .eq('id', req.params.id)
    .eq('business_id', req.businessId)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Expense not found.' });
  await logAudit({
    businessId: req.businessId,
    userId: req.user.id,
    action: 'expense.updated',
    entityType: 'expense',
    entityId: req.params.id,
    summary: `Expense updated: ${data.title}`,
    metadata: { changed_fields: Object.keys(req.body), amount: data.amount },
  });
  res.json(normaliseExpense(data));
});

router.delete('/:id', requireOwnerOrManager, async (req, res) => {
  const { data, error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', req.params.id)
    .eq('business_id', req.businessId)
    .select('id')
    .single();

  if (error || !data) return res.status(404).json({ error: 'Expense not found.' });
  await logAudit({
    businessId: req.businessId,
    userId: req.user.id,
    action: 'expense.deleted',
    entityType: 'expense',
    entityId: req.params.id,
    summary: 'Expense deleted',
  });
  res.json({ ok: true });
});

module.exports = router;
