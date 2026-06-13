'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { reportsAPI } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { useToast } from '@/hooks/useToast';
import { getStoredOperatingMode } from '@/lib/businessMode';
import { downloadCsv } from '@/lib/export';

type ReportRange = 'today' | 'week' | 'month' | 'all';

interface BusinessSummary {
  period?: string;
  from?: string;
  to?: string;
  revenue?: number | string | null;
  cash_collected?: number | string | null;
  credit_outstanding?: number | string | null;
  cost_of_goods_sold?: number | string | null;
  gross_profit?: number | string | null;
  gross_margin?: number | string | null;
  expenses?: number | string | null;
  net_profit?: number | string | null;
  net_margin?: number | string | null;
  stock_value?: number | string | null;
  transactions?: number | string | null;
  top_products?: { name?: string | null; qty?: number | string | null; revenue?: number | string | null; profit?: number | string | null }[];
  low_stock?: { id?: string | null; name?: string | null; stock_qty?: number | string | null }[];
  recent_credit_customers?: { name?: string | null; phone?: string | null; amount?: number | string | null }[];
}

interface LoanReadiness {
  score?: number | string | null;
  grade?: string | null;
  estimated_safe_monthly_repayment?: number | string | null;
  average_monthly_revenue?: number | string | null;
  average_monthly_net_profit?: number | string | null;
  cash_collection_rate?: number | string | null;
  credit_outstanding?: number | string | null;
  expense_to_revenue_ratio?: number | string | null;
  record_completeness?: number | string | null;
  strengths?: string[];
  risks?: string[];
  disclaimer?: string | null;
}

interface FoodReport {
  total_orders?: number | string | null;
  completed_orders?: number | string | null;
  pending_orders?: number | string | null;
  cancelled_orders?: number | string | null;
  cancellation_rate?: number | string | null;
  revenue?: number | string | null;
  avg_order_value?: number | string | null;
  top_meals?: { name?: string | null; qty?: number | string | null; revenue?: number | string | null }[];
}

function safeNumber(value: unknown, fallback = 0) {
  const amount = Number(value ?? fallback);
  return Number.isFinite(amount) ? amount : fallback;
}

function formatMoney(value: unknown) {
  return `GH₵ ${safeNumber(value).toFixed(2)}`;
}

function formatPercent(value: unknown) {
  return `${safeNumber(value).toFixed(1)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function resolveRange(range: ReportRange) {
  const now = new Date();
  if (range === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { period: 'today', from: from.toISOString() };
  }
  if (range === 'week') {
    return { period: 'week', from: new Date(Date.now() - 7 * 86400000).toISOString() };
  }
  if (range === 'month') {
    return { period: 'month', from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
  }
  return { period: 'all' };
}

function formatPeriodLabel(range: ReportRange, summary?: BusinessSummary | null) {
  if (range === 'today') return 'Today';
  if (range === 'week') return 'Last 7 days';
  if (range === 'month') return 'This month';
  if (summary?.from && summary?.to) return `${formatDate(summary.from)} to ${formatDate(summary.to)}`;
  return 'All time';
}

function getReportFilename(type: 'csv' | 'pdf', range: ReportRange) {
  return `bizmanager-dashboard-business-report-${range}.${type}`;
}

function getHealthMessage(summary: BusinessSummary | null) {
  const revenue = safeNumber(summary?.revenue);
  const netProfit = safeNumber(summary?.net_profit);
  const expenses = safeNumber(summary?.expenses);
  const cashCollected = safeNumber(summary?.cash_collected);
  const creditOutstanding = safeNumber(summary?.credit_outstanding);

  if (revenue === 0) return { text: 'No sales recorded in this period yet.', tone: 'muted' as const };
  if (creditOutstanding > cashCollected) return { text: 'Credit outstanding is high compared to cash collected.', tone: 'warn' as const };
  if (expenses / revenue > 0.4) return { text: 'Expenses are taking a large share of sales.', tone: 'warn' as const };
  if (netProfit > 0) return { text: 'Healthy profit this period.', tone: 'green' as const };
  return { text: 'Profit is tight this period. Review costs and expenses.', tone: 'danger' as const };
}

function MetricCard({ label, value, tone = 'default', helper }: { label: string; value: string; tone?: 'default' | 'green' | 'warn' | 'danger'; helper?: string }) {
  const color = tone === 'green'
    ? 'var(--accent)'
    : tone === 'warn'
      ? 'var(--warn)'
      : tone === 'danger'
        ? 'var(--danger)'
        : 'var(--text-primary)';

  return (
    <div className="card" style={{ padding: 14, minWidth: 0 }}>
      <p className="section-label" style={{ margin: '0 0 6px', padding: 0 }}>{label}</p>
      <p style={{ margin: 0, color, fontWeight: 800, fontSize: value.length > 13 ? 16 : 20, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
        {value}
      </p>
      {helper && <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>{helper}</p>}
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <p className="section-label" style={{ marginTop: 0 }}>{title}</p>
      {subtitle && <p style={{ margin: '-4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>{subtitle}</p>}
    </div>
  );
}

function InlineError({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return (
    <div className="card" style={{ borderColor: 'rgba(239,68,68,0.24)' }}>
      <p style={{ margin: '0 0 6px', color: 'var(--danger)', fontWeight: 800 }}>{title}</p>
      <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>{body}</p>
      <button className="btn btn-secondary" onClick={onRetry}>Retry</button>
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="skeleton" style={{ height: 150, borderRadius: 'var(--card-radius)' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="skeleton" style={{ height: 82, borderRadius: 'var(--card-radius)' }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 170, borderRadius: 'var(--card-radius)' }} />
      <div className="skeleton" style={{ height: 170, borderRadius: 'var(--card-radius)' }} />
    </div>
  );
}

export default function ReportsPage() {
  const { showToast } = useToast();
  const [summary, setSummary] = useState<BusinessSummary | null>(null);
  const [loan, setLoan] = useState<LoanReadiness | null>(null);
  const [foodReport, setFoodReport] = useState<FoodReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<ReportRange>('month');
  const [foodMode] = useState(() => getStoredOperatingMode() === 'food');
  const [summaryError, setSummaryError] = useState('');
  const [loanError, setLoanError] = useState('');
  const [foodError, setFoodError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  async function load(nextRange: ReportRange = range) {
    setLoading(true);
    setSummaryError('');
    setLoanError('');
    setFoodError('');

    const params = resolveRange(nextRange);
    const [summaryResult, loanResult, foodResult] = await Promise.allSettled([
      reportsAPI.businessSummary(params),
      reportsAPI.loanReadiness(params),
      foodMode ? reportsAPI.food(params.from ? { from: params.from } : undefined) : Promise.resolve(null),
    ]);

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value.data ?? null);
    } else {
      setSummary(null);
      setSummaryError('Could not load reports.');
      showToast('Could not load reports.', 'error');
    }

    if (loanResult.status === 'fulfilled') {
      setLoan(loanResult.value.data ?? null);
    } else {
      setLoan(null);
      setLoanError('Loan readiness could not be loaded.');
    }

    if (foodMode) {
      if (foodResult.status === 'fulfilled') {
        setFoodReport(foodResult.value?.data ?? null);
      } else {
        setFoodReport(null);
        setFoodError('Food order report could not be loaded.');
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    load('month');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeRange(nextRange: ReportRange) {
    setRange(nextRange);
    load(nextRange);
  }

  async function downloadPdf() {
    if (!summary || pdfLoading) return;

    setPdfLoading(true);
    const params = resolveRange(range);
    const url = reportsAPI.businessReportPdfUrl(params);

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${getStoredToken()}` },
      });
      if (!response.ok) throw new Error('PDF failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = getReportFilename('pdf', range);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      showToast('PDF report downloaded.', 'success');
    } catch {
      showToast('Could not download PDF report.', 'error');
    } finally {
      setPdfLoading(false);
    }
  }

  function exportCsv() {
    if (!summary) {
      showToast('No report data to export.', 'info');
      return;
    }

    const rows: Array<Array<string | number>> = [
      ['Period', formatPeriodLabel(range, summary)],
      ['Sales', safeNumber(summary.revenue).toFixed(2)],
      ['Cash collected', safeNumber(summary.cash_collected).toFixed(2)],
      ['Credit outstanding', safeNumber(summary.credit_outstanding).toFixed(2)],
      ['Cost of goods sold', safeNumber(summary.cost_of_goods_sold).toFixed(2)],
      ['Gross profit', safeNumber(summary.gross_profit).toFixed(2)],
      ['Gross margin', formatPercent(grossMargin)],
      ['Expenses', safeNumber(summary.expenses).toFixed(2)],
      ['Net profit', safeNumber(summary.net_profit).toFixed(2)],
      ['Net margin', formatPercent(netMargin)],
      ['Stock value', safeNumber(summary.stock_value).toFixed(2)],
      ['Transactions', safeNumber(summary.transactions)],
    ];

    if (foodMode && foodReport) {
      rows.push(
        ['Food order revenue', safeNumber(foodReport.revenue).toFixed(2)],
        ['Completed food orders', safeNumber(foodReport.completed_orders)],
        ['Pending food orders', safeNumber(foodReport.pending_orders)],
        ['Cancelled food orders', safeNumber(foodReport.cancelled_orders)],
        ['Food cancellation rate', formatPercent(foodReport.cancellation_rate)],
      );
    }

    downloadCsv(getReportFilename('csv', range), ['Metric', 'Value'], rows);
    showToast('Reports CSV downloaded.', 'success');
  }

  const revenue = safeNumber(summary?.revenue);
  const grossProfit = safeNumber(summary?.gross_profit);
  const netProfit = safeNumber(summary?.net_profit);
  const expenses = safeNumber(summary?.expenses);
  const cashCollected = safeNumber(summary?.cash_collected);
  const creditOutstanding = safeNumber(summary?.credit_outstanding);
  const grossMargin = summary?.gross_margin != null
    ? safeNumber(summary.gross_margin)
    : revenue > 0
      ? (grossProfit / revenue) * 100
      : 0;
  const netMargin = summary?.net_margin != null
    ? safeNumber(summary.net_margin)
    : revenue > 0
      ? (netProfit / revenue) * 100
      : 0;
  const cashCollectionRate = revenue > 0 ? (cashCollected / revenue) * 100 : 0;
  const health = useMemo(() => getHealthMessage(summary), [summary]);
  const healthColor = health.tone === 'green'
    ? 'var(--accent)'
    : health.tone === 'warn'
      ? 'var(--warn)'
      : health.tone === 'danger'
        ? 'var(--danger)'
        : 'var(--text-secondary)';

  const fullPageError = !loading && !summary && summaryError;

  return (
    <main className="page page-wide">
      <div className="page-toolbar" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0 }}>Reports</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
              Understand profit, cash, credit, and stock
            </p>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
              {formatPeriodLabel(range, summary)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={exportCsv} disabled={!summary || loading}>CSV</button>
            <button className="btn btn-primary" onClick={downloadPdf} disabled={!summary || pdfLoading || loading}>
              {pdfLoading ? 'Preparing…' : 'PDF'}
            </button>
            <button className="btn btn-secondary" onClick={() => load(range)} disabled={loading || pdfLoading}>Refresh</button>
          </div>
        </div>
      </div>

      <div className="filter-chips" style={{ marginBottom: 14 }}>
        {[
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'all', label: 'All time' },
        ].map(({ value, label }) => (
          <button
            key={value}
            className={`btn ${range === value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => changeRange(value as ReportRange)}
            disabled={loading}
            style={{ flex: '1 1 72px', padding: '10px 12px', boxShadow: range === value ? 'var(--shadow-accent)' : 'none' }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingDashboard />
      ) : fullPageError ? (
        <InlineError
          title="Could not load reports"
          body="Check your connection and try again."
          onRetry={() => load(range)}
        />
      ) : summary ? (
        <div className="reports-grid">
          <section className="card">
            <SectionTitle title="Business Health Snapshot" subtitle="The owner’s quick view of profit, cash, credit, and stock." />
            <div className="summary-grid">
              <MetricCard label="Net Profit" value={formatMoney(summary.net_profit)} tone={netProfit >= 0 ? 'green' : 'danger'} />
              <MetricCard label="Sales" value={formatMoney(summary.revenue)} />
              <MetricCard label="Cash Collected" value={formatMoney(summary.cash_collected)} tone="green" />
              <MetricCard label="Credit Outstanding" value={formatMoney(summary.credit_outstanding)} tone={creditOutstanding > cashCollected ? 'warn' : 'default'} />
              <MetricCard label="Expenses" value={formatMoney(summary.expenses)} tone={expenses > revenue * 0.4 && revenue > 0 ? 'warn' : 'default'} />
              <MetricCard label="Stock Value" value={formatMoney(summary.stock_value)} />
            </div>
            <div className="row-card" style={{ cursor: 'default', marginTop: 10, borderColor: health.tone === 'green' ? 'rgba(16,185,129,0.24)' : health.tone === 'warn' ? 'rgba(245,158,11,0.24)' : health.tone === 'danger' ? 'rgba(239,68,68,0.24)' : 'var(--border)' }}>
              <div>
                <p style={{ margin: '0 0 4px', color: healthColor, fontWeight: 800 }}>Health message</p>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{health.text}</p>
              </div>
            </div>
          </section>

          <section className="card">
            <SectionTitle title="Profit Breakdown" subtitle="Net Profit = Sales - Cost of Goods Sold - Expenses" />
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                ['Sales', formatMoney(summary.revenue), 'pill-green'],
                ['- Cost of Goods Sold', formatMoney(summary.cost_of_goods_sold), 'pill-muted'],
                ['= Gross Profit', formatMoney(summary.gross_profit), grossProfit >= 0 ? 'pill-green' : 'pill-danger'],
                ['- Expenses', formatMoney(summary.expenses), 'pill-warn'],
                ['= Net Profit', formatMoney(summary.net_profit), netProfit >= 0 ? 'pill-green' : 'pill-danger'],
              ].map(([label, value, pillClass]) => (
                <div key={label} className="row-card" style={{ cursor: 'default', justifyContent: 'space-between', minHeight: 58 }}>
                  <strong>{label}</strong>
                  <span className={`pill ${pillClass}`}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <MetricCard label="Gross Margin" value={formatPercent(grossMargin)} />
              <MetricCard label="Net Margin" value={formatPercent(netMargin)} tone={netMargin >= 0 ? 'green' : 'danger'} />
            </div>
          </section>

          <section className="card">
            <SectionTitle title="Cash & Credit" subtitle="How much money came in versus what customers still owe." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <MetricCard label="Cash Collected" value={formatMoney(summary.cash_collected)} tone="green" />
              <MetricCard label="Customers Owing" value={formatMoney(summary.credit_outstanding)} tone={creditOutstanding > 0 ? 'warn' : 'default'} />
              <MetricCard label="Collection Rate" value={formatPercent(cashCollectionRate)} />
            </div>
            {creditOutstanding > cashCollected && (
              <div className="row-card" style={{ cursor: 'default', marginTop: 10, borderColor: 'rgba(245,158,11,0.28)' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', color: 'var(--warn)', fontWeight: 800 }}>Credit warning</p>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Credit is higher than collected cash. Follow up with owing customers.</p>
                </div>
                <Link href="/customers" className="btn btn-secondary" style={{ textDecoration: 'none', padding: '10px 12px' }}>View Customers</Link>
              </div>
            )}
            {(summary.recent_credit_customers || []).length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {(summary.recent_credit_customers || []).slice(0, 3).map((customer, index) => (
                  <div key={`${customer.name}-${index}`} className="row-card" style={{ cursor: 'default', justifyContent: 'space-between', minHeight: 58 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700 }}>{customer.name || 'Customer'}</p>
                      {customer.phone && <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>{customer.phone}</p>}
                    </div>
                    <span className="pill pill-warn">{formatMoney(customer.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <SectionTitle title="Products & Stock" subtitle="What is selling, and what needs attention." />
            <MetricCard label="Stock Value" value={formatMoney(summary.stock_value)} helper="Based on current product cost prices." />
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              <div>
                <h3 style={{ margin: '0 0 8px' }}>Top products</h3>
                {(summary.top_products || []).length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--text-muted)' }}>No product sales in this range.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(summary.top_products || []).slice(0, 5).map((product) => (
                      <div key={product.name || 'product'} className="row-card" style={{ cursor: 'default', alignItems: 'flex-start', paddingBlock: 12 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: 800 }}>{product.name || 'Product'}</p>
                          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
                            {safeNumber(product.qty)} sold · Profit {formatMoney(product.profit)}
                          </p>
                        </div>
                        <span className="pill pill-green">{formatMoney(product.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3 style={{ margin: '4px 0 8px' }}>Low stock</h3>
                {(summary.low_stock || []).length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--text-muted)' }}>No low-stock alerts.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(summary.low_stock || []).slice(0, 5).map((item) => {
                      const content = (
                        <div className="row-card" style={{ justifyContent: 'space-between', minHeight: 58 }}>
                          <strong>{item.name || 'Product'}</strong>
                          <span className="pill pill-warn">{safeNumber(item.stock_qty)} left</span>
                        </div>
                      );

                      return item.id ? (
                        <Link key={item.id} href={`/products/${item.id}`} style={{ textDecoration: 'none' }}>{content}</Link>
                      ) : (
                        <div key={item.name || 'low-stock'}>{content}</div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <Link href="/products" className="btn btn-secondary" style={{ textDecoration: 'none', marginTop: 12, width: '100%' }}>
              View Products
            </Link>
          </section>

          <section className="card">
            <SectionTitle title="Loan Readiness" subtitle="Estimate based on your recorded sales, profit, expenses, credit, and stock." />
            {loanError && !loan ? (
              <InlineError title="Loan readiness unavailable" body={loanError} onRetry={() => load(range)} />
            ) : loan ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>{safeNumber(loan.score)}/100</p>
                    <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontWeight: 800 }}>{loan.grade || '—'}</p>
                  </div>
                  <Link href="/reports/loan-readiness" className="btn btn-secondary" style={{ textDecoration: 'none' }}>Details</Link>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  <MetricCard label="Safe Repayment" value={formatMoney(loan.estimated_safe_monthly_repayment)} />
                  <MetricCard label="Strengths" value={String((loan.strengths || []).length)} tone="green" />
                  <MetricCard label="Risks" value={String((loan.risks || []).length)} tone={(loan.risks || []).length > 0 ? 'warn' : 'default'} />
                </div>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>
                  {loan.disclaimer || 'This is an estimate based on your records, not a bank approval.'}
                </p>
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>Loan readiness data is not available yet.</p>
            )}
          </section>

          <section className="card">
            <SectionTitle title="Business Statement Preview" subtitle="A bank-ready summary of what your records prove." />
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              This report summarizes your sales, profit, expenses, credit exposure, and stock value for the selected period. Export it as PDF when discussing your business records.
            </p>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {[
                ['Business performance summary', `${formatMoney(summary.revenue)} sales and ${formatMoney(summary.net_profit)} net profit.`],
                ['Cash collection', `${formatPercent(cashCollectionRate)} collection rate for this period.`],
                ['Customer credit exposure', `${formatMoney(summary.credit_outstanding)} currently outstanding.`],
                ['Expense discipline', `${formatMoney(summary.expenses)} recorded expenses.`],
                ['Stock position', `${formatMoney(summary.stock_value)} current stock value.`],
                ['Loan readiness estimate', loan ? `${safeNumber(loan.score)}/100 (${loan.grade || '—'}).` : 'Estimate unavailable.'],
              ].map(([label, value]) => (
                <div key={label} className="row-card" style={{ cursor: 'default', alignItems: 'flex-start', paddingBlock: 12 }}>
                  <div>
                    <p style={{ margin: '0 0 3px', fontWeight: 800 }}>{label}</p>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={downloadPdf} disabled={pdfLoading} style={{ width: '100%', marginTop: 12 }}>
              {pdfLoading ? 'Preparing…' : 'Download PDF Statement'}
            </button>
          </section>

          <section className="card">
            <SectionTitle title="Exports" subtitle="Share your records with partners, accountants, or lenders." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button className="btn btn-secondary" onClick={exportCsv}>Download CSV</button>
              <button className="btn btn-primary" onClick={downloadPdf} disabled={pdfLoading}>{pdfLoading ? 'Preparing…' : 'Download PDF'}</button>
            </div>
          </section>

          {foodMode && (
            <section className="card">
              <SectionTitle title="Food Orders" subtitle="Restaurant order signals for this report period." />
              {foodError && !foodReport ? (
                <InlineError title="Food report unavailable" body={foodError} onRetry={() => load(range)} />
              ) : foodReport ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <MetricCard label="Order Revenue" value={formatMoney(foodReport.revenue)} />
                  <MetricCard label="Completed" value={String(safeNumber(foodReport.completed_orders))} />
                  <MetricCard label="Pending" value={String(safeNumber(foodReport.pending_orders))} />
                  <MetricCard label="Cancellation Rate" value={formatPercent(foodReport.cancellation_rate)} />
                </div>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>No food order report data.</p>
              )}
            </section>
          )}
        </div>
      ) : (
        <div className="card">No report data.</div>
      )}
    </main>
  );
}
