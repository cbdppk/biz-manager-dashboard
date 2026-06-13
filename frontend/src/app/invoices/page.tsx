'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { invoicesAPI } from '@/lib/api';
import EmptyState from '@/components/ui/EmptyState';
import { formatDateGh, formatMoneyGhs } from '@/lib/display';
import { useToast } from '@/hooks/useToast';

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  status: InvoiceStatus;
  total: number;
  due_date: string;
}

const TABS: { label: string; value: 'all' | InvoiceStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Paid', value: 'paid' },
  { label: 'Overdue', value: 'overdue' },
];

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft: '#94a3b8',
  sent: '#60a5fa',
  paid: '#10b981',
  overdue: '#f59e0b',
};

function StatusIcon({ status }: { status: InvoiceStatus }) {
  const color = STATUS_COLOR[status];
  const size = 20;
  const stroke = { stroke: color, fill: 'none', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  if (status === 'draft') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
    );
  }
  if (status === 'sent') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    );
  }
  if (status === 'paid') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
        <circle cx="12" cy="12" r="10" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    );
  }
  // overdue
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function formatDueDate(iso: string) {
  return formatDateGh(iso, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function InvoicesPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | InvoiceStatus>('all');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await invoicesAPI.list({ limit: 100 });
      const data: Invoice[] = res.data?.invoices ?? res.data ?? [];
      setInvoices(data);
    } catch {
      setInvoices([]);
      setError('Could not load invoices right now.');
      showToast('Could not load invoices.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const filtered = activeTab === 'all'
    ? invoices
    : invoices.filter((inv) => inv.status === activeTab);

  const emptyLabel = activeTab === 'all' ? 'invoices' : `${activeTab} invoices`;

  return (
    <>
      <main className="page page-content">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Invoices</h1>
          <button
            onClick={() => router.push('/invoices/new')}
            style={{
              width: 36, height: 36,
              background: 'var(--accent)',
              border: 'none', borderRadius: 10,
              color: '#fff', fontSize: 22, fontWeight: 300,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', lineHeight: 1,
            }}
          >
            +
          </button>
        </div>

        {/* Filter tabs */}
        <div className="filter-chips" style={{ marginBottom: 20 }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`btn btn-nowrap ${active ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  minHeight: 38,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--row-gap)' }}>
          {error && !loading && (
            <div className="card" style={{ marginBottom: 8 }}>
              <p style={{ color: 'var(--danger)', marginBottom: 10 }}>{error}</p>
              <button className="btn btn-secondary" onClick={fetchInvoices}>Try Again</button>
            </div>
          )}

          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="row-card" style={{ opacity: 0.35 }}>
                  <div className="skeleton" style={{ width: 28, height: 28, borderRadius: 6 }} />
                  <div className="skeleton" style={{ flex: 1, height: 14, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 64, height: 22, borderRadius: 6 }} />
                </div>
              ))
            : filtered.length === 0
            ? (
                <EmptyState
                  icon={(
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  )}
                  title={activeTab === 'all' ? 'No invoices yet' : `No ${emptyLabel}`}
                  description={activeTab === 'all'
                    ? 'Create your first invoice to start tracking drafts, sent bills, and paid balances.'
                    : `There are no ${emptyLabel} in this view right now.`}
                  ctaLabel={activeTab === 'all' ? 'Create first invoice' : undefined}
                  ctaHref={activeTab === 'all' ? '/invoices/new' : undefined}
                />
              )
            : filtered.map((inv) => {
                const amountClass =
                  inv.status === 'paid' ? 'pill-green'
                  : inv.status === 'sent' || inv.status === 'overdue' ? 'pill-warn'
                  : undefined;

                return (
                  <div
                    key={inv.id}
                    className="row-card"
                    onClick={() => router.push(`/invoices/${inv.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Status icon */}
                    <div style={{ width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <StatusIcon status={inv.status} />
                    </div>

                    {/* Customer + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.customer_name || 'Unknown'}
                      </p>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                        {inv.invoice_number} · Due {formatDueDate(inv.due_date)}
                      </p>
                    </div>

                    {/* Amount pill */}
                    {amountClass ? (
                      <span className={amountClass}>
                        {formatMoneyGhs(inv.total)}
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: 'var(--text-muted)',
                        background: 'rgba(148,163,184,0.12)',
                        borderRadius: 20, padding: '4px 10px',
                        flexShrink: 0,
                      }}>
                        {formatMoneyGhs(inv.total)}
                      </span>
                    )}

                    {/* Chevron */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="var(--text-muted)" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{ flexShrink: 0 }}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                );
              })
          }
        </div>
      </main>

      {/* FAB */}
      <button
        onClick={() => router.push('/invoices/new')}
        style={{
          position: 'fixed', bottom: 80, right: 20,
          width: 52, height: 52,
          background: 'var(--accent)',
          border: 'none', borderRadius: '50%',
          color: '#fff', fontSize: 26, fontWeight: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(16,185,129,0.4)',
          cursor: 'pointer', zIndex: 50,
          lineHeight: 1,
        }}
        aria-label="New invoice"
      >
        +
      </button>
    </>
  );
}
