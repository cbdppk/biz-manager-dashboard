'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import api, { customersAPI, productsAPI, reportsAPI, salesAPI } from '@/lib/api';
import LowStockBanner from '@/components/features/LowStockBanner';
import InsightsCard from '@/components/features/InsightsCard';
import PullToRefreshIndicator from '@/components/ui/PullToRefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useToast } from '@/hooks/useToast';
import { useTheme } from '@/components/providers/ThemeProvider';
import { unreadCount } from '@/lib/notifications';
import { resolveBusinessMode, storeOperatingMode, type OperatingMode } from '@/lib/businessMode';
import {
  buildOnboardingSteps,
  dismissOnboarding,
  isOnboardingDismissed,
  onboardingProgress,
} from '@/lib/onboarding';

interface BusinessSummary {
  revenue: number;
  transactions: number;
  avg_order: number;
  cash_collected: number;
  credit_outstanding: number;
  cost_of_goods_sold: number;
  gross_profit: number;
  gross_margin: number;
  expenses: number;
  net_profit: number;
  net_margin: number;
  stock_value: number;
  recent: { id: string; customer_name: string | null; created_at: string; total: number }[];
  low_stock: LowStockProduct[];
}

interface LowStockProduct {
  id: string; name: string; stock_qty: number;
}

interface BillingStatus {
  tier: string;
  status?: 'trial' | 'active' | 'expired' | 'free' | 'unknown';
  trial_ends_at: string | null;
  subscription_expires_at: string | null;
  days_remaining: number | null;
  is_expired?: boolean;
}

interface OnboardingBannerState {
  requiredDone: number;
  requiredTotal: number;
}

/* ── Module-level cache so navigating away and back doesn't refetch ──
   Lives for the JS module's lifetime (browser session). Considered fresh
   for FRESH_MS — within that window we skip the network entirely. After
   that we still hydrate from cache instantly and revalidate in background. */
const FRESH_MS = 30_000;
const dashboardCache: {
  summary: BusinessSummary | null;
  lowStock: LowStockProduct[];
  billing: BillingStatus | null;
  operatingMode: OperatingMode | null;
  role: string | null;
  fetchedAt: number;
} = { summary: null, lowStock: [], billing: null, operatingMode: null, role: null, fetchedAt: 0 };

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmt(n: number) {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function deriveBillingBanner(billing: BillingStatus | null) {
  if (!billing || billing.days_remaining == null) return null;
  const tier = (billing.tier || 'free').toLowerCase();
  const paid = tier === 'basic' || tier === 'pro';
  const status = billing.status || (billing.is_expired || billing.days_remaining === 0 ? 'expired' : paid ? 'active' : 'trial');
  const expired = status === 'expired' || billing.is_expired || billing.days_remaining === 0;

  if (!expired && billing.days_remaining > 7) return null;

  if (expired) {
    return {
      tone: 'danger' as const,
      title: 'Trial or subscription ended',
      body: 'Renew to keep using BizManager for live business operations.',
    };
  }

  if (status === 'trial' || !paid) {
    return {
      tone: 'warn' as const,
      title: `Trial ends in ${billing.days_remaining} day${billing.days_remaining === 1 ? '' : 's'}`,
      body: 'Upgrade before trial ends to avoid disruption.',
    };
  }

  return {
    tone: 'warn' as const,
    title: `${tier === 'pro' ? 'Pro' : 'Basic'} renews in ${billing.days_remaining} day${billing.days_remaining === 1 ? '' : 's'}`,
    body: 'Renew or extend your plan before expiry.',
  };
}

function asSetupArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.products)) return value.products;
  if (Array.isArray(value?.customers)) return value.customers;
  if (Array.isArray(value?.sales)) return value.sales;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

const PAYMENT_METHOD_COLORS: Record<string, string> = {
  cash: '#10b981',
  momo: '#f59e0b',
  card: '#3b82f6',
  credit: '#a78bfa',
};

const baseQuickActions = [
  {
    label: 'New Sale',
    href: '/pos',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.12)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
    ),
  },
  {
    label: 'Add Product',
    href: '/products/new',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.12)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
    ),
  },
  {
    label: 'Invoices',
    href: '/invoices',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    label: 'Customers',
    href: '/customers',
    color: '#ec4899',
    bg: 'rgba(236,72,153,0.12)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    label: 'Expenses',
    href: '/expenses',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
  },
  {
    label: 'Reports',
    href: '/reports',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.12)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
];

/* ── Quick action skeleton ───────────────────────────────────── */
function QuickActionSkeletonGrid() {
  return (
    <div className="quick-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton-tile" aria-hidden="true" />
      ))}
    </div>
  );
}

/* ── Theme toggle button ──────────────────────────────────────── */
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

export default function DashboardPage() {
  const { showToast } = useToast();
  const [bizName, setBizName]   = useState('');
  const [summary, setSummary]   = useState<BusinessSummary | null>(dashboardCache.summary);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>(dashboardCache.lowStock);
  const [billing, setBilling]   = useState<BillingStatus | null>(dashboardCache.billing);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading]   = useState(dashboardCache.summary == null);
  const [isFoodMode, setIsFoodMode] = useState(() => dashboardCache.operatingMode === 'food');
  const [role, setRole] = useState<string | null>(dashboardCache.role);
  const [identityReady, setIdentityReady] = useState(false);
  const [onboardingBanner, setOnboardingBanner] = useState<OnboardingBannerState | null>(null);
  const inflightRef = useRef(false);

  async function loadDashboard(opts?: { silent?: boolean; force?: boolean }) {
    if (inflightRef.current) return;

    inflightRef.current = true;
    const showSpinner = dashboardCache.summary == null;
    if (showSpinner) setLoading(true);

    const stored = typeof window !== 'undefined' ? localStorage.getItem('bm_biz_name') : null;
    if (stored) setBizName(stored);

    let currentRole = role ?? dashboardCache.role ?? '';

    try {
      const me = await api.get('/auth/me');
      const name = me.data?.business_name || me.data?.name || '';
      const nextRole = me.data?.user?.role ?? '';
      currentRole = nextRole;
      setRole(nextRole);
      dashboardCache.role = nextRole;
      const mode = resolveBusinessMode(me.data?.business);
      setIsFoodMode(mode.isFoodMode);
      dashboardCache.operatingMode = mode.operatingMode;
      storeOperatingMode(mode.operatingMode);
      setBizName(name);
      if (name) localStorage.setItem('bm_biz_name', name);
    } catch {
      currentRole = '';
      setRole('');
      dashboardCache.role = '';
      if (!opts?.silent && !stored) showToast('Could not load business details.', 'error');
    } finally {
      setIdentityReady(true);
    }

    const cacheAge = Date.now() - dashboardCache.fetchedAt;
    const cacheFresh = dashboardCache.summary != null && cacheAge < FRESH_MS;

    if (cacheFresh && !opts?.force) {
      inflightRef.current = false;
      setLoading(false);
      return;
    }

    try {
      const canSeeProfit = currentRole === 'owner' || currentRole === 'manager';
      const canSeeBilling = canSeeProfit;
      const [summaryRes, billingRes] = await Promise.allSettled([
        canSeeProfit
          ? reportsAPI.businessSummary({ period: 'today' })
          : salesAPI.summary('today'),
        canSeeBilling ? api.get('/billing/status') : Promise.resolve({ data: null }),
      ]);

      if (summaryRes.status === 'fulfilled') {
        const data = summaryRes.value.data;
        const normalized = canSeeProfit ? data : {
          revenue: data.revenue,
          transactions: data.transactions,
          avg_order: data.avg_order,
          cash_collected: data.total_collected ?? data.cash_collected ?? 0,
          credit_outstanding: 0,
          cost_of_goods_sold: data.cost_of_goods_sold ?? 0,
          gross_profit: data.gross_profit ?? 0,
          gross_margin: data.gross_margin ?? 0,
          expenses: 0,
          net_profit: data.gross_profit ?? data.revenue ?? 0,
          net_margin: 0,
          stock_value: 0,
          recent: data.recent ?? [],
          low_stock: data.low_stock ?? [],
        };
        setSummary(normalized);
        setLowStock(normalized.low_stock ?? []);
        dashboardCache.summary = normalized;
        dashboardCache.lowStock = normalized.low_stock ?? [];
      } else if (!opts?.silent) {
        showToast('Could not refresh sales data.', 'error');
      }

      if (billingRes.status === 'fulfilled') {
        setBilling(billingRes.value.data);
        dashboardCache.billing = billingRes.value.data;
      } else {
        setBilling(null);
        dashboardCache.billing = null;
        if (!opts?.silent) showToast('Could not refresh billing status.', 'error');
      }
      dashboardCache.fetchedAt = Date.now();
    } finally {
      setLoading(false);
      inflightRef.current = false;
    }
  }

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('bm_biz_name') : null;
    if (stored) setBizName(stored);
    loadDashboard();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadOnboardingBanner() {
      if (isOnboardingDismissed()) {
        setOnboardingBanner(null);
        return;
      }

      try {
        const [meRes, productsRes, customersRes, salesRes] = await Promise.all([
          api.get('/auth/me'),
          productsAPI.list({ limit: 1 }),
          customersAPI.list({ limit: 1 }),
          salesAPI.list({ limit: 1 }),
        ]);
        if (cancelled) return;

        const business = meRes.data?.business ?? {};
        const mode = resolveBusinessMode(business);
        const products = asSetupArray(productsRes.data);
        const customers = asSetupArray(customersRes.data);
        const sales = asSetupArray(salesRes.data);
        const businessName = business?.name || meRes.data?.business_name || meRes.data?.name || '';
        const hasProfile = Boolean(businessName.trim() && business?.phone?.trim());
        const steps = buildOnboardingSteps({
          businessName,
          sector: business?.sector,
          operatingMode: mode.operatingMode,
          hasProfile,
          productCount: products.length,
          customerCount: customers.length,
          staffCount: Number(meRes.data?.staff_count || 1),
          saleCount: sales.length,
          dismissed: false,
        });
        const progress = onboardingProgress(steps);
        setOnboardingBanner(progress.complete ? null : {
          requiredDone: progress.requiredDone,
          requiredTotal: progress.requiredTotal,
        });
      } catch {
        if (!cancelled) setOnboardingBanner(null);
      }
    }

    loadOnboardingBanner();
    window.addEventListener('bizmanager-data-changed', loadOnboardingBanner);
    window.addEventListener('storage', loadOnboardingBanner);
    return () => {
      cancelled = true;
      window.removeEventListener('bizmanager-data-changed', loadOnboardingBanner);
      window.removeEventListener('storage', loadOnboardingBanner);
    };
  }, []);

  useEffect(() => {
    const refreshUnread = () => setUnreadNotifications(unreadCount());
    refreshUnread();
    window.addEventListener('bm:notification', refreshUnread);
    window.addEventListener('bm:notification:read', refreshUnread);
    return () => {
      window.removeEventListener('bm:notification', refreshUnread);
      window.removeEventListener('bm:notification:read', refreshUnread);
    };
  }, []);

  useEffect(() => {
    const onDataChanged = () => {
      loadDashboard({ silent: true, force: true });
    };
    window.addEventListener('bizmanager-data-changed', onDataChanged);
    return () => window.removeEventListener('bizmanager-data-changed', onDataChanged);
  }, []);

  const pullToRefresh = usePullToRefresh(async () => {
    await loadDashboard({ silent: true, force: true });
    showToast('Refreshed.', 'success');
  });

  const quickActions = isFoodMode
    ? [
        {
          label: 'Food POS',
          href: '/food-pos',
          color: '#10b981',
          bg: 'rgba(16,185,129,0.12)',
          icon: baseQuickActions[0].icon,
        },
        {
          label: 'Kitchen',
          href: '/orders',
          color: '#f59e0b',
          bg: 'rgba(245,158,11,0.12)',
          icon: baseQuickActions[2].icon,
        },
        {
          label: 'Close Day',
          href: '/daily-close',
          color: '#ec4899',
          bg: 'rgba(236,72,153,0.12)',
          icon: baseQuickActions[3].icon,
        },
        {
          label: 'Menu',
          href: '/menu',
          color: '#3b82f6',
          bg: 'rgba(59,130,246,0.12)',
          icon: baseQuickActions[1].icon,
        },
        {
          label: 'Groceries',
          href: '/products',
          color: '#14b8a6',
          bg: 'rgba(20,184,166,0.12)',
          icon: baseQuickActions[1].icon,
        },
        {
          label: 'Reports',
          href: '/reports',
          color: '#a78bfa',
          bg: 'rgba(167,139,250,0.12)',
          icon: baseQuickActions[3].icon,
        },
      ]
    : baseQuickActions;
  const canManage = identityReady && (role === 'owner' || role === 'manager');
  const visibleQuickActions = quickActions.filter((action) => {
    if (['/products/new', '/menu', '/reports', '/invoices', '/expenses'].includes(action.href)) return canManage;
    return true;
  });

  const gettingStartedActions = isFoodMode
    ? [
        { href: '/menu', label: 'Add your first meal', step: 1, color: 'var(--accent)' },
        { href: '/food-pos', label: 'Send your first order', step: 2, color: 'var(--info)' },
        { href: '/products/new', label: 'Add kitchen groceries', step: 3, color: 'var(--warn)' },
      ]
    : [
        { href: '/products/new', label: 'Add your first product', step: 1, color: 'var(--accent)' },
        { href: '/pos',          label: 'Record your first sale',  step: 2, color: 'var(--info)' },
        { href: '/settings/staff', label: 'Invite your team',     step: 3, color: 'var(--warn)' },
      ];
  const visibleGettingStartedActions = gettingStartedActions.filter((action) => {
    if (['/products/new', '/menu', '/settings/staff'].includes(action.href)) return canManage;
    return true;
  });

  const recent = summary?.recent?.slice(0, 5) ?? [];
  const billingBanner = deriveBillingBanner(billing);
  const showBillingBanner = Boolean(billingBanner);

  function handleDismissOnboardingBanner() {
    dismissOnboarding();
    setOnboardingBanner(null);
  }

  return (
    <main className="page page-wide">
      <PullToRefreshIndicator {...pullToRefresh} />

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 2, letterSpacing: '0.02em' }}>
            {greeting()}
          </p>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.4px', lineHeight: 1.15 }}>
            {bizName || 'Your Business'}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link
            href="/notifications"
            aria-label="Notifications"
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-primary)',
              position: 'relative',
              textDecoration: 'none',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {unreadNotifications > 0 && (
              <span style={{
                position: 'absolute',
                top: -4,
                right: -2,
                minWidth: 18,
                height: 18,
                borderRadius: 999,
                padding: '0 5px',
                background: 'var(--danger)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--bg-base)',
              }}>
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </Link>
          <ThemeToggle />
          <Link href="/settings" style={{ textDecoration: 'none' }}>
            <div className="avatar">
              {bizName ? initials(bizName) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              )}
            </div>
          </Link>
        </div>
      </div>

      {/* ── Low stock banner ─────────────────────────────── */}
      <LowStockBanner count={lowStock.length} />

      {/* ── Billing banner ───────────────────────────────── */}
      {showBillingBanner && (
        <Link href="/settings/subscription" style={{ textDecoration: 'none', display: 'block', marginTop: 10 }}>
          <div style={{
            background: billingBanner?.tone === 'danger' ? 'var(--danger-dim)' : 'var(--warn-dim)',
            border: `1px solid ${billingBanner?.tone === 'danger' ? 'rgba(239,68,68,0.24)' : 'rgba(245,158,11,0.24)'}`,
            borderRadius: 'var(--card-radius)',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{
              width: 36, height: 36,
              borderRadius: 10,
              background: billingBanner?.tone === 'danger' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: billingBanner?.tone === 'danger' ? 'var(--danger)' : 'var(--warn)',
              flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: billingBanner?.tone === 'danger' ? 'var(--danger)' : 'var(--warn)', marginBottom: 2 }}>
                {billingBanner?.title}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {billingBanner?.body}
              </p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </Link>
      )}

      {/* ── Setup banner ───────────────────────────────── */}
      {onboardingBanner && (
        <div className="card" style={{
          marginTop: showBillingBanner ? 10 : 4,
          padding: '12px 14px',
          borderColor: 'rgba(167,139,250,0.24)',
          background: 'var(--purple-dim)',
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              background: 'rgba(167,139,250,0.14)',
              border: '1px solid rgba(167,139,250,0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--purple)',
              flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--purple)' }}>Finish setup</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                {onboardingBanner.requiredDone} of {onboardingBanner.requiredTotal} required steps complete
              </p>
            </div>
          </div>
          <div className="action-row" style={{ marginTop: 12 }}>
            <Link href="/onboarding" className="btn btn-primary" style={{ textDecoration: 'none', flex: '1 1 140px' }}>
              Continue setup
            </Link>
            <button type="button" className="btn btn-ghost" onClick={handleDismissOnboardingBanner}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <div>
      {/* ── Revenue card ─────────────────────────────────── */}
      <div
        style={{
          marginTop: showBillingBanner || onboardingBanner ? 12 : 4,
          background: 'var(--grad-revenue)',
          border: '1px solid rgba(16,185,129,0.18)',
          borderRadius: 20,
          padding: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow orb */}
        <div style={{
          position: 'absolute', top: '-40%', right: '-5%',
          width: 180, height: 180,
          background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: !identityReady ? 'var(--text-muted)' : canManage && summary?.net_profit != null && summary.net_profit < 0 ? 'var(--danger)' : 'var(--accent)', marginBottom: 6 }}>
            {!identityReady
              ? <span className="skeleton skeleton-line" style={{ display: 'inline-block', width: 120 }} />
              : canManage ? 'Net Profit Today' : "Today's Revenue"}
          </p>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.07)',
            padding: '3px 8px', borderRadius: 6,
          }}>
            Live
          </span>
        </div>

        <p style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-1.5px', color: '#fff', lineHeight: 1 }}>
          {loading || !identityReady
            ? <span className="skeleton" style={{ display: 'inline-block', width: 160, height: 34, borderRadius: 8 }} />
            : `GH₵\u00a0${fmt(canManage ? (summary?.net_profit ?? 0) : (summary?.revenue ?? 0))}`
          }
        </p>
        {!loading && identityReady && canManage && (summary?.expenses ?? 0) === 0 && (summary?.revenue ?? 0) > 0 && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 8 }}>
            Start recording expenses to see true net profit.
          </p>
        )}
        {!loading && identityReady && canManage && (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>
            Revenue − cost of goods − expenses
          </p>
        )}

        <div className="metric-grid" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {!identityReady ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <span className="skeleton skeleton-line" style={{ display: 'block', width: 64, marginBottom: 6 }} />
                <span className="skeleton skeleton-line" style={{ display: 'block', width: 88, height: 18 }} />
              </div>
            ))
          ) : canManage ? (
            <>
              <div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Sales</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                  {loading ? '—' : `GH₵\u00a0${fmt(summary?.revenue ?? 0)}`}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Gross Profit</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                  {loading ? '—' : `GH₵\u00a0${fmt(summary?.gross_profit ?? 0)}`}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Expenses</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                  {loading ? '—' : `GH₵\u00a0${fmt(summary?.expenses ?? 0)}`}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Customers Owing</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                  {loading ? '—' : `GH₵\u00a0${fmt(summary?.credit_outstanding ?? 0)}`}
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Sales</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                  {loading ? '—' : (summary?.transactions ?? 0)}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Avg. Order</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                  {loading ? '—' : `GH₵\u00a0${fmt(summary?.avg_order ?? 0)}`}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

        </div>
        <aside>
      {/* ── Quick actions ─────────────────────────────────── */}
      <div className="section-label">Quick Actions</div>
      {!identityReady ? (
        <QuickActionSkeletonGrid />
      ) : (
        <div className="quick-grid">
          {visibleQuickActions.map((a) => (
            <Link key={a.href} href={a.href} style={{ textDecoration: 'none' }}>
              <div className="quick-tile">
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 13,
                  background: a.bg,
                  border: `1px solid ${a.color}22`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: a.color,
                }}>
                  {a.icon}
                </div>
                <span className="quick-tile-label">{a.label}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
        </aside>
      </div>

      {/* ── Getting started ───────────────────────────────── */}
      {!loading && identityReady && (summary?.transactions ?? 0) === 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
            Getting Started
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Link href="/onboarding" style={{ textDecoration: 'none', marginBottom: 8, display: 'block' }}>
              <div className="row-card" style={{ minHeight: 48, borderColor: 'var(--purple-dim)' }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: 'var(--purple)' }}>Open full setup checklist</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </Link>
            {visibleGettingStartedActions.map(({ href, label, step, color }) => (
              <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                <div className="row-card" style={{ minHeight: 52 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 8,
                    background: `${color}18`,
                    border: `1px solid ${color}25`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color, flexShrink: 0,
                  }}>
                    {step}
                  </div>
                  <span style={{ flex: 1, fontWeight: 500, fontSize: 13 }}>{label}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── AI Insights ───────────────────────────────────── */}
      <InsightsCard />

      {/* ── Recent Sales ──────────────────────────────────── */}
      <div className="section-label">
        <span style={{ flex: 1 }}>Recent Sales</span>
        <Link href="/sales" style={{ color: 'var(--accent)', fontSize: 12, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
          See all
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--row-gap)' }}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="row-card" style={{ opacity: 0.4 }}>
                <div className="skeleton" style={{ width: 30, height: 30, borderRadius: 9 }} />
                <div className="skeleton" style={{ flex: 1, height: 13, maxWidth: 140 }} />
                <div className="skeleton" style={{ width: 72, height: 22, borderRadius: 7 }} />
              </div>
            ))
          : recent.length === 0
          ? (
            <div style={{
              textAlign: 'center', padding: '24px 16px',
              color: 'var(--text-muted)', fontSize: 13,
              background: 'var(--bg-card)',
              borderRadius: 'var(--card-radius)',
              border: '1px dashed var(--border-strong)',
            }}>
              No sales yet today.{' '}
              <Link href="/pos" style={{ color: 'var(--accent)', fontWeight: 600 }}>Record a sale →</Link>
            </div>
          )
          : recent.map((s) => {
            const name = s.customer_name || 'Walk-in';
            return (
              <div key={s.id} className="row-card">
                <div className="avatar-sm">
                  {name.charAt(0).toUpperCase()}
                </div>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }} className="truncate-1">
                  {name}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 6 }}>
                  {timeAgo(s.created_at)}
                </span>
                <span className="pill pill-green">GH₵ {fmt(Number(s.total))}</span>
              </div>
            );
          })
        }
      </div>

      {/* ── Low Stock Alert ───────────────────────────────── */}
      {(loading || lowStock.length > 0) && (
        <>
          <div className="section-label">
            <span style={{ flex: 1 }}>Low Stock</span>
            <Link href="/products?filter=low_stock" style={{ color: 'var(--accent)', fontSize: 12, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
              See all
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--row-gap)' }}>
            {loading
              ? Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="row-card" style={{ opacity: 0.4 }}>
                    <div className="skeleton" style={{ width: 30, height: 30, borderRadius: 9 }} />
                    <div className="skeleton" style={{ flex: 1, height: 13, maxWidth: 120 }} />
                    <div className="skeleton" style={{ width: 54, height: 22, borderRadius: 7 }} />
                  </div>
                ))
              : lowStock.map((p) => (
                <Link key={p.id} href={`/products/${p.id}`} style={{ textDecoration: 'none' }}>
                  <div className="row-card">
                    <div style={{
                      width: 30, height: 30, borderRadius: 9,
                      background: 'var(--warn-dim)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--warn)', flexShrink: 0,
                    }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                    </div>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }} className="truncate-1">{p.name}</span>
                    <span className="pill pill-warn">{p.stock_qty} left</span>
                  </div>
                </Link>
              ))
            }
          </div>
        </>
      )}
    </main>
  );
}
