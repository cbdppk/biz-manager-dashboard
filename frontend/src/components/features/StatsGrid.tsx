'use client';

interface StatsGridProps {
  revenue: number;
  transactions: number;
  avgOrder: number;
  loading?: boolean;
}

function fmt(n: number) {
  return `GH₵ ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StatsGrid({ revenue, transactions, avgOrder, loading }: StatsGridProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
      <div className="stat-card" style={{ gridColumn: '1 / -1' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Today's Revenue</p>
        <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.5px' }}>
          {loading ? '—' : fmt(revenue)}
        </p>
      </div>
      <div className="stat-card">
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Sales</p>
        <p style={{ fontSize: 22, fontWeight: 700 }}>{loading ? '—' : transactions}</p>
      </div>
      <div className="stat-card">
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Avg. Order</p>
        <p style={{ fontSize: 22, fontWeight: 700 }}>{loading ? '—' : fmt(avgOrder)}</p>
      </div>
    </div>
  );
}
