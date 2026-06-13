const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const validate = require('../middleware/validate');
const { createStaffInvite } = require('../helpers/staffInvites');
const { z } = require('zod');
const { logAudit } = require('../helpers/audit');

const HASH_ROUNDS = 12;

function signToken(userId, tokenVersion = 0) {
  return jwt.sign(
    { userId, tokenVersion: Number(tokenVersion) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

const registerSchema = z.object({
  business_name: z.string().trim().min(2).max(100),
  owner_name: z.string().trim().max(100).optional(),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  phone: z.string().trim().min(10).max(30),
  sector: z.enum(['retail', 'pharmacy', 'spare_parts', 'restaurant', 'service', 'other'])
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string()
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['manager', 'cashier']),
});

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req, res) => {
  const { business_name, owner_name, email, password, phone, sector } = req.body;
  try {
    const { data: existingUser, error: existingError } = await supabase
      .from('users')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    if (existingError) return res.status(400).json({ error: existingError.message });
    if (existingUser) return res.status(409).json({ error: 'An account with this email already exists.' });

    const businessId = uuidv4();
    const userId = uuidv4();
    const trialEndsAt = new Date(Date.now() + 14 * 86400000).toISOString();
    const passwordHash = await bcrypt.hash(password, HASH_ROUNDS);

    // Insert with only columns we know exist; extra columns added by migration
    const bizInsert = {
      id: businessId,
      name: business_name,
      phone,
      sector,
      operating_mode: sector === 'restaurant' ? 'food' : 'retail',
      enabled_modules: sector === 'restaurant' ? ['retail_core', 'food_ops'] : ['retail_core'],
      owner_id: userId,
      subscription_tier: 'free',
      trial_ends_at: trialEndsAt,
      whatsapp_enabled: false,
    };
    const { error: businessError } = await supabase.from('businesses').insert(bizInsert);
    if (businessError) {
      return res.status(400).json({ error: businessError.message });
    }

    const { error: userError } = await supabase.from('users').insert({
      id: userId,
      business_id: businessId,
      email,
      name: owner_name || null,
      role: 'owner',
      is_active: true,
      phone,
      password_hash: passwordHash,
    });
    if (userError) {
      await supabase.from('businesses').delete().eq('id', businessId).catch(() => {});
      return res.status(400).json({ error: userError.message });
    }

    const token = signToken(userId, 0);
    res.status(201).json({ token, business_id: businessId });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, business_id, role, is_active, password_hash, token_version, must_change_password')
      .ilike('email', email)
      .maybeSingle();

    if (error) {
      console.error('[auth/login] user lookup failed:', error.message);
      return res.status(500).json({ error: 'Login failed. Please try again.' });
    }
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.password_hash) {
      return res.status(403).json({
        error: 'This account has no password yet. Ask your business owner to send a new staff invite, or register a new business.',
      });
    }
    if (!user.is_active) return res.status(403).json({ error: 'Account deactivated.' });

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) return res.status(401).json({ error: 'Invalid email or password.' });

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, sector, operating_mode, enabled_modules')
      .eq('id', user.business_id)
      .single();

    if (businessError) {
      console.error('[auth/login] business lookup failed:', businessError.message);
      return res.status(500).json({ error: 'Login failed. Please try again.' });
    }

    const token = signToken(user.id, user.token_version);
    res.json({
      token,
      user: {
        id: user.id,
        role: user.role,
        business_id: user.business_id,
        must_change_password: Boolean(user.must_change_password),
      },
      business,
      business_name: business?.name || '',
    });
  } catch (err) {
    console.error('[auth/login] unexpected error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, validate(changePasswordSchema), async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('password_hash, token_version')
      .eq('id', req.user.id)
      .single();
    if (fetchError || !user?.password_hash) return res.status(401).json({ error: 'Current password is incorrect.' });

    const passwordMatches = await bcrypt.compare(current_password, user.password_hash);
    if (!passwordMatches) return res.status(401).json({ error: 'Current password is incorrect.' });

    const passwordHash = await bcrypt.hash(new_password, HASH_ROUNDS);
    const nextTokenVersion = Number(user.token_version ?? 0) + 1;
    const { error } = await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        token_version: nextTokenVersion,
        must_change_password: false,
      })
      .eq('id', req.user.id);
    if (error) return res.status(400).json({ error: error.message });
    await logAudit({
      businessId: req.user.business_id,
      userId: req.user.id,
      action: 'auth.password_changed',
      entityType: 'auth',
      entityId: req.user.id,
      summary: 'Password changed',
    });
    res.json({ success: true, token: signToken(req.user.id, nextTokenVersion) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const { data: profile } = await supabase
    .from('users')
    .select('email, must_change_password')
    .eq('id', req.user.id)
    .single();

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, sector, operating_mode, enabled_modules, subscription_tier, trial_ends_at, subscription_expires_at, whatsapp_enabled, phone')
    .eq('id', req.user.business_id)
    .single();

  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', req.user.business_id)
    .eq('is_active', true);

  res.json({
    user: {
      id: req.user.id,
      role: req.user.role,
      business_id: req.user.business_id,
      email: profile?.email || null,
      must_change_password: Boolean(profile?.must_change_password),
    },
    business,
    business_name: business?.name || '',
    staff_count: count || 0,
  });
});

// POST /api/auth/refresh  — reissue a fresh 7-day token.
// Intentionally accepts expired tokens (ignoreExpiration) so the client can
// silently renew without forcing re-login. Rejects tokens older than 30 days
// (grace window) so stale/forgotten tokens can't be refreshed indefinitely.
router.post('/refresh', async (req, res) => {
  const raw = req.headers.authorization?.split(' ')[1];
  if (!raw) return res.status(401).json({ error: 'No token provided.' });

  let decoded;
  try {
    decoded = jwt.verify(raw, process.env.JWT_SECRET, { ignoreExpiration: true });
  } catch {
    return res.status(401).json({ error: 'Invalid token.' });
  }

  // Reject tokens that expired more than 30 days ago
  const MAX_GRACE_SECONDS = 30 * 86400;
  if (decoded.exp && Math.floor(Date.now() / 1000) - decoded.exp > MAX_GRACE_SECONDS) {
    return res.status(401).json({ error: 'Token too old to refresh. Please log in again.' });
  }

  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, is_active, token_version')
      .eq('id', decoded.userId)
      .single();

    if (!user?.is_active) return res.status(403).json({ error: 'Account deactivated.' });

    const tokenVersion = Number(decoded.tokenVersion ?? 0);
    if (tokenVersion !== Number(user.token_version ?? 0)) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }

    const token = signToken(decoded.userId, user.token_version);
    res.json({ token });
  } catch {
    res.status(500).json({ error: 'Token refresh failed.' });
  }
});

// POST /api/auth/logout  — client clears its token; server confirms and logs.
// audit_logs table will be added in a future migration — endpoint is ready for it.
router.post('/logout', authenticate, (req, res) => {
  console.log(`[auth] logout user=${req.user.id} business=${req.user.business_id}`);
  res.status(204).send();
});

// POST /api/auth/invite
router.post('/invite', authenticate, tenantScope, requireRole('owner', 'manager'), validate(inviteSchema), async (req, res) => {
  const { email, role } = req.body;

  try {
    const result = await createStaffInvite({
      supabase,
      businessId: req.businessId,
      email,
      role,
    });
    await logAudit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'staff.invited',
      entityType: 'staff',
      entityId: result.user?.id || result.invite?.id || null,
      summary: `Staff invited as ${role}`,
      metadata: { role, email },
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to invite staff member.' });
  }
});

module.exports = router;
