import { describe, expect, it } from 'vitest';
import {
  countPendingSales,
  findCachedCustomers,
  findCachedProducts,
  getPendingSales,
  queuePendingSale,
  reduceCachedProductStock,
  saveCustomerCache,
  saveProductCache,
  updatePendingSale,
} from './posOffline';

describe('pos offline helpers', () => {
  it('searches cached products and updates cached stock after a queued sale', () => {
    saveProductCache([
      { id: 'p-1', name: 'Milk', price: 12, stock_qty: 6 },
      { id: 'p-2', name: 'Soap', price: 4, stock_qty: 3 },
    ]);

    expect(findCachedProducts('mil')).toEqual([
      { id: 'p-1', name: 'Milk', price: 12, stock_qty: 6 },
    ]);

    reduceCachedProductStock([{ product_id: 'p-1', qty: 2 }]);

    expect(findCachedProducts('milk')).toEqual([
      { id: 'p-1', name: 'Milk', price: 12, stock_qty: 4 },
    ]);
  });

  it('tracks queued and failed offline sales', () => {
    const queued = queuePendingSale({
      items: [{ product_id: 'p-1', qty: 2, unit_price: 8, discount: 0 }],
      total: 16,
      payment_method: 'Cash',
      amount_paid: 16,
    });

    expect(getPendingSales()).toHaveLength(1);
    expect(countPendingSales()).toEqual({ pending: 1, failed: 0 });

    updatePendingSale(queued.id, { status: 'failed', error: 'Network timeout' });
    expect(countPendingSales()).toEqual({ pending: 0, failed: 1 });
  });

  it('searches cached customers while offline', () => {
    saveCustomerCache([
      { id: 'c-1', name: 'Demo Customer', phone: '0000000000' },
      { id: 'c-2', name: 'Example User', phone: '0000000000' },
    ]);

    expect(findCachedCustomers('ama')).toEqual([
      { id: 'c-1', name: 'Demo Customer', phone: '0000000000' },
    ]);
    expect(findCachedCustomers('0201')).toEqual([
      { id: 'c-2', name: 'Example User', phone: '0000000000' },
    ]);
  });
});
