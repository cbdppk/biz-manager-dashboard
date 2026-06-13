import { describe, expect, it } from 'vitest';

describe('inventory helpers', () => {
  it('aggregates duplicate sale items by product id', async () => {
    const inventoryModule = await import('../src/helpers/inventory.js');
    const { aggregateSaleItems } = inventoryModule;

    expect(aggregateSaleItems([
      { product_id: 'p-1', qty: 2 },
      { product_id: 'p-1', qty: 3 },
      { product_id: 'p-2', qty: 1 },
    ])).toEqual([
      { product_id: 'p-1', qty: 5 },
      { product_id: 'p-2', qty: 1 },
    ]);
  });

  it('flags missing and insufficient stock before a sale is recorded', async () => {
    const inventoryModule = await import('../src/helpers/inventory.js');
    const { buildInsufficientStockIssues } = inventoryModule;

    expect(buildInsufficientStockIssues([
      { id: 'p-1', name: 'Rice', stock_qty: 4, is_active: true },
      { id: 'p-2', name: 'Oil', stock_qty: 1, is_active: true },
    ], [
      { product_id: 'p-1', qty: 2 },
      { product_id: 'p-1', qty: 3 },
      { product_id: 'p-2', qty: 1 },
      { product_id: 'missing', qty: 1 },
    ])).toEqual([
      {
        product_id: 'p-1',
        product_name: 'Rice',
        requested_qty: 5,
        available_qty: 4,
        reason: 'insufficient_stock',
      },
      {
        product_id: 'missing',
        product_name: 'Unknown product',
        requested_qty: 1,
        available_qty: 0,
        reason: 'missing_product',
      },
    ]);
  });
});
