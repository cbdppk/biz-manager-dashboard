const express = require('express');
const router = express.Router();
const { z } = require('zod');
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { logAudit } = require('../helpers/audit');

router.use(authenticate, tenantScope);

const feedbackSchema = z.object({
  type: z.string().trim().min(1).max(60),
  area: z.string().trim().min(1).max(80),
  message: z.string().trim().min(10).max(2000),
  contact: z.string().trim().max(120).optional().nullable(),
}).strict();

const statusSchema = z.object({
  status: z.enum(['open', 'reviewed']),
}).strict();

function normalizeRequest(row) {
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

router.post('/feedback', validate(feedbackSchema), async (req, res) => {
  const payload = {
    business_id: req.businessId,
    user_id: req.user.id,
    type: req.body.type,
    area: req.body.area,
    message: req.body.message,
    contact: req.body.contact || null,
    status: 'open',
  };

  try {
    const { data, error } = await supabase
      .from('support_requests')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;

    await logAudit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'support.feedback_submitted',
      entityType: 'support_request',
      entityId: data.id,
      summary: `${req.body.type} feedback submitted for ${req.body.area}`,
      metadata: { type: req.body.type, area: req.body.area },
    });

    return res.status(201).json({ ok: true, stored: true, request: normalizeRequest(data) });
  } catch (err) {
    console.warn('[support] feedback fallback:', err.message);
    return res.status(202).json({
      ok: true,
      stored: false,
      message: 'Feedback received. Support storage is not fully configured yet.',
    });
  }
});

router.get('/feedback', requireRole('owner', 'manager'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50) || 50, 100);
  const status = typeof req.query.status === 'string' ? req.query.status : '';

  let query = supabase
    .from('support_requests')
    .select('*, users(name, email, role)')
    .eq('business_id', req.businessId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && ['open', 'reviewed'].includes(status)) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    if (error.message?.toLowerCase().includes('support_requests')) return res.json([]);
    return res.status(500).json({ error: 'Failed to load support requests.' });
  }

  res.json((data || []).map(normalizeRequest));
});

router.patch('/feedback/:id', requireRole('owner', 'manager'), validate(statusSchema), async (req, res) => {
  const patch = {
    status: req.body.status,
    reviewed_at: req.body.status === 'reviewed' ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from('support_requests')
    .update(patch)
    .eq('id', req.params.id)
    .eq('business_id', req.businessId)
    .select('*')
    .single();

  if (error || !data) return res.status(404).json({ error: 'Support request not found.' });

  await logAudit({
    businessId: req.businessId,
    userId: req.user.id,
    action: 'support.request_updated',
    entityType: 'support_request',
    entityId: req.params.id,
    summary: `Support request marked ${req.body.status}`,
    metadata: { status: req.body.status },
  });

  res.json(normalizeRequest(data));
});

module.exports = router;
