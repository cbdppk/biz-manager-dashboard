'use client';

import { createContext, useMemo, useRef, useState } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export type ToastItem = {
  id: string;
  message: string;
  tone?: ToastTone;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CONFIG: Record<ToastTone, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  success: {
    color: '#10b981',
    bg: 'rgba(5,46,28,0.96)',
    border: 'rgba(16,185,129,0.25)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
  },
  error: {
    color: '#ef4444',
    bg: 'rgba(45,10,10,0.96)',
    border: 'rgba(239,68,68,0.25)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
  },
  info: {
    color: '#60a5fa',
    bg: 'rgba(13,31,60,0.96)',
    border: 'rgba(59,130,246,0.25)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
  },
};

function ToastCard({ toast }: { toast: ToastItem }) {
  const tone = toast.tone ?? 'info';
  const { icon, color, bg, border } = TONE_CONFIG[tone];

  return (
    <div
      style={{
        minWidth: 260,
        maxWidth: 'min(360px, calc(100vw - 32px)',
        padding: '11px 14px',
        borderRadius: 14,
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        animation: 'slideUp 250ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ color, flexShrink: 0 }}>{icon}</div>
      <p style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', margin: 0, lineHeight: 1.4 }}>
        {toast.message}
      </p>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const value = useMemo<ToastContextValue>(() => ({
    showToast(message, tone = 'info') {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, message, tone }].slice(-3));
      timersRef.current[id] = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        delete timersRef.current[id];
      }, 3500);
    },
  }), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 'calc(76px + env(safe-area-inset-bottom))',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          zIndex: 300,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => <ToastCard key={t.id} toast={t} />)}
      </div>
    </ToastContext.Provider>
  );
}
