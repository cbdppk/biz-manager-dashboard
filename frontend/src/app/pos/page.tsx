'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { productsAPI, salesAPI, momoAPI, customersAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';
import {
  clearPosCart,
  countPendingSales,
  findCachedCustomers,
  findCachedProducts,
  loadCustomerCache,
  loadPosCart,
  migrateLegacyPosCart,
  queuePendingSale,
  reduceCachedProductStock,
  saveCustomerCache,
  savePosCart,
} from '@/lib/posOffline';
import { addNotification } from '@/lib/notifications';
import { hydratePosOfflineCache, syncPendingSales as syncQueuedSales } from '@/lib/posOfflineSync';

interface Product {
  id: string;
  name: string;
  price: number;
  stock_qty: number;
}

interface CartItem {
  product: Product;
  qty: number;
}

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  isOfflineDraft?: boolean;
  offlineId?: string;
}

type PaymentMethod = 'Cash' | 'MoMo' | 'Card' | 'Credit';
type MomoStatus = 'idle' | 'sending' | 'pending' | 'failed' | 'timeout';

interface MomoSheetState {
  phone: string;
  amount: number;
  status: MomoStatus;
  reference?: string;
}

const OFFLINE_CUSTOMER_PREFIX = 'offline-customer-';

const NETWORK_MAP: { prefixes: string[]; name: string; color: string }[] = [
  { prefixes: ['024', '054', '059'], name: 'MTN', color: '#fbbf24' },
  { prefixes: ['020', '050'], name: 'Vodafone', color: '#ef4444' },
  { prefixes: ['027', '057'], name: 'AirtelTigo', color: '#3b82f6' },
];

function detectNetwork(phone: string): { name: string; color: string } | null {
  const digits = phone.replace(/\D/g, '');
  let prefix = '';
  if (digits.startsWith('0') && digits.length >= 3) prefix = digits.slice(0, 3);
  else if (digits.startsWith('233') && digits.length >= 5) prefix = '0' + digits.slice(3, 5);
  return NETWORK_MAP.find((n) => n.prefixes.includes(prefix)) ?? null;
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4h6v2" />
    </svg>
  );
}

function Spinner({ size = 20, color = '#10b981' }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2.5px solid ${color}33`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

/* ── Payment method icons ─────────────────────────────── */
const PAY_METHODS: {
  id: PaymentMethod;
  label: string;
  hint: string;
  color: string;
  bg: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'Cash', label: 'Cash', hint: 'Count change',
    color: '#10b981', bg: 'rgba(16,185,129,0.15)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2"/>
        <circle cx="12" cy="12" r="3"/>
        <path d="M6 12h.01M18 12h.01"/>
      </svg>
    ),
  },
  {
    id: 'MoMo', label: 'MoMo', hint: 'Mobile money',
    color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2"/>
        <line x1="12" y1="18" x2="12.01" y2="18"/>
      </svg>
    ),
  },
  {
    id: 'Card', label: 'Card', hint: 'Debit / credit',
    color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <line x1="2" y1="10" x2="22" y2="10"/>
      </svg>
    ),
  },
  {
    id: 'Credit', label: 'Credit', hint: 'Owe later',
    color: '#a78bfa', bg: 'rgba(167,139,250,0.15)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10z"/>
        <path d="M12 6v6l4 2"/>
      </svg>
    ),
  },
];

function isOfflineLikeError(error: any) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!error) return false;
  return !error.response;
}

function canQueueOfflineSale(method: PaymentMethod) {
  return method === 'Cash' || method === 'Card' || method === 'Credit';
}

export default function POSPage() {
  const { showToast } = useToast();
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [recording, setRecording] = useState(false);
  const [collectModal, setCollectModal] = useState(false);
  const [modal, setModal] = useState<{ total: number; method: PaymentMethod; change: number } | null>(null);
  const [momoSheet, setMomoSheet] = useState<MomoSheetState | null>(null);
  const [cartRestored, setCartRestored] = useState(false);
  const [syncingOutbox, setSyncingOutbox] = useState(false);
  const [pendingSummary, setPendingSummary] = useState({ pending: 0, failed: 0 });

  /* ── Credit customer state ── */
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerSearchError, setCustomerSearchError] = useState('');
  const [customerSearching, setCustomerSearching] = useState(false);
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = cart.reduce((sum, i) => sum + i.product.price * i.qty, 0);
  const paid = parseFloat(amountPaid) || 0;
  const change = paid - total;

  const refreshPendingSummary = useCallback(() => {
    setPendingSummary(countPendingSales());
  }, []);

  const queueCurrentSale = useCallback(() => {
    const customerDraft = paymentMethod === 'Credit' && creditCustomer?.isOfflineDraft
      ? {
          name: creditCustomer.name,
          phone: creditCustomer.phone || null,
        }
      : undefined;

    queuePendingSale({
      items: cart.map((item) => ({
        product_id: item.product.id,
        qty: item.qty,
        unit_price: item.product.price,
        discount: 0,
      })),
      total,
      payment_method: paymentMethod === 'MoMo' ? 'Cash' : paymentMethod,
      amount_paid: paymentMethod === 'Cash'
        ? (paid || total)
        : paymentMethod === 'Credit'
          ? 0
          : total,
      customer_id: paymentMethod === 'Credit' && !creditCustomer?.isOfflineDraft ? creditCustomer?.id : undefined,
      customer_draft: paymentMethod === 'Credit' ? customerDraft : undefined,
    });

    reduceCachedProductStock(cart.map((item) => ({ product_id: item.product.id, qty: item.qty })));
    refreshPendingSummary();
    addNotification({
      type: 'system',
      title: 'Sale saved offline',
      body: 'The sale is queued locally and will sync when the internet returns.',
      href: '/pos',
    });
    showToast('Sale saved offline. It will sync automatically.', 'success');
    setCollectModal(false);
    newSale();
  }, [cart, creditCustomer, paid, paymentMethod, refreshPendingSummary, showToast, total]);

  const runQueuedSalesSync = useCallback(async (opts?: { manual?: boolean }) => {
    setSyncingOutbox(true);
    try {
      await syncQueuedSales();
      refreshPendingSummary();
      if (opts?.manual) {
        const current = countPendingSales();
        if (current.failed === 0) showToast('Offline sales synced.', 'success');
        else showToast('Some queued sales still need attention.', 'info');
      }
    } finally {
      setSyncingOutbox(false);
      refreshPendingSummary();
    }
  }, [refreshPendingSummary, showToast]);

  /* ── Hide bottom nav when any modal is open ── */
  const anyModalOpen = collectModal || !!momoSheet || !!modal;
  useEffect(() => {
    const nav = document.querySelector('.bottom-nav') as HTMLElement | null;
    if (!nav) return;
    nav.style.display = anyModalOpen ? 'none' : '';
    return () => { nav.style.display = ''; };
  }, [anyModalOpen]);

  /* ── Persist cart ── */
  useEffect(() => {
    migrateLegacyPosCart();
    const parsed = loadPosCart<{ cart?: CartItem[]; paymentMethod?: PaymentMethod; amountPaid?: string } | null>(null);
    if (!parsed) { setCartRestored(true); return; }
    try {
      setCart(parsed.cart || []);
      setPaymentMethod(parsed.paymentMethod || 'Cash');
      setAmountPaid(parsed.amountPaid || '');
    } finally {
      setCartRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!cartRestored) return;
    savePosCart({ cart, paymentMethod, amountPaid });
  }, [amountPaid, cart, cartRestored, paymentMethod]);

  useEffect(() => {
    refreshPendingSummary();
    const handleOnline = () => {
      setIsOnline(true);
      hydratePosOfflineCache().finally(() => runQueuedSalesSync());
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) {
      hydratePosOfflineCache().finally(() => runQueuedSalesSync());
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshPendingSummary, runQueuedSalesSync]);

  /* ── Product search ── */
  const runSearch = useCallback((q: string) => {
    if (!q.trim()) { setSearchResults([]); setSearchError(''); return; }
    if (navigator.onLine === false) {
      const cached = findCachedProducts(q);
      setSearchResults(cached);
      setSearchError(cached.length === 0 ? 'Offline mode: no cached product matched that search.' : '');
      return;
    }

    setSearching(true);
    productsAPI.list({ search: q })
      .then((res) => {
        const results = res.data?.products ?? res.data ?? [];
        setSearchResults(results);
        setSearchError('');
      })
      .catch(() => {
        const cached = findCachedProducts(q);
        setSearchResults(cached);
        setSearchError(cached.length === 0 ? 'Could not search products right now.' : 'Offline results shown from your last synced catalog.');
      })
      .finally(() => setSearching(false));
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    setSearchError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 300);
  };

  /* ── Cart ops ── */
  const addToCart = (product: Product) => {
    if (product.stock_qty <= 0) {
      showToast(`${product.name} is out of stock.`, 'error');
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock_qty) {
          showToast(`Only ${product.stock_qty} ${product.name} available.`, 'error');
          return prev;
        }
        return prev.map((i) => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { product, qty: 1 }];
    });
    setSearch('');
    setSearchResults([]);
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) => {
      const item = prev.find((i) => i.product.id === productId);
      if (item && delta > 0 && item.qty >= item.product.stock_qty) {
        showToast(`Only ${item.product.stock_qty} ${item.product.name} available.`, 'error');
        return prev;
      }
      return prev.map((i) => i.product.id === productId ? { ...i, qty: i.qty + delta } : i)
        .filter((i) => i.qty > 0);
    });
  };

  const removeItem = (productId: string) =>
    setCart((prev) => prev.filter((i) => i.product.id !== productId));

  /* ── Customer search for Credit sales ── */
  const runCustomerSearch = useCallback((q: string) => {
    if (!q.trim()) { setCustomerResults([]); setCustomerSearchError(''); return; }
    if (navigator.onLine === false) {
      const cached = findCachedCustomers(q);
      setCustomerResults(cached);
      setCustomerSearchError(cached.length === 0 ? 'Offline mode: no cached customer matched that search.' : '');
      return;
    }

    setCustomerSearching(true);
    customersAPI.list({ search: q, limit: 8 })
      .then((res) => {
        const list = res.data?.customers ?? res.data ?? [];
        setCustomerResults(Array.isArray(list) ? list : []);
        setCustomerSearchError('');
      })
      .catch(() => {
        const cached = findCachedCustomers(q);
        setCustomerResults(cached);
        setCustomerSearchError(cached.length === 0 ? 'Could not search customers right now.' : 'Offline results shown from your last synced customers.');
      })
      .finally(() => setCustomerSearching(false));
  }, []);

  const handleCustomerQueryChange = (val: string) => {
    setCustomerQuery(val);
    setCustomerSearchError('');
    if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
    customerDebounceRef.current = setTimeout(() => runCustomerSearch(val), 250);
  };

  const quickCreateCustomer = async () => {
    if (creatingCustomer) return;
    if (!newCustomerName.trim()) {
      showToast('Customer name is required for credit sales.', 'error');
      return;
    }

    if (navigator.onLine === false) {
      const offlineId = `${OFFLINE_CUSTOMER_PREFIX}${Date.now()}`;
      const draftCustomer: Customer = {
        id: offlineId,
        offlineId,
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
        isOfflineDraft: true,
      };
      setCreditCustomer(draftCustomer);
      setNewCustomerMode(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setCustomerQuery('');
      setCustomerResults([]);
      showToast('Customer saved for this sale and will sync when you are back online.', 'info');
      return;
    }

    setCreatingCustomer(true);
    try {
      const res = await customersAPI.create({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
      });
      const created: Customer = res.data?.customer ?? res.data;
      if (created?.id) {
        setCreditCustomer(created);
        setNewCustomerMode(false);
        setNewCustomerName('');
        setNewCustomerPhone('');
        setCustomerQuery('');
        setCustomerResults([]);
        saveCustomerCache([created, ...loadCustomerCache().filter((customer) => customer.id !== created.id)].slice(0, 250));
        showToast('Customer created for this credit sale.', 'success');
      }
    } catch {
      showToast('Failed to create customer.', 'error');
    }
    finally { setCreatingCustomer(false); }
  };

  /* Clear credit customer if the user switches away from Credit */
  useEffect(() => {
    if (paymentMethod !== 'Credit') {
      setCreditCustomer(null);
      setNewCustomerMode(false);
      setCustomerQuery('');
      setCustomerResults([]);
    }
  }, [paymentMethod]);

  /* ── Open payment collection sheet ── */
  const recordSale = () => {
    if (cart.length === 0 || recording) return;
    setCollectModal(true);
  };

  /* ── Confirm & record sale (called from inside collection modal) ── */
  const handleConfirm = async () => {
    if (recording) return;
    if (paymentMethod === 'MoMo') {
      if (navigator.onLine === false) {
        showToast('Mobile money requests need an internet connection.', 'error');
        return;
      }
      setMomoSheet({ phone: '', amount: total, status: 'idle' });
      return;
    }
    // Credit sales require a customer so the balance can be tracked.
    if (paymentMethod === 'Credit' && !creditCustomer) {
      showToast('Choose a customer before recording a credit sale.', 'error');
      return;
    }
    if (paymentMethod === 'Credit' && creatingCustomer) {
      showToast('Finish saving the customer first.', 'info');
      return;
    }

    if (navigator.onLine === false && canQueueOfflineSale(paymentMethod)) {
      queueCurrentSale();
      return;
    }

    setRecording(true);
    try {
      await salesAPI.create({
        items: cart.map((i) => ({ product_id: i.product.id, qty: i.qty, unit_price: i.product.price, discount: 0 })),
        total,
        payment_method: paymentMethod,
        amount_paid: paymentMethod === 'Cash' ? (paid || total) : paymentMethod === 'Credit' ? 0 : total,
        customer_id: paymentMethod === 'Credit' ? creditCustomer?.id : undefined,
      });
      setCollectModal(false);
      setAmountPaid('');
      const cashChange = paymentMethod === 'Cash' && paid > 0 ? change : 0;
      reduceCachedProductStock(cart.map((item) => ({ product_id: item.product.id, qty: item.qty })));
      await hydratePosOfflineCache();
      setModal({ total, method: paymentMethod, change: cashChange });
    } catch (error: any) {
      if (canQueueOfflineSale(paymentMethod) && isOfflineLikeError(error)) {
        queueCurrentSale();
        return;
      }

      const message = error?.response?.data?.code === 'INSUFFICIENT_STOCK'
        ? 'Stock changed before checkout. Refresh products and review the cart.'
        : 'Failed to record sale. Please try again.';
      showToast(message, 'error');
    }
    finally { setRecording(false); }
  };

  /* ── MoMo flow ── */
  const stopMomoPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  };

  const closeMomoSheet = () => { stopMomoPoll(); setMomoSheet(null); };

  const finalizeSale = async () => {
    try {
      await salesAPI.create({
        items: cart.map((i) => ({ product_id: i.product.id, qty: i.qty, unit_price: i.product.price, discount: 0 })),
        total,
        payment_method: 'MoMo',
        amount_paid: total,
      });
      reduceCachedProductStock(cart.map((item) => ({ product_id: item.product.id, qty: item.qty })));
      await hydratePosOfflineCache();
      setMomoSheet(null);
      setCollectModal(false);
      setModal({ total, method: 'MoMo', change: 0 });
    } catch {
      stopMomoPoll();
      setMomoSheet((p) => p ? { ...p, status: 'failed' } : null);
      showToast('Payment was approved, but recording the sale failed. Please retry.', 'error');
    }
  };

  const sendMomoRequest = async () => {
    if (!momoSheet?.phone.trim()) {
      showToast('Enter a mobile money number first.', 'error');
      return;
    }

    setMomoSheet((p) => p ? { ...p, status: 'sending' } : null);
    try {
      const res = await momoAPI.collect({ phone: momoSheet.phone.trim(), amount: momoSheet.amount, sale_id: null });
      const reference: string = res.data?.reference ?? res.data?.data?.reference;
      setMomoSheet((p) => p ? { ...p, status: 'pending', reference } : null);

      pollRef.current = setInterval(async () => {
        try {
          const s = (await momoAPI.status(reference)).data?.status ?? 'pending';
          if (s === 'success') { stopMomoPoll(); await finalizeSale(); }
          else if (s === 'failed') {
            stopMomoPoll();
            setMomoSheet((p) => p ? { ...p, status: 'failed' } : null);
            showToast('MoMo payment failed or was declined.', 'error');
          }
        } catch { /* keep polling */ }
      }, 3000);

      timeoutRef.current = setTimeout(() => {
        stopMomoPoll();
        setMomoSheet((p) => p ? { ...p, status: 'timeout' } : null);
        showToast('MoMo payment timed out. You can retry or record as cash.', 'info');
      }, 90000);
    } catch {
      setMomoSheet((p) => p ? { ...p, status: 'idle' } : null);
      showToast('Failed to send the MoMo request.', 'error');
    }
  };

  const recordAsCash = async () => {
    closeMomoSheet();
    setRecording(true);
    try {
      await salesAPI.create({
        items: cart.map((i) => ({ product_id: i.product.id, qty: i.qty, unit_price: i.product.price, discount: 0 })),
        total,
        payment_method: 'Cash',
        amount_paid: total,
      });
      reduceCachedProductStock(cart.map((item) => ({ product_id: item.product.id, qty: item.qty })));
      await hydratePosOfflineCache();
      setModal({ total, method: 'Cash', change: 0 });
    } catch {
      showToast('Failed to record the fallback cash sale.', 'error');
    }
    finally { setRecording(false); }
  };

  function newSale() {
    setCart([]); setModal(null); setSearch('');
    setSearchResults([]); setAmountPaid('');
    setPaymentMethod('Cash');
    setCreditCustomer(null);
    setNewCustomerMode(false);
    setCustomerQuery('');
    setCustomerResults([]);
    clearPosCart();
  }

  const network = momoSheet ? detectNetwork(momoSheet.phone) : null;
  const activeMethod = PAY_METHODS.find((m) => m.id === paymentMethod)!;

  return (
    <div className="pos-root">

      <div className="pos-layout">

      {/* ── LEFT — Product search ─────────────────────── */}
      <div className="pos-products" style={{ padding: '14px 16px 8px' }}>

        {(!isOnline || pendingSummary.pending > 0 || pendingSummary.failed > 0) && (
          <div style={{
            marginBottom: 12,
            padding: '12px 14px',
            borderRadius: 14,
            background: !isOnline ? 'rgba(245,158,11,0.12)' : pendingSummary.failed > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)',
            border: `1px solid ${!isOnline ? 'rgba(245,158,11,0.25)' : pendingSummary.failed > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(59,130,246,0.25)'}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
                {!isOnline
                  ? 'Offline mode active'
                  : pendingSummary.failed > 0
                    ? 'Some queued sales need attention'
                    : 'Queued sales waiting to sync'}
              </p>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 1.5 }}>
                {!isOnline
                  ? 'Cash, card, and credit sales can be saved locally and will sync when your connection returns.'
                  : pendingSummary.failed > 0
                    ? `${pendingSummary.failed} queued sale${pendingSummary.failed === 1 ? '' : 's'} failed to sync. Review stock and retry.`
                    : `${pendingSummary.pending} queued sale${pendingSummary.pending === 1 ? '' : 's'} will sync automatically in the background.`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="pill pill-muted">
                {pendingSummary.pending} pending
              </span>
              {pendingSummary.failed > 0 && (
                <span className="pill pill-warn">{pendingSummary.failed} failed</span>
              )}
              {isOnline && (
                <button
                  type="button"
                  onClick={() => runQueuedSalesSync({ manual: true })}
                  disabled={syncingOutbox}
                  style={{
                    marginLeft: 'auto',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '8px 12px',
                    cursor: syncingOutbox ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {syncingOutbox ? 'Syncing…' : 'Sync now'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 12, padding: '0 14px', height: 48,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search products…"
              value={search}
              onChange={handleSearchChange}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit',
              }}
            />
            {searching && <Spinner size={16} />}
          </div>
        </div>
        {searchError && (
          <p style={{ color: 'var(--danger)', fontSize: 12, margin: '-2px 2px 10px' }}>{searchError}</p>
        )}

        {/* Search results */}
        {searchResults.length > 0 && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 14, overflow: 'hidden', marginBottom: 12,
            boxShadow: 'var(--shadow-md)',
          }}>
            {searchResults.map((p, i) => (
              <div key={p.id}>
                {i > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '0 14px' }} />}
                <div
                  onClick={() => addToCart(p)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '12px 16px', cursor: 'pointer',
                    transition: 'background 100ms',
                    minWidth: 0,
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="truncate-1" style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{p.name}</p>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                      {p.stock_qty} in stock
                    </p>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent)', flexShrink: 0 }}>
                    GH₵ {Number(p.price).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* ── RIGHT — Cart + checkout ───────────────────── */}
      <div className="pos-sidebar">

        <div style={{ padding: '14px 16px 8px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p className="section-label" style={{ margin: 0 }}>Cart</p>
          {cart.length > 0 && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
              {cart.reduce((s, i) => s + i.qty, 0)} item{cart.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cart.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '28px 16px',
              background: 'var(--bg-card)', border: '1px dashed var(--border-strong)',
              borderRadius: 14, color: 'var(--text-muted)', fontSize: 14,
            }}>
              Search and tap a product to add it
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.product.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '11px 12px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                minWidth: 0,
              }}>
                <span className="truncate-1" style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{item.product.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => updateQty(item.product.id, -1)} style={qtyBtn}>−</button>
                  <span style={{ minWidth: 20, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>{item.qty}</span>
                  <button onClick={() => updateQty(item.product.id, 1)} style={qtyBtn}>+</button>
                </div>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)', minWidth: 56, textAlign: 'right', flexShrink: 0 }}>
                  GH₵ {(item.product.price * item.qty).toFixed(2)}
                </span>
                <button onClick={() => removeItem(item.product.id)} style={{
                  color: 'var(--danger)', background: 'none', border: 'none',
                  cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
                  borderRadius: 6, opacity: 0.7, flexShrink: 0,
                }}>
                  <TrashIcon />
                </button>
              </div>
            ))
          )}
        </div>
        </div>

      <div style={{
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        padding: '12px 16px 14px',
        flexShrink: 0,
      }}>
        {/* Total + items */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {cart.length === 0 ? 'Cart empty' : `${cart.reduce((s, i) => s + i.qty, 0)} item${cart.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''}`}
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              GH₵ {total.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Method pills */}
        <div className="action-row" style={{ marginBottom: 10 }}>
          {PAY_METHODS.map((m) => {
            const active = paymentMethod === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => { setPaymentMethod(m.id); setAmountPaid(''); }}
                style={{
                  flex: '1 1 72px', height: 36, borderRadius: 10,
                  // Fixed 2px border — only the color changes, so adjacent pills
                  // don't shift by 1px when switching selection.
                  border: `2px solid ${active ? m.color : 'var(--border)'}`,
                  background: active ? m.bg : 'var(--bg-card)',
                  color: active ? m.color : 'var(--text-muted)',
                  fontSize: 11, fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  cursor: 'pointer', fontFamily: 'inherit',
                  WebkitTapHighlightColor: 'transparent',
                  // Scoped transitions — no `all`, no gradient interp.
                  transition: 'background-color 120ms ease, border-color 120ms ease, color 120ms ease',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Charge button */}
        <button
          type="button"
          onClick={recordSale}
          disabled={cart.length === 0 || recording}
          style={{
            width: '100%', height: 58, borderRadius: 16, border: 'none',
            background: cart.length === 0
              ? 'var(--bg-elevated)'
              : `linear-gradient(135deg, ${activeMethod.color} 0%, ${activeMethod.color}cc 100%)`,
            color: cart.length === 0 ? 'var(--text-muted)' : '#fff',
            fontSize: 17, fontWeight: 800, letterSpacing: '-0.2px',
            cursor: cart.length === 0 || recording ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: cart.length > 0 ? `0 6px 24px ${activeMethod.color}40` : 'none',
            WebkitTapHighlightColor: 'transparent',
            // No `transition: all` — gradients don't animate and it causes
            // a visible flash when switching methods.
            transition: 'box-shadow 180ms ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {recording ? (
            <><Spinner size={20} color="#fff" /> Processing…</>
          ) : cart.length === 0 ? (
            'Add products to start'
          ) : (
            `Charge  GH₵ ${total.toFixed(2)}`
          )}
        </button>
      </div>

      </div>

      </div>

      {/* ── Payment Collection Modal ─────────────────────── */}
      {collectModal && !momoSheet && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'flex-end',
          }}
          onClick={() => { if (!recording) { setCollectModal(false); setAmountPaid(''); } }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 520, margin: '0 auto',
              background: 'var(--bg-surface)',
              borderRadius: '28px 28px 0 0',
              maxHeight: '92dvh',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── Colored header with big amount ── */}
            <div style={{
              background: `linear-gradient(160deg, ${activeMethod.color} 0%, ${activeMethod.color}99 100%)`,
              padding: '0 20px 28px',
              flexShrink: 0,
            }}>
              {/* Handle */}
              <div style={{ width: 44, height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 2, margin: '14px auto 16px' }} />

              {/* Method label + close */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 10,
                    background: 'rgba(255,255,255,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff',
                  }}>
                    {activeMethod.icon}
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.2px' }}>
                    {activeMethod.label} Payment
                  </span>
                </div>
                <button
                  onClick={() => { setCollectModal(false); setAmountPaid(''); }}
                  style={{
                    width: 32, height: 32, borderRadius: 9,
                    background: 'rgba(255,255,255,0.2)', border: 'none',
                    color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {/* Amount — hero */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
                  Amount to collect
                </div>
                <div style={{ fontSize: 58, fontWeight: 900, color: '#fff', letterSpacing: '-2px', lineHeight: 1, textShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
                  GH₵&nbsp;{total.toFixed(2)}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 8 }}>
                  {cart.reduce((s, i) => s + i.qty, 0)} item{cart.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''} · {cart.length} product{cart.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {/* ── Method-specific body ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>

              {/* CASH */}
              {paymentMethod === 'Cash' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{
                      display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8,
                    }}>
                      Cash received (GH₵)
                    </label>
                    <input
                      type="number" inputMode="decimal" min="0" step="0.01"
                      placeholder={total.toFixed(2)}
                      value={amountPaid}
                      autoFocus
                      onChange={(e) => setAmountPaid(e.target.value)}
                      style={{
                        width: '100%', height: 64, borderRadius: 14,
                        background: 'var(--bg-card)',
                        border: '2px solid var(--border-strong)',
                        padding: '0 18px',
                        fontSize: 28, fontWeight: 800, textAlign: 'right',
                        color: 'var(--text-primary)', outline: 'none',
                        fontFamily: 'inherit', boxSizing: 'border-box',
                        transition: 'border-color 150ms',
                      }}
                    />
                  </div>

                  {/* Quick amount buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[0, 5, 10, 20].map((bump) => {
                      const snapped = bump === 0 ? total : Math.ceil((total + 0.01) / 10) * 10 + (bump - 10 < 0 ? 0 : bump - 10);
                      const label = bump === 0 ? 'Exact' : `+${bump}`;
                      const val = bump === 0 ? total : Math.ceil(total / 10) * 10 + bump;
                      const displayVal = bump === 0 ? total.toFixed(2) : val.toFixed(0);
                      return (
                        <button key={bump}
                          onClick={() => setAmountPaid(bump === 0 ? total.toFixed(2) : val.toFixed(2))}
                          style={{
                            flex: 1, height: 40, borderRadius: 10,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-card)',
                            color: 'var(--text-secondary)',
                            fontSize: 12, fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit',
                            WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          {bump === 0 ? 'Exact' : `GH₵ ${displayVal}`}
                        </button>
                      );
                    })}
                  </div>

                  {/* Change display */}
                  {paid > 0 && total > 0 && (
                    <div style={{
                      borderRadius: 16, padding: '16px 18px',
                      background: change >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      border: `2px solid ${change >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {change >= 0 ? '↩ Change to give' : '⚠ Amount short'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {change >= 0 ? `Customer paid GH₵ ${paid.toFixed(2)}` : `Need GH₵ ${Math.abs(change).toFixed(2)} more`}
                        </div>
                      </div>
                      <div style={{ fontSize: 34, fontWeight: 900, color: change >= 0 ? '#10b981' : '#ef4444', letterSpacing: '-1px' }}>
                        GH₵&nbsp;{Math.abs(change).toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MOMO */}
              {paymentMethod === 'MoMo' && (
                <div style={{
                  background: 'rgba(245,158,11,0.08)',
                  border: '1.5px solid rgba(245,158,11,0.25)',
                  borderRadius: 16, padding: '20px 18px',
                  display: 'flex', flexDirection: 'column', gap: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', flexShrink: 0 }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>Mobile Money</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        You'll enter the customer's MoMo number on the next screen to send a payment request.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CARD */}
              {paymentMethod === 'Card' && (
                <div style={{
                  background: 'rgba(59,130,246,0.08)',
                  border: '1.5px solid rgba(59,130,246,0.25)',
                  borderRadius: 16, padding: '24px 18px',
                  textAlign: 'center',
                }}>
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', margin: '0 auto 14px' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>Swipe or Tap Card</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Process GH₵ {total.toFixed(2)} on your card terminal, then tap Record Sale to confirm.
                  </div>
                </div>
              )}

              {/* CREDIT */}
              {paymentMethod === 'Credit' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{
                    background: 'rgba(167,139,250,0.08)',
                    border: '1.5px solid rgba(167,139,250,0.25)',
                    borderRadius: 14, padding: '12px 14px',
                    fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5,
                  }}>
                    Credit sales need a customer so the balance can be tracked. Pick an existing customer or add a new one.
                  </div>

                  {/* Selected customer chip */}
                  {creditCustomer ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: 'rgba(167,139,250,0.1)',
                      border: '2px solid rgba(167,139,250,0.4)',
                      borderRadius: 14, padding: '14px 14px',
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: 'rgba(167,139,250,0.2)', color: '#a78bfa',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: 15, flexShrink: 0,
                      }}>
                        {creditCustomer.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="truncate-1" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {creditCustomer.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                          {creditCustomer.phone || 'No phone added'}
                          {creditCustomer.isOfflineDraft ? ' · offline draft' : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCreditCustomer(null)}
                        className="btn btn-ghost btn-nowrap"
                        style={{ padding: '6px 12px', minHeight: 38, fontSize: 12 }}
                      >
                        Change
                      </button>
                    </div>
                  ) : newCustomerMode ? (
                    <div style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 14, padding: 14,
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <div className="section-label" style={{ margin: 0, padding: 0 }}>
                        New customer
                      </div>
                      <input
                        type="text"
                        className="input"
                        placeholder="Customer name *"
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                        autoFocus
                      />
                      <input
                        type="tel"
                        className="input"
                        placeholder="Phone (optional)"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                      />
                      <div className="action-row">
                        <button
                          type="button"
                          onClick={() => { setNewCustomerMode(false); setNewCustomerName(''); setNewCustomerPhone(''); }}
                          className="btn btn-secondary"
                          style={{ flex: '1 1 120px' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={quickCreateCustomer}
                          disabled={!newCustomerName.trim() || creatingCustomer}
                          className="btn btn-primary"
                          style={{ flex: '1 1 120px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          {creatingCustomer ? <Spinner size={16} color="#fff" /> : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Search existing */}
                      <div style={{ position: 'relative' }}>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--text-muted)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                        >
                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input
                          type="text"
                          className="input"
                          placeholder="Search customer by name or phone…"
                          value={customerQuery}
                          onChange={(e) => handleCustomerQueryChange(e.target.value)}
                          style={{ paddingLeft: 42, paddingRight: customerSearching ? 42 : 14 }}
                        />
                        {customerSearching && (
                          <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
                            <Spinner size={14} color="#a78bfa" />
                          </div>
                        )}
                      </div>
                      {customerSearchError && (
                        <p style={{ color: 'var(--danger)', fontSize: 12, margin: '8px 2px 0' }}>{customerSearchError}</p>
                      )}

                      {/* Results */}
                      {customerResults.length > 0 && (
                        <div style={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          borderRadius: 12, overflow: 'hidden',
                          maxHeight: 220, overflowY: 'auto',
                        }}>
                          {customerResults.map((c, i) => (
                            <div key={c.id}>
                              {i > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '0 14px' }} />}
                              <button
                                type="button"
                                onClick={() => { setCreditCustomer(c); setCustomerQuery(''); setCustomerResults([]); }}
                                style={{
                                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                                  padding: '12px 14px', background: 'transparent',
                                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                  textAlign: 'left',
                                  WebkitTapHighlightColor: 'transparent',
                                }}
                              >
                                <div style={{
                                  width: 34, height: 34, borderRadius: 10,
                                  background: 'rgba(167,139,250,0.15)', color: '#a78bfa',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontWeight: 800, fontSize: 13, flexShrink: 0,
                                }}>
                                  {c.name.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="truncate-1" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {c.name}
                                  </div>
                                  {c.phone && (
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{c.phone}</div>
                                  )}
                                </div>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add new */}
                      <button
                        type="button"
                        onClick={() => setNewCustomerMode(true)}
                        className="btn btn-secondary btn-block"
                        style={{ borderStyle: 'dashed', color: 'var(--purple)' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Add New Customer
                      </button>
                    </>
                  )}

                  {creditCustomer && (
                    <div style={{
                      fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center',
                      marginTop: 4, lineHeight: 1.5,
                    }}>
                      <strong style={{ color: '#a78bfa' }}>{creditCustomer.name}</strong> will owe <strong style={{ color: '#a78bfa' }}>GH₵ {total.toFixed(2)}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Confirm button ── */}
            <div style={{ padding: '16px 20px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', flexShrink: 0 }}>
              {paymentMethod === 'Cash' && paid > 0 && paid < total && (
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--danger)', fontWeight: 600, marginBottom: 10 }}>
                  Cash received is less than total
                </div>
              )}
              {paymentMethod === 'Credit' && !creditCustomer && (
                <div style={{ textAlign: 'center', fontSize: 13, color: '#a78bfa', fontWeight: 600, marginBottom: 10 }}>
                  Select or add a customer to continue
                </div>
              )}
              {paymentMethod === 'Credit' && creatingCustomer && (
                <div style={{ textAlign: 'center', fontSize: 13, color: '#a78bfa', fontWeight: 600, marginBottom: 10 }}>
                  Saving customer…
                </div>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={
                  recording ||
                  (paymentMethod === 'Cash' && paid > 0 && paid < total) ||
                  (paymentMethod === 'Credit' && (!creditCustomer || creatingCustomer))
                }
                style={{
                  width: '100%', height: 62, borderRadius: 18, border: 'none',
                  background:
                    (paymentMethod === 'Cash' && paid > 0 && paid < total) ||
                    (paymentMethod === 'Credit' && (!creditCustomer || creatingCustomer))
                      ? 'var(--bg-elevated)'
                      : `linear-gradient(135deg, ${activeMethod.color} 0%, ${activeMethod.color}cc 100%)`,
                  color:
                    (paymentMethod === 'Cash' && paid > 0 && paid < total) ||
                    (paymentMethod === 'Credit' && (!creditCustomer || creatingCustomer))
                      ? 'var(--text-muted)'
                      : '#fff',
                  fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px',
                  cursor: recording ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: `0 8px 28px ${activeMethod.color}45`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'box-shadow 180ms ease',
                }}
              >
                {recording ? (
                  <><Spinner size={22} color="#fff" /> Recording…</>
                ) : paymentMethod === 'MoMo' ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                    </svg>
                    Enter MoMo Number
                  </>
                ) : !isOnline && canQueueOfflineSale(paymentMethod) ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 13 7 8" />
                      <line x1="12" y1="13" x2="12" y2="3" />
                    </svg>
                    Save Offline
                  </>
                ) : (
                  <>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Record Sale
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MoMo Sheet (shown on top of collection modal) ── */}
      {momoSheet && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1010,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
          onClick={momoSheet.status === 'idle' ? closeMomoSheet : undefined}
        >
          <div
            style={{
              width: '100%', maxWidth: 520,
              background: 'var(--bg-surface)',
              borderRadius: '28px 28px 0 0',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Amber header */}
            <div style={{
              background: 'linear-gradient(160deg, #f59e0b 0%, #d97706 100%)',
              padding: '0 20px 24px',
            }}>
              <div style={{ width: 44, height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 2, margin: '14px auto 16px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                    </svg>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Mobile Money</span>
                </div>
                <button onClick={closeMomoSheet} style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Collecting</div>
                <div style={{ fontSize: 48, fontWeight: 900, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1, textShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
                  GH₵&nbsp;{momoSheet.amount.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 20px', paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>

            {/* IDLE — phone input */}
            {momoSheet.status === 'idle' && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={{
                    display: 'block', fontSize: 11, fontWeight: 700,
                    color: 'var(--text-muted)', marginBottom: 7,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    Customer MoMo Number
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="tel"
                      placeholder="e.g. 0000000000"
                      value={momoSheet.phone}
                      onChange={(e) => setMomoSheet((p) => p ? { ...p, phone: e.target.value } : null)}
                      style={{
                        width: '100%', height: 58,
                        background: 'var(--bg-card)',
                        border: '2px solid var(--border-strong)',
                        borderRadius: 14, padding: '0 16px',
                        color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, outline: 'none',
                        fontFamily: 'inherit',
                        paddingRight: network ? 90 : 16,
                      }}
                      autoFocus
                    />
                    {network && (
                      <span style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: network.color + '22', color: network.color,
                        border: `1px solid ${network.color}55`,
                        borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700,
                      }}>
                        {network.name}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'var(--bg-elevated)', borderRadius: 12,
                  padding: '13px 16px', marginBottom: 18,
                }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Amount to collect</span>
                  <span style={{ fontWeight: 800, fontSize: 20, color: '#f59e0b' }}>
                    GH₵ {momoSheet.amount.toFixed(2)}
                  </span>
                </div>

                <button
                  onClick={sendMomoRequest}
                  disabled={!momoSheet.phone.trim()}
                  style={{
                    width: '100%', height: 58, borderRadius: 16, border: 'none',
                    background: momoSheet.phone.trim()
                      ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                      : 'var(--bg-elevated)',
                    color: momoSheet.phone.trim() ? '#fff' : 'var(--text-muted)',
                    fontSize: 17, fontWeight: 800,
                    cursor: momoSheet.phone.trim() ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit', letterSpacing: '-0.2px',
                    boxShadow: momoSheet.phone.trim() ? '0 6px 24px rgba(245,158,11,0.4)' : 'none',
                    transition: 'all 150ms',
                    WebkitTapHighlightColor: 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                  Send Payment Request
                </button>
              </>
            )}

            {/* SENDING */}
            {momoSheet.status === 'sending' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '24px 0' }}>
                <Spinner size={48} color="#f59e0b" />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Sending Request…</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>to {momoSheet.phone}</div>
                </div>
              </div>
            )}

            {/* PENDING */}
            {momoSheet.status === 'pending' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '16px 0' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: 'pulse-dot 2s ease-in-out infinite',
                }}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                  </svg>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Awaiting Approval</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55 }}>
                    Tell the customer to check their phone and approve the MoMo prompt
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 8, padding: '6px 14px' }}>
                  Expires in 90 seconds
                </div>
              </div>
            )}

            {/* FAILED */}
            {momoSheet.status === 'failed' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '12px 0' }}>
                <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '2px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#ef4444', textAlign: 'center' }}>Payment Declined</div>
                <div className="action-row" style={{ width: '100%' }}>
                  <button type="button" onClick={() => setMomoSheet((p) => p ? { ...p, status: 'idle' } : null)} className="btn btn-secondary" style={{ flex: '1 1 140px' }}>Try Again</button>
                  <button type="button" onClick={recordAsCash} className="btn btn-primary" style={{ flex: '1 1 140px' }}>Record as Cash</button>
                </div>
              </div>
            )}

            {/* TIMEOUT */}
            {momoSheet.status === 'timeout' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '12px 0' }}>
                <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(245,158,11,0.12)', border: '2px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#f59e0b', textAlign: 'center' }}>Request Timed Out</div>
                <div className="action-row" style={{ width: '100%' }}>
                  <button type="button" onClick={() => setMomoSheet((p) => p ? { ...p, status: 'idle', reference: undefined } : null)} className="btn btn-secondary" style={{ flex: '1 1 140px' }}>Try Again</button>
                  <button type="button" onClick={recordAsCash} className="btn btn-primary" style={{ flex: '1 1 140px' }}>Record as Cash</button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* ── Success Receipt ──────────────────────────────── */}
      {modal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1020,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 20px',
          }}
          onClick={newSale}
        >
          <div
            style={{
              width: '100%', maxWidth: 420,
              background: 'var(--bg-surface)',
              borderRadius: 28,
              overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Green header */}
            <div style={{
              background: 'linear-gradient(160deg, #10b981 0%, #059669 100%)',
              padding: '28px 24px 32px',
              textAlign: 'center',
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                border: '3px solid rgba(255,255,255,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                Sale Recorded · {modal.method}
              </div>
              <div style={{ fontSize: 52, fontWeight: 900, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1, textShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
                GH₵&nbsp;{modal.total.toFixed(2)}
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px 24px' }}>
              {modal.change !== 0 && (
                <div style={{
                  borderRadius: 16, padding: '16px 18px', marginBottom: 16,
                  background: modal.change >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `2px solid ${modal.change >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {modal.change >= 0 ? '↩ Change to give' : 'Balance owed'}
                    </div>
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: modal.change >= 0 ? '#10b981' : '#ef4444', letterSpacing: '-1px' }}>
                    GH₵&nbsp;{Math.abs(modal.change).toFixed(2)}
                  </div>
                </div>
              )}

              <button
                onClick={newSale}
                style={{
                  width: '100%', height: 58, borderRadius: 16, border: 'none',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer',
                  fontFamily: 'inherit', letterSpacing: '-0.2px',
                  boxShadow: '0 6px 24px rgba(16,185,129,0.4)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                + New Sale
              </button>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
                Tap anywhere to dismiss
              </p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}

const qtyBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: 17, display: 'flex',
  alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
};
