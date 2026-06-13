'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { invoicesAPI, customersAPI } from '@/lib/api';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/hooks/useToast';
import { getPathSegment } from '@/lib/pathnameParams';

// ── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

interface InvoiceItem {
  id?: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  customer_id: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  created_at: string;
  due_date: string;
  items: InvoiceItem[];
  total: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
};

const STATUS_COLOR: Record<InvoiceStatus, { bg: string; text: string }> = {
  draft:   { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' },
  sent:    { bg: 'rgba(96,165,250,0.15)',  text: '#60a5fa' },
  paid:    { bg: 'rgba(16,185,129,0.15)',  text: '#10b981' },
  overdue: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
};

// ── Icons ────────────────────────────────────────────────────────────────────

function ArrowBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const router = useRouter();
  const pathname = usePathname();
  const id = getPathSegment(pathname);
  const { showToast } = useToast();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'delete' | 'markPaid'>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    try {
      // Try direct GET first, fallback to list filter
      try {
        const res = await invoicesAPI.get(id);
        const data: Invoice = res.data?.invoice ?? res.data;
        setInvoice(data);
      } catch {
        const res = await invoicesAPI.list({ limit: 200 });
        const list: Invoice[] = res.data?.invoices ?? res.data ?? [];
        const found = list.find((inv) => inv.id === id) ?? null;
        setInvoice(found);
      }
    } catch {
      setInvoice(null);
      setLoadError('Could not load this invoice right now.');
      showToast('Failed to load invoice details.', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => { load(); }, [load]);

  async function markAsPaid() {
    if (!invoice || actionLoading) return;
    setActionLoading('paid');
    try {
      await invoicesAPI.updateStatus(id, 'paid');
      showToast('Invoice marked as paid.', 'success');
      await load();
    } catch {
      showToast('Failed to update status.', 'error');
    } finally {
      setActionLoading(null);
      setConfirm(null);
    }
  }

  async function sendReminder() {
    if (!invoice || actionLoading) return;
    setActionLoading('reminder');
    try {
      await customersAPI.sendReminder(invoice.customer_id);
      showToast('Reminder sent!', 'success');
    } catch {
      showToast('Failed to send reminder.', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteInvoice() {
    if (!invoice || actionLoading) return;
    setActionLoading('delete');
    try {
      await invoicesAPI.delete(id);
      showToast('Invoice deleted.', 'success');
      router.replace('/invoices');
    } catch {
      showToast('Failed to delete invoice.', 'error');
      setActionLoading(null);
      setConfirm(null);
    }
  }

  function downloadPdf() {
    const url = invoicesAPI.getPdfUrl(id);
    window.open(url, '_blank');
  }

  async function sendInvoiceEmail() {
    if (!invoice || actionLoading) return;
    setActionLoading('email');
    try {
      await invoicesAPI.send(id);
      showToast('Invoice emailed successfully.', 'success');
      await load();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to send invoice email.', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  // ── Skeleton ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="page page-content">
        <div className="page-toolbar">
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
        </div>
        <div style={{ opacity: 0.35 }}>
          <div className="skeleton skeleton-line" style={{ width: 180, height: 28, marginBottom: 10 }} />
          <div className="skeleton skeleton-line" style={{ width: 80, height: 22, borderRadius: 20, marginBottom: 20 }} />
          <div className="skeleton skeleton-card" style={{ marginBottom: 16 }} />
          <div className="skeleton skeleton-card" style={{ height: 160 }} />
        </div>
      </main>
    );
  }

  if (!invoice) {
    if (loadError) {
      return (
        <main className="page page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
            <p style={{ color: 'var(--danger)', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{loadError}</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 14 }}>
              Check your connection and try again.
            </p>
            <div className="action-row" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={load}>Try Again</button>
              <button className="btn btn-secondary" onClick={() => router.push('/invoices')}>Back to Invoices</button>
            </div>
          </div>
        </main>
      );
    }
    return (
      <main className="page page-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 16 }}>Invoice not found.</p>
        <button className="btn btn-ghost" onClick={() => router.push('/invoices')}>Back to invoices</button>
      </main>
    );
  }

  const { status } = invoice;
  const statusStyle = STATUS_COLOR[status];
  const items: InvoiceItem[] = invoice.items ?? [];
  const total = Number(invoice.total ?? items.reduce((s, it) => s + Number(it.subtotal ?? it.price * it.quantity), 0));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="page page-content">
      <div className="page-toolbar">
        <button
          onClick={() => router.push('/invoices')}
          style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}
          aria-label="Back"
        >
          <ArrowBack />
        </button>
        <h1 className="truncate-1" style={{ fontSize: 17, fontWeight: 700, margin: 0, flex: 1 }}>
          Invoice Detail
        </h1>
      </div>

      <div>

        {/* Invoice number + status */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.5px' }}>
            {invoice.invoice_number}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '4px 12px', borderRadius: 20,
              background: statusStyle.bg, color: statusStyle.text,
              fontSize: 13, fontWeight: 700,
            }}>
              {STATUS_LABEL[status]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Created</p>
              <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{fmtDate(invoice.created_at)}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: status === 'overdue' ? '#f59e0b' : 'var(--text-secondary)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due date</p>
              <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: status === 'overdue' ? '#f59e0b' : 'inherit' }}>{fmtDate(invoice.due_date)}</p>
            </div>
          </div>
        </div>

        {/* Bill To card */}
        <div
          onClick={() => router.push(`/customers/${invoice.customer_id}`)}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', marginBottom: 16,
          }}
        >
          <div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Bill To
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 2px' }}>{invoice.customer_name}</p>
            {invoice.customer_phone && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{invoice.customer_phone}</p>
            )}
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>

        {/* Line items */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 14, overflow: 'hidden', marginBottom: 20,
        }}>
          <p style={{
            fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            margin: 0, padding: '14px 16px 10px',
            borderBottom: '1px solid var(--border)',
          }}>
            Line Items
          </p>

          {items.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px', textAlign: 'center' }}>
              No items.
            </p>
          ) : (
            items.map((item, i) => {
              const subtotal = Number(item.subtotal ?? item.price * item.quantity);
              return (
                <div
                  key={item.id ?? i}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: i < items.length - 1 ? '1px solid rgba(51,65,85,0.5)' : 'none',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                      {item.quantity} × GH₵ {Number(item.price).toFixed(2)}
                    </p>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, flexShrink: 0, paddingLeft: 12 }}>
                    GH₵ {subtotal.toFixed(2)}
                  </p>
                </div>
              );
            })
          )}

          {/* Divider + Total */}
          <div style={{ borderTop: '2px solid var(--border)', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Total</p>
            <p style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--accent)' }}>
              GH₵ {total.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="action-stack">
          {invoice.customer_email && (
            <button
              disabled={!!actionLoading}
              className="btn btn-primary btn-block"
              onClick={sendInvoiceEmail}
            >
              {actionLoading === 'email' ? 'Sending…' : status === 'draft' ? 'Send Invoice Email' : 'Resend Invoice Email'}
            </button>
          )}

          {status === 'draft' && (
            <button
              disabled={!!actionLoading}
              className="btn btn-danger btn-block"
              onClick={() => setConfirm('delete')}
            >
              Delete Invoice
            </button>
          )}

          {status === 'sent' && (
            <>
              <button
                disabled={!!actionLoading}
                className="btn btn-primary btn-block"
                onClick={() => setConfirm('markPaid')}
              >
                {actionLoading === 'paid' ? 'Updating…' : 'Mark as Paid'}
              </button>
              <button
                disabled={!!actionLoading}
                className="btn btn-secondary btn-block"
                onClick={sendReminder}
              >
                {actionLoading === 'reminder' ? 'Sending…' : 'Send Reminder'}
              </button>
            </>
          )}

          {status === 'paid' && (
            <button
              className="btn btn-secondary btn-block"
              onClick={downloadPdf}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download PDF
            </button>
          )}

          {status === 'overdue' && (
            <>
              <button
                disabled={!!actionLoading}
                className="btn btn-primary btn-block"
                onClick={() => setConfirm('markPaid')}
              >
                {actionLoading === 'paid' ? 'Updating…' : 'Mark as Paid'}
              </button>
              <button
                disabled={!!actionLoading}
                className="btn btn-secondary btn-block"
                onClick={sendReminder}
              >
                {actionLoading === 'reminder' ? 'Sending…' : 'Send Reminder'}
              </button>
            </>
          )}

        </div>
      </div>

      {confirm === 'delete' && (
        <ConfirmDialog
          open
          title="Delete invoice?"
          message="This invoice will be removed permanently. This action cannot be undone."
          confirmLabel="Delete"
          tone="danger"
          busy={actionLoading === 'delete'}
          onConfirm={deleteInvoice}
          onCancel={() => setConfirm(null)}
        />
      )}

      {confirm === 'markPaid' && (
        <ConfirmDialog
          open
          title="Mark invoice as paid?"
          message="This will update the invoice status to paid."
          confirmLabel="Mark as Paid"
          busy={actionLoading === 'paid'}
          onConfirm={markAsPaid}
          onCancel={() => setConfirm(null)}
        />
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}
