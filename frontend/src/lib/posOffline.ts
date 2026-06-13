const CART_KEY = 'bm_pos_cart';
const PRODUCT_CACHE_KEY = 'bm_pos_product_cache';
const CUSTOMER_CACHE_KEY = 'bm_pos_customer_cache';
const OUTBOX_KEY = 'bm_pos_outbox';
const LEGACY_SESSION_CART_KEY = 'bm_pos_cart';

export interface CachedProduct {
  id: string;
  name: string;
  price: number;
  stock_qty: number;
}

export interface CachedCustomer {
  id: string;
  name: string;
  phone?: string | null;
}

function createOfflineSaleId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `offline-sale-${crypto.randomUUID()}`;
  }
  return `offline-sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface PendingSaleDraft {
  id: string;
  createdAt: number;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
  payload: {
    items: Array<{ product_id: string; qty: number; unit_price: number; discount: number }>;
    total: number;
    payment_method: 'Cash' | 'Card' | 'Credit' | 'cash' | 'card' | 'credit';
    amount_paid: number;
    customer_id?: string;
    customer_draft?: {
      name: string;
      phone?: string | null;
    };
  };
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function emitPosOutboxEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('bm:outbox'));
}

function loadJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function migrateLegacyPosCart() {
  if (!canUseStorage() || typeof window.sessionStorage === 'undefined') return;

  const existing = window.localStorage.getItem(CART_KEY);
  if (existing) return;

  const legacy = window.sessionStorage.getItem(LEGACY_SESSION_CART_KEY);
  if (!legacy) return;

  window.localStorage.setItem(CART_KEY, legacy);
  window.sessionStorage.removeItem(LEGACY_SESSION_CART_KEY);
}

export function loadPosCart<T>(fallback: T): T {
  return loadJson(CART_KEY, fallback);
}

export function savePosCart<T>(value: T) {
  saveJson(CART_KEY, value);
}

export function clearPosCart() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(CART_KEY);
}

export function saveProductCache(products: CachedProduct[]) {
  saveJson(PRODUCT_CACHE_KEY, products);
}

export function loadProductCache(): CachedProduct[] {
  return loadJson<CachedProduct[]>(PRODUCT_CACHE_KEY, []);
}

export function saveCustomerCache(customers: CachedCustomer[]) {
  saveJson(CUSTOMER_CACHE_KEY, customers);
}

export function loadCustomerCache(): CachedCustomer[] {
  return loadJson<CachedCustomer[]>(CUSTOMER_CACHE_KEY, []);
}

export function findCachedProducts(query: string) {
  const search = query.trim().toLowerCase();
  if (!search) return [];

  return loadProductCache()
    .filter((product) => product.name.toLowerCase().includes(search))
    .slice(0, 12);
}

export function findCachedCustomers(query: string) {
  const search = query.trim().toLowerCase();
  if (!search) return [];

  return loadCustomerCache()
    .filter((customer) => {
      const haystack = `${customer.name} ${customer.phone || ''}`.toLowerCase();
      return haystack.includes(search);
    })
    .slice(0, 12);
}

export function reduceCachedProductStock(items: Array<{ product_id: string; qty: number }>) {
  const aggregated = new Map<string, number>();
  for (const item of items) {
    aggregated.set(item.product_id, (aggregated.get(item.product_id) || 0) + Number(item.qty || 0));
  }

  const nextProducts = loadProductCache().map((product) => {
    const qty = aggregated.get(product.id);
    if (!qty) return product;
    return {
      ...product,
      stock_qty: Math.max(0, Number(product.stock_qty || 0) - qty),
    };
  });

  saveProductCache(nextProducts);
}

export function getPendingSales() {
  return loadJson<PendingSaleDraft[]>(OUTBOX_KEY, []);
}

export function savePendingSales(items: PendingSaleDraft[]) {
  saveJson(OUTBOX_KEY, items);
  emitPosOutboxEvent();
}

export function queuePendingSale(payload: PendingSaleDraft['payload']) {
  const queued = getPendingSales();
  const item: PendingSaleDraft = {
    id: createOfflineSaleId(),
    createdAt: Date.now(),
    status: 'pending',
    payload,
  };

  savePendingSales([item, ...queued]);
  return item;
}

export function updatePendingSale(id: string, patch: Partial<PendingSaleDraft>) {
  const nextItems = getPendingSales().map((item) => item.id === id ? { ...item, ...patch } : item);
  savePendingSales(nextItems);
}

export function removePendingSale(id: string) {
  savePendingSales(getPendingSales().filter((item) => item.id !== id));
}

/** Re-queue a failed sale for another sync attempt (does not delete history). */
export function retryPendingSale(id: string) {
  updatePendingSale(id, { status: 'pending', error: undefined });
}

export function countPendingSales() {
  const items = getPendingSales();
  return {
    pending: items.filter((item) => item.status === 'pending' || item.status === 'syncing').length,
    failed: items.filter((item) => item.status === 'failed').length,
  };
}
