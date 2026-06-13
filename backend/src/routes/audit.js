const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');

router.use(authenticate, tenantScope, requireRole('owner', 'manager'));

const CATEGORY_ENTITY_TYPES = {
  billing: ['billing', 'subscription'],
  products: ['product', 'stock'],
  customers: ['customer', 'credit_payment'],
  expenses: ['expense'],
  staff: ['staff', 'auth'],
};

function normalizeAudit(row) {
  if (!row) return row;
  return {
    ...row,
    user: row.users ? {
      name: row.users.name || '',
      email: row.users.email || '',
      role: row.users.role || '',
    } : null,
  };
}

router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50) || 50, 100);
  const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
  const entityType = typeof req.query.entity_type === 'string' ? req.query.entity_type.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';

  let query = supabase
    .from('audit_logs')
    .select('*, users(name, email, role)')
    .eq('business_id', req.businessId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (action) query = query.eq('action', action);
  if (entityType) query = query.eq('entity_type', entityType);
  if (category && CATEGORY_ENTITY_TYPES[category]) {
    query = query.in('entity_type', CATEGORY_ENTITY_TYPES[category]);
  }

  const { data, error } = await query;
  if (error) {
    if (error.message?.toLowerCase().includes('audit_logs')) return res.json([]);
    return res.status(500).json({ error: 'Failed to load audit logs.' });
  }

  res.json((data || []).map(normalizeAudit));
});

module.exports = router;
