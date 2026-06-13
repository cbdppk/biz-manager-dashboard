import { customersAPI, productsAPI, salesAPI } from '@/lib/api';
import { addNotification } from '@/lib/notifications';
import {
  countPendingSales,
  getPendingSales,
  loadCustomerCache,
  type PendingSaleDraft,
  removePendingSale,
  saveCustomerCache,
  saveProductCache,
  updatePendingSale,
} from '@/lib/posOffline';

const SYNC_STALE_MS = 2 * 60 * 1000;

let syncInFlight = false;

/** Map offline POS labels to API payment_method values expected by the backend. */
export function normalizePaymentMethodForApi(method: string): 'cash' | 'card' | 'credit' | 'momo' {
  const raw = String(method || 'cash').toLowerCase().trim();
  if (raw === 'credit') return 'credit';
  if (raw === 'card') return 'card';
  if (raw === 'momo' || raw === 'mobile money') return 'momo';
  return 'cash';
}

export function formatOfflineSyncError(error: unknown): string {
  const err = error as { response?: { data?: { error?: string; code?: string; products?: Array<{ name?: string; product_name?: string }> } } };
  const data = err?.response?.data;
  if (data?.code === 'INSUFFICIENT_STOCK') {
    const names = (data.products || [])
      .map((p) => p.name || p.product_name)
      .filter(Boolean);
    if (names.length > 0) {
      return `Not enough stock for: ${names.join(', ')}. Restock those products or edit the queued sale, then retry.`;
    }
    return 'Not enough stock for one or more products in this queued sale.';
  }
  return data?.error || 'Could not sync queued sale.';
}

function normalizePhone(phone?: string | null) {
  return (phone || '').replace(/\D/g, '');
}

async function resolveCustomerId(pending: PendingSaleDraft): Promise<string | undefined> {
  if (pending.payload.customer_id) return pending.payload.customer_id;

  const draft = pending.payload.customer_draft;
  if (!draft?.name?.trim()) return undefined;

  const cache = loadCustomerCache();
  const phoneKey = normalizePhone(draft.phone);
  if (phoneKey) {
    const byPhone = cache.find((c) => normalizePhone(c.phone) === phoneKey);
    if (byPhone) return byPhone.id;
  }

  const nameKey = draft.name.trim().toLowerCase();
  const byName = cache.find((c) => c.name.trim().toLowerCase() === nameKey);
  if (byName) return byName.id;

  const created = await customersAPI.create({
    name: draft.name.trim(),
    phone: draft.phone || null,
  });
  const customerId = created.data?.customer?.id ?? created.data?.id;
  if (customerId) {
    saveCustomerCache([
      { id: customerId, name: draft.name.trim(), phone: draft.phone || null },
      ...cache.filter((customer) => customer.id !== customerId),
    ].slice(0, 250));
  }
  return customerId;
}

function shouldSkipSync(pending: PendingSaleDraft): boolean {
  if (pending.status !== 'syncing') return false;
  const age = Date.now() - pending.createdAt;
  return age < SYNC_STALE_MS;
}

async function syncOnePendingSale(pending: PendingSaleDraft): Promise<'synced' | 'failed' | 'skipped'> {
  if (shouldSkipSync(pending)) return 'skipped';

  updatePendingSale(pending.id, { status: 'syncing', error: undefined });

  try {
    const customerId = await resolveCustomerId(pending);

    await salesAPI.create({
      items: pending.payload.items,
      total: pending.payload.total,
      payment_method: normalizePaymentMethodForApi(pending.payload.payment_method),
      amount_paid: pending.payload.amount_paid,
      customer_id: customerId,
      note: `offline_queue:${pending.id}`,
    });

    removePendingSale(pending.id);
    addNotification({
      type: 'sale',
      title: 'Offline sale synced',
      body: `Queued ${normalizePaymentMethodForApi(pending.payload.payment_method)} sale synced successfully.`,
      href: '/sales',
    });
    return 'synced';
  } catch (error) {
    const message = formatOfflineSyncError(error);
    updatePendingSale(pending.id, { status: 'failed', error: message });
    addNotification({
      type: 'system',
      title: 'Offline sale needs attention',
      body: message,
      href: '/offline',
    });
    return 'failed';
  }
}

export async function hydratePosOfflineCache() {
  try {
    const [productRes, customerRes] = await Promise.all([
      productsAPI.list({ limit: 250 }),
      customersAPI.list({ limit: 250 }),
    ]);
    saveProductCache(productRes.data?.products ?? productRes.data ?? []);
    saveCustomerCache(customerRes.data?.customers ?? customerRes.data ?? []);
  } catch {
    // cache refresh is best-effort
  }
}

/** Mark a failed queued sale as pending again for manual retry. */
export function retryFailedSale(id: string) {
  updatePendingSale(id, { status: 'pending', error: undefined });
}

export async function syncSinglePendingSale(id: string) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return countPendingSales();
  }

  const pending = getPendingSales().find((item) => item.id === id);
  if (!pending || pending.status === 'syncing') return countPendingSales();

  syncInFlight = true;
  try {
    await syncOnePendingSale(pending);
    await hydratePosOfflineCache();
    return countPendingSales();
  } finally {
    syncInFlight = false;
  }
}

export async function syncPendingSales() {
  if (syncInFlight || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return countPendingSales();
  }

  syncInFlight = true;

  try {
    const queued = getPendingSales().filter((item) => {
      if (item.status === 'pending' || item.status === 'failed') return true;
      if (item.status === 'syncing') return !shouldSkipSync(item);
      return false;
    });
    let syncedAny = false;

    for (const pending of queued) {
      const result = await syncOnePendingSale(pending);
      if (result === 'synced') syncedAny = true;
    }

    if (syncedAny) await hydratePosOfflineCache();
    return countPendingSales();
  } finally {
    syncInFlight = false;
  }
}
