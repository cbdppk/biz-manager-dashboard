'use client';

import { useEffect, useRef, useState } from 'react';

type Options = {
  enabled?: boolean;
  threshold?: number;
};

export function usePullToRefresh(onRefresh: () => Promise<void> | void, options: Options = {}) {
  const { enabled = true, threshold = 76 } = options;
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (event: TouchEvent) => {
      if (window.scrollY > 0 || refreshing) return;
      startYRef.current = event.touches[0]?.clientY ?? null;
      activeRef.current = true;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!activeRef.current || startYRef.current == null) return;
      if (window.scrollY > 0) return;

      const delta = (event.touches[0]?.clientY ?? 0) - startYRef.current;
      if (delta <= 0) return;

      const limited = Math.min(delta * 0.55, threshold + 28);
      setPullDistance(limited);

      if (limited > 0) {
        event.preventDefault();
      }
    };

    const handleTouchEnd = async () => {
      activeRef.current = false;
      startYRef.current = null;

      if (pullDistance < threshold || refreshing) {
        setPullDistance(0);
        return;
      }

      setRefreshing(true);
      setPullDistance(0);

      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, onRefresh, pullDistance, refreshing, threshold]);

  return {
    pullDistance,
    refreshing,
    ready: pullDistance >= threshold,
  };
}
