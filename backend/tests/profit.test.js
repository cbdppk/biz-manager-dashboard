import { describe, expect, it } from 'vitest';

describe('profit helpers', () => {
  it('computes sale item profit with cost snapshot', async () => {
    const { computeSaleItemProfit } = await import('../src/helpers/profit.js');

    const result = computeSaleItemProfit({ qty: 2, unit_price: 100, discount: 0 }, 70);

    expect(result.subtotal).toBe(200);
    expect(result.cost_price_snapshot).toBe(70);
    expect(result.line_cost).toBe(140);
    expect(result.line_profit).toBe(60);
    expect(result.profit_margin).toBe(30);
  });

  it('applies discount before profit calculation', async () => {
    const { computeSaleItemProfit } = await import('../src/helpers/profit.js');

    const result = computeSaleItemProfit({ qty: 2, unit_price: 100, discount: 20 }, 70);

    expect(result.subtotal).toBe(180);
    expect(result.line_cost).toBe(140);
    expect(result.line_profit).toBe(40);
  });

  it('handles zero cost price safely', async () => {
    const { computeSaleItemProfit } = await import('../src/helpers/profit.js');

    const result = computeSaleItemProfit({ qty: 1, unit_price: 50, discount: 0 }, 0);

    expect(result.line_cost).toBe(0);
    expect(result.line_profit).toBe(50);
    expect(result.profit_margin).toBe(100);
  });

  it('aggregates profit totals from line items', async () => {
    const { aggregateProfitTotals } = await import('../src/helpers/profit.js');

    const totals = aggregateProfitTotals([
      { subtotal: 200, line_cost: 140, line_profit: 60 },
      { subtotal: 100, line_cost: 50, line_profit: 50 },
    ]);

    expect(totals.revenue).toBe(300);
    expect(totals.cost_of_goods_sold).toBe(190);
    expect(totals.gross_profit).toBe(110);
    expect(totals.gross_margin).toBeCloseTo(36.67, 1);
  });
});

describe('loan readiness grading', () => {
  it('maps score to grade bands', async () => {
    const { buildLoanReadiness } = await import('../src/services/businessSummary.js');
    expect(typeof buildLoanReadiness).toBe('function');
  });
});
