/* Lightweight in-browser notification store ─────────────────── */

export type NotifType = 'sale' | 'stock' | 'billing' | 'system' | 'ai';

export interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  ts: number;
  read: boolean;
  href?: string;
}

const KEY = 'bm_notifications';
const MAX = 50;

function load(): Notification[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function save(items: Notification[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {}
}

export function getNotifications(): Notification[] {
  return load();
}

export function addNotification(n: Omit<Notification, 'id' | 'ts' | 'read'>): Notification {
  const item: Notification = {
    ...n,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
    read: false,
  };
  const existing = load();
  save([item, ...existing]);
  window.dispatchEvent(new CustomEvent('bm:notification', { detail: item }));
  return item;
}

export function markRead(id: string) {
  const items = load().map(n => n.id === id ? { ...n, read: true } : n);
  save(items);
  window.dispatchEvent(new CustomEvent('bm:notification:read'));
}

export function markAllRead() {
  const items = load().map(n => ({ ...n, read: true }));
  save(items);
  window.dispatchEvent(new CustomEvent('bm:notification:read'));
}

export function clearAll() {
  save([]);
  window.dispatchEvent(new CustomEvent('bm:notification:read'));
}

export function unreadCount(): number {
  return load().filter(n => !n.read).length;
}
