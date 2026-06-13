'use client';

type PullToRefreshIndicatorProps = {
  pullDistance: number;
  refreshing: boolean;
  ready: boolean;
};

export default function PullToRefreshIndicator({
  pullDistance,
  refreshing,
  ready,
}: PullToRefreshIndicatorProps) {
  if (pullDistance <= 0 && !refreshing) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        top: 10,
        transform: `translate(-50%, ${Math.min(pullDistance, 40)}px)`,
        zIndex: 160,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          minWidth: 160,
          borderRadius: 999,
          padding: '9px 14px',
          border: '1px solid var(--border)',
          background: 'rgba(17,24,39,0.92)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: refreshing ? 'rotate(180deg)' : ready ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 180ms ease' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
          {refreshing ? 'Refreshing…' : ready ? 'Release to refresh' : 'Pull to refresh'}
        </span>
      </div>
    </div>
  );
}
