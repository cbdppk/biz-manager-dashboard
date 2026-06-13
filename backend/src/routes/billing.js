const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { sendWhatsAppMessage } = require('../helpers/whatsapp');
const { sendSMS } = require('../helpers/arkesel');
const { logAudit } = require('../helpers/audit');

const PRICES = { basic: 7900, pro: 14900 };

function calculateSubscriptionExpiry(currentExpiryIso, now = Date.now()) {
  const currentExpiry = currentExpiryIso
    ? new Date(currentExpiryIso).getTime()
    : 0;
  const baseTime = Math.max(now, currentExpiry);
  return new Date(baseTime + 30 * 86400 * 1000).toISOString();
}

function getTimeOrNull(iso) {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : null;
}

function daysUntil(expiryTime, now = Date.now()) {
  if (!expiryTime) return null;
  return Math.max(0, Math.ceil((expiryTime - now) / 86400000));
}

function deriveBillingStatus(business, now = Date.now()) {
  const tier = business.subscription_tier || 'free';
  const subscriptionExpiry = getTimeOrNull(business.subscription_expires_at);
  const trialExpiry = getTimeOrNull(business.trial_ends_at);
  const paidTier = tier === 'basic' || tier === 'pro';
  const expiry = paidTier ? subscriptionExpiry : trialExpiry;
  const days_remaining = daysUntil(expiry, now);

  let status = 'unknown';
  if (paidTier) {
    status = subscriptionExpiry && subscriptionExpiry > now ? 'active' : 'expired';
  } else if (trialExpiry) {
    status = trialExpiry > now ? 'trial' : 'expired';
  } else if (tier === 'free' || tier === 'trial') {
    status = 'free';
  }

  return {
    tier,
    status,
    days_remaining,
    is_expired: status === 'expired',
  };
}

// ── POST /api/billing/initiate ───────────────────────────────────
async function startBillingCheckout(req, res) {
  const { plan } = req.body;
  if (!PRICES[plan]) return res.status(400).json({ error: 'Invalid plan. Choose basic or pro.' });
  if (!process.env.PAYSTACK_SECRET_KEY || !process.env.FRONTEND_URL) {
    return res.status(503).json({ error: 'Billing is not configured. Set PAYSTACK_SECRET_KEY and FRONTEND_URL.' });
  }

  // Fetch business owner email
  const { data: business, error: bErr } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', req.businessId)
    .single();
  if (bErr || !business) return res.status(404).json({ error: 'Business not found.' });

  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('email')
    .eq('id', req.user.id)
    .single();
  if (uErr || !user) return res.status(404).json({ error: 'User not found.' });

  try {
    const { data: psData } = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: user.email,
        amount: PRICES[plan],
        currency: 'GHS',
        callback_url: `${process.env.FRONTEND_URL}/settings/subscription`,
        // Explicitly enable both card and mobile money so MoMo (MTN, Vodafone,
        // AirtelTigo) is offered alongside cards on Paystack's hosted page.
        channels: ['card', 'mobile_money'],
        metadata: { business_id: req.businessId, plan }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      authorization_url: psData.data.authorization_url,
      checkout_url: psData.data.authorization_url,
    });

    await logAudit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'billing.checkout_initiated',
      entityType: 'billing',
      entityId: plan,
      summary: `Checkout initiated for ${plan} plan`,
      metadata: { plan, amount: PRICES[plan] },
    });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    res.status(502).json({ error: `Paystack error: ${msg}` });
  }
}

router.post('/initiate', authenticate, tenantScope, requireRole('owner', 'manager'), startBillingCheckout);
router.post('/subscribe', authenticate, tenantScope, requireRole('owner', 'manager'), startBillingCheckout);

// ── POST /api/billing/webhook (Paystack) ─────────────────────────
// Mounted in index.js before express.json() to preserve the raw body.
async function paystackWebhook(req, res) {
  const signature = req.headers['x-paystack-signature'];
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) return res.status(503).json({ error: 'Billing webhook is not configured.' });
  if (!signature) return res.status(401).json({ error: 'Missing signature.' });

  const hash = crypto
    .createHmac('sha512', secret)
    .update(req.body)
    .digest('hex');

  const hashBuffer = Buffer.from(hash);
  const signatureBuffer = Buffer.from(signature);

  if (hashBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(hashBuffer, signatureBuffer)) {
    return res.status(401).json({ error: 'Invalid signature.' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  if (event.event === 'charge.success') {
    await processChargeSuccess(event);
  }

  if (event.event === 'charge.failed') {
    const { business_id, plan } = event.data?.metadata || {};
    if (business_id) {
      console.warn(`[billing] charge.failed for business ${business_id} plan=${plan}`);
      // Payment attempt failed — no subscription change; the business keeps its current tier.
      // Optionally notify owner of the failure.
      await logAudit({
        businessId: business_id,
        userId: null,
        action: 'billing.charge_failed',
        entityType: 'billing',
        entityId: event.data?.reference || null,
        summary: `Paystack charge failed${plan ? ` for ${plan} plan` : ''}`,
        metadata: { plan, reference: event.data?.reference || null },
      });
      notifyOwnerPaymentFailed(business_id).catch(() => {});
    }
  }

  // Paystack emits 'refund.processed' (not 'charge.refunded') when a refund completes.
  if (event.event === 'refund.processed') {
    // Paystack refund payloads carry the original transaction reference, not
    // always metadata. Try metadata first, then fall back to a transaction lookup.
    const metaBusinessId = event.data?.metadata?.business_id;
    let business_id = metaBusinessId;

    if (!business_id && event.data?.transaction_reference) {
      // Look up the business via the original transaction reference stored in payments table.
      const { data: payment } = await supabase
        .from('payments')
        .select('business_id')
        .eq('provider_ref', event.data.transaction_reference)
        .maybeSingle();
      business_id = payment?.business_id;
    }

    if (business_id) {
      await supabase
        .from('businesses')
        .update({ subscription_tier: 'free', subscription_expires_at: null })
        .eq('id', business_id);
      console.log(`[billing] refund.processed — business ${business_id} reverted to free`);
      await logAudit({
        businessId: business_id,
        userId: null,
        action: 'billing.refund_processed',
        entityType: 'billing',
        entityId: event.data?.transaction_reference || null,
        summary: 'Paystack refund processed; subscription reverted to free',
        metadata: { reference: event.data?.transaction_reference || null },
      });
      notifyOwnerPaymentFailed(business_id).catch(() => {});
    } else {
      console.warn('[billing] refund.processed — could not resolve business_id', event.data);
    }
  }

  res.sendStatus(200);
}

async function notifyOwner(businessId, plan) {
  const { data: business } = await supabase
    .from('businesses')
    .select('name, whatsapp_enabled')
    .eq('id', businessId)
    .single();

  const { data: owner } = await supabase
    .from('users')
    .select('phone')
    .eq('business_id', businessId)
    .eq('role', 'owner')
    .single();

  if (!owner?.phone) return;

  const msg = `BizManager: Your ${plan} subscription is now active for 30 days. Thank you, ${business?.name || 'valued customer'}!`;

  const tasks = [sendSMS(owner.phone, msg)];
  if (business?.whatsapp_enabled) tasks.push(sendWhatsAppMessage(owner.phone, msg));

  await Promise.allSettled(tasks);
}

// ── GET /api/billing/status ──────────────────────────────────────
router.get('/status', authenticate, tenantScope, requireRole('owner', 'manager'), async (req, res) => {
  const { data: business, error } = await supabase
    .from('businesses')
    .select('subscription_tier, trial_ends_at, subscription_expires_at')
    .eq('id', req.businessId)
    .single();

  if (error || !business) return res.status(404).json({ error: 'Business not found.' });

  const derived = deriveBillingStatus(business);

  res.json({
    tier: derived.tier,
    status: derived.status,
    trial_ends_at: business.trial_ends_at,
    subscription_expires_at: business.subscription_expires_at,
    days_remaining: derived.days_remaining,
    is_expired: derived.is_expired,
    can_manage_billing: req.user.role === 'owner' || req.user.role === 'manager',
  });
});

async function notifyOwnerPaymentFailed(businessId) {
  const { data: business } = await supabase
    .from('businesses')
    .select('name, whatsapp_enabled')
    .eq('id', businessId)
    .single();

  const { data: owner } = await supabase
    .from('users')
    .select('phone')
    .eq('business_id', businessId)
    .eq('role', 'owner')
    .single();

  if (!owner?.phone) return;

  const msg = `BizManager: Your payment could not be processed for ${business?.name || 'your account'}. Please try again at example.com.`;

  const tasks = [sendSMS(owner.phone, msg)];
  if (business?.whatsapp_enabled) tasks.push(sendWhatsAppMessage(owner.phone, msg));

  await Promise.allSettled(tasks);
}

async function processChargeSuccess(event) {
  const reference = event.data?.reference;
  const currency = event.data?.currency;
  const amount = Number(event.data?.amount);
  const { business_id: businessId, plan } = event.data?.metadata || {};

  if (!reference) {
    console.warn('[billing] charge.success ignored: missing reference');
    return;
  }

  const { data: existingEvent } = await supabase
    .from('billing_events')
    .select('id')
    .eq('provider_ref', reference)
    .maybeSingle();

  if (existingEvent) {
    console.log(`[billing] duplicate charge.success ignored for reference ${reference}`);
    return;
  }

  if (currency !== 'GHS') {
    console.warn(`[billing] charge.success ignored: invalid currency ${currency || 'unknown'}`);
    return;
  }

  if (!businessId || !plan || !PRICES[plan]) {
    console.warn('[billing] charge.success ignored: invalid metadata');
    return;
  }

  if (amount !== PRICES[plan]) {
    console.warn(`[billing] charge.success ignored: amount mismatch for ${plan}`);
    return;
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('subscription_expires_at')
    .eq('id', businessId)
    .single();

  if (businessError || !business) {
    console.warn(`[billing] charge.success ignored: business ${businessId} not found`);
    return;
  }

  const { error: insertEventError } = await supabase.from('billing_events').insert({
    business_id: businessId,
    provider: 'paystack',
    provider_ref: reference,
    event_type: 'charge.success',
    plan,
    amount,
    currency,
    status: 'processed',
    raw_event: event,
  });

  if (insertEventError) {
    if (insertEventError.code === '23505' || insertEventError.message?.includes('duplicate')) {
      console.log(`[billing] duplicate charge.success ignored for reference ${reference}`);
      return;
    }
    console.error('[billing] failed to record billing event');
    return;
  }

  const expiresAt = calculateSubscriptionExpiry(business.subscription_expires_at);

  await supabase
    .from('businesses')
    .update({ subscription_tier: plan, subscription_expires_at: expiresAt })
    .eq('id', businessId);

  await logAudit({
    businessId,
    userId: null,
    action: 'billing.charge_success',
    entityType: 'billing',
    entityId: reference,
    summary: `Paystack charge succeeded for ${plan} plan`,
    metadata: { plan, expires_at: expiresAt, reference },
  });

  notifyOwner(businessId, plan).catch(() => {});
}

router.paystackWebhook = paystackWebhook;
router.processChargeSuccess = processChargeSuccess;
router.calculateSubscriptionExpiry = calculateSubscriptionExpiry;
router.deriveBillingStatus = deriveBillingStatus;
module.exports = router;
