'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { productsAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { isOfflineLikeError, queueAppMutation, shouldQueueOfflineNow } from '@/lib/appOutbox';

interface FormState {
  name: string;
  sku: string;
  price: string;
  cost_price: string;
  stock_qty: string;
  reorder_level: string;
  unit: string;
}

const INITIAL: FormState = {
  name: '',
  sku: '',
  price: '',
  cost_price: '',
  stock_qty: '0',
  reorder_level: '5',
  unit: 'piece',
};

const UNITS = ['piece', 'kg', 'litre', 'box', 'pack', 'dozen'];

export default function NewProductPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate() {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.price || Number(form.price) <= 0) e.price = 'Enter a valid selling price';
    if (form.cost_price && Number(form.cost_price) < 0) e.cost_price = 'Cost price cannot be negative';
    if (Number(form.stock_qty) < 0) e.stock_qty = 'Stock quantity cannot be negative';
    if (Number(form.reorder_level) < 0) e.reorder_level = 'Reorder level cannot be negative';
    return e;
  }

  function queueOfflineProduct() {
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      price: Number(form.price),
      cost_price: form.cost_price ? Number(form.cost_price) : undefined,
      stock_qty: Number(form.stock_qty),
      reorder_level: Number(form.reorder_level),
      unit: form.unit,
    };

    queueAppMutation('create_product', payload);
    showToast('Product saved offline. It will sync automatically.', 'success');
    setForm(INITIAL);
    setErrors({});
    setSubmitting(false);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    if (shouldQueueOfflineNow()) {
      queueOfflineProduct();
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        price: Number(form.price),
        cost_price: form.cost_price ? Number(form.cost_price) : undefined,
        stock_qty: Number(form.stock_qty),
        reorder_level: Number(form.reorder_level),
        unit: form.unit,
      };

      await productsAPI.create(payload);
      showToast('Product added!', 'success');
      setTimeout(() => router.push('/products'), 1200);
    } catch (error) {
      if (isOfflineLikeError(error)) {
        queueOfflineProduct();
        return;
      }

      showToast('Failed to save product.', 'error');
      setSubmitting(false);
    }
  }

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
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Add Product</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="form-stack">
        <div className={`field-box${errors.name ? ' field-box--error' : ''}`}>
          <label className="field-box-label">Name *</label>
          <input
            className="field-box-input"
            placeholder="e.g. Indomie Noodles"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            autoFocus
          />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>

        <div className="field-box">
          <label className="field-box-label">SKU <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
          <input
            className="field-box-input"
            placeholder="e.g. NDL-001"
            value={form.sku}
            onChange={(e) => set('sku', e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className={`field-box${errors.price ? ' field-box--error' : ''}`}>
            <label className="field-box-label">Selling Price *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>GH₵</span>
              <input
                className="field-box-input"
                type="number" inputMode="decimal" min="0" step="0.01"
                placeholder="0.00"
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
              />
            </div>
            {errors.price && <p className="field-error">{errors.price}</p>}
          </div>

          <div className={`field-box${errors.cost_price ? ' field-box--error' : ''}`}>
            <label className="field-box-label">Cost Price</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>GH₵</span>
              <input
                className="field-box-input"
                type="number" inputMode="decimal" min="0" step="0.01"
                placeholder="0.00"
                value={form.cost_price}
                onChange={(e) => set('cost_price', e.target.value)}
              />
            </div>
            {errors.cost_price && <p className="field-error">{errors.cost_price}</p>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className={`field-box${errors.stock_qty ? ' field-box--error' : ''}`}>
            <label className="field-box-label">Stock Qty</label>
            <input
              className="field-box-input"
              type="number" inputMode="numeric" min="0"
              value={form.stock_qty}
              onChange={(e) => set('stock_qty', e.target.value)}
            />
            {errors.stock_qty && <p className="field-error">{errors.stock_qty}</p>}
          </div>

          <div className={`field-box${errors.reorder_level ? ' field-box--error' : ''}`}>
            <label className="field-box-label">Reorder Level</label>
            <input
              className="field-box-input"
              type="number" inputMode="numeric" min="0"
              value={form.reorder_level}
              onChange={(e) => set('reorder_level', e.target.value)}
            />
            {errors.reorder_level && <p className="field-error">{errors.reorder_level}</p>}
          </div>
        </div>

        <div className="field-box">
          <label className="field-box-label">Unit</label>
          <select
            value={form.unit}
            onChange={(e) => set('unit', e.target.value)}
            className="field-box-input field-box-input--select"
          >
            {UNITS.map((u) => (
              <option key={u} value={u} style={{ background: 'var(--bg-surface)' }}>
                {u.charAt(0).toUpperCase() + u.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" disabled={submitting} className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
          {submitting ? 'Saving…' : 'Save Product'}
        </button>
      </form>
    </main>
  );
}
