'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { customersAPI, paymentsAPI, salesAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { getPathSegment } from '@/lib/pathnameParams';

type Customer = {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  created_at?: string | null;
  total_unpaid_credit?: number | string | null;
  total_purchases?: number | string | null;
  total_spent?: number | string | null;
};

type CreditEntry = {
  id: string;
  type: 'debt' | 'payment';
  sale_id?: string | null;
  amount: number;
  settled: boolean;
  created_at?: string | null;
  due_date?: string | null;
  sale_created_at?: string | null;
  sale_total?: number | null;
};

type SaleRow = {
  id: string;
  created_at?: string | null;
  total?: number | null;
  total_amount?: number | null;
  items_count?: number | null;
};

type PaymentMethod = 'Cash' | 'MoMo';

function safeNumber(value: unknown, fallback = 0) {
  const amount = Number(value ?? fallback);
  return Number.isFinite(amount) ? amount : fallback;
}

function positiveNumber(value: unknown) {
  const amount = safeNumber(value);
  return amount > 0 ? amount : 0;
}

function formatMoney(value: unknown) {
  return `GH₵ ${safeNumber(value).toFixed(2)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';

  return parsed.toLocaleDateString('en-GH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getInitials(name: string | null | undefined) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts[0]) return 'CU';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function avatarColor(name: string | null | undefined) {
  const safeName = String(name ?? '');
  const colors = ['#064e3b', '#1e3a5f', '#4c1d95', '#7c2d12', '#134e4a', '#1e1b4b'];
  let hash = 0;
  for (let index = 0; index < safeName.length; index += 1) {
    hash += safeName.charCodeAt(index);
  }
  return colors[hash % colors.length];
}

function normalizeCreditPayload(raw: any): CreditEntry[] {
  const entries = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.entries)
      ? raw.entries
      : Array.isArray(raw?.credit)
        ? raw.credit
        : [];

  return entries.map((entry: any) => {
    const sale = Array.isArray(entry.sales) ? entry.sales[0] : entry.sales;

    return {
    id: String(entry.id),
    type: entry.type === 'payment' ? 'payment' : 'debt',
    sale_id: entry.sale_id || null,
      amount: positiveNumber(entry.amount),
      settled: Boolean(entry.settled),
    created_at: entry.created_at || null,
    due_date: entry.due_date || null,
      sale_created_at: sale?.created_at || null,
      sale_total: sale?.total_amount ?? sale?.total ?? null,
    };
  });
}

function normalizeSalesPayload(raw: any): SaleRow[] {
  const sales = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.sales)
      ? raw.sales
      : [];

  return sales.map((sale: any) => ({
    id: String(sale.id),
    created_at: sale.created_at || null,
    total: sale.total ?? null,
    total_amount: sale.total_amount ?? null,
    items_count: sale.items_count ?? null,
  }));
}

function normalizeCustomerPayload(raw: any): Customer | null {
  const customer = raw?.customer ?? raw ?? null;
  if (!customer?.id) return null;

  return {
    id: String(customer.id),
    name: customer.name || 'Unnamed customer',
    phone: customer.phone || null,
    email: customer.email || null,
    created_at: customer.created_at || null,
    total_unpaid_credit: customer.total_unpaid_credit ?? 0,
    total_purchases: customer.total_purchases ?? null,
    total_spent: customer.total_spent ?? null,
  };
}

function SummaryCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' | 'green' }) {
  const color = tone === 'warn' ? 'var(--warn)' : tone === 'green' ? 'var(--accent)' : 'var(--text-primary)';

  return (
    <div className="row-card" style={{ cursor: 'default', alignItems: 'flex-start', padding: 14 }}>
      <div style={{ minWidth: 0 }}>
        <p className="section-label" style={{ margin: '0 0 6px', padding: 0 }}>{label}</p>
        <p style={{ margin: 0, color, fontWeight: 800, fontSize: value.length > 12 ? 16 : 18, overflowWrap: 'anywhere' }}>
          {value}
        </p>
      </div>
    </div>
  );
}

function SectionError({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return (
    <div className="row-card" style={{ cursor: 'default', borderColor: 'rgba(239,68,68,0.24)' }}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: '0 0 4px', color: 'var(--danger)', fontWeight: 800 }}>{title}</p>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{body}</p>
      </div>
      <button className="btn btn-secondary" onClick={onRetry} style={{ padding: '9px 12px' }}>
        Retry
      </button>
    </div>
  );
}

function InlineEmpty({ title, body, tone = 'default' }: { title: string; body?: string; tone?: 'default' | 'green' | 'warn' }) {
  const color = tone === 'green' ? 'var(--accent)' : tone === 'warn' ? 'var(--warn)' : 'var(--text-primary)';

  return (
    <div className="row-card" style={{ cursor: 'default', alignItems: 'flex-start', paddingBlock: 14 }}>
      <div>
        <p style={{ margin: '0 0 4px', color, fontWeight: 800 }}>{title}</p>
        {body && <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{body}</p>}
      </div>
    </div>
  );
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const pathname = usePathname();
  const id = getPathSegment(pathname);
  const { showToast } = useToast();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [creditEntries, setCreditEntries] = useState<CreditEntry[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerLoadError, setCustomerLoadError] = useState(false);
  const [creditLoadError, setCreditLoadError] = useState(false);
  const [salesLoadError, setSalesLoadError] = useState(false);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderNote, setReminderNote] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const loadCustomer = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setCustomerLoadError(false);
    setCreditLoadError(false);
    setSalesLoadError(false);

    try {
      const [customerRes, creditRes, salesRes] = await Promise.allSettled([
        customersAPI.get(id),
        customersAPI.getCredit(id),
        salesAPI.list({ customer_id: id, limit: 5 }),
      ]);

      if (customerRes.status === 'fulfilled') {
        const payload = normalizeCustomerPayload(customerRes.value.data);
        setCustomer(payload);
        setCustomerLoadError(!payload);
      } else {
        setCustomer(null);
        setCustomerLoadError(true);
        showToast('Failed to load customer details.', 'error');
      }

      if (creditRes.status === 'fulfilled') {
        setCreditEntries(normalizeCreditPayload(creditRes.value.data));
        setCreditLoadError(false);
      } else {
        setCreditEntries([]);
        setCreditLoadError(true);
      }

      if (salesRes.status === 'fulfilled') {
        setSales(normalizeSalesPayload(salesRes.value.data));
        setSalesLoadError(false);
      } else {
        setSales([]);
        setSalesLoadError(true);
      }

      const partialFailures = [creditRes, salesRes].some((result) => result.status === 'rejected');
      if (partialFailures && customerRes.status === 'fulfilled') {
        showToast('Some customer history could not be loaded.', 'info');
      }
    } catch {
      setCustomer(null);
      setCreditEntries([]);
      setSales([]);
      setCustomerLoadError(true);
      setCreditLoadError(false);
      setSalesLoadError(false);
      showToast('Failed to load customer details.', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  const outstanding = positiveNumber(customer?.total_unpaid_credit);
  const totalPurchases = useMemo(() => {
    if (customer?.total_purchases != null) return safeNumber(customer.total_purchases);
    if (customer?.total_spent != null) return safeNumber(customer.total_spent);

    return sales.reduce((sum, sale) => {
      return sum + safeNumber(sale.total ?? sale.total_amount);
    }, 0);
  }, [customer, sales]);

  const totalDebtRecorded = useMemo(() => (
    creditEntries
      .filter((entry) => entry.type === 'debt')
      .reduce((sum, entry) => sum + positiveNumber(entry.amount), 0)
  ), [creditEntries]);

  const totalPaymentsRecorded = useMemo(() => (
    creditEntries
      .filter((entry) => entry.type === 'payment')
      .reduce((sum, entry) => sum + positiveNumber(entry.amount), 0)
  ), [creditEntries]);

  const lastActivity = useMemo(() => {
    const dates = [
      customer?.created_at,
      ...creditEntries.map((entry) => entry.created_at),
      ...sales.map((sale) => sale.created_at),
    ]
      .map((value) => {
        if (!value) return 0;
        const parsed = new Date(value).getTime();
        return Number.isNaN(parsed) ? 0 : parsed;
      })
      .filter(Boolean);

    if (!dates.length) return '—';
    return formatDate(new Date(Math.max(...dates)).toISOString());
  }, [creditEntries, customer, sales]);

  const customerName = customer?.name || 'Unnamed customer';
  const hasPhone = Boolean(customer?.phone?.trim());
  const actionBusy = reminderLoading || paymentSaving;

  async function sendReminder() {
    if (!id || reminderLoading) return;

    if (outstanding <= 0) {
      setReminderNote('This customer has no outstanding credit.');
      return;
    }

    if (!hasPhone) {
      setReminderNote('Add a phone number before sending SMS reminders.');
      return;
    }

    setReminderLoading(true);
    setReminderNote('');
    try {
      await customersAPI.sendReminder(id);
      showToast('Reminder sent!', 'success');
      setReminderNote('Reminder sent just now.');
    } catch {
      const message = 'Could not send the reminder right now. Check SMS setup or try again.';
      setReminderNote(message);
      showToast('Failed to send reminder.', 'error');
    } finally {
      setReminderLoading(false);
    }
  }

  async function recordPayment() {
    if (!id || paymentSaving) return;

    if (!paymentAmount.trim()) {
      setPaymentError('Payment amount is required.');
      return;
    }

    const amount = safeNumber(paymentAmount, Number.NaN);
    if (!Number.isFinite(amount)) {
      setPaymentError('Payment amount is required.');
      return;
    }
    if (amount <= 0) {
      setPaymentError('Payment amount must be greater than 0.');
      return;
    }
    if (amount > outstanding) {
      setPaymentError('Amount cannot exceed the current balance.');
      return;
    }

    setPaymentError('');
    setPaymentSaving(true);
    try {
      await paymentsAPI.record({
        customer_id: id,
        amount,
        method: paymentMethod,
        note: paymentNote.trim() || undefined,
        type: 'credit_payment',
      });

      showToast('Payment recorded.', 'success');
      setPaymentOpen(false);
      setPaymentAmount('');
      setPaymentMethod('Cash');
      setPaymentNote('');
      setPaymentError('');
      await loadCustomer();
    } catch {
      showToast('Failed to record payment.', 'error');
    } finally {
      setPaymentSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="page page-content">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div className="skeleton" style={{ width: 64, height: 64, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'grid', gap: 8 }}>
              <div className="skeleton" style={{ width: '58%', height: 20, borderRadius: 8 }} />
              <div className="skeleton" style={{ width: '42%', height: 14, borderRadius: 8 }} />
            </div>
          </div>
          <div className="skeleton" style={{ width: '100%', height: 110, borderRadius: 14 }} />
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="skeleton" style={{ width: 150, height: 18, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: '100%', height: 70, borderRadius: 14 }} />
          <div className="skeleton" style={{ width: '100%', height: 70, borderRadius: 14 }} />
        </div>
      </main>
    );
  }

  if (!customer) {
    return (
      <main className="page page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: 360 }}>
          <h1 style={{ marginBottom: 8 }}>{customerLoadError ? 'Could not load customer' : 'Customer not found'}</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
            This customer record could not be loaded. Check your connection and try again.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={loadCustomer}>
              Retry
            </button>
            <button className="btn btn-secondary" onClick={() => router.push('/customers')}>
              Back to Customers
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page page-content">
      <div className="page-toolbar">
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-primary)', display: 'flex', cursor: 'pointer' }}
          aria-label="Go back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="truncate-1" style={{ margin: 0, flex: 1, fontSize: 18, fontWeight: 700 }}>{customerName}</h1>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: avatarColor(customerName),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: 22,
              flexShrink: 0,
            }}
          >
            {getInitials(customerName)}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 19 }}>{customerName}</p>
              <span className={`pill ${outstanding > 0 ? 'pill-warn' : 'pill-green'}`}>
                {outstanding > 0 ? 'Owing' : 'Clear'}
              </span>
            </div>
            <p style={{ margin: 0, color: hasPhone ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
              {customer.phone || 'No phone number saved'}
            </p>
            {customer.email && <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>{customer.email}</p>}
            {outstanding <= 0 && (
              <p style={{ margin: '8px 0 0', color: 'var(--accent)', fontWeight: 700 }}>
                This customer has no outstanding credit.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
          <SummaryCard label="Total Purchases" value={formatMoney(totalPurchases)} />
          <SummaryCard label="Outstanding Credit" value={formatMoney(outstanding)} tone={outstanding > 0 ? 'warn' : 'green'} />
          <SummaryCard label="Credit Entries" value={String(creditEntries.length)} />
          <SummaryCard label="Last Activity" value={lastActivity} />
        </div>

        <div className="action-row">
          {outstanding > 0 && (
            <button
              className="btn btn-primary"
              onClick={() => setPaymentOpen((current) => !current)}
              disabled={actionBusy}
            >
              {paymentSaving ? 'Saving…' : paymentOpen ? 'Close Payment' : 'Record Payment'}
            </button>
          )}
          {outstanding > 0 && (
            <button
              className="btn btn-secondary"
              onClick={sendReminder}
              disabled={actionBusy || !hasPhone}
            >
              {reminderLoading ? 'Sending…' : 'Send Reminder'}
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => router.push(`/customers/${id}/edit`)}
            disabled={actionBusy}
          >
            Edit Customer
          </button>
        </div>
        {outstanding > 0 && !hasPhone && (
          <p style={{ margin: '10px 0 0', color: 'var(--warn)', fontSize: 13 }}>
            Add a phone number before sending SMS reminders.
          </p>
        )}
        {reminderNote && (
          <p style={{ margin: '10px 0 0', color: reminderNote.includes('sent') ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 13 }}>
            {reminderNote}
          </p>
        )}

        {paymentOpen && (
          <div className="card" style={{ marginTop: 16, padding: 16 }}>
            <p className="section-label" style={{ marginTop: 0, marginBottom: 12 }}>Record Credit Payment</p>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label className="input-label">Amount</label>
                <p style={{ margin: '0 0 8px', color: 'var(--text-secondary)', fontSize: 13 }}>
                  Current balance: {formatMoney(outstanding)}
                </p>
                <input
                  className="input"
                  type="number"
                  min="0.01"
                  max={outstanding}
                  step="0.01"
                  value={paymentAmount}
                  onChange={(event) => {
                    setPaymentAmount(event.target.value);
                    if (paymentError) setPaymentError('');
                  }}
                  placeholder="0.00"
                  style={{ borderColor: paymentError ? 'var(--danger)' : undefined }}
                />
                {paymentError && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{paymentError}</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setPaymentAmount((outstanding / 2).toFixed(2));
                      setPaymentError('');
                    }}
                    style={{ padding: '9px 12px' }}
                    disabled={paymentSaving}
                  >
                    Half balance
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setPaymentAmount(outstanding.toFixed(2));
                      setPaymentError('');
                    }}
                    style={{ padding: '9px 12px' }}
                    disabled={paymentSaving}
                  >
                    Full balance
                  </button>
                </div>
              </div>

              <div>
                <label className="input-label">Payment Method</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(['Cash', 'MoMo'] as PaymentMethod[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={paymentMethod === option ? 'btn btn-primary' : 'btn btn-secondary'}
                      onClick={() => setPaymentMethod(option)}
                      disabled={paymentSaving}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="input-label">Note</label>
                <input
                  className="input"
                  value={paymentNote}
                  onChange={(event) => setPaymentNote(event.target.value)}
                  placeholder="Optional note"
                  disabled={paymentSaving}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                  Current balance: {formatMoney(outstanding)}
                </p>
                <button className="btn btn-primary" onClick={recordPayment} disabled={paymentSaving}>
                  {paymentSaving ? 'Saving…' : 'Save Payment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <p className="section-label" style={{ marginTop: 0, marginBottom: 12 }}>Credit Statement</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
          <SummaryCard label="Debt Recorded" value={formatMoney(totalDebtRecorded)} tone="warn" />
          <SummaryCard label="Payments" value={formatMoney(totalPaymentsRecorded)} tone="green" />
          <SummaryCard label="Current Balance" value={formatMoney(outstanding)} tone={outstanding > 0 ? 'warn' : 'green'} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {creditLoadError && (
            <SectionError
              title="Credit statement unavailable"
              body="Customer details loaded, but the credit history could not be fetched."
              onRetry={loadCustomer}
            />
          )}

          {!creditLoadError && creditEntries.length === 0 && outstanding <= 0 && (
            <InlineEmpty
              title="No outstanding balance."
              body="No credit activity yet. Credit sales recorded through POS will appear here."
              tone="green"
            />
          )}

          {!creditLoadError && creditEntries.length === 0 && outstanding > 0 && (
            <InlineEmpty
              title="Balance found, but detailed credit history is not available yet."
              body="The current customer balance is still shown above."
              tone="warn"
            />
          )}

          {!creditLoadError && creditEntries.map((entry) => {
            const isDebt = entry.type === 'debt';
            const status = isDebt
              ? entry.settled
                ? 'Paid / settled'
                : 'Outstanding'
              : 'Payment recorded';

            return (
              <div key={entry.id} className="row-card" style={{ cursor: 'default', alignItems: 'flex-start', paddingBlock: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <p style={{ margin: 0, fontWeight: 800 }}>
                      {isDebt ? 'Debt' : 'Payment'}
                    </p>
                    <span className={`pill ${isDebt ? entry.settled ? 'pill-muted' : 'pill-warn' : 'pill-green'}`}>
                      {status}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    {formatDate(entry.created_at)}
                    {entry.sale_id ? ` · Sale #${entry.sale_id.slice(-5).toUpperCase()}` : ''}
                  </p>
                  {isDebt && entry.due_date && (
                    <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                      Due {formatDate(entry.due_date)}
                    </p>
                  )}
                  {entry.sale_created_at && (
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
                      Related sale: {formatDate(entry.sale_created_at)}
                      {entry.sale_total != null ? ` · ${formatMoney(entry.sale_total)}` : ''}
                    </p>
                  )}
                </div>
                <span className={`pill ${isDebt ? 'pill-warn' : 'pill-green'}`}>
                  {isDebt ? '-' : '+'}{formatMoney(entry.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <p className="section-label" style={{ marginTop: 0, marginBottom: 12 }}>Recent Sales</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {salesLoadError && (
            <SectionError
              title="Recent sales unavailable"
              body="Customer details loaded, but recent sales could not be fetched."
              onRetry={loadCustomer}
            />
          )}

          {!salesLoadError && sales.length === 0 && (
            <InlineEmpty title="No recent sales for this customer." />
          )}

          {!salesLoadError && sales.map((sale) => {
            const total = safeNumber(sale.total ?? sale.total_amount);

            return (
              <div
                key={sale.id}
                className="row-card"
                style={{ cursor: 'default' }}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{formatDate(sale.created_at)}</p>
                  {sale.items_count != null && (
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                      {safeNumber(sale.items_count)} item{safeNumber(sale.items_count) === 1 ? '' : 's'}
                    </p>
                  )}
                </div>
                <span className="pill-green">{formatMoney(total)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
