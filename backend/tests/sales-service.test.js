import { beforeEach, describe, expect, it, vi } from 'vitest';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000002';
const OTHER_CUSTOMER_ID = '00000000-0000-4000-8000-000000000099';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000003';

function buildSupabase({ customerFound = false } = {}) {
  const inserts = [];

  return {
    inserts,
    rpc: vi.fn(async () => ({ error: null })),
    from: vi.fn((table) => {
      if (table === 'customers') {
        return {
          select() {
            const filters = [];
            return {
              eq(column, value) {
                filters.push([column, value]);
                return {
                  eq(nextColumn, nextValue) {
                    filters.push([nextColumn, nextValue]);
                    return {
                      single: async () => {
                        const matches = filters.some(([c, v]) => c === 'id' && v === CUSTOMER_ID)
                          && filters.some(([c, v]) => c === 'business_id' && v === BUSINESS_ID);
                        if (customerFound && matches) {
                          return { data: { id: CUSTOMER_ID }, error: null };
                        }
                        return { data: null, error: { message: 'not found' } };
                      },
                    };
                  },
                  single: async () => ({ data: null, error: { message: 'not found' } }),
                };
              },
            };
          },
        };
      }

      if (table === 'products') {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              in: async () => ({
                data: [{
                  id: PRODUCT_ID,
                  name: 'Item',
                  stock_qty: 10,
                  reorder_level: 5,
                  is_active: true,
                  cost_price: 1,
                }],
                error: null,
              }),
            };
          },
          update() {
            return { eq: () => ({ eq: async () => ({ error: null }) }) };
          },
        };
      }

      if (table === 'sales' || table === 'sale_items' || table === 'credit_ledger' || table === 'stock_movements') {
        return {
          insert(payload) {
            inserts.push({ table, payload });
            if (table === 'sales') {
              return {
                select() {
                  return {
                    single: async () => ({ data: { id: payload.id, ...payload }, error: null }),
                  };
                },
              };
            }
            return Promise.resolve({ error: null });
          },
        };
      }

      return {
        update() {
          return { eq: async () => ({ error: null }) };
        },
      };
    }),
  };
}

describe('createSale customer ownership', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('rejects another business customer before inserting sale or credit ledger', async () => {
    const supabase = buildSupabase({ customerFound: false });
    const { createSale } = await import('../src/services/sales.js');

    await expect(createSale({
      supabase,
      businessId: BUSINESS_ID,
      userId: 'user-1',
      customerId: OTHER_CUSTOMER_ID,
      items: [{ product_id: PRODUCT_ID, qty: 1, unit_price: 20, discount: 0 }],
      paymentMethod: 'credit',
      amountPaid: 0,
      note: null,
    })).rejects.toMatchObject({
      message: 'Customer does not belong to this business.',
      status: 400,
    });

    expect(supabase.inserts.some((row) => row.table === 'sales')).toBe(false);
    expect(supabase.inserts.some((row) => row.table === 'credit_ledger')).toBe(false);
  });

  it('allows same-business customer and can write credit ledger for partial payment', async () => {
    const supabase = buildSupabase({ customerFound: true });
    const { createSale } = await import('../src/services/sales.js');

    const result = await createSale({
      supabase,
      businessId: BUSINESS_ID,
      userId: 'user-1',
      customerId: CUSTOMER_ID,
      items: [{ product_id: PRODUCT_ID, qty: 1, unit_price: 20, discount: 0 }],
      paymentMethod: 'credit',
      amountPaid: 5,
      note: null,
    });

    expect(result.balance).toBeGreaterThan(0);
    expect(supabase.inserts.some((row) => row.table === 'sales')).toBe(true);
    expect(supabase.inserts.some((row) => row.table === 'credit_ledger')).toBe(true);
  });
});
