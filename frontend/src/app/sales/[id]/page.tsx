'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { salesAPI } from '@/lib/api';

function safeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: unknown) {
  return `GH₵ ${safeNumber(value).toFixed(2)}`;
}

function formatDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export default function SaleDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [sale, setSale] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    salesAPI.get(id)
      .then((res) => setSale(res.data))
      .catch(() => setSale(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <main className="page page-content">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.back()} className="text-muted text-2xl leading-none">&lt;</button>
          <h1 className="text-lg font-semibold text-primary">Loading Sale...</h1>
        </div>
        <div className="skeleton h-32 rounded-[10px] mb-4"></div>
        <div className="skeleton h-64 rounded-[10px]"></div>
      </main>
    );
  }

  if (!sale) {
    return (
      <main className="page page-content">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.back()} className="text-muted text-2xl leading-none">&lt;</button>
          <h1 className="text-lg font-semibold text-primary">Sale Not Found</h1>
        </div>
        <p className="text-secondary text-sm">This sale does not exist or was deleted.</p>
      </main>
    );
  }

  const balance = safeNumber(sale.balance);

  return (
    <main className="page page-content">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="text-muted text-2xl leading-none">&lt;</button>
        <h1 className="text-lg font-semibold text-primary flex-1">Sale Details</h1>
        <span className={`pill ${balance > 0 ? 'pill-warn' : 'pill-green'}`}>
          {balance > 0 ? 'Credit' : 'Paid'}
        </span>
      </div>

      <div className="card p-4 mb-6">
        <p className="text-[13px] text-secondary mb-1">Total Amount</p>
        <p className="text-2xl font-bold text-primary mb-4">{formatMoney(sale.total)}</p>

        <div className="grid grid-cols-2 gap-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Amount Paid</p>
            <p className="text-sm font-medium text-primary mt-1">{formatMoney(sale.amount_paid)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Balance Owed</p>
            <p className={`text-sm font-medium mt-1 ${balance > 0 ? 'text-warn' : 'text-primary'}`}>
              {formatMoney(balance)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Payment Method</p>
            <p className="text-sm font-medium text-primary mt-1 capitalize">{sale.payment_method || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Date</p>
            <p className="text-sm font-medium text-primary mt-1">{formatDate(sale.created_at)}</p>
          </div>
        </div>
      </div>

      {sale.customer && (
        <div className="mb-6">
          <h2 className="section-label mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Customer</h2>
          <div className="card p-4">
            <p className="font-medium text-primary">{sale.customer.name}</p>
            {sale.customer.phone && <p className="text-[13px] text-secondary mt-1">{sale.customer.phone}</p>}
          </div>
        </div>
      )}

      <div>
        <h2 className="section-label mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Items ({sale.items?.length || 0})</h2>
        <div className="card overflow-hidden">
          {sale.items?.map((item: any, idx: number) => (
            <div key={idx} className={`p-4 ${idx !== sale.items.length - 1 ? 'border-b border-[#334155]' : ''}`}>
              <div className="flex justify-between mb-1 gap-3">
                <p className="font-medium text-primary">{item.name || 'Item'}</p>
                <p className="font-medium text-primary">{formatMoney(item.subtotal)}</p>
              </div>
              <div className="flex justify-between text-[13px] text-secondary gap-3">
                <p>{safeNumber(item.qty)} x {formatMoney(item.unit_price)}</p>
                {safeNumber(item.discount) > 0 && <p className="text-warn">Discount: {formatMoney(item.discount)}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}