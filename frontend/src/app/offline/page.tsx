'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/hooks/useToast';
import {
  countPendingSales,
  getPendingSales,
  retryPendingSale,
  type PendingSaleDraft,
} from '@/lib/posOffline';
import {
  hydratePosOfflineCache,
  syncPendingSales,
  syncSinglePendingSale,
} from '@/lib/posOfflineSync';

function formatWhen(ts: number) {
  return new Date(ts).toLocaleString('en-GH', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function statusLabel(status: PendingSaleDraft['status']) {
  if (status === 'failed') return 'Needs attention';
  if (status === 'syncing') return 'Syncing…';
  return 'Queued';
}

export default function OfflineQueuePage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<PendingSaleDraft[]>([]);
  const [summary, setSummary] = useState({ pending: 0, failed: 0 });
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  const refresh = useCallback(() => {
    setItems(getPendingSales());
    setSummary(countPendingSales());
  }, []);

  useEffect(() => {
    refresh();
    const onOutbox = () => refresh();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('bm:outbox', onOutbox);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('bm:outbox', onOutbox);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh]);

  async function runSyncAll() {
    if (!online) {
      showToast('You are offline. Queued sales stay saved until the network returns.', 'info');
      return;
    }
    setSyncing(true);
    try {
      await syncPendingSales();
      refresh();
      const next = countPendingSales();
      if (next.failed === 0 && next.pending === 0) {
        showToast('All queued sales synced.', 'success');
      } else if (next.failed > 0) {
        showToast('Some sales still need attention. See errors below.', 'info');
      }
    } finally {
      setSyncing(false);
    }
  }

  async function runRetry(id: string) {
    if (!online) {
      showToast('Go online to retry syncing this sale.', 'info');
      return;
    }
    retryPendingSale(id);
    refresh();
    setSyncing(true);
    try {
      await syncSinglePendingSale(id);
      await hydratePosOfflineCache();
      refresh();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="page page-content" style={{ paddingBottom: 100 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px', marginBottom: 6 }}>
          Offline queue
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
          Sales saved without internet stay here until they sync. Failed sales are kept — nothing is deleted automatically.
        </p>
      </div>

      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 16,
        flexWrap: 'wrap',
      }}>
        <div className="card" style={{ flex: 1, minWidth: 120, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Queued</p>
          <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 800 }}>{summary.pending}</p>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 120, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Failed</p>
          <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 800, color: summary.failed > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
            {summary.failed}
          </p>
        </div>
      </div>

      {!online ? (
        <div style={{
          padding: '12px 14px',
          borderRadius: 12,
          background: 'var(--warn-dim)',
          border: '1px solid rgba(245,158,11,0.25)',
          marginBottom: 16,
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}>
          You are offline. Queued sales are safe on this device and will sync when you reconnect.
        </div>
      ) : null}

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', marginBottom: 20 }}
        disabled={syncing || items.length === 0}
        onClick={runSyncAll}
      >
        {syncing ? 'Syncing…' : 'Sync all now'}
      </button>

      {items.length === 0 ? (
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>No queued offline sales.</p>
          <Link href="/pos" style={{ display: 'inline-block', marginTop: 14, color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>
            Open POS
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => (
            <div key={item.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  GHS {Number(item.payload.total).toFixed(2)} · {item.payload.payment_method}
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: item.status === 'failed' ? 'var(--danger)' : 'var(--text-muted)',
                }}>
                  {statusLabel(item.status)}
                </span>
              </div>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
                {item.payload.items.length} item(s) · {formatWhen(item.createdAt)}
              </p>
              {item.error ? (
                <p style={{
                  margin: '0 0 10px',
                  fontSize: 12,
                  color: 'var(--danger)',
                  lineHeight: 1.5,
                  background: 'var(--danger-dim)',
                  padding: '8px 10px',
                  borderRadius: 8,
                }}>
                  {item.error}
                </p>
              ) : null}
              {item.status === 'failed' ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                  disabled={syncing}
                  onClick={() => runRetry(item.id)}
                >
                  Retry sync
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
