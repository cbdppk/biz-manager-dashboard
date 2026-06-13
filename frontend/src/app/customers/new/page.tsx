'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { customersAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import { isOfflineLikeError, queueAppMutation, shouldQueueOfflineNow } from '@/lib/appOutbox';

interface FormState {
  name: string;
  phone: string;
  email: string;
  address: string;
  credit_limit: string;
}

const INITIAL: FormState = {
  name: '',
  phone: '',
  email: '',
  address: '',
  credit_limit: '0',
};

export default function NewCustomerPage() {
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
    if (!form.name.trim()) e.name = 'Full name is required';
    if (!form.phone.trim()) e.phone = 'Phone number is required';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email address';
    if (Number(form.credit_limit) < 0) e.credit_limit = 'Credit limit cannot be negative';
    return e;
  }

  function queueOfflineCustomer() {
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      credit_limit: Number(form.credit_limit),
    };

    queueAppMutation('create_customer', payload);
    showToast('Customer saved offline. It will sync automatically.', 'success');
    setForm(INITIAL);
    setErrors({});
    setSubmitting(false);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    if (shouldQueueOfflineNow()) {
      queueOfflineCustomer();
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        credit_limit: Number(form.credit_limit),
      };

      const res = await customersAPI.create(payload);
      const newId = res.data?.id ?? res.data?.customer?.id;
      showToast('Customer added!', 'success');
      setTimeout(() => {
        if (newId) router.push(`/customers/${newId}`);
        else router.push('/customers');
      }, 1000);
    } catch (error) {
      if (isOfflineLikeError(error)) {
        queueOfflineCustomer();
        return;
      }

      showToast('Failed to save customer.', 'error');
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
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>New Customer</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="form-stack">
        <div className={`field-box${errors.name ? ' field-box--error' : ''}`}>
          <label className="field-box-label">Full Name *</label>
          <input
            className="field-box-input"
            placeholder="e.g. Sample Client"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            autoFocus
          />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>

        <div className={`field-box${errors.phone ? ' field-box--error' : ''}`}>
          <label className="field-box-label">Phone *</label>
          <input
            className="field-box-input"
            type="tel"
            inputMode="tel"
            placeholder="e.g. 0000000000"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
          {errors.phone && <p className="field-error">{errors.phone}</p>}
        </div>

        <div className={`field-box${errors.email ? ' field-box--error' : ''}`}>
          <label className="field-box-label">Email <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
          <input
            className="field-box-input"
            type="email"
            inputMode="email"
            placeholder="e.g. demo@example.com"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
          {errors.email && <p className="field-error">{errors.email}</p>}
        </div>

        <div className="field-box">
          <label className="field-box-label">Address <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
          <textarea
            className="field-box-input"
            style={{ resize: 'none', lineHeight: 1.5 }}
            rows={2}
            placeholder="e.g. Osu, Accra"
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </div>

        <div className={`field-box${errors.credit_limit ? ' field-box--error' : ''}`}>
          <label className="field-box-label">Credit Limit</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>GH₵</span>
            <input
              className="field-box-input"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={form.credit_limit}
              onChange={(e) => set('credit_limit', e.target.value)}
            />
          </div>
          {errors.credit_limit && <p className="field-error">{errors.credit_limit}</p>}
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Max credit allowed. 0 = no credit</p>
        </div>

        <button type="submit" disabled={submitting} className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
          {submitting ? 'Saving…' : 'Save Customer'}
        </button>
      </form>
    </main>
  );
}
