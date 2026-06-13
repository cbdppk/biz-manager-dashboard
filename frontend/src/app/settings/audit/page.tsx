'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { auditAPI } from '@/lib/api';

interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  user?: {
    name?: string;
    email?: string;
    role?: string;
  } | null;
}

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'billing', label: 'Billing' },
  { id: 'products', label: 'Products' },
  { id: 'customers', label: 'Customers' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'staff', label: 'Staff/Auth' },
];

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatAction(action: string) {
  return (action || '-').replace(/\./g, ' ').replace(/_/g, ' ');
}

function metadataPreview(metadata?: Record<string, unknown> | null) {
  if (!metadata || Object.keys(metadata).length === 0) return '';
  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' - ');
}

function loadErrorMessage(err: unknown) {
  if (typeof err === 'object' && err && 'response' in err) {
    const response = (err as { response?: { status?: number } }).response;
    if (response?.status === 403) return 'Only owners and managers can view audit logs.';
  }
  return 'Could not load audit logs.';
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await auditAPI.list({ category: filter || undefined, limit: 50 });
      setLogs(res.data || []);
    } catch (err) {
      setError(loadErrorMessage(err));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const visibleLogs = useMemo(() => logs.filter(Boolean), [logs]);

  return (
    <main className="page page-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Link href="/settings" className="btn btn-ghost" style={{ width: 40, minHeight: 40, padding: 0, textDecoration: 'none' }}>
          &lt;
        </Link>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Owner / manager only
          </p>
          <h1 style={{ margin: 0 }}>Audit Logs</h1>
        </div>
      </div>

      <section className="card" style={{ padding: 16, marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Important business changes</p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Track changes to products, stock, customers, credit payments, expenses, billing, and staff actions.
        </p>
      </section>

      <div className="filter-chips" style={{ marginBottom: 10 }}>
        {FILTERS.map((item) => (
          <button
            key={item.id || 'all'}
            type="button"
            className={`btn btn-nowrap ${filter === item.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(item.id)}
            style={{ padding: '6px 14px', borderRadius: 20, minHeight: 38, fontSize: 13 }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          [1, 2, 3, 4].map((item) => (
            <div key={item} className="row-card row-card--flush" style={{ minHeight: 78 }}>
              <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 12 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 12, width: '45%', borderRadius: 4, marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 10, width: '80%', borderRadius: 4 }} />
              </div>
            </div>
          ))
        ) : error ? (
          <div style={{ padding: 18, textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px', color: 'var(--danger)', fontSize: 13, fontWeight: 800 }}>{error}</p>
            <button type="button" className="btn btn-secondary" onClick={loadLogs}>Retry</button>
          </div>
        ) : visibleLogs.length === 0 ? (
          <div style={{ padding: 22, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>No audit events yet.</p>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Important business changes will appear here.
            </p>
          </div>
        ) : visibleLogs.map((log) => {
          const metadata = metadataPreview(log.metadata);
          const actor = log.user?.name || log.user?.email || log.user?.role || 'System';

          return (
            <article key={log.id} className="row-card row-card--flush" style={{ alignItems: 'flex-start' }}>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: 'var(--purple-dim)',
                border: '1px solid rgba(139,92,246,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--purple)',
                fontWeight: 900,
                flexShrink: 0,
              }}>
                A
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 900, textTransform: 'capitalize' }}>
                    {formatAction(log.action)}
                  </p>
                  <span className="pill pill-muted">{log.entity_type || '-'}</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {log.summary || 'Business action recorded.'}
                </p>
                {metadata && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {metadata}
                  </p>
                )}
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                  {formatDateTime(log.created_at)} - {actor}
                </p>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
