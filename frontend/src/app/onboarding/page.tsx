'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api, { customersAPI, productsAPI, salesAPI } from '@/lib/api';
import { resolveBusinessMode, storeOperatingMode, type OperatingMode } from '@/lib/businessMode';
import {
  buildOnboardingSteps,
  dismissOnboarding,
  isOnboardingDismissed,
  onboardingProgress,
  resetOnboardingDismissal,
  type OnboardingGroup,
  type OnboardingSnapshot,
  type OnboardingStep,
} from '@/lib/onboarding';

const GROUP_META: Record<OnboardingGroup, { title: string; subtitle: string }> = {
  required: {
    title: 'Required for first sale',
    subtitle: 'Finish these to reach a useful first transaction and report.',
  },
  recommended: {
    title: 'Recommended for better records',
    subtitle: 'Helpful for credit sales, staff handoff, and cleaner operations.',
  },
  optional: {
    title: 'Optional setup',
    subtitle: 'Useful later, but not required before your first sale.',
  },
};

const FALLBACK_SNAPSHOT: OnboardingSnapshot = {
  businessName: 'your business',
  operatingMode: 'retail',
  hasProfile: false,
  productCount: 0,
  customerCount: 0,
  staffCount: 1,
  saleCount: 0,
  dismissed: false,
};

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.products)) return value.products;
  if (Array.isArray(value?.customers)) return value.customers;
  if (Array.isArray(value?.sales)) return value.sales;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function modeLabel(mode: OperatingMode) {
  return mode === 'food' ? 'Restaurant / food mode' : 'Retail / shop mode';
}

function StepBadge({ step, isNext }: { step: OnboardingStep; isNext: boolean }) {
  const isOptional = step.group === 'optional';
  const label = step.done ? 'Done' : isNext ? 'Next' : isOptional ? 'Optional' : 'Pending';

  return (
    <div style={{
      width: 34,
      height: 34,
      borderRadius: 11,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 800,
      background: step.done
        ? 'var(--accent-dim)'
        : isNext
          ? 'var(--purple-dim)'
          : isOptional
            ? 'var(--bg-elevated)'
            : 'var(--warn-dim)',
      color: step.done
        ? 'var(--accent)'
        : isNext
          ? 'var(--purple)'
          : isOptional
            ? 'var(--text-secondary)'
            : 'var(--warn)',
      border: `1px solid ${step.done
        ? 'var(--accent-glow)'
        : isNext
          ? 'rgba(167,139,250,0.24)'
          : isOptional
            ? 'var(--border)'
            : 'rgba(245,158,11,0.22)'}`,
    }}>
      {step.done ? '✓' : isNext ? '1' : isOptional ? '•' : '·'}
      <span className="sr-only">{label}</span>
    </div>
  );
}

function ChecklistStepCard({ step, isNext }: { step: OnboardingStep; isNext: boolean }) {
  const status = step.done ? 'Done' : isNext ? 'Next' : step.group === 'optional' ? 'Optional' : 'Pending';
  const cta = step.done ? 'Review' : step.ctaLabel || (isNext ? 'Complete' : 'Open');

  return (
    <Link href={step.href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div className="card" style={{
        padding: 14,
        borderColor: step.done
          ? 'var(--accent-glow)'
          : isNext
            ? 'rgba(167,139,250,0.35)'
            : 'var(--border)',
        boxShadow: isNext ? '0 0 0 1px rgba(167,139,250,0.08), var(--shadow-md)' : undefined,
        opacity: step.done ? 0.9 : 1,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <StepBadge step={step} isNext={isNext} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{step.title}</p>
              <span className={`pill ${step.done ? 'pill-green' : isNext ? '' : step.group === 'required' ? 'pill-warn' : ''}`} style={{
                fontSize: 10,
                padding: '3px 7px',
                background: isNext ? 'var(--purple-dim)' : undefined,
                color: isNext ? 'var(--purple)' : undefined,
              }}>
                {status}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {step.description}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {GROUP_META[step.group].title}
              </span>
              <span style={{ color: isNext ? 'var(--purple)' : 'var(--accent)', fontSize: 12, fontWeight: 700 }}>
                {cta} →
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function LoadingOnboarding() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ padding: 18 }}>
        <div className="skeleton" style={{ width: '45%', height: 12, borderRadius: 99, marginBottom: 14 }} />
        <div className="skeleton" style={{ width: '80%', height: 28, borderRadius: 10, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: '65%', height: 12, borderRadius: 99 }} />
      </div>
      <div className="skeleton" style={{ height: 10, borderRadius: 99 }} />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skeleton" style={{ height: 84, borderRadius: 16 }} />
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<OnboardingSnapshot>(FALLBACK_SNAPSHOT);
  const [loadWarning, setLoadWarning] = useState(false);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setLoadWarning(false);

    try {
      const [meRes, productsRes, customersRes, salesRes] = await Promise.all([
        api.get('/auth/me'),
        productsAPI.list({ limit: 1 }),
        customersAPI.list({ limit: 1 }),
        salesAPI.list({ limit: 1 }),
      ]);

      const business = meRes.data?.business ?? {};
      const mode = resolveBusinessMode(business);
      storeOperatingMode(mode.operatingMode);

      const products = asArray(productsRes.data);
      const customers = asArray(customersRes.data);
      const sales = asArray(salesRes.data);
      const businessName = business?.name || meRes.data?.business_name || meRes.data?.name || 'your business';
      const hasProfile = Boolean(businessName?.trim() && business?.phone?.trim());

      setSnapshot({
        businessName,
        sector: business?.sector,
        operatingMode: mode.operatingMode,
        hasProfile,
        productCount: products.length,
        customerCount: customers.length,
        staffCount: Number(meRes.data?.staff_count || 1),
        saleCount: sales.length,
        dismissed: isOnboardingDismissed(),
      });
    } catch {
      setLoadWarning(true);
      setSnapshot({
        ...FALLBACK_SNAPSHOT,
        businessName: typeof window !== 'undefined'
          ? window.localStorage.getItem('bm_biz_name') || FALLBACK_SNAPSHOT.businessName
          : FALLBACK_SNAPSHOT.businessName,
        dismissed: isOnboardingDismissed(),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSetup();
  }, [loadSetup]);

  const steps = useMemo(() => buildOnboardingSteps(snapshot), [snapshot]);
  const progress = useMemo(() => onboardingProgress(steps), [steps]);
  const nextStep = steps.find((step) => step.group === 'required' && !step.done);
  const requiredPct = progress.requiredTotal
    ? Math.round((progress.requiredDone / progress.requiredTotal) * 100)
    : 0;
  const groupedSteps = {
    required: steps.filter((step) => step.group === 'required'),
    recommended: steps.filter((step) => step.group === 'recommended'),
    optional: steps.filter((step) => step.group === 'optional'),
  };

  function handleDismiss() {
    dismissOnboarding();
    router.push('/dashboard');
  }

  function handleReset() {
    resetOnboardingDismissal();
    setSnapshot((current) => ({ ...current, dismissed: false }));
  }

  return (
    <main className="page page-content" style={{ paddingBottom: 108 }}>
      {loading ? (
        <LoadingOnboarding />
      ) : (
        <>
          <section className="card" style={{
            padding: 18,
            marginBottom: 14,
            background: 'linear-gradient(145deg, var(--bg-card), var(--bg-surface))',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <p style={{ fontSize: 12, color: 'var(--purple)', fontWeight: 800, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Getting started
                </p>
                <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 8 }}>
                  Set up {snapshot.businessName || 'your business'}
                </h1>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  Follow a short path from business profile to first sale, first report, and phone install.
                </p>
              </div>
              <span className="pill" style={{
                background: snapshot.operatingMode === 'food' ? 'var(--warn-dim)' : 'var(--accent-dim)',
                color: snapshot.operatingMode === 'food' ? 'var(--warn)' : 'var(--accent)',
                border: '1px solid var(--border)',
              }}>
                {modeLabel(snapshot.operatingMode || 'retail')}
              </span>
            </div>

            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>
                  {progress.requiredDone}/{progress.requiredTotal} required steps complete
                </p>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{requiredPct}%</span>
              </div>
              <div style={{ height: 9, borderRadius: 99, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${requiredPct}%`,
                  background: 'var(--grad-accent)',
                  transition: 'width 240ms ease',
                }} />
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                Recommended complete: {progress.recommendedDone}/{progress.recommendedTotal}
              </p>
            </div>
          </section>

          {loadWarning && (
            <section className="card" style={{
              padding: 14,
              marginBottom: 14,
              background: 'var(--warn-dim)',
              borderColor: 'rgba(245,158,11,0.24)',
            }}>
              <p style={{ margin: 0, color: 'var(--warn)', fontWeight: 800, fontSize: 13 }}>
                We could not check your setup progress.
              </p>
              <p style={{ margin: '4px 0 12px', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.55 }}>
                You can still continue setup using the fallback checklist.
              </p>
              <button type="button" className="btn btn-secondary" onClick={loadSetup} style={{ width: '100%' }}>
                Retry progress check
              </button>
            </section>
          )}

          <section className="card" style={{
            padding: 16,
            marginBottom: 18,
            borderColor: nextStep ? 'rgba(167,139,250,0.32)' : 'var(--accent-glow)',
            background: nextStep ? 'var(--purple-dim)' : 'var(--accent-dim)',
          }}>
            <p style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: nextStep ? 'var(--purple)' : 'var(--accent)',
            }}>
              {nextStep ? 'Next step' : 'Setup ready'}
            </p>
            <h2 style={{ margin: '6px 0', fontSize: 18, fontWeight: 800 }}>
              {nextStep ? nextStep.title : 'Your setup is ready.'}
            </h2>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {nextStep
                ? nextStep.description
                : 'You have completed the required setup path. You can keep improving records or go back to the dashboard.'}
            </p>
            <Link href={nextStep?.href || '/dashboard'} className="btn btn-primary" style={{ width: '100%', textDecoration: 'none' }}>
              {nextStep?.ctaLabel || 'Go to dashboard'}
            </Link>
          </section>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {(Object.keys(groupedSteps) as OnboardingGroup[]).map((group) => (
              <section key={group}>
                <div style={{ marginBottom: 10 }}>
                  <p className="section-label" style={{ marginBottom: 2 }}>{GROUP_META[group].title}</p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {GROUP_META[group].subtitle}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {groupedSteps[group].map((step) => (
                    <ChecklistStepCard key={step.id} step={step} isNext={nextStep?.id === step.id} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <section id="install" className="card" style={{ padding: 16, marginTop: 18 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Install BizManager on your phone</p>
            <p style={{ margin: '6px 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              Installing gives you faster access at the counter, a full-screen app feel, and fewer taps during busy sales.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>Android Chrome</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Open menu, then tap Install app or Add to Home screen.
                </p>
              </div>
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>iPhone Safari</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Tap Share, then choose Add to Home Screen.
                </p>
              </div>
            </div>
          </section>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
            <button type="button" className="btn btn-primary" onClick={() => router.push('/dashboard')}>
              {progress.complete ? 'Go to dashboard' : 'Continue to app'}
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={handleDismiss}>
                Dismiss checklist
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleReset}>
                Show checklist again
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
