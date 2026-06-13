'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { reportsAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface LoanReadiness {
  score: number;
  grade: string;
  estimated_safe_monthly_repayment: number;
  average_monthly_revenue: number;
  average_monthly_net_profit: number;
  cash_collection_rate: number;
  credit_outstanding: number;
  expense_to_revenue_ratio: number;
  record_completeness: number;
  selling_days: number;
  expense_days: number;
  strengths: string[];
  risks: string[];
  disclaimer: string;
}

function money(value: number) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

export default function LoanReadinessPage() {
  const { showToast } = useToast();
  const [report, setReport] = useState<LoanReadiness | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportsAPI.loanReadiness({ period: 'month' })
      .then((res) => setReport(res.data))
      .catch(() => showToast('Could not load loan readiness.', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  return (
    <main className="page page-content">
      <div className="page-toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <Link href="/reports" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 13 }}>← Reports</Link>
        <h1 style={{ margin: 0 }}>Loan Readiness</h1>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 280, borderRadius: 'var(--card-radius)' }} />
      ) : report ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <section className="card">
            <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>Estimate score</p>
            <h2 style={{ margin: '8px 0 0', fontSize: 34 }}>{report.score}/100</h2>
            <p style={{ margin: '6px 0 0', fontWeight: 700 }}>{report.grade}</p>
            <p style={{ margin: '12px 0 0', color: 'var(--text-secondary)' }}>
              Safe monthly repayment estimate: {money(report.estimated_safe_monthly_repayment)}
            </p>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Avg monthly revenue</p>
              <strong>{money(report.average_monthly_revenue)}</strong>
            </div>
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Avg monthly net profit</p>
              <strong>{money(report.average_monthly_net_profit)}</strong>
            </div>
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Cash collection rate</p>
              <strong>{report.cash_collection_rate}%</strong>
            </div>
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Customers owing</p>
              <strong>{money(report.credit_outstanding)}</strong>
            </div>
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Strengths</h2>
            {(report.strengths || []).map((item) => (
              <p key={item} style={{ margin: '0 0 8px', color: 'var(--accent)' }}>• {item}</p>
            ))}
            {(report.strengths || []).length === 0 && <p style={{ color: 'var(--text-muted)' }}>Keep recording sales and expenses to build strengths.</p>}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>What to improve</h2>
            {(report.risks || []).map((item) => (
              <p key={item} style={{ margin: '0 0 8px', color: 'var(--warn)' }}>• {item}</p>
            ))}
            {(report.risks || []).length === 0 && <p style={{ color: 'var(--text-muted)' }}>No major risks flagged for this period.</p>}
          </section>

          <section className="card">
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {report.disclaimer}
            </p>
          </section>
        </div>
      ) : (
        <div className="card">No loan readiness data.</div>
      )}
    </main>
  );
}
