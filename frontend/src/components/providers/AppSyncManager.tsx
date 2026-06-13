'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/hooks/useToast';
import { countAppOutbox, syncAppOutbox } from '@/lib/appOutbox';
import { countPendingSales } from '@/lib/posOffline';
import { syncPendingSales as syncPosPendingSales } from '@/lib/posOfflineSync';

import { resolveApiBaseUrl } from '@/lib/api';

const API_BASE_URL = resolveApiBaseUrl();
const ONLINE_CHECK_INTERVAL_MS = 30000;

function resolveHealthUrl() {
  if (API_BASE_URL.endsWith('/api')) {
    return `${API_BASE_URL.slice(0, -4)}/health`;
  }

  return `${API_BASE_URL.replace(/\/$/, '')}/health`;
}

async function canReachBackend() {
  try {
    const response = await fetch(resolveHealthUrl(), {
      method: 'GET',
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

function StatusPill({
  online,
  pending,
  failed,
  syncing,
  onSync,
}: {
  online: boolean;
  pending: number;
  failed: number;
  syncing: boolean;
  onSync: () => void;
}) {
  if (pending === 0 && failed === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      left: 16,
      right: 16,
      top: 'calc(env(safe-area-inset-top) + 18px)',
      zIndex: 48,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{
        maxWidth: 460,
        width: '100%',
        background: 'rgba(8,13,26,0.92)',
        color: '#fff',
        border: '1px solid rgba(148,163,184,0.18)',
        borderRadius: 16,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: 'var(--shadow-md)',
        pointerEvents: 'auto',
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          background: !online ? 'rgba(245,158,11,0.18)' : failed > 0 ? 'rgba(239,68,68,0.18)' : 'rgba(59,130,246,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {!online ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            </svg>
          ) : failed > 0 ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>
            {!online && pending > 0
              ? 'Queued changes are saved offline'
              : failed > 0
                ? 'Some queued changes need attention'
                : 'Queued changes are waiting to sync'}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
            {!online && pending > 0
              ? `${pending} queued locally · will sync when your connection returns`
              : `${pending} queued · ${failed} failed`}
          </p>
        </div>
        <Link href="/offline" style={{ color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
          View
        </Link>
        {online && (
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            style={{
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              padding: '8px 12px',
              cursor: syncing ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AppSyncManager() {
  const { showToast } = useToast();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState({ pending: 0, failed: 0 });
  const syncInFlight = useRef(false);
  const checkingOnline = useRef(false);

  const refreshSummary = useCallback(() => {
    const app = countAppOutbox();
    const pos = countPendingSales();
    setSummary({
      pending: app.pending + pos.pending,
      failed: app.failed + pos.failed,
    });
  }, []);

  const runSync = useCallback(async (opts?: { silent?: boolean }) => {
    if (syncInFlight.current || typeof navigator !== 'undefined' && navigator.onLine === false) {
      refreshSummary();
      return;
    }

    syncInFlight.current = true;
    setSyncing(true);
    try {
      await syncAppOutbox();
      await syncPosPendingSales();
      refreshSummary();
      if (!opts?.silent) {
        const next = countAppOutbox();
        const pos = countPendingSales();
        if (next.pending + next.failed + pos.pending + pos.failed === 0) {
          showToast('Queued changes synced.', 'success');
        } else {
          showToast('Some queued changes still need attention.', 'info');
        }
      }
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
      refreshSummary();
    }
  }, [refreshSummary, showToast]);

  const reconcileOnlineState = useCallback(async () => {
    if (checkingOnline.current) return;

    checkingOnline.current = true;
    try {
      const reachable = await canReachBackend();
      const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setOnline(reachable || !browserOffline);
      if (reachable) runSync({ silent: true });
    } finally {
      checkingOnline.current = false;
    }
  }, [runSync]);

  useEffect(() => {
    refreshSummary();
    const handleOutbox = () => refreshSummary();
    const handleOnline = () => {
      setOnline(true);
      runSync({ silent: true });
      reconcileOnlineState();
    };
    const handleOffline = () => {
      setOnline(false);
      reconcileOnlineState();
    };
    const handleVisibility = () => {
      if (!document.hidden) reconcileOnlineState();
    };

    window.addEventListener('bm:outbox', handleOutbox);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', reconcileOnlineState);
    window.addEventListener('pageshow', reconcileOnlineState);
    document.addEventListener('visibilitychange', handleVisibility);

    if (navigator.onLine) {
      runSync({ silent: true });
    }
    reconcileOnlineState();
    const interval = window.setInterval(reconcileOnlineState, ONLINE_CHECK_INTERVAL_MS);

    return () => {
      window.removeEventListener('bm:outbox', handleOutbox);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', reconcileOnlineState);
      window.removeEventListener('pageshow', reconcileOnlineState);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
    };
  }, [reconcileOnlineState, refreshSummary, runSync]);

  return (
    <StatusPill
      online={online}
      pending={summary.pending}
      failed={summary.failed}
      syncing={syncing}
      onSync={() => runSync()}
    />
  );
}
