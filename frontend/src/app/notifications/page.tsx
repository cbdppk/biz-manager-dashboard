'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import {
  getNotifications,
  markRead,
  markAllRead,
  clearAll,
  addNotification,
  type Notification,
  type NotifType,
} from '@/lib/notifications';

const CASHIER_HIDDEN_TYPES = new Set<NotifType>(['billing', 'ai']);

/* ── Icons ─────────────────────────────────────────────────── */
function NotifIcon({ type }: { type: NotifType }) {
  const configs: Record<NotifType, { icon: React.ReactNode; color: string; bg: string }> = {
    sale: {
      color: '#10b981',
      bg: 'rgba(16,185,129,0.12)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
      ),
    },
    stock: {
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.12)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
    },
    billing: {
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.12)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      ),
    },
    system: {
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.12)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      ),
    },
    ai: {
      color: '#a78bfa',
      bg: 'rgba(167,139,250,0.12)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9.5 2.5L11 10l7.5 1.5L11 13l-1.5 7.5L8 13 .5 11.5 8 10z" />
        </svg>
      ),
    },
  };

  const { icon, color, bg } = configs[type] ?? configs.system;

  return (
    <div style={{
      width: 38, height: 38, borderRadius: 11,
      background: bg, color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {icon}
    </div>
  );
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TYPE_LABELS: Record<NotifType, string> = {
  sale: 'Sale',
  stock: 'Stock',
  billing: 'Billing',
  system: 'System',
  ai: 'AI',
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<NotifType | 'all'>('all');
  const [role, setRole] = useState('');

  function reload(nextRole = role) {
    const items = getNotifications();
    const visible = nextRole === 'cashier'
      ? items.filter((item) => !CASHIER_HIDDEN_TYPES.has(item.type))
      : items;
    setNotifications(visible);
  }

  useEffect(() => {
    api.get('/auth/me')
      .then((res) => {
        const nextRole = res.data?.user?.role ?? '';
        setRole(nextRole);
        reload(nextRole);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  useEffect(() => {
    if (!role) return;
    reload();

    /* Seed demo notifications if empty */
    if (getNotifications().length === 0) {
      addNotification({ type: 'sale', title: 'New sale recorded', body: 'GH₵ 145.00 from Sample Client via MoMo.', href: '/sales' });
      addNotification({ type: 'stock', title: 'Low stock alert', body: '3 products are running below threshold.', href: '/products?filter=low_stock' });
      addNotification({ type: 'ai', title: 'AI insight ready', body: 'Your weekly sales performance analysis is available.', href: '/sales' });
      addNotification({ type: 'system', title: 'Welcome to BizManager', body: 'Your account is set up and ready to use.', href: '/dashboard' });
      reload();
    }

    const handler = () => reload();
    window.addEventListener('bm:notification', handler);
    window.addEventListener('bm:notification:read', handler);
    return () => {
      window.removeEventListener('bm:notification', handler);
      window.removeEventListener('bm:notification:read', handler);
    };
  }, []);

  function handleMarkRead(id: string) {
    markRead(id);
    reload();
  }

  function handleMarkAll() {
    markAllRead();
    reload();
  }

  function handleClear() {
    clearAll();
    reload();
  }

  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.type === filter);
  const unread = notifications.filter(n => !n.read).length;

  const FILTERS: Array<NotifType | 'all'> = ['all', 'sale', 'stock', 'billing', 'ai', 'system'];

  return (
    <main className="page page-content">
      {/* ── Header ────────────────────────────────────── */}
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', padding: 4, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 17, margin: 0 }}>Notifications</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {unread > 0 && (
            <button
              onClick={handleMarkAll}
              style={{
                background: 'none', border: 'none',
                color: 'var(--accent)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={handleClear}
              style={{
                background: 'none', border: 'none',
                color: 'var(--text-muted)', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Filter tabs ───────────────────────────────── */}
      <div className="filter-chips" style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => {
          const count = f === 'all'
            ? notifications.filter(n => !n.read).length
            : notifications.filter(n => n.type === f && !n.read).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`btn btn-nowrap ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                minHeight: 38,
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {f === 'all' ? 'All' : TYPE_LABELS[f]}
              {count > 0 && (
                <span style={{
                  background: filter === f ? 'rgba(255,255,255,0.3)' : 'var(--accent-dim)',
                  color: filter === f ? '#fff' : 'var(--accent)',
                  borderRadius: 10, padding: '0 5px', fontSize: 10, fontWeight: 800,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Notification list ─────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 20px',
          background: 'var(--bg-card)',
          border: '1px dashed var(--border-strong)',
          borderRadius: 16,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'var(--bg-elevated)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', color: 'var(--text-muted)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No notifications</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {filter === 'all' ? 'You\'re all caught up.' : `No ${TYPE_LABELS[filter as NotifType]?.toLowerCase()} notifications yet.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--row-gap)' }}>
          {filtered.map((n) => {
            const Wrapper = n.href ? Link : 'div';
            const wrapperProps = n.href ? { href: n.href, style: { textDecoration: 'none' } } : {};

            return (
              // @ts-expect-error polymorphic wrapper
              <Wrapper
                key={n.id}
                {...wrapperProps}
                onClick={() => handleMarkRead(n.id)}
                className={`notif-item${!n.read ? ' unread' : ''}`}
              >
                <NotifIcon type={n.type} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <p style={{
                      fontSize: 14, fontWeight: n.read ? 500 : 700,
                      color: 'var(--text-primary)', flex: 1,
                    }} className="truncate-1">
                      {n.title}
                    </p>
                    {!n.read && (
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: 'var(--accent)', flexShrink: 0,
                      }} />
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }} className="truncate-2">
                    {n.body}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {timeAgo(n.ts)}
                  </p>
                </div>
                {n.href && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--border-strong)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                )}
              </Wrapper>
            );
          })}
        </div>
      )}
    </main>
  );
}
