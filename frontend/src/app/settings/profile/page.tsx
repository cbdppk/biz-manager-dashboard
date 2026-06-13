'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function BusinessProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', address: '' });

  useEffect(() => {
    api.get('/settings')
      .then((res) => {
        const biz = res.data?.business;
        if (biz) {
          setFormData({ name: biz.name || '', phone: biz.phone || '', address: biz.address || '' });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await api.patch('/settings/profile', formData);
      setMessage({ type: 'success', text: 'Business profile updated successfully.' });
      setTimeout(() => router.back(), 1500);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="page page-narrow">
        <div className="skeleton skeleton-line" style={{ width: '40%', height: 28, marginBottom: 16 }} />
        <div className="skeleton skeleton-card" style={{ height: 260 }} />
      </main>
    );
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
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Business Profile</h1>
      </div>

      {message && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            borderColor: message.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)',
            background: message.type === 'error' ? 'var(--danger-dim)' : 'var(--accent-dim)',
            color: message.type === 'error' ? 'var(--danger-text)' : 'var(--accent)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card form-stack">
        <div>
          <label className="input-label">Business Name</label>
          <input
            type="text"
            required
            className="input"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div>
          <label className="input-label">Phone Number</label>
          <input
            type="tel"
            className="input"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div>
          <label className="input-label">Business Address</label>
          <textarea
            rows={3}
            className="input"
            style={{ resize: 'vertical', minHeight: 88 }}
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
        </div>
        <button type="submit" disabled={saving} className="btn btn-primary btn-block">
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </form>
    </main>
  );
}
