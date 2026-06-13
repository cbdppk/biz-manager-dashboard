'use client';

import { useEffect, useMemo, useState } from 'react';
import { menuAPI, ordersAPI, productsAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

type OrderType = 'dine_in' | 'takeaway' | 'delivery';
type PaymentMethod = 'cash' | 'momo' | 'card' | 'credit';
type PosTab = 'new_order' | 'pay_orders';

interface Category { id: string; name: string; }
interface Product { id: string; name: string; price: number; is_available?: boolean; menu_category_id?: string | null; }
interface OptionValue { id: string; label: string; price_delta: number; }
interface MenuOption { id: string; name: string; menu_item_option_values?: OptionValue[]; }
interface SelectedOption { option_id: string; option_name: string; value_id: string; label: string; price_delta: number; }
interface CartItem { product: Product; qty: number; note: string; selectedOptions: SelectedOption[]; }

interface PendingOrderItem {
  id: string;
  item_name_snapshot: string;
  qty: number;
  unit_price: number;
}

interface PendingOrder {
  id: string;
  order_type: string;
  table_ref?: string | null;
  status: string;
  sale_id?: string | null;
  total_amount: number;
  created_at: string;
  order_items: PendingOrderItem[];
}

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'dine_in', label: 'Dine In' },
  { value: 'delivery', label: 'Delivery' },
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash',   label: 'Cash' },
  { value: 'momo',   label: 'MoMo' },
  { value: 'card',   label: 'Card' },
  { value: 'credit', label: 'Credit' },
];

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: 'Dine In', takeaway: 'Takeaway', delivery: 'Delivery',
};

function cartItemUnitPrice(item: CartItem) {
  return Number(item.product.price || 0) +
    item.selectedOptions.reduce((s, o) => s + Number(o.price_delta || 0), 0);
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function FoodPosPage() {
  const { showToast } = useToast();
  const [posTab, setPosTab] = useState<PosTab>('new_order');

  // ── New Order state ──
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [optionsByProduct, setOptionsByProduct] = useState<Record<string, MenuOption[]>>({});
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('takeaway');
  const [tableRef, setTableRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [configuring, setConfiguring] = useState<Product | null>(null);
  const [draftOptions, setDraftOptions] = useState<Record<string, SelectedOption>>({});
  const [draftNote, setDraftNote] = useState('');

  // ── Pay Orders state ──
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [payMethods, setPayMethods] = useState<Record<string, PaymentMethod>>({});
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [catRes, itemRes] = await Promise.all([
          menuAPI.categories(),
          productsAPI.list({ menu_only: true, limit: 200 }),
        ]);
        const menuItems = (itemRes.data || []).filter((p: Product) => p.is_available !== false);
        setCategories(catRes.data || []);
        setProducts(menuItems);
        const optionEntries = await Promise.all(
          menuItems.map(async (p: Product) => {
            try {
              const res = await menuAPI.options(p.id);
              return [p.id, res.data || []] as const;
            } catch {
              return [p.id, []] as const;
            }
          })
        );
        setOptionsByProduct(Object.fromEntries(optionEntries));
      } catch {
        showToast('Could not load menu.', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  async function loadPendingOrders() {
    setLoadingOrders(true);
    try {
      const res = await ordersAPI.list();
      // Show any order that hasn't been paid yet (no sale_id), excluding cancelled.
      // Kitchen marking "complete" doesn't create a sale, so those orders must
      // still appear here until the cashier collects payment.
      const pending = (res.data || []).filter(
        (o: PendingOrder) => !o.sale_id && o.status !== 'cancelled'
      );
      setPendingOrders(pending);
    } catch {
      showToast('Could not load orders.', 'error');
    } finally {
      setLoadingOrders(false);
    }
  }

  useEffect(() => {
    if (posTab === 'pay_orders') loadPendingOrders();
  }, [posTab]);

  function payMethodForOrder(id: string): PaymentMethod {
    return payMethods[id] ?? 'cash';
  }

  async function collectPayment(order: PendingOrder) {
    setPaying(order.id);
    try {
      await ordersAPI.complete(order.id, {
        payment_method: payMethodForOrder(order.id),
        amount_paid: Number(order.total_amount || 0),
      });
      showToast('Payment collected!', 'success');
      await loadPendingOrders();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Could not collect payment.', 'error');
    } finally {
      setPaying(null);
    }
  }

  const shown = useMemo(() => {
    let list = products;
    if (activeCategory) list = list.filter((p) => p.menu_category_id === activeCategory);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return list;
  }, [products, activeCategory, search]);

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const total = cart.reduce((s, i) => s + cartItemUnitPrice(i) * i.qty, 0);

  function openProduct(product: Product) {
    setConfiguring(product);
    setDraftOptions({});
    setDraftNote('');
  }

  function addConfiguredItem() {
    if (!configuring) return;
    const selectedOptions = Object.values(draftOptions);
    setCart((prev) => {
      const sig = JSON.stringify(selectedOptions.map((o) => o.value_id).sort());
      const existing = prev.find(
        (i) =>
          i.product.id === configuring.id &&
          i.note === draftNote.trim() &&
          JSON.stringify(i.selectedOptions.map((o) => o.value_id).sort()) === sig
      );
      if (existing) return prev.map((i) => (i === existing ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { product: configuring, qty: 1, note: draftNote.trim(), selectedOptions }];
    });
    setConfiguring(null);
  }

  function updateQty(index: number, delta: number) {
    setCart((prev) =>
      prev.flatMap((item, i) => {
        if (i !== index) return [item];
        const qty = item.qty + delta;
        return qty > 0 ? [{ ...item, qty }] : [];
      })
    );
  }

  async function createOrder() {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      await ordersAPI.create({
        order_type: orderType,
        table_ref: orderType === 'dine_in' ? tableRef || undefined : undefined,
        items: cart.map((item) => ({
          product_id: item.product.id,
          qty: item.qty,
          unit_price: item.product.price,
          selected_options: item.selectedOptions,
          item_note: item.note || undefined,
        })),
      });
      showToast('Order sent to kitchen!', 'success');
      setCart([]);
      setTableRef('');
    } catch {
      showToast('Could not send order.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const configuringOptions = optionsByProduct[configuring?.id ?? ''] || [];

  return (
    <main className="page page-wide" style={{ paddingBottom: posTab === 'new_order' && cartCount > 0 ? 230 : 100 }}>
      {/* Header */}
      <div
        className="page-toolbar"
      >
        <h1 style={{ flex: 1 }}>Food POS</h1>
        {posTab === 'new_order' && cartCount > 0 && (
          <span className="pill pill-green">
            {cartCount} item{cartCount !== 1 ? 's' : ''}
          </span>
        )}
        {posTab === 'pay_orders' && pendingOrders.length > 0 && (
          <span className="pill pill-warn">{pendingOrders.length} unpaid</span>
        )}
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button
          className={`btn ${posTab === 'new_order' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setPosTab('new_order')}
          style={{ flex: 1, padding: '10px 6px', fontSize: 13 }}
        >
          New Order
        </button>
        <button
          className={`btn ${posTab === 'pay_orders' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setPosTab('pay_orders')}
          style={{ flex: 1, padding: '10px 6px', fontSize: 13 }}
        >
          Collect Payment
        </button>
      </div>

      {/* ── Pay Orders Tab ── */}
      {posTab === 'pay_orders' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '8px 12px', fontSize: 13 }}
              onClick={loadPendingOrders}
            >
              Refresh
            </button>
          </div>

          {loadingOrders ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {[1, 2].map((n) => (
                <div key={n} className="skeleton" style={{ height: 130, borderRadius: 'var(--card-radius)' }} />
              ))}
            </div>
          ) : pendingOrders.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
              <p>No unpaid orders</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {pendingOrders.map((order) => (
                <section key={order.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
                      <span className={order.status === 'ready' ? 'pill pill-green' : 'pill pill-warn'}>
                        {order.status}
                      </span>
                    </div>
                  </div>

                  {/* Items summary */}
                  <div style={{ padding: '8px 14px' }}>
                    {order.order_items.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 13,
                          padding: '3px 0',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <span>{item.item_name_snapshot} ×{item.qty}</span>
                        <span>GH₵{(Number(item.unit_price) * item.qty).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Payment footer */}
                  <div
                    style={{
                      padding: '12px 14px',
                      borderTop: '1px solid var(--border)',
                      background: 'var(--accent-dim)',
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                      <span>Total</span>
                      <span style={{ color: 'var(--accent)' }}>
                        GH₵{Number(order.total_amount || 0).toFixed(2)}
                      </span>
                    </div>
                    {/* Payment method selector */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {PAYMENT_METHODS.map(({ value, label }) => (
                        <button
                          key={value}
                          className={`btn ${payMethodForOrder(order.id) === value ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setPayMethods((p) => ({ ...p, [order.id]: value }))}
                          style={{ flex: 1, padding: '8px 4px', fontSize: 12 }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={paying === order.id}
                      onClick={() => collectPayment(order)}
                    >
                      {paying === order.id ? 'Processing…' : 'Collect Payment'}
                    </button>
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── New Order Tab ── */}
      {posTab === 'new_order' && (
        <>
          {/* Order type selector */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {ORDER_TYPES.map(({ value, label }) => (
              <button
                key={value}
                className={`btn ${orderType === value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setOrderType(value)}
                style={{ flex: 1, padding: '10px 6px', fontSize: 13 }}
              >
                {label}
              </button>
            ))}
          </div>

          {orderType === 'dine_in' && (
            <input
              className="input"
              placeholder="Table number (optional)"
              value={tableRef}
              onChange={(e) => setTableRef(e.target.value)}
              style={{ marginBottom: 12 }}
            />
          )}

          {/* Search */}
          <input
            className="input"
            placeholder="Search meals…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: categories.length > 0 ? 10 : 14 }}
          />

          {/* Category tabs */}
          {categories.length > 0 && (
            <div
              className="filter-chips"
              style={{ marginBottom: 14 }}
            >
              <button
                className={`btn btn-nowrap ${!activeCategory ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveCategory('')}
                style={{ padding: '8px 14px', fontSize: 13 }}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  className={`btn btn-nowrap ${activeCategory === cat.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{ padding: '8px 14px', fontSize: 13 }}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* Menu grid */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="skeleton" style={{ height: 76, borderRadius: 12 }} />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div
              className="card"
              style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}
            >
              {search ? `No results for "${search}"` : 'No meals available'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {shown.map((p) => (
                <button
                  key={p.id}
                  className="card"
                  onClick={() => openProduct(p)}
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    padding: '14px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    minHeight: 76,
                    border: '1px solid var(--border)',
                  }}
                >
                  <strong style={{ fontSize: 14, lineHeight: 1.3 }}>{p.name}</strong>
                  <span className="pill pill-green" style={{ alignSelf: 'flex-start', fontSize: 12 }}>
                    GH₵{Number(p.price || 0).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Fixed cart footer */}
          {cartCount > 0 && (
            <section
              className="card-glass"
              style={{
                position: 'fixed',
                left: 12,
                right: 12,
                bottom: 'calc(var(--nav-height) + 8px + env(safe-area-inset-bottom))',
                padding: '12px 14px',
                zIndex: 50,
                boxShadow: 'var(--shadow-lg)',
                borderRadius: 'var(--card-radius)',
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-surface)',
              }}
            >
              {/* Cart items */}
              <div
                style={{
                  display: 'grid',
                  gap: 6,
                  maxHeight: 148,
                  overflow: 'auto',
                  marginBottom: 10,
                }}
              >
                {cart.map((item, index) => (
                  <div
                    key={`${item.product.id}-${index}`}
                    style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="truncate-1" style={{ fontSize: 13, fontWeight: 600 }}>
                        {item.product.name}
                      </div>
                      {item.selectedOptions.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {item.selectedOptions.map((o) => o.label).join(', ')}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
                      <button
                        className="btn btn-ghost"
                        style={{ minHeight: 28, padding: '2px 10px', fontSize: 18, lineHeight: 1 }}
                        onClick={() => updateQty(index, -1)}
                      >
                        −
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 18, textAlign: 'center' }}>
                        {item.qty}
                      </span>
                      <button
                        className="btn btn-ghost"
                        style={{ minHeight: 28, padding: '2px 10px', fontSize: 18, lineHeight: 1 }}
                        onClick={() => updateQty(index, 1)}
                      >
                        +
                      </button>
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--accent)',
                        minWidth: 58,
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      GH₵{(cartItemUnitPrice(item) * item.qty).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Total + submit */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: 17, flexShrink: 0 }}>
                  GH₵{total.toFixed(2)}
                </span>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={submitting}
                  onClick={createOrder}
                >
                  {submitting ? 'Sending…' : 'Send to Kitchen'}
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {/* Item configure sheet */}
      {configuring && (
        <>
          <div className="sheet-backdrop" onClick={() => setConfiguring(null)} />
          <section className="sheet">
            <div className="sheet-handle" />
            <div style={{ padding: '16px 16px 0' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 16,
                }}
              >
                <div>
                  <h2 style={{ marginBottom: 2 }}>{configuring.name}</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    GH₵{Number(configuring.price || 0).toFixed(2)}
                  </p>
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '8px 12px', flexShrink: 0 }}
                  onClick={() => setConfiguring(null)}
                >
                  ✕
                </button>
              </div>

              {configuringOptions.map((option) => (
                <div key={option.id} style={{ marginBottom: 18 }}>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      marginBottom: 8,
                    }}
                  >
                    {option.name}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(option.menu_item_option_values || []).map((val) => {
                      const active = draftOptions[option.id]?.value_id === val.id;
                      return (
                        <button
                          key={val.id}
                          className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ fontSize: 13, padding: '8px 14px' }}
                          onClick={() =>
                            setDraftOptions((cur) => ({
                              ...cur,
                              [option.id]: {
                                option_id: option.id,
                                option_name: option.name,
                                value_id: val.id,
                                label: val.label,
                                price_delta: Number(val.price_delta || 0),
                              },
                            }))
                          }
                        >
                          {val.label}
                          {Number(val.price_delta) > 0 && (
                            <span style={{ opacity: 0.75, marginLeft: 4 }}>
                              +GH₵{Number(val.price_delta).toFixed(2)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <textarea
                className="input"
                placeholder="Kitchen note (optional)"
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                rows={2}
                style={{ resize: 'none', marginBottom: 12 }}
              />
              <button
                className="btn btn-primary"
                style={{ width: '100%', marginBottom: 16 }}
                onClick={addConfiguredItem}
              >
                Add to Order
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
