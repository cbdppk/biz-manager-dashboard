import { describe, expect, it } from 'vitest';
import { formatOfflineSyncError, normalizePaymentMethodForApi } from './posOfflineSync';

describe('posOfflineSync helpers', () => {
  it('normalizes POS payment labels for the API', () => {
    expect(normalizePaymentMethodForApi('Cash')).toBe('cash');
    expect(normalizePaymentMethodForApi('Credit')).toBe('credit');
    expect(normalizePaymentMethodForApi('Card')).toBe('card');
  });

  it('formats insufficient stock errors clearly', () => {
    const message = formatOfflineSyncError({
      response: {
        data: {
          code: 'INSUFFICIENT_STOCK',
          products: [{ name: 'Milo Sachet' }],
        },
      },
    });
    expect(message).toContain('Milo Sachet');
    expect(message).toContain('Not enough stock');
  });
});
