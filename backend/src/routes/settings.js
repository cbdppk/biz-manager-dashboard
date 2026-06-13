const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { createStaffInvite } = require('../helpers/staffInvites');
const { z } = require('zod');

router.use(authenticate, tenantScope, requireRole('owner', 'manager'));

// ── GET /api/settings — business notification settings ───────────
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', req.businessId)
    .single();

  if (error || !data) return res.status(500).json({ error: 'Failed to fetch settings.' });

  // Return only the settings fields (with defaults if columns don't exist yet)
  res.json({
    low_stock_alerts: data.low_stock_alerts ?? true,
    daily_summary_sms: data.daily_summary_sms ?? false,
    whatsapp_enabled: data.whatsapp_enabled ?? false,
  });
});

// ── PATCH /api/settings — update notification settings ──────────
const settingsSchema = z.object({
  low_stock_alerts: z.boolean().optional(),
  daily_summary_sms: z.boolean().optional(),
  whatsapp_enabled: z.boolean().optional(),
}).passthrough();

router.patch('/', validate(settingsSchema), async (req, res) => {
  const allowed = ['low_stock_alerts', 'daily_summary_sms', 'whatsapp_enabled'];
  const patch = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) patch[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from('businesses')
    .update(patch)
    .eq('id', req.businessId)
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: 'Failed to update settings.' });
  res.json({
    low_stock_alerts: data.low_stock_alerts ?? true,
    daily_summary_sms: data.daily_summary_sms ?? false,
    whatsapp_enabled: data.whatsapp_enabled ?? false,
  });
});

const profileSchema = z.object({
  business_name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  sector: z.enum(['retail', 'pharmacy', 'spare_parts', 'restaurant', 'service', 'other']).optional(),
}).strict();

// ── PATCH /api/settings/profile — business profile ─────────────
router.patch('/profile', validate(profileSchema), async (req, res) => {
  const patch = {};

  if (req.body.business_name !== undefined) patch.name = req.body.business_name;
  if (req.body.phone !== undefined) patch.phone = req.body.phone;
  if (req.body.sector !== undefined) {
    patch.sector = req.body.sector;
    patch.operating_mode = req.body.sector === 'restaurant' ? 'food' : 'retail';
    patch.enabled_modules = req.body.sector === 'restaurant' ? ['retail_core', 'food_ops'] : ['retail_core'];
  }

  const { data, error } = await supabase
    .from('businesses')
    .update(patch)
    .eq('id', req.businessId)
    .select('id, name, phone, sector, operating_mode, enabled_modules')
    .single();

  if (error) return res.status(500).json({ error: 'Failed to update business profile.' });
  res.json({
    business_name: data.name,
    phone: data.phone || '',
    sector: data.sector || '',
    operating_mode: data.operating_mode || 'retail',
    enabled_modules: data.enabled_modules || ['retail_core'],
  });
});

// ── GET /api/settings/staff ──────────────────────────────────────
router.get('/staff', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, is_active, created_at')
    .eq('business_id', req.businessId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: 'Failed to fetch staff.' });
  res.json(data);
});

// ── PATCH /api/settings/staff/:id ───────────────────────────────
const updateStaffSchema = z.object({
  role: z.enum(['manager', 'cashier']).optional(),
  is_active: z.boolean().optional(),
}).strict();

router.patch('/staff/:id', validate(updateStaffSchema), async (req, res) => {
  const { id } = req.params;

  if (id === req.user.id && req.body.is_active === false) {
    return res.status(400).json({ error: 'You cannot deactivate yourself.' });
  }

  if (req.body.role && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can change staff roles.' });
  }

  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', id)
    .eq('business_id', req.businessId)
    .single();

  if (targetError || !targetUser) return res.status(404).json({ error: 'Staff member not found.' });

  if (targetUser.role === 'owner' && req.body.is_active === false) {
    return res.status(400).json({ error: 'Owner accounts cannot be deactivated from staff settings.' });
  }

  if (targetUser.role === 'owner' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can update owner accounts.' });
  }

  const { data, error } = await supabase
    .from('users')
    .update(req.body)
    .eq('id', id)
    .eq('business_id', req.businessId)
    .select('id, email, role, is_active')
    .single();

  if (error) return res.status(500).json({ error: 'Failed to update staff member.' });
  res.json(data);
});

// ── POST /api/settings/staff/invite ─────────────────────────────
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['manager', 'cashier']),
});

router.post('/staff/invite', validate(inviteSchema), async (req, res) => {
  const { email, role } = req.body;

  try {
    const result = await createStaffInvite({
      supabase,
      businessId: req.businessId,
      email,
      role,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to invite staff member.' });
  }
});

module.exports = router;
