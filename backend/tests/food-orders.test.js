import { describe, expect, it } from 'vitest';

describe('food order helpers', () => {
  it('builds ingredient deductions with yield and waste factor', async () => {
    const { buildRecipeDeductions } = await import('../src/helpers/foodOrders.js');

    const deductions = buildRecipeDeductions(
      [{ product_id: 'meal-1', qty: 3 }],
      [{
        menu_product_id: 'meal-1',
        yield_qty: 2,
        recipe_items: [
          { ingredient_product_id: 'ing-1', qty_required: 1, waste_factor: 0.1 },
          { ingredient_product_id: 'ing-2', qty_required: 0.5, waste_factor: 0 },
        ],
      }]
    );

    expect(deductions).toEqual([
      { ingredient_product_id: 'ing-1', qty: 2 },
      { ingredient_product_id: 'ing-2', qty: 1 },
    ]);
  });

  it('returns empty deductions when no matching recipes exist', async () => {
    const { buildRecipeDeductions } = await import('../src/helpers/foodOrders.js');
    expect(buildRecipeDeductions([{ product_id: 'meal-x', qty: 2 }], [])).toEqual([]);
  });
});
