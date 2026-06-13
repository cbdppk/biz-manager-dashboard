'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { expensesAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

const CATEGORIES = ['general', 'rent', 'utilities', 'transport', 'salaries', 'supplies', 'marketing', 'other'];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewExpensePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: 'general',
    amount: '',
    payment_method: 'cash',
    expense_date: todayIsoDate(),
    note: '',
  });

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.title.trim()) {
      showToast('Enter an expense title.', 'error');
      return;
    }
    if (!amount || amount < 0) {
      showToast('Enter a valid amount.', 'error');
      return;
    }

    setSaving(true);
    try {
      await expensesAPI.create({
        title: form.title.trim(),
        category: form.category,
        amount,
        payment_method: form.payment_method,
        expense_date: form.expense_date,
        note: form.note.trim() || null,
      });
      showToast('Expense recorded.', 'success');
      window.dispatchEvent(new Event('bizmanager-data-changed'));
      router.push('/expenses');
    } catch {
      showToast('Could not save expense.', 'error');
    } finally {
      setSaving(false);
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
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>New Expense</h1>
      </div>

      <form onSubmit={handleSubmit} className="card form-stack">
        <div>
          <label className="input-label">Title</label>
          <input className="input" value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="Rent, fuel, supplies..." />
        </div>
        <div>
          <label className="input-label">Amount (GHS)</label>
          <input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => setField('amount', e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="input-label">Category</label>
          <select className="input" value={form.category} onChange={(e) => setField('category', e.target.value)}>
            {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label className="input-label">Payment method</label>
          <select className="input" value={form.payment_method} onChange={(e) => setField('payment_method', e.target.value)}>
            {['cash', 'momo', 'card', 'bank', 'other'].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label className="input-label">Date</label>
          <input className="input" type="date" value={form.expense_date} onChange={(e) => setField('expense_date', e.target.value)} />
        </div>
        <div>
          <label className="input-label">Note (optional)</label>
          <textarea className="input" rows={3} value={form.note} onChange={(e) => setField('note', e.target.value)} placeholder="Extra details" />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {saving ? 'Saving…' : 'Save expense'}
        </button>
      </form>
    </main>
  );
}
