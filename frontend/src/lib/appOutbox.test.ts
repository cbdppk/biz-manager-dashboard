import { describe, expect, it, vi } from 'vitest';
import {
  countAppOutbox,
  getAppOutbox,
  isOfflineLikeError,
  queueAppMutation,
  shouldQueueOfflineNow,
  updateAppOutboxItem,
} from './appOutbox';

vi.mock('@/lib/api', () => ({
  customersAPI: { create: vi.fn() },
  invoicesAPI: { create: vi.fn(), send: vi.fn() },
  productsAPI: { create: vi.fn() },
}));

vi.mock('@/lib/notifications', () => ({
  addNotification: vi.fn(),
}));

describe('app outbox helpers', () => {
  it('queues offline mutations and tracks pending vs failed counts', () => {
    const queued = queueAppMutation('create_customer', { name: 'Ama' });

    expect(getAppOutbox()).toHaveLength(1);
    expect(countAppOutbox()).toEqual({ pending: 1, failed: 0 });

    updateAppOutboxItem(queued.id, { status: 'failed', error: 'No network' });
    expect(countAppOutbox()).toEqual({ pending: 0, failed: 1 });
  });

  it('detects offline-like request failures', () => {
    expect(isOfflineLikeError({})).toBe(true);
    expect(isOfflineLikeError({ response: { status: 400 } })).toBe(false);
  });

  it('can short-circuit queueing when the browser is offline', () => {
    const originalNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: { onLine: false },
    });

    expect(shouldQueueOfflineNow()).toBe(true);

    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });
});
