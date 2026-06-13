'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { redirectToExternal } from '@/lib/navigation';

type BillingState = 'trial' | 'active' | 'expired' | 'free' | 'unknown';

interface BillingStatus {
  tier: string;
  status?: BillingState;
  days_remaining: number | null;
  trial_ends_at?: string | null;
  subscription_expires_at?: string | null;
  is_expired?: boolean;
  can_manage_billing?: boolean;
}

interface CurrentUser {
  role: string;
  businessName: string;
}

const PLANS = {
  basic: {
    name: 'Basic',
    price: 79,
    audience: 'For small shops starting proper records.',
    features: [
      'Products, sales, and stock tracking',
      'Customer credit tracking',
      'PDF invoices and receipts',
      'Monthly reports',
      'Up to 3 staff accounts',
      '50 SMS notifications / month',
    ],
  },
  pro: {
    name: 'Pro',
    price: 149,
    audience: 'For growing businesses that need automation.',
    features: [
      'Everything in Basic',
      'AI business advisor',
      'MoMo collection at the counter',
      'WhatsApp staff bot',
      'Daily AI insights',
      'Priority support',
    ],
  },
} as const;

type PlanKey = keyof typeof PLANS;

function safeNumber(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function formatMoney(value: unknown) {
  return `GH₵ ${safeNumber(value).toLocaleString('en-GH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(value: unknown) {
  if (!value || typeof value !== 'string') return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function daysFromIso(value: unknown) {
  if (!value || typeof value !== 'string') return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.ceil((time - Date.now()) / 86400000));
}

function deriveBillingState(billing: BillingStatus | null): BillingState {
  if (!billing) return 'unknown';
  if (billing.status) return billing.status;
  if (billing.is_expired) return 'expired';

  const tier = (billing.tier || 'free').toLowerCase();
  const paid = tier === 'basic' || tier === 'pro';
  const daysLeft = billing.days_remaining ?? daysFromIso(paid ? billing.subscription_expires_at : billing.trial_ends_at);

  if (paid) return daysLeft === 0 ? 'expired' : 'active';
  if (daysLeft == null) return tier === 'free' ? 'free' : 'unknown';
  return daysLeft === 0 ? 'expired' : 'trial';
}

function normalizeBilling(data: any): BillingStatus {
  const source = data?.business ?? data ?? {};
  const tier = String(source.tier ?? source.subscription_tier ?? 'free').toLowerCase();
  const paid = tier === 'basic' || tier === 'pro';
  const fallbackDays = daysFromIso(paid ? source.subscription_expires_at : source.trial_ends_at);

  return {
    tier,
    status: source.status,
    days_remaining: source.days_remaining ?? fallbackDays,
    trial_ends_at: source.trial_ends_at ?? null,
    subscription_expires_at: source.subscription_expires_at ?? null,
    is_expired: source.is_expired,
    can_manage_billing: source.can_manage_billing,
  };
}

function friendlyCheckoutError(err: any) {
  const status = err?.response?.status;
  const raw = String(err?.response?.data?.error || err?.response?.data?.message || err?.message || '').toLowerCase();

  if (status === 401) return 'Please sign in again before managing billing.';
  if (status === 403) return 'Only owners or managers can manage billing.';
  if (status === 503 || raw.includes('not configured')) return 'Billing is not configured yet. Contact support.';
  if (raw.includes('paystack')) return 'Payment could not start. Please try again or contact support.';
  if (raw.includes('network')) return 'Network error. Check your connection and try again.';
  return 'Payment could not start. Please try again.';
}

function planCta(plan: PlanKey, billing: BillingStatus | null, state: BillingState, canManage: boolean) {
  if (!canManage) return 'Owner/manager only';
  const tier = (billing?.tier || 'free').toLowerCase();
  const planName = PLANS[plan].name;
  if (state === 'active' && tier === plan) return `Renew ${planName}`;
  if (state === 'active') return plan === 'pro' && tier === 'basic' ? 'Upgrade to Pro' : `Switch to ${planName}`;
  if (state === 'expired') return `Renew ${planName}`;
  return `Start ${planName}`;
}

function statusCopy(state: BillingState, billing: BillingStatus | null) {
  const tier = (billing?.tier || 'free').toLowerCase();
  const daysLeft = billing?.days_remaining;
  const paidName = tier === 'pro' ? 'Pro' : 'Basic';
  const expiry = billing?.subscription_expires_at || billing?.trial_ends_at;

  if (state === 'trial') {
    return {
      label: 'Trial active',
      title: daysLeft != null ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'Trial active',
      body: daysLeft != null
        ? `You have ${daysLeft} day${daysLeft === 1 ? '' : 's'} left to test BizManager.`
        : 'You can test BizManager before choosing a paid plan.',
      cta: 'Upgrade before trial ends',
      tone: 'accent' as const,
      expiryLabel: 'Trial expiry',
      expiry,
    };
  }

  if (state === 'active') {
    return {
      label: 'Active subscription',
      title: `${paidName} plan is active`,
      body: `Your ${paidName} plan is active for live business operations.`,
      cta: 'Renew / Extend plan',
      tone: 'accent' as const,
      expiryLabel: 'Renewal date',
      expiry,
    };
  }

  if (state === 'expired') {
    return {
      label: tier === 'basic' || tier === 'pro' ? 'Subscription expired' : 'Trial expired',
      title: 'Renew to continue',
      body: 'Your trial or subscription has ended. Renew to keep using BizManager for live business operations.',
      cta: 'Choose a plan',
      tone: 'danger' as const,
      expiryLabel: 'Ended on',
      expiry,
    };
  }

  if (state === 'free') {
    return {
      label: 'Free account',
      title: 'Choose a plan when ready',
      body: 'Choose Basic or Pro when you are ready to use BizManager for live business operations.',
      cta: 'Choose a plan',
      tone: 'warn' as const,
      expiryLabel: 'Expiry date',
      expiry,
    };
  }

  return {
    label: 'Billing status unknown',
    title: 'Could not confirm billing status',
    body: 'You can still retry or contact support.',
    cta: 'Retry status',
    tone: 'warn' as const,
    expiryLabel: 'Expiry date',
    expiry,
  };
}

function StatusPill({ state }: { state: BillingState }) {
  if (state === 'active' || state === 'trial') return <span className="pill pill-green">{state === 'active' ? 'Active' : 'Trial'}</span>;
  if (state === 'expired') return <span className="pill pill-danger">Expired</span>;
  if (state === 'unknown') return <span className="pill pill-warn">Unknown</span>;
  return <span className="pill">Free</span>;
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function SubscriptionPage() {
  const router = useRouter();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser>({ role: '', businessName: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState<PlanKey | null>(null);
  const [selectError, setSelectError] = useState('');
  const [returnReference, setReturnReference] = useState('');
  const [returnMessage, setReturnMessage] = useState('');

  const state = deriveBillingState(billing);
  const copy = statusCopy(state, billing);
  const tier = (billing?.tier || 'free').toLowerCase();
  const roleAllowsBilling = currentUser.role === '' || currentUser.role === 'owner' || currentUser.role === 'manager';
  const canManage = roleAllowsBilling && billing?.can_manage_billing !== false;
  const daysLeft = billing?.days_remaining;
  const currentPlan = useMemo(() => (tier === 'basic' || tier === 'pro' ? PLANS[tier] : null), [tier]);

  async function load(opts?: { fromReturn?: boolean }) {
    setLoading(true);
    setError('');

    try {
      const [billingRes, meRes] = await Promise.allSettled([
        api.get('/billing/status'),
        api.get('/auth/me'),
      ]);

      if (meRes.status === 'fulfilled') {
        setCurrentUser({
          role: meRes.value.data?.user?.role || '',
          businessName: meRes.value.data?.business?.name || meRes.value.data?.business_name || '',
        });
      }

      if (billingRes.status === 'fulfilled') {
        const nextBilling = normalizeBilling(billingRes.value.data);
        setBilling(nextBilling);
        if (opts?.fromReturn) {
          const nextState = deriveBillingState(nextBilling);
          setReturnMessage(nextState === 'active'
            ? 'Subscription active. Your payment has been confirmed.'
            : 'Payment may still be processing. Refresh in a moment or contact support with your reference.');
        }
        return;
      }

      if (billingRes.status === 'rejected' && billingRes.reason?.response?.status === 403) {
        setError('Only owners or managers can manage billing.');
        setBilling(null);
        return;
      }

      if (meRes.status === 'fulfilled') {
        const fallbackBilling = normalizeBilling(meRes.value.data?.business ?? {});
        setBilling({ ...fallbackBilling, status: 'unknown' });
        setError('Could not confirm billing status. You can retry or contact support.');
        return;
      }

      setError('Could not load subscription details. Please check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const reference = params.get('reference') || params.get('trxref') || '';
    if (reference) {
      setReturnReference(reference);
      setReturnMessage('Payment submitted. We are checking your subscription status.');
    }
    load({ fromReturn: Boolean(reference) });
  }, []);

  async function handleSelect(plan: PlanKey) {
    if (!canManage) {
      setSelectError('Only owners or managers can manage billing.');
      return;
    }

    setSelecting(plan);
    setSelectError('');
    try {
      const res = await api.post('/billing/subscribe', { plan });
      const url = res.data?.checkout_url || res.data?.authorization_url || res.data?.url;
      if (url) redirectToExternal(url);
      else setSelectError('No checkout URL returned. Please try again.');
    } catch (err: any) {
      setSelectError(friendlyCheckoutError(err));
    } finally {
      setSelecting(null);
    }
  }

  return (
    <main className="page page-narrow">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={() => router.back()}
          aria-label="Back"
          style={{
            background: 'var(--bg-elevated)', border: 'none', cursor: 'pointer',
            width: 36, height: 36, borderRadius: 10, display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Subscription</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Trial, plan, billing, and payment help</p>
        </div>
      </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="skeleton" style={{ height: 190, borderRadius: 18 }} />
            <div className="skeleton" style={{ height: 82, borderRadius: 16 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              <div className="skeleton" style={{ height: 340, borderRadius: 18 }} />
              <div className="skeleton" style={{ height: 340, borderRadius: 18 }} />
            </div>
          </div>
        )}

        {!loading && (
          <>
            {returnReference && (
              <div className="card" style={{
                marginBottom: 14,
                padding: 14,
                borderColor: state === 'active' ? 'var(--accent-glow)' : 'rgba(245,158,11,0.24)',
                background: state === 'active' ? 'var(--accent-dim)' : 'var(--warn-dim)',
              }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: state === 'active' ? 'var(--accent)' : 'var(--warn)' }}>
                  {returnMessage}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                  Reference: {returnReference}
                </p>
              </div>
            )}

            {error && (
              <div className="card" style={{
                marginBottom: 14,
                padding: 14,
                background: error.includes('Only owners') ? 'var(--warn-dim)' : 'var(--danger-dim)',
                borderColor: error.includes('Only owners') ? 'rgba(245,158,11,0.24)' : 'rgba(239,68,68,0.24)',
              }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: error.includes('Only owners') ? 'var(--warn)' : 'var(--danger)' }}>
                  {error}
                </p>
                <button type="button" className="btn btn-secondary" onClick={() => load()} style={{ width: '100%', marginTop: 12 }}>
                  Retry billing status
                </button>
              </div>
            )}

            <section className="card" style={{
              padding: 20,
              marginBottom: 16,
              background: copy.tone === 'danger'
                ? 'var(--danger-dim)'
                : copy.tone === 'warn'
                  ? 'var(--warn-dim)'
                  : 'linear-gradient(145deg, var(--bg-card), var(--bg-surface))',
              borderColor: copy.tone === 'danger'
                ? 'rgba(239,68,68,0.28)'
                : copy.tone === 'warn'
                  ? 'rgba(245,158,11,0.28)'
                  : 'var(--accent-glow)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <p style={{
                    margin: 0,
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: copy.tone === 'danger' ? 'var(--danger)' : copy.tone === 'warn' ? 'var(--warn)' : 'var(--accent)',
                  }}>
                    {copy.label}
                  </p>
                  <h2 style={{ margin: '6px 0', fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px' }}>
                    {copy.title}
                  </h2>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {copy.body}
                  </p>
                </div>
                <StatusPill state={state} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 18 }}>
                <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Current tier</p>
                  <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 800, textTransform: 'capitalize' }}>{tier || 'free'}</p>
                </div>
                <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>{copy.expiryLabel}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 800 }}>{formatDate(copy.expiry)}</p>
                </div>
                <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Days remaining</p>
                  <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 800 }}>
                    {daysLeft != null ? `${daysLeft} day${daysLeft === 1 ? '' : 's'}` : '—'}
                  </p>
                </div>
              </div>

              <button type="button" className="btn btn-primary" onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })} style={{ width: '100%', marginTop: 16 }}>
                {copy.cta}
              </button>
            </section>

            {!canManage && (
              <section className="card" style={{ padding: 14, marginBottom: 16, background: 'var(--warn-dim)', borderColor: 'rgba(245,158,11,0.24)' }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--warn)' }}>
                  Billing management is owner/manager only.
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Ask an owner or manager to renew, upgrade, or change the business plan.
                </p>
              </section>
            )}

            {selectError && (
              <div className="card" style={{
                background: 'var(--danger-dim)',
                borderColor: 'rgba(239,68,68,0.25)',
                padding: 14,
                marginBottom: 16,
                color: 'var(--danger-text)',
                fontSize: 14,
                fontWeight: 700,
              }}>
                {selectError}
              </div>
            )}

            <p className="section-label" id="plans" style={{ marginTop: 8 }}>
              Choose a plan
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))', gap: 14 }}>
              {(['basic', 'pro'] as PlanKey[]).map((key) => {
                const plan = PLANS[key];
                const isCurrent = tier === key;
                const isPro = key === 'pro';
                const disabled = selecting !== null || !canManage;
                return (
                  <div key={key} className="card" style={{
                    padding: '22px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    borderColor: isCurrent || isPro ? 'var(--accent-glow)' : 'var(--border)',
                    boxShadow: isPro && !isCurrent ? 'var(--shadow-md)' : undefined,
                  }}>
                    {isPro && !isCurrent && (
                      <span style={{
                        position: 'absolute',
                        top: -12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'var(--grad-accent)',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '4px 14px',
                        borderRadius: 999,
                        whiteSpace: 'nowrap',
                      }}>
                        Popular
                      </span>
                    )}

                    <div style={{ marginBottom: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{plan.name}</h3>
                        {isCurrent && <span className="pill pill-green">Current plan</span>}
                      </div>
                      <p style={{ margin: '8px 0 0', fontSize: 30, fontWeight: 800 }}>
                        {formatMoney(plan.price)}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 600 }}> / month</span>
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {plan.audience}
                      </p>
                    </div>

                    <div style={{ flex: 1, marginBottom: 18 }}>
                      {plan.features.map((feature) => (
                        <div key={feature} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                          <CheckIcon />
                          <span style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{feature}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className={isPro || isCurrent ? 'btn btn-primary' : 'btn btn-secondary'}
                      disabled={disabled}
                      onClick={() => handleSelect(key)}
                      style={{ width: '100%' }}
                    >
                      {selecting === key ? 'Opening checkout…' : planCta(key, billing, state, canManage)}
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="section-label">What happens after expiry</p>
            <section className="card" style={{ padding: 16 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Keep billing active for live operations.</p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                If your trial or subscription expires, BizManager will show clear renewal warnings. This sprint does not hard-lock every route, but owners should renew before relying on the app for live business operations.
              </p>
            </section>

            <p className="section-label">Need help with payment?</p>
            <section className="card" style={{ padding: 16 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Contact support with your business name and payment reference.</p>
              <p style={{ margin: '6px 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Payments are processed securely by Paystack. If checkout fails or a payment is still processing, include your business name{currentUser.businessName ? ` (${currentUser.businessName})` : ''} and reference{returnReference ? ` ${returnReference}` : ''}.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                <a href="mailto:support@example.com" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                  Email support
                </a>
                <div className="btn btn-ghost" style={{ cursor: 'default' }}>
                  WhatsApp not configured
                </div>
              </div>
            </section>
          </>
        )}
    </main>
  );
}
