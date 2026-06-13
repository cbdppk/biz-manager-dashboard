'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { productsAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

const DISMISS_KEY = 'bm_lowstock_dismissed';

export default function LowStockBanner({ count: initialCount }: { count?: number }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [count, setCount] = useState(initialCount ?? 0);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const isDismissed = sessionStorage.getItem(DISMISS_KEY) != null;
    setDismissed(isDismissed);
    if (typeof initialCount === 'number') {
      setCount(initialCount);
      if (!isDismissed && initialCount > 0) setDismissed(false);
      return;
    }

    if (isDismissed) return;
    productsAPI.list({ low_stock: true, limit: 100 }).then((res) => {
      const items: unknown[] = res.data?.products ?? res.data ?? [];
      if (items.length > 0) { setCount(items.length); setDismissed(false); }
    }).catch(() => {
      showToast('Could not check low-stock products.', 'error');
    });
  }, [initialCount, showToast]);

  if (dismissed || count === 0) return null;

  function dismiss(e: React.MouseEvent) {
    e.stopPropagation();
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <div
      onClick={() => router.push('/products?filter=low_stock')}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--warn-dim)',
        border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: 12,
        padding: '11px 14px',
        cursor: 'pointer',
        marginBottom: 8,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: 'rgba(245,158,11,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--warn)', flexShrink: 0,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>

      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--warn)', margin: 0 }}>
          {count} product{count !== 1 ? 's' : ''} running low
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, marginTop: 1 }}>
          Tap to review stock levels
        </p>
      </div>

      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: 'none', border: 'none', padding: 4,
          cursor: 'pointer', display: 'flex', color: 'var(--text-muted)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
