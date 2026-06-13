'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supportAPI } from '@/lib/api';

const TYPES = ['Bug', 'Feature request', 'Confusing flow', 'Payment issue', 'Data issue', 'Other'];
const AREAS = ['Dashboard', 'POS', 'Products', 'Customers', 'Sales', 'Reports', 'Billing', 'Other'];

interface FeedbackForm {
  type: string;
  area: string;
  message: string;
  contact: string;
}

function errorMessage(err: unknown) {
  if (typeof err === 'object' && err && 'response' in err) {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error || 'Could not submit feedback.';
  }
  return 'Could not submit feedback.';
}

export default function FeedbackPage() {
  const [form, setForm] = useState<FeedbackForm>({ type: '', area: '', message: '', contact: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FeedbackForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const initialType = new URLSearchParams(window.location.search).get('type') || '';
    if (initialType && TYPES.includes(initialType)) {
      setForm((prev) => ({ ...prev, type: initialType }));
    }
  }, []);

  const remaining = useMemo(() => Math.max(0, 10 - form.message.trim().length), [form.message]);

  function updateField<K extends keyof FeedbackForm>(key: K, value: FeedbackForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    setError('');
    setSuccess('');
  }

  function validateForm() {
    const nextErrors: Partial<Record<keyof FeedbackForm, string>> = {};
    if (!form.type) nextErrors.type = 'Choose a feedback type.';
    if (!form.area) nextErrors.area = 'Choose the page or area.';
    if (!form.message.trim()) nextErrors.message = 'Message is required.';
    else if (form.message.trim().length < 10) nextErrors.message = 'Message must be at least 10 characters.';
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess('');
    setError('');

    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const res = await supportAPI.submitFeedback({
        type: form.type,
        area: form.area,
        message: form.message.trim(),
        contact: form.contact.trim() || undefined,
      });
      setSuccess(res.data?.stored === false
        ? 'Feedback received. Storage is not fully configured yet, but the team can still follow up.'
        : 'Feedback submitted. Thank you for helping improve BizManager.');
      setForm({ type: '', area: '', message: '', contact: '' });
      setFieldErrors({});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page page-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Link href="/settings/support" className="btn btn-ghost" style={{ width: 40, minHeight: 40, padding: 0, textDecoration: 'none' }}>
          &lt;
        </Link>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Beta feedback
          </p>
          <h1 style={{ margin: 0 }}>Send Feedback</h1>
        </div>
      </div>

      <section className="card" style={{ padding: 16, marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Help us improve the beta</p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Share bugs, confusing flows, payment problems, data issues, and feature requests from inside your account.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {success && (
          <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)', borderRadius: 12, padding: 12, color: 'var(--accent)', fontSize: 13, fontWeight: 700 }}>
            {success}
          </div>
        )}
        {error && (
          <div style={{ background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.24)', borderRadius: 12, padding: 12, color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>
            {error}
          </div>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Feedback type</span>
          <select className="input" value={form.type} onChange={(event) => updateField('type', event.target.value)} style={{ borderColor: fieldErrors.type ? 'var(--danger)' : undefined }}>
            <option value="">Choose type</option>
            {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          {fieldErrors.type && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{fieldErrors.type}</span>}
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Page / area</span>
          <select className="input" value={form.area} onChange={(event) => updateField('area', event.target.value)} style={{ borderColor: fieldErrors.area ? 'var(--danger)' : undefined }}>
            <option value="">Choose area</option>
            {AREAS.map((area) => <option key={area} value={area}>{area}</option>)}
          </select>
          {fieldErrors.area && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{fieldErrors.area}</span>}
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Message</span>
          <textarea
            className="input"
            value={form.message}
            onChange={(event) => updateField('message', event.target.value)}
            placeholder="Tell us what happened, what you expected, and any affected records."
            rows={6}
            style={{ resize: 'vertical', borderColor: fieldErrors.message ? 'var(--danger)' : undefined }}
          />
          {fieldErrors.message ? (
            <span style={{ color: 'var(--danger)', fontSize: 12 }}>{fieldErrors.message}</span>
          ) : remaining > 0 ? (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{remaining} more character{remaining !== 1 ? 's' : ''} needed.</span>
          ) : null}
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Optional contact phone/email</span>
          <input
            className="input"
            value={form.contact}
            onChange={(event) => updateField('contact', event.target.value)}
            placeholder="Phone or email for follow-up"
            maxLength={120}
          />
        </label>

        <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: '100%', marginTop: 4 }}>
          {submitting ? 'Submitting...' : 'Submit Feedback'}
        </button>
      </form>
    </main>
  );
}
