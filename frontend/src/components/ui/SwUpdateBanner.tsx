'use client';

import { useEffect, useState } from 'react';

export default function SwUpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        setWaiting(reg.waiting);
        return;
      }

      reg.addEventListener('updatefound', () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener('statechange', () => {
          if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
            setWaiting(incoming);
            setDismissed(false); // re-show if a new update arrives after a dismiss
          }
        });
      });
    });

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloading) {
        reloading = true;
        window.location.reload();
      }
    });
  }, []);

  function applyUpdate() {
    if (!waiting) return;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  if (!waiting || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'var(--accent)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span style={{ flex: 1 }}>A new version of BizManager is available.</span>
      <button
        onClick={applyUpdate}
        style={{
          background: 'rgba(255,255,255,0.25)',
          border: 'none',
          borderRadius: 8,
          color: '#fff',
          padding: '6px 14px',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        Update now
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update banner"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.75)',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          padding: '4px 6px',
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}
