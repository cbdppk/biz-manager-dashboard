'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { expensesAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const CATEGORIES = ['general', 'rent', 'utilities', 'transport', 'salaries', 'supplies', 'marketing', 'other'];

interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  payment_method: string;
  expense_date: string;
  note?: string | null;
}

export default function ExpenseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [form, setForm] = useState<Expense | null>(null);

  useEffect(() => {
    expensesAPI.get(params.id)
      .then((res) => setForm(res.data))
      .catch(() => showToast('Expense not found.', 'error'))
      .finally(() => setLoading(false));
  }, [params.id, showToast]);

  function setField(key: keyof Expense, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;

    setSaving(true);
    try {
      await expensesAPI.update(form.id, {
        title: form.title.trim(),
        category: form.category,
        amount: Number(form.amount),
        payment_method: form.payment_method,
        expense_date: form.expense_date,
        note: form.note?.trim() || null,
      });
      showToast('Expense updated.', 'success');
      window.dispatchEvent(new Event('bizmanager-data-changed'));
    } catch {
      showToast('Could not update expense.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!form) return;
    setDeleting(true);
    try {
      await expensesAPI.delete(form.id);
      showToast('Expense deleted.', 'success');
      window.dispatchEvent(new Event('bizmanager-data-changed'));
      router.push('/expenses');
    } catch {
      showToast('Could not delete expense.', 'error');
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  }

  if (loading) {
    return (
      <main className="page page-content">
        <div className="skeleton" style={{ height: 320, borderRadius: 'var(--card-radius)' }} />
      </main>
    );
  }

  if (!form) {
    return (
      <main className="page page-content">
        <div className="card">Expense not found.</div>
      </main>
    );
  }

  return (
    <main className="page page-content">
      <div className="page-toolbar">
        <button type="button" className="btn btn-ghost" onClick={() => router.back()} aria-label="Go back">
          ←
        </button>
        <h1 style={{ margin: 0, flex: 1 }}>Edit Expense</h1>
      </div>

      <form onSubmit={handleSave} className="card form-stack">
        <div>
          <label className="input-label">Title</label>
          <input className="input" value={form.title} onChange={(e) => setField('title', e.target.value)} />
        </div>
        <div>
          <label className="input-label">Amount (GHS)</label>
          <input className="input" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setField('amount', e.target.value)} />
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
          <label className="input-label">Note</label>
          <textarea className="input" rows={3} value={form.note || ''} onChange={(e) => setField('note', e.target.value)} />
        </div>
        <div className="action-stack">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="btn btn-danger btn-block" disabled={deleting} onClick={() => setConfirmDeleteOpen(true)}>
            {deleting ? 'Deleting…' : 'Delete expense'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete this expense?"
        message="This removes the expense from reports and profit calculations. This action cannot be undone."
        confirmLabel="Delete expense"
        tone="danger"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </main>
  );
}
