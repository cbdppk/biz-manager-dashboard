'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { salesAPI, aiAPI } from '@/lib/api';
import EmptyState from '@/components/ui/EmptyState';
import PullToRefreshIndicator from '@/components/ui/PullToRefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useToast } from '@/hooks/useToast';
import { downloadCsv } from '@/lib/export';
import { formatDateGh, formatMoneyGhs, formatTimeGh } from '@/lib/display';
import { parseInsightBullets } from '@/lib/formatAiText';

interface Sale {
  id: string;
  customer_name: string | null;
  payment_method: 'cash' | 'momo' | 'card' | 'credit';
  payment_status: 'paid' | 'partial' | 'credit';
  total: number;
  created_at: string;
}

type Period = 'today' | 'week' | 'month' | 'custom';

const PAYMENT_ICONS: Record<string, string> = {
  cash: '💵', momo: '📱', card: '💳', credit: '⏳',
};

const PAYMENT_COLORS: Record<string, string> = {
  cash: '#10b981', momo: '#f59e0b', card: '#3b82f6', credit: '#a78bfa',
};

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#a78bfa'];

function formatTime(iso: string) {
  return formatTimeGh(iso);
}

function formatDate(iso: string) {
  return formatDateGh(iso, { day: '2-digit', month: 'short', year: 'numeric' });
}

function compactDayLabel(iso: string) {
  return formatDateGh(iso, { day: '2-digit', month: 'short' });
}

function formatSaleTotal(value: number | null | undefined) {
  return formatMoneyGhs(value);
}

function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end   = new Date(); end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

export default function SalesPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [sales, setSales]         = useState<Sale[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [total, setTotal]         = useState(0);
  const [showFilter, setShowFilter] = useState(false);
  const [period, setPeriod]       = useState<Period>('today');
  const [dateFrom, setDateFrom]   = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); });
  const [dateTo, setDateTo]       = useState(() => new Date().toISOString().slice(0,10));
  const [applied, setApplied]     = useState({ from: '', to: '' });

  const [aiExpanded, setAiExpanded]   = useState(false);
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiBullets, setAiBullets]     = useState<string[]>([]);
  const [aiSummaryLine, setAiSummaryLine] = useState('');

  const fetchSales = useCallback(async (from?: string, to?: string, opts?: { silent?: boolean }) => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = { limit: 50 };
      if (from) params.date_from = from;
      if (to)   params.date_to   = to;
      const res = await salesAPI.list(params);
      const data: Sale[] = res.data?.sales ?? res.data ?? [];
      setSales(data);
      setTotal(data.reduce((acc, s) => acc + Number(s.total), 0));
    } catch {
      setSales([]); setTotal(0);
      setError('Could not load sales right now.');
      if (!opts?.silent) showToast('Could not load sales.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const pullToRefresh = usePullToRefresh(async () => {
    await fetchSales(
      applied.from ? new Date(applied.from).toISOString() : todayRange().from,
      applied.to   ? new Date(applied.to + 'T23:59:59').toISOString() : todayRange().to,
      { silent: true },
    );
    showToast('Sales refreshed.', 'success');
  });

  useEffect(() => {
    const { from, to } = todayRange();
    fetchSales(from, to);
  }, [fetchSales]);

  useEffect(() => {
    if (period !== 'week' && period !== 'month') {
      setAiBullets([]); setAiSummaryLine(''); setAiExpanded(false);
      return;
    }
    let cancelled = false;
    setAiLoading(true); setAiBullets([]); setAiSummaryLine(''); setAiExpanded(false);
    aiAPI.insights({ context: 'sales', period })
      .then(res => {
        if (cancelled) return;
        const reply: string = res.data?.reply || res.data?.message || '';
        const { title, bullets } = parseInsightBullets(reply, 4);
        setAiBullets(bullets);
        setAiSummaryLine(title || bullets[0] || 'AI Sales Summary');
      })
      .catch(() => {
        if (!cancelled) {
          setAiSummaryLine('Could not load AI insights.');
          showToast('Could not load AI sales insights.', 'error');
        }
      })
      .finally(() => { if (!cancelled) setAiLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  function selectPeriodPreset(p: 'today' | 'week' | 'month') {
    const now = new Date();
    let from: Date, to: Date;
    if (p === 'today') {
      from = new Date(now); from.setHours(0,0,0,0);
      to   = new Date(now); to.setHours(23,59,59,999);
    } else if (p === 'week') {
      from = new Date(now.getTime() - 7*86400000); from.setHours(0,0,0,0);
      to   = new Date(now); to.setHours(23,59,59,999);
    } else {
      from = new Date(now.getTime() - 30*86400000); from.setHours(0,0,0,0);
      to   = new Date(now); to.setHours(23,59,59,999);
    }
    setPeriod(p);
    setDateFrom(from.toISOString().slice(0,10));
    setDateTo(to.toISOString().slice(0,10));
    setApplied({ from: from.toISOString(), to: to.toISOString() });
    setShowFilter(false);
    fetchSales(from.toISOString(), to.toISOString());
  }

  function applyFilter() {
    setApplied({ from: dateFrom, to: dateTo });
    setPeriod('custom');
    setShowFilter(false);
    fetchSales(new Date(dateFrom).toISOString(), new Date(dateTo + 'T23:59:59').toISOString());
  }

  function clearFilter() {
    const { from, to } = todayRange();
    setDateFrom(from.slice(0,10)); setDateTo(to.slice(0,10));
    setApplied({ from: '', to: '' }); setPeriod('today');
    setShowFilter(false); fetchSales(from, to);
  }

  function exportSales() {
    if (sales.length === 0) { showToast('No sales to export for this filter.', 'info'); return; }
    downloadCsv('bizmanager-sales.csv', ['Date', 'Customer', 'Payment Method', 'Status', 'Total'], sales.map((s) => [
      formatDate(s.created_at), s.customer_name || 'Walk-in', s.payment_method, s.payment_status, Number(s.total).toFixed(2),
    ]));
    showToast('Sales CSV downloaded.', 'success');
  }

  const PERIOD_LABELS: Record<Period, string> = {
    today: 'Today', week: 'This Week', month: 'This Month',
    custom: applied.from && applied.to ? `${formatDate(applied.from)} – ${formatDate(applied.to)}` : 'Custom',
  };

  const showAiCard = period === 'week' || period === 'month';

  const chartData = Object.values(
    sales.reduce<Record<string, { label: string; revenue: number }>>((acc, s) => {
      const key = s.created_at.slice(0, 10);
      if (!acc[key]) acc[key] = { label: compactDayLabel(s.created_at), revenue: 0 };
      acc[key].revenue += Number(s.total);
      return acc;
    }, {})
  ).slice(-7);

  const paymentBreakdown = Object.entries(
    sales.reduce<Record<string, number>>((acc, s) => {
      acc[s.payment_method] = (acc[s.payment_method] || 0) + Number(s.total);
      return acc;
    }, {})
  ).map(([name, value]) => ({ name: name.toUpperCase(), value }));

  return (
    <>
      <PullToRefreshIndicator {...pullToRefresh} />
      <main className="page page-content">

        {/* ── Header ────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px' }}>Sales</h1>
            {!loading && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {formatMoneyGhs(total)} · {sales.length} transaction{sales.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={exportSales}
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-secondary)', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
              aria-label="Export"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              onClick={() => setShowFilter(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: period !== 'today' ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                border: `1px solid ${period !== 'today' ? 'var(--accent-glow)' : 'var(--border)'}`,
                borderRadius: 10,
                padding: '8px 12px',
                color: period !== 'today' ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                fontFamily: 'inherit',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="8" y1="12" x2="16" y2="12" />
                <line x1="11" y1="18" x2="13" y2="18" />
              </svg>
              {PERIOD_LABELS[period]}
            </button>
          </div>
        </div>

        {/* ── AI Summary Card ───────────────────────────── */}
        {showAiCard && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            marginBottom: 16,
            marginTop: 12,
            overflow: 'hidden',
          }}>
            <button
              onClick={() => !aiLoading && setAiExpanded(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px',
                background: 'transparent', border: 'none',
                cursor: aiLoading ? 'default' : 'pointer',
                textAlign: 'left', fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: 15, flexShrink: 0, color: 'var(--purple)' }}>✦</span>
              <span style={{
                flex: 1, fontSize: 13, fontWeight: 500,
                color: aiLoading ? 'var(--text-muted)' : 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {aiLoading ? 'Analyzing your sales…' : aiSummaryLine || 'AI Sales Summary'}
              </span>
              {!aiLoading && (
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="var(--text-muted)" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0, transition: 'transform 0.2s', transform: aiExpanded ? 'rotate(180deg)' : 'none' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
            </button>

            {aiExpanded && aiBullets.length > 0 && (
              <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                <ul style={{ margin: '10px 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {aiBullets.map((b, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--accent)', fontSize: 14, flexShrink: 0, marginTop: 1 }}>•</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                        {b.replace(/^[-•*\d+\.\s]+/, '')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Charts ────────────────────────────────────── */}
        {!loading && sales.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, marginTop: showAiCard ? 0 : 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
                Revenue Trend
              </p>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} barSize={28}>
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip
                      cursor={{ fill: 'var(--bg-hover)', radius: 6 }}
                      contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 12 }}
                      labelStyle={{ color: 'var(--tooltip-text)', fontSize: 12, fontWeight: 600 }}
                      formatter={(value: number) => [`GH₵ ${value.toFixed(2)}`, 'Revenue']}
                    />
                    <Bar dataKey="revenue" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {paymentBreakdown.length > 1 && (
              <div className="card" style={{ padding: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
                  Payment Mix
                </p>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie dataKey="value" nameKey="name" data={paymentBreakdown} cx="50%" cy="50%" innerRadius={46} outerRadius={74} paddingAngle={3}>
                        {paymentBreakdown.map((entry, index) => (
                          <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 12 }}
                        labelStyle={{ color: 'var(--tooltip-text)', fontSize: 12, fontWeight: 600 }}
                        formatter={(value: number) => [`GH₵ ${value.toFixed(2)}`, 'Collected']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {paymentBreakdown.map((entry, index) => (
                    <span key={entry.name} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 8, padding: '3px 10px',
                      fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: PIE_COLORS[index % PIE_COLORS.length], flexShrink: 0 }} />
                      {entry.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Sales list ────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--row-gap)' }}>
          {error && !loading && (
            <div className="card" style={{ marginBottom: 6 }}>
              <p style={{ color: 'var(--danger)', marginBottom: 10, fontSize: 13 }}>{error}</p>
              <button className="btn btn-secondary" style={{ fontSize: 13, padding: '10px 16px' }}
                onClick={() => fetchSales(
                  applied.from ? new Date(applied.from).toISOString() : todayRange().from,
                  applied.to   ? new Date(applied.to + 'T23:59:59').toISOString() : todayRange().to,
                )}>
                Try Again
              </button>
            </div>
          )}

          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="row-card" style={{ opacity: 0.35 }}>
                  <div className="skeleton" style={{ width: 30, height: 30, borderRadius: 8 }} />
                  <div className="skeleton" style={{ flex: 1, height: 13, maxWidth: 160 }} />
                  <div className="skeleton" style={{ width: 70, height: 22, borderRadius: 7 }} />
                </div>
              ))
            : sales.length === 0
            ? (
              <EmptyState
                icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>}
                title="No sales for this period"
                description="Try a different date range or make a new sale from the POS."
                ctaLabel="Open POS"
                ctaHref="/pos"
              />
            )
            : sales.map((s) => (
              <div
                key={s.id}
                className="row-card"
                onClick={() => router.push(`/sales/${s.id}`)}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                  background: `${PAYMENT_COLORS[s.payment_method] || '#10b981'}18`,
                  border: `1px solid ${PAYMENT_COLORS[s.payment_method] || '#10b981'}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16,
                }}>
                  {PAYMENT_ICONS[s.payment_method] ?? '💵'}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }} className="truncate-1">
                    {s.customer_name || 'Walk-in'}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, marginTop: 1 }}>
                    {formatTime(s.created_at)} · {s.payment_method}
                  </p>
                </div>

                <span className={s.payment_status === 'paid' ? 'pill pill-green' : 'pill pill-warn'}>
                  {formatMoneyGhs(s.total)}
                </span>
              </div>
            ))
          }
        </div>

        {/* Load more */}
        {!loading && sales.length >= 50 && (
          <button
            onClick={() => fetchSales(
              applied.from ? new Date(applied.from).toISOString() : todayRange().from,
              applied.to   ? new Date(applied.to + 'T23:59:59').toISOString() : todayRange().to,
            )}
            style={{
              width: '100%', marginTop: 14,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '13px 0',
              color: 'var(--accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Load more
          </button>
        )}
      </main>

      {/* ── Filter sheet ──────────────────────────────── */}
      {showFilter && (
        <>
          <div
            onClick={() => setShowFilter(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, backdropFilter: 'blur(4px)' }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: '22px 22px 0 0',
            padding: '0 20px calc(32px + env(safe-area-inset-bottom))',
            zIndex: 201,
            animation: 'slideUp 280ms var(--ease-out)',
          }}>
            <div style={{ width: 40, height: 4, background: 'var(--border-strong)', borderRadius: 2, margin: '14px auto 20px' }} />

            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Filter by Date</h2>

            {/* Period quick-select */}
            <div className="action-row" style={{ marginBottom: 20 }}>
              {(['today', 'week', 'month'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => selectPeriodPreset(p)}
                  style={{
                    flex: '1 1 88px', padding: '10px 0',
                    background: period === p ? 'var(--accent)' : 'var(--bg-elevated)',
                    border: `1px solid ${period === p ? 'transparent' : 'var(--border)'}`,
                    borderRadius: 10,
                    color: period === p ? '#fff' : 'var(--text-secondary)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {p === 'today' ? 'Today' : p === 'week' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>From</span>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border-strong)', borderRadius: 10, padding: '11px 12px', color: 'var(--text-primary)', fontSize: 14, colorScheme: 'dark', outline: 'none', fontFamily: 'inherit' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>To</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  style={{ background: 'var(--bg-input)', border: '1.5px solid var(--border-strong)', borderRadius: 10, padding: '11px 12px', color: 'var(--text-primary)', fontSize: 14, colorScheme: 'dark', outline: 'none', fontFamily: 'inherit' }} />
              </label>
            </div>

            <div className="action-row" style={{ marginTop: 20 }}>
              <button
                onClick={clearFilter}
                style={{
                  flex: 1, padding: '13px 0',
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 12, color: 'var(--text-secondary)',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                Reset
              </button>
              <button
                onClick={applyFilter}
                style={{
                  flex: 2, padding: '13px 0',
                  background: 'var(--grad-accent)', border: 'none',
                  borderRadius: 12, color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: 'var(--shadow-accent)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                Apply Filter
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
