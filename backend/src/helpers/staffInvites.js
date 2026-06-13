const axios = require('axios');
const bcrypt = require('bcryptjs');
const { randomBytes } = require('crypto');
const { v4: uuidv4 } = require('uuid');

const HASH_ROUNDS = 12;
const INVITE_EMAIL_NOT_CONFIGURED = 'Staff invite email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL before inviting staff.';

function makeTemporaryPassword() {
  return `${randomBytes(9).toString('base64url')}aA1!`;
}

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || 'https://bizmanager-dashboard.vercel.app').split(',')[0].trim().replace(/\/+$/, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureInviteEmailConfigured() {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    const err = new Error(INVITE_EMAIL_NOT_CONFIGURED);
    err.status = 503;
    throw err;
  }
}

async function sendInviteEmail({ email, role, temporaryPassword, businessName }) {
  ensureInviteEmailConfigured();

  const loginUrl = `${getFrontendUrl()}/login`;
  const safeBusinessName = escapeHtml(businessName || 'BizManager');
  const safeEmail = escapeHtml(email);
  const safeRole = escapeHtml(role);
  const safeTemporaryPassword = escapeHtml(temporaryPassword);
  const subject = `${businessName || 'BizManager'} staff access`.replace(/[\r\n]+/g, ' ').slice(0, 120);
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2>You've been added to ${safeBusinessName}</h2>
      <p>Your ${safeRole} account is ready. Sign in with this email and temporary password:</p>
      <p><strong>Email:</strong> ${safeEmail}</p>
      <p><strong>Temporary password:</strong> ${safeTemporaryPassword}</p>
      <p><a href="${loginUrl}">Open BizManager</a></p>
      <p>Please change this password from Settings after signing in.</p>
    </div>
  `;

  try {
    await axios.post('https://api.resend.com/emails', {
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject,
      html,
    }, {
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.response?.data?.message || err.message || 'email_failed' };
  }
}

async function createStaffInvite({ supabase, businessId, email, role }) {
  ensureInviteEmailConfigured();

  const normalizedEmail = email.trim().toLowerCase();

  const { data: existing, error: existingError } = await supabase
    .from('users')
    .select('id, business_id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existingError) {
    const err = new Error(existingError.message || 'Failed to check existing staff.');
    err.status = 400;
    throw err;
  }

  if (existing?.business_id === businessId) {
    const err = new Error('This email is already linked to your business.');
    err.status = 409;
    throw err;
  }

  if (existing) {
    const err = new Error('This email is already used by another BizManager account.');
    err.status = 409;
    throw err;
  }

  const [{ data: business }, temporaryPassword] = await Promise.all([
    supabase.from('businesses').select('name').eq('id', businessId).single(),
    Promise.resolve(makeTemporaryPassword()),
  ]);

  const userId = uuidv4();
  const passwordHash = await bcrypt.hash(temporaryPassword, HASH_ROUNDS);

  const { error: insertError } = await supabase.from('users').insert({
    id: userId,
    business_id: businessId,
    email: normalizedEmail,
    role,
    is_active: true,
    password_hash: passwordHash,
    must_change_password: true,
  });

  if (insertError) {
    const err = new Error(insertError.message || 'Failed to create staff account.');
    err.status = 400;
    throw err;
  }

  const emailDelivery = await sendInviteEmail({
    email: normalizedEmail,
    role,
    temporaryPassword,
    businessName: business?.name,
  });

  if (!emailDelivery.sent) {
    await supabase.from('users').delete().eq('id', userId);
    const err = new Error('Staff invite email could not be sent. Check Resend configuration and try again.');
    err.status = 503;
    throw err;
  }

  return {
    success: true,
    message: `Invite sent to ${normalizedEmail}. They must change the temporary password after first sign-in.`,
    staff: {
      id: userId,
      email: normalizedEmail,
      role,
      is_active: true,
      must_change_password: true,
    },
    email_delivery: emailDelivery,
  };
}

module.exports = { createStaffInvite, INVITE_EMAIL_NOT_CONFIGURED };
