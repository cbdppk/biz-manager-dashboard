import { customersAPI, invoicesAPI, productsAPI } from '@/lib/api';
import { addNotification } from '@/lib/notifications';

const OUTBOX_KEY = 'bm_app_outbox';

export type AppOutboxKind = 'create_customer' | 'create_product' | 'create_invoice';

export interface AppOutboxItem {
  id: string;
  kind: AppOutboxKind;
  createdAt: number;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
  payload: Record<string, any>;
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function emitOutboxEvent() {
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

export function getAppOutbox() {
  return loadJson<AppOutboxItem[]>(OUTBOX_KEY, []);
}

export function saveAppOutbox(items: AppOutboxItem[]) {
  saveJson(OUTBOX_KEY, items);
  emitOutboxEvent();
}

export function queueAppMutation(kind: AppOutboxKind, payload: Record<string, any>) {
  const queued = getAppOutbox();
  const item: AppOutboxItem = {
    id: `outbox-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    createdAt: Date.now(),
    status: 'pending',
    payload,
  };
  saveAppOutbox([item, ...queued]);
  return item;
}

export function updateAppOutboxItem(id: string, patch: Partial<AppOutboxItem>) {
  const next = getAppOutbox().map((item) => item.id === id ? { ...item, ...patch } : item);
  saveAppOutbox(next);
}

export function removeAppOutboxItem(id: string) {
  saveAppOutbox(getAppOutbox().filter((item) => item.id !== id));
}

export function countAppOutbox() {
  const items = getAppOutbox();
  return {
    pending: items.filter((item) => item.status === 'pending' || item.status === 'syncing').length,
    failed: items.filter((item) => item.status === 'failed').length,
  };
}

export function isOfflineLikeError(error: any) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return !!error && !error.response;
}

export function shouldQueueOfflineNow() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function syncCustomer(item: AppOutboxItem) {
  const res = await customersAPI.create(item.payload);
  const customerId = res.data?.id ?? res.data?.customer?.id;
  removeAppOutboxItem(item.id);
  addNotification({
    type: 'system',
    title: 'Customer synced',
    body: `${item.payload.name || 'Queued customer'} was created successfully.`,
    href: customerId ? `/customers/${customerId}` : '/customers',
  });
}

async function syncProduct(item: AppOutboxItem) {
  const res = await productsAPI.create(item.payload);
  const productId = res.data?.id ?? res.data?.product?.id;
  removeAppOutboxItem(item.id);
  addNotification({
    type: 'system',
    title: 'Product synced',
    body: `${item.payload.name || 'Queued product'} is now in stock.`,
    href: productId ? `/products/${productId}` : '/products',
  });
}

async function syncInvoice(item: AppOutboxItem) {
  const { send_on_sync, ...payload } = item.payload;
  const created = await invoicesAPI.create(payload);
  const invoiceId = created.data?.id ?? created.data?.invoice?.id;

  let sendError: string | null = null;
  if (send_on_sync && invoiceId) {
    try {
      await invoicesAPI.send(invoiceId);
    } catch (error: any) {
      sendError = error?.response?.data?.error || 'Invoice saved, but sending failed.';
    }
  }

  removeAppOutboxItem(item.id);
  addNotification({
    type: 'system',
    title: sendError ? 'Invoice synced with warning' : 'Invoice synced',
    body: sendError || `${payload.note ? 'Queued invoice' : 'Invoice'} was created successfully.`,
    href: invoiceId ? `/invoices/${invoiceId}` : '/invoices',
  });
}

export async function syncAppOutbox() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return countAppOutbox();
  }

  const queued = getAppOutbox();
  for (const item of queued) {
    updateAppOutboxItem(item.id, { status: 'syncing', error: undefined });

    try {
      if (item.kind === 'create_customer') {
        await syncCustomer(item);
      } else if (item.kind === 'create_product') {
        await syncProduct(item);
      } else if (item.kind === 'create_invoice') {
        await syncInvoice(item);
      }
    } catch (error: any) {
      updateAppOutboxItem(item.id, {
        status: 'failed',
        error: error?.response?.data?.error || error?.message || 'Could not sync queued change.',
      });
      addNotification({
        type: 'system',
        title: 'Queued change needs attention',
        body: error?.response?.data?.error || error?.message || 'Could not sync queued change.',
        href: '/offline',
      });
    }
  }

  return countAppOutbox();
}
