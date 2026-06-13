'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { expensesAPI } from '@/lib/api';
import { formatDateGh, formatMoneyGhs } from '@/lib/display';
import { useToast } from '@/hooks/useToast';

interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  payment_method: string;
  expense_date: string;
  note?: string | null;
}

const CATEGORIES = ['general', 'rent', 'utilities', 'transport', 'salaries', 'supplies', 'marketing', 'other'];

function money(value: number) {
  return formatMoneyGhs(value).replace('GH₵', 'GHS');
}

function fmtDate(value: string) {
  return formatDateGh(value);
}

export default function ExpensesPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('month');
  const [category, setCategory] = useState('');

  async function load(nextRange = range, nextCategory = category) {
    setLoading(true);
    try {
      const now = new Date();
      let from: string | undefined;
      if (nextRange === 'today') from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
      if (nextRange === 'week') from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      if (nextRange === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      if (nextRange === 'all') from = undefined;

      const [listRes, summaryRes] = await Promise.all([
        expensesAPI.list({ from, category: nextCategory || undefined }),
        expensesAPI.summary({ from }),
      ]);
      setExpenses(listRes.data || []);
      setTotal(summaryRes.data?.total ?? 0);
    } catch {
      showToast('Could not load expenses.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="page page-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Expenses</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0' }}>
            Track costs to see true net profit
          </p>
        </div>
        <Link href="/expenses/new" className="btn btn-primary" style={{ textDecoration: 'none', padding: '10px 14px' }}>
          Add
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 6px' }}>
          Total expenses
        </p>
        <p style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>{money(total)}</p>
      </div>

      <div className="action-row" style={{ marginBottom: 10 }}>
        {[
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'all', label: 'All' },
        ].map(({ value, label }) => (
          <button
            key={value}
            className={`btn ${range === value ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: '1 1 72px', padding: '10px 6px', fontSize: 13 }}
            onClick={() => { setRange(value); load(value, category); }}
          >
            {label}
          </button>
        ))}
      </div>

      <select
        className="input"
        value={category}
        onChange={(e) => { setCategory(e.target.value); load(range, e.target.value); }}
        style={{ marginBottom: 14 }}
      >
        <option value="">All categories</option>
        {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>

      {loading ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {[1, 2, 3].map((n) => (
            <div key={n} className="skeleton" style={{ height: 68, borderRadius: 'var(--card-radius)' }} />
          ))}
        </div>
      ) : expenses.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No expenses recorded yet.</p>
          <button className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} onClick={() => router.push('/expenses/new')}>
            Record first expense
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="row-card"
              onClick={() => router.push(`/expenses/${expense.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{expense.title}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  {fmtDate(expense.expense_date)} · {expense.category}
                </p>
              </div>
              <strong style={{ color: 'var(--danger)' }}>{money(expense.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
