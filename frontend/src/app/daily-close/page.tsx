'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ordersAPI, productsAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface Meal {
  id: string;
  name: string;
  price: number;
  cost_price?: number | null;
  is_available?: boolean;
}

type PaymentMethod = 'cash' | 'momo' | 'card' | 'credit';

const paymentMethods: PaymentMethod[] = ['cash', 'momo', 'card', 'credit'];

function money(value: number) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

export default function DailyClosePage() {
  const { showToast } = useToast();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await productsAPI.list({ menu_only: true, limit: 250 });
        setMeals((res.data || []).filter((meal: Meal) => meal.is_available !== false));
      } catch {
        showToast('Could not load meals.', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  const selectedItems = useMemo(() => meals
    .map((meal) => ({
      meal,
      qty: Number(quantities[meal.id] || 0),
    }))
    .filter((item) => item.qty > 0), [meals, quantities]);

  const revenue = selectedItems.reduce((sum, item) => sum + (Number(item.meal.price || 0) * item.qty), 0);
  const estimatedCost = selectedItems.reduce((sum, item) => sum + (Number(item.meal.cost_price || 0) * item.qty), 0);
  const grossProfit = revenue - estimatedCost;

  function setQty(mealId: string, value: string) {
    setQuantities((current) => ({ ...current, [mealId]: value }));
  }

  async function submitClose() {
    if (selectedItems.length === 0) {
      showToast('Enter at least one meal sold.', 'error');
      return;
    }

    setSaving(true);
    try {
      await ordersAPI.dailyClose({
        payment_method: paymentMethod,
        note: `End-of-day food sales ${new Date().toLocaleDateString('en-GH')}`,
        items: selectedItems.map(({ meal, qty }) => ({
          product_id: meal.id,
          qty,
          unit_price: Number(meal.price || 0),
        })),
      });
      showToast('Day closed and sales recorded.', 'success');
      setQuantities({});
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Could not close the day.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page page-content">
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Close Day</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>Record meals sold after service</p>
        </div>
        <Link href="/reports" className="btn btn-secondary" style={{ textDecoration: 'none', minHeight: 38, padding: '8px 12px' }}>
          Reports
        </Link>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <section className="card" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 800 }}>Revenue</p>
              <strong>{money(revenue)}</strong>
            </div>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 800 }}>Est. cost</p>
              <strong>{money(estimatedCost)}</strong>
            </div>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 800 }}>Gross</p>
              <strong style={{ color: grossProfit >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{money(grossProfit)}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {paymentMethods.map((method) => (
              <button
                key={method}
                className={`btn ${paymentMethod === method ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPaymentMethod(method)}
                style={{ flex: '1 1 74px' }}
              >
                {method}
              </button>
            ))}
          </div>
        </section>

        {loading ? (
          <div className="card">Loading meals...</div>
        ) : meals.length === 0 ? (
          <section className="card" style={{ textAlign: 'center', display: 'grid', gap: 10 }}>
            <h2>No meals yet</h2>
            <p style={{ color: 'var(--text-muted)' }}>Add meals to the menu before closing the day.</p>
            <Link href="/menu" className="btn btn-primary" style={{ textDecoration: 'none' }}>Open Menu</Link>
          </section>
        ) : (
          <section className="card" style={{ display: 'grid', gap: 10 }}>
            <h2>Meals Sold</h2>
            {meals.map((meal) => {
              const qty = Number(quantities[meal.id] || 0);
              return (
                <div key={meal.id} className="row-card" style={{ cursor: 'default', minHeight: 70 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong className="truncate-1" style={{ display: 'block' }}>{meal.name}</strong>
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '2px 0 0' }}>
                      {money(Number(meal.price || 0))} each · cost {money(Number(meal.cost_price || 0))}
                    </p>
                  </div>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={quantities[meal.id] || ''}
                    onChange={(event) => setQty(meal.id, event.target.value)}
                    placeholder="0"
                    style={{ width: 76, textAlign: 'center' }}
                    aria-label={`${meal.name} quantity sold`}
                  />
                  {qty > 0 && <span className="pill pill-green">{money(qty * Number(meal.price || 0))}</span>}
                </div>
              );
            })}
          </section>
        )}

        <button className="btn btn-primary" disabled={saving || selectedItems.length === 0} onClick={submitClose}>
          {saving ? 'Recording...' : 'Record End-of-Day Sales'}
        </button>
      </div>
    </main>
  );
}
