'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { customersAPI, productsAPI, invoicesAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { isOfflineLikeError, queueAppMutation, shouldQueueOfflineNow } from '@/lib/appOutbox';
import { findCachedCustomers, findCachedProducts } from '@/lib/posOffline';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Customer { id: string; name: string; phone?: string; email?: string; }
interface Product  { id: string; name: string; price: number; unit?: string; }

interface LineItem {
  id: number;
  product: Product | null;
  productSearch: string;
  productResults: Product[];
  productOpen: boolean;
  productError?: string;
  qty: number;
  unitPrice: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
}

function fmt(n: number) {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let nextId = 1;
function newItem(): LineItem {
  return {
    id: nextId++,
    product: null,
    productSearch: '',
    productResults: [],
    productOpen: false,
    productError: '',
    qty: 1,
    unitPrice: '',
  };
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const dropdownStyle: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
  background: '#1e293b',
  border: '1px solid var(--border)',
  borderRadius: 10,
  marginTop: 4,
  overflow: 'hidden',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NewInvoicePage() {
  const router = useRouter();
  const { showToast } = useToast();

  // Customer
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const customerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Line items
  const [items, setItems] = useState<LineItem[]>([newItem()]);
  const productTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Details
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [note, setNote] = useState('');

  // UI
  const [submitting, setSubmitting] = useState<'draft' | 'sent' | null>(null);
  const [customerError, setCustomerError] = useState('');
  const [customerSearchError, setCustomerSearchError] = useState('');
  const [itemsError, setItemsError] = useState('');

  const resetQueuedInvoiceForm = useCallback(() => {
    setCustomerSearch('');
    setCustomerResults([]);
    setCustomerOpen(false);
    setCustomer(null);
    setItems([newItem()]);
    setDueDate(defaultDueDate());
    setNote('');
    setSubmitting(null);
    setCustomerError('');
    setCustomerSearchError('');
    setItemsError('');
  }, []);

  const queueOfflineInvoice = useCallback((status: 'draft' | 'sent', validItems: LineItem[], totalAmount: number) => {
    if (!customer) return;

    queueAppMutation('create_invoice', {
      customer_id: customer.id,
      status: 'draft',
      due_date: dueDate,
      note: note.trim() || undefined,
      items: validItems.map(it => ({
        product_id: it.product!.id,
        product_name: it.product!.name,
        qty: it.qty,
        unit_price: parseFloat(it.unitPrice),
      })),
      total: totalAmount,
      send_on_sync: status === 'sent',
    });
    showToast(
      status === 'sent'
        ? 'Invoice saved offline. It will be created and sent when you are back online.'
        : 'Invoice saved offline. It will sync automatically.',
      'success'
    );
    resetQueuedInvoiceForm();
  }, [customer, dueDate, note, resetQueuedInvoiceForm, showToast]);

  // ── Customer search ────────────────────────────────────────────────────────

  const searchCustomers = useCallback(async (q: string) => {
    if (!q.trim()) { setCustomerResults([]); setCustomerOpen(false); return; }
    if (navigator.onLine === false) {
      const cached = findCachedCustomers(q).map((customer) => ({
        ...customer,
        phone: customer.phone ?? undefined,
      }));
      setCustomerSearchError(cached.length === 0 ? 'Offline mode: no cached customer matched that search.' : '');
      setCustomerResults(cached);
      setCustomerOpen(cached.length > 0);
      return;
    }
    try {
      const res = await customersAPI.list({ search: q, limit: 6 });
      const data: Customer[] = res.data?.customers ?? res.data ?? [];
      setCustomerSearchError('');
      setCustomerResults(data);
      setCustomerOpen(data.length > 0);
    } catch {
      const cached = findCachedCustomers(q).map((customer) => ({
        ...customer,
        phone: customer.phone ?? undefined,
      }));
      setCustomerResults(cached);
      setCustomerOpen(cached.length > 0);
      setCustomerSearchError(cached.length === 0 ? 'Could not search customers right now.' : 'Offline results shown from your last synced customers.');
    }
  }, []);

  function onCustomerInput(val: string) {
    setCustomerSearch(val);
    setCustomer(null);
    setCustomerSearchError('');
    if (customerTimer.current) clearTimeout(customerTimer.current);
    customerTimer.current = setTimeout(() => searchCustomers(val), 300);
  }

  function selectCustomer(c: Customer) {
    setCustomer(c);
    setCustomerError('');
    setCustomerSearchError('');
    setCustomerSearch(c.name);
    setCustomerOpen(false);
    setCustomerResults([]);
  }

  // ── Product search (per line item) ────────────────────────────────────────

  function searchProducts(itemId: number, q: string) {
    if (productTimers.current[itemId]) clearTimeout(productTimers.current[itemId]);
    productTimers.current[itemId] = setTimeout(async () => {
      if (!q.trim()) {
        setItems(prev => prev.map(it => it.id === itemId ? { ...it, productResults: [], productOpen: false } : it));
        return;
      }
      if (navigator.onLine === false) {
        const cached = findCachedProducts(q);
        setItems(prev => prev.map(it => it.id === itemId ? {
          ...it,
          productResults: cached,
          productOpen: cached.length > 0,
          productError: cached.length === 0 ? 'Offline mode: no cached product matched that search.' : '',
        } : it));
        return;
      }
      try {
        const res = await productsAPI.list({ search: q, limit: 6 });
        const data: Product[] = res.data?.products ?? res.data ?? [];
        setItems(prev => prev.map(it => it.id === itemId ? { ...it, productResults: data, productOpen: data.length > 0, productError: '' } : it));
      } catch {
        const cached = findCachedProducts(q);
        setItems(prev => prev.map(it => it.id === itemId ? {
          ...it,
          productResults: cached,
          productOpen: cached.length > 0,
          productError: cached.length === 0 ? 'Could not search products right now.' : 'Offline results shown from your last synced catalog.',
        } : it));
      }
    }, 300);
  }

  function onProductInput(itemId: number, val: string) {
    setItems(prev => prev.map(it =>
      it.id === itemId ? { ...it, productSearch: val, product: null, unitPrice: '', productOpen: false, productError: '' } : it
    ));
    searchProducts(itemId, val);
  }

  function selectProduct(itemId: number, product: Product) {
    setItemsError('');
    setItems(prev => prev.map(it =>
      it.id === itemId
        ? { ...it, product, productSearch: product.name, unitPrice: String(product.price), productResults: [], productOpen: false, productError: '' }
        : it
    ));
  }

  function updateItem(itemId: number, patch: Partial<LineItem>) {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, ...patch } : it));
  }

  function addItem() { setItems(prev => [...prev, newItem()]); }

  function removeItem(itemId: number) {
    setItems(prev => prev.length === 1 ? prev : prev.filter(it => it.id !== itemId));
  }

  // ── Totals ─────────────────────────────────────────────────────────────────

  const total = items.reduce((sum, it) => {
    const price = parseFloat(it.unitPrice) || 0;
    return sum + it.qty * price;
  }, 0);

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(status: 'draft' | 'sent') {
    if (!customer) {
      setCustomerError('Please select a customer before saving this invoice.');
      return;
    }
    const validItems = items.filter(it => it.product && parseFloat(it.unitPrice) > 0 && it.qty > 0);
    if (validItems.length === 0) {
      setItemsError('Add at least one valid line item before continuing.');
      return;
    }

    setCustomerError('');
    setItemsError('');

    if (shouldQueueOfflineNow()) {
      queueOfflineInvoice(status, validItems, total);
      return;
    }

    setSubmitting(status);
    try {
      const payload = {
        customer_id: customer.id,
        status,
        due_date: dueDate,
        note: note.trim() || undefined,
        items: validItems.map(it => ({
          product_id: it.product!.id,
          product_name: it.product!.name,
          qty: it.qty,
          unit_price: parseFloat(it.unitPrice),
        })),
        total,
      };

      const created = await invoicesAPI.create(payload);

      if (status === 'sent' && created.data?.id) {
        try {
          await invoicesAPI.send(created.data.id);
          showToast('Invoice emailed to customer.', 'success');
        } catch (err: any) {
          showToast(err?.response?.data?.error || 'Invoice saved, but email delivery failed.', 'error');
        }
      } else {
        showToast('Draft saved!', 'success');
      }

      setTimeout(() => router.push('/invoices'), 1200);
    } catch (error) {
      if (isOfflineLikeError(error)) {
        queueOfflineInvoice(status, validItems, total);
        return;
      }

      showToast('Failed to save invoice.', 'error');
      setSubmitting(null);
    }
  }

  // Close dropdowns on outside click
  useEffect(() => {
    function handle() {
      setCustomerOpen(false);
      setItems(prev => prev.map(it => ({ ...it, productOpen: false })));
    }
    document.addEventListener('click', handle);
    return () => document.removeEventListener('click', handle);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="page page-narrow">
      <div className="page-toolbar">
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', color: 'var(--text-primary)' }}
          aria-label="Go back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, flex: 1 }}>New Invoice</h1>
        <Link
          href="/invoices"
          className="btn btn-ghost btn-nowrap"
          style={{ textDecoration: 'none', padding: '8px 12px', minHeight: 38 }}
        >
          History
        </Link>
      </div>

      <div className="form-stack" style={{ gap: 20 }}>

        {/* ── SECTION 1: Customer ── */}
        <section>
          <p className="section-label" style={{ marginBottom: 10 }}>CUSTOMER</p>

          {/* Search */}
          <div
            style={{ position: 'relative' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="field-box">
              <label className="field-box-label">Search customer</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  className="field-box-input"
                  placeholder="Name or phone…"
                  value={customerSearch}
                  onChange={e => onCustomerInput(e.target.value)}
                  onFocus={() => { if (customerResults.length) setCustomerOpen(true); }}
                  autoComplete="off"
                />
                {customerSearch && (
                  <button onClick={() => { setCustomerSearch(''); setCustomer(null); setCustomerResults([]); setCustomerOpen(false); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Dropdown */}
            {customerOpen && (
              <div style={dropdownStyle}>
                {customerResults.map(c => (
                  <button
                    key={c.id}
                    onClick={() => selectCustomer(c)}
                    style={{
                      width: '100%', background: 'none', border: 'none',
                      padding: '12px 14px', textAlign: 'left',
                      color: 'var(--text-primary)', fontFamily: 'inherit',
                      cursor: 'pointer', borderBottom: '1px solid var(--border)',
                      display: 'flex', flexDirection: 'column', gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {c.phone || c.email || 'No contact details'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bill-to card */}
          {customer && (
            <div style={{
              marginTop: 10,
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 10, padding: '12px 14px',
            }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#10b981', margin: '0 0 4px' }}>Bill to</p>
              <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 2px' }}>{customer.name}</p>
              {customer.phone && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{customer.phone}</p>}
            </div>
          )}

          {customerError && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{customerError}</p>
          )}
          {customerSearchError && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{customerSearchError}</p>
          )}
        </section>

        {/* ── SECTION 2: Line items ── */}
        <section>
          <p className="section-label" style={{ marginBottom: 10 }}>ITEMS</p>

          {itemsError && (
            <p style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 10 }}>{itemsError}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((item, idx) => {
              const subtotal = (parseFloat(item.unitPrice) || 0) * item.qty;
              return (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12, padding: '12px 14px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                >
                  {/* Row header: index + remove */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Item {idx + 1}
                    </span>
                    <button
                      onClick={() => removeItem(item.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444', display: 'flex' }}
                      aria-label="Remove item"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6" /><path d="M14 11v6" />
                        <path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  </div>

                  {/* Product search */}
                  <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        className="field-box-input"
                        style={{ fontSize: 14 }}
                        placeholder="Search product…"
                        value={item.productSearch}
                        onChange={e => onProductInput(item.id, e.target.value)}
                        onFocus={() => { if (item.productResults.length) updateItem(item.id, { productOpen: true }); }}
                        autoComplete="off"
                      />
                    </div>
                    {item.productOpen && (
                      <div style={dropdownStyle}>
                        {item.productResults.map(p => (
                          <button
                            key={p.id}
                            onClick={() => selectProduct(item.id, p)}
                            style={{
                              width: '100%', background: 'none', border: 'none',
                              padding: '11px 14px', textAlign: 'left',
                              color: 'var(--text-primary)', fontFamily: 'inherit',
                              cursor: 'pointer', borderBottom: '1px solid var(--border)',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}
                          >
                            <span style={{ fontSize: 14 }}>{p.name}</span>
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>GH₵ {fmt(p.price)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {item.productError && (
                      <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{item.productError}</p>
                    )}
                  </div>

                  {/* Qty + Unit price + Subtotal */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 10 }}>
                    {/* Qty stepper */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        onClick={() => updateItem(item.id, { qty: Math.max(1, item.qty - 1) })}
                        style={{
                          width: 30, height: 30, borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--bg-base)', color: 'var(--text-primary)',
                          fontSize: 18, lineHeight: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >−</button>
                      <span style={{ fontSize: 15, fontWeight: 600, minWidth: 24, textAlign: 'center' }}>{item.qty}</span>
                      <button
                        onClick={() => updateItem(item.id, { qty: item.qty + 1 })}
                        style={{
                          width: 30, height: 30, borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--bg-base)', color: 'var(--text-primary)',
                          fontSize: 18, lineHeight: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >+</button>
                    </div>

                    {/* Unit price */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>GH₵</span>
                      <input
                        className="field-box-input"
                        style={{ fontSize: 14, textAlign: 'right' }}
                        type="number" inputMode="decimal" min="0" step="0.01"
                        placeholder="0.00"
                        value={item.unitPrice}
                        onChange={e => updateItem(item.id, { unitPrice: e.target.value })}
                      />
                    </div>

                    {/* Subtotal */}
                    <span style={{ fontSize: 14, fontWeight: 600, color: subtotal > 0 ? 'var(--text-primary)' : 'var(--text-muted)', textAlign: 'right', minWidth: 64 }}>
                      GH₵ {fmt(subtotal)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add item */}
          <button
            onClick={addItem}
            style={{
              marginTop: 10,
              width: '100%', height: 44,
              background: 'none',
              border: '1px dashed var(--border)',
              borderRadius: 10,
              color: 'var(--accent)',
              fontSize: 14, fontWeight: 500,
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add item
          </button>
        </section>

        {/* ── SECTION 3: Details ── */}
        <section>
          <p className="section-label" style={{ marginBottom: 10 }}>DETAILS</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Due date */}
            <div className="field-box">
              <label className="field-box-label">Due date</label>
              <input
                className="field-box-input"
                style={{ colorScheme: 'dark' }}
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>

            {/* Note */}
            <div className="field-box">
              <label className="field-box-label">Note <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
              <textarea
                className="field-box-input"
                style={{ resize: 'none', lineHeight: 1.5 }}
                rows={3}
                placeholder="Payment terms, delivery info…"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>
          </div>
        </section>
      </div>

      {/* ── Fixed footer ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#1a2332',
        borderTop: '1px solid var(--border)',
        padding: '14px 16px calc(14px + env(safe-area-inset-bottom))',
        zIndex: 50,
      }}>
        {/* Total */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>Total</span>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px' }}>
            GHS {fmt(total)}
          </span>
        </div>

        {/* Buttons */}
        <div className="action-row">
          <button
            onClick={() => handleSubmit('draft')}
            disabled={!!submitting}
            className="btn btn-secondary"
            style={{ flex: '1 1 140px' }}
          >
            {submitting === 'draft' ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            onClick={() => handleSubmit('sent')}
            disabled={!!submitting}
            className="btn btn-primary"
            style={{ flex: '1 1 140px' }}
          >
            {submitting === 'sent' ? 'Sending…' : 'Save & Send'}
          </button>
        </div>
      </div>
    </main>
  );
}
