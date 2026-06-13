'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { customersAPI } from '@/lib/api';

export default function EditCustomerPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '' });

  useEffect(() => {
    customersAPI.get(id)
      .then((res) => {
        const c = res.data?.customer || res.data;
        if (c) {
          setFormData({ name: c.name || '', phone: c.phone || '', email: c.email || '', address: c.address || '' });
        }
      })
      .catch(() => setError('Customer not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await customersAPI.update(id, formData);
      router.back();
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      setError(message || 'Failed to update customer.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="page page-narrow">
        <div className="skeleton" style={{ height: 48, borderRadius: 10, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 320, borderRadius: 'var(--card-radius)' }} />
      </main>
    );
  }

  if (error && !formData.name) {
    return (
      <main className="page page-narrow">
        <div className="page-toolbar">
          <button
            type="button"
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', color: 'var(--text-primary)' }}
            aria-label="Go back"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Error</h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{error}</p>
      </main>
    );
  }

  return (
    <main className="page page-narrow">
      <div className="page-toolbar">
        <button
          type="button"
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', color: 'var(--text-primary)' }}
          aria-label="Go back"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Edit Customer</h1>
      </div>

      {error && (
        <div className="card" style={{ padding: 14, marginBottom: 16, color: 'var(--danger)', fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-stack">
        <div className="field-box">
          <label className="field-box-label">Customer Name *</label>
          <input
            type="text"
            required
            className="field-box-input"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div className="field-box">
          <label className="field-box-label">Phone Number</label>
          <input
            type="tel"
            className="field-box-input"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div className="field-box">
          <label className="field-box-label">Email Address</label>
          <input
            type="email"
            className="field-box-input"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
        <div className="field-box">
          <label className="field-box-label">Address</label>
          <textarea
            rows={2}
            className="field-box-input"
            style={{ resize: 'none', lineHeight: 1.5 }}
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
        </div>
        <button type="submit" disabled={saving} className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
          {saving ? 'Saving…' : 'Update Customer'}
        </button>
      </form>
    </main>
  );
}
