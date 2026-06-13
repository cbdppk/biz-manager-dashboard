'use client';

import { useEffect, useState } from 'react';
import { ordersAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface KitchenItem {
  id: string;
  item_name_snapshot: string;
  qty: number;
  item_note?: string | null;
  kitchen_status: 'queued' | 'cooking' | 'ready' | 'served';
  selected_options?: { label: string; price_delta?: number }[];
}

interface KitchenOrder {
  id: string;
  order_type: 'dine_in' | 'takeaway' | 'delivery';
  table_ref?: string | null;
  status: string;
  total_amount?: number;
  created_at: string;
  order_items: KitchenItem[];
}

const STATUS_FLOW: KitchenItem['kitchen_status'][] = ['queued', 'cooking', 'ready', 'served'];

const STATUS_META: Record<
  KitchenItem['kitchen_status'],
  { label: string; pill: string }
> = {
  queued:  { label: 'Queued',  pill: 'pill pill-warn' },
  cooking: { label: 'Cooking', pill: 'pill pill-info' },
  ready:   { label: 'Ready',   pill: 'pill pill-green' },
  served:  { label: 'Served',  pill: 'pill pill-muted' },
};

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in:  'Dine In',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

const ACTIVE_STATUSES = new Set(['confirmed', 'preparing', 'ready']);

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function nextStatus(
  current: KitchenItem['kitchen_status']
): KitchenItem['kitchen_status'] | null {
  const idx = STATUS_FLOW.indexOf(current);
  return idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
}

export default function OrdersPage() {
  const { showToast } = useToast();
  const [activeOrders, setActiveOrders] = useState<KitchenOrder[]>([]);
  const [historyOrders, setHistoryOrders] = useState<KitchenOrder[]>([]);
  const [view, setView] = useState<'active' | 'history'>('active');
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [movingItem, setMovingItem] = useState<string | null>(null);
  const [, setTick] = useState(0);

  async function load() {
    try {
      const [activeRes, historyRes] = await Promise.all([
        ordersAPI.kitchenQueue(),
        ordersAPI.list({ status: 'completed' }),
      ]);
      setActiveOrders(activeRes.data || []);
      setHistoryOrders((historyRes.data || []).slice(0, 30));
    } catch {
      showToast('Could not load kitchen queue.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  async function advance(orderId: string, item: KitchenItem) {
    const next = nextStatus(item.kitchen_status);
    if (!next) return;
    setMovingItem(item.id);
    try {
      await ordersAPI.updateKitchenStatus(orderId, item.id, next);
      await load();
    } catch {
      showToast('Could not update status.', 'error');
    } finally {
      setMovingItem(null);
    }
  }

  async function markComplete(orderId: string) {
    setCompleting(orderId);
    try {
      await ordersAPI.updateStatus(orderId, 'completed');
      showToast('Order marked complete.', 'success');
      await load();
    } catch {
      showToast('Could not complete order.', 'error');
    } finally {
      setCompleting(null);
    }
  }

  const orders = view === 'active' ? activeOrders : historyOrders;

  return (
    <main className="page page-content">
      <div
        className="page-toolbar"
        style={{ justifyContent: 'space-between' }}
      >
        <h1>Kitchen</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeOrders.length > 0 && (
            <span className="pill pill-warn">{activeOrders.length} active</span>
          )}
          <button
            className="btn btn-secondary"
            style={{ padding: '8px 12px', fontSize: 13 }}
            onClick={load}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['active', 'history'] as const).map((tab) => (
          <button
            key={tab}
            className={`btn ${view === tab ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView(tab)}
            style={{ flex: 1, padding: '10px 6px', fontSize: 13, textTransform: 'capitalize' }}
          >
            {tab === 'active' ? 'Active' : 'History'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {[1, 2].map((n) => (
            <div
              key={n}
              className="skeleton"
              style={{ height: 140, borderRadius: 'var(--card-radius)' }}
            />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>{view === 'active' ? '✓' : '🕐'}</div>
          <p>{view === 'active' ? 'All clear — no active orders' : 'No completed orders yet'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {orders.map((order) => {
            const isHistory = !ACTIVE_STATUSES.has(order.status);
            const servedCount = order.order_items.filter(
              (i) => i.kitchen_status === 'served'
            ).length;

            return (
              <section
                key={order.id}
                className="card"
                style={{ padding: 0, overflow: 'hidden', opacity: isHistory ? 0.75 : 1 }}
              >
                {/* Order header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    background: 'var(--bg-elevated)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <strong style={{ fontSize: 14 }}>
                      {ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}
                    </strong>
                    {order.table_ref && (
                      <span className="pill pill-muted">Table {order.table_ref}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {timeAgo(order.created_at)}
                    </span>
                    <span
                      className={
                        order.status === 'completed'
                          ? 'pill pill-muted'
                          : order.status === 'ready'
                          ? 'pill pill-green'
                          : 'pill pill-warn'
                      }
                    >
                      {order.status}
                    </span>
                  </div>
                </div>

                {/* Items */}
                <div style={{ padding: '4px 14px' }}>
                  {order.order_items.map((item, idx) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        padding: '10px 0',
                        borderBottom:
                          idx < order.order_items.length - 1
                            ? '1px solid var(--border)'
                            : 'none',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            alignItems: 'baseline',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span style={{ fontWeight: 600, fontSize: 14 }}>
                            {item.item_name_snapshot}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                            ×{item.qty}
                          </span>
                        </div>
                        {item.selected_options && item.selected_options.length > 0 && (
                          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                            {item.selected_options.map((o) => o.label).join(' · ')}
                          </p>
                        )}
                        {item.item_note && (
                          <p style={{ fontSize: 12, color: 'var(--warn)', marginTop: 3 }}>
                            📝 {item.item_note}
                          </p>
                        )}
                      </div>

                      {/* Status + advance (active orders only) */}
                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                          alignItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <span className={STATUS_META[item.kitchen_status]?.pill ?? 'pill pill-muted'}>
                          {STATUS_META[item.kitchen_status]?.label ?? item.kitchen_status}
                        </span>
                        {!isHistory && nextStatus(item.kitchen_status) && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '5px 11px', fontSize: 13 }}
                            disabled={movingItem === item.id}
                            onClick={() => advance(order.id, item)}
                          >
                            {movingItem === item.id ? '…' : '→'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div
                  style={{
                    padding: '10px 14px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {isHistory
                      ? `${order.order_items.length} item${order.order_items.length !== 1 ? 's' : ''}`
                      : `${servedCount}/${order.order_items.length} served`}
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}>
                      GH₵{Number(order.total_amount || 0).toFixed(2)}
                    </span>
                    {!isHistory && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '7px 14px', fontSize: 13 }}
                        disabled={completing === order.id}
                        onClick={() => markComplete(order.id)}
                      >
                        {completing === order.id ? '…' : 'Mark Complete'}
                      </button>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
