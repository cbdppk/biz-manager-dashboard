import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/helpers/arkesel.js', () => ({ sendSMS: vi.fn().mockResolvedValue(true) }));
vi.mock('../src/helpers/whatsapp.js', () => ({ sendWhatsAppMessage: vi.fn().mockResolvedValue(true) }));

function makeThenableResult(result) {
  const builder = {
    eq() { return builder; },
    ilike() { return builder; },
    or() { return builder; },
    order() { return builder; },
    limit() { return builder; },
    select() { return builder; },
    single() { return Promise.resolve(result); },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

describe('AI tool execution', () => {
  it('creates a customer through the approved AI tool path', async () => {
    const inserts = [];
    const supabase = {
      from(table) {
        if (table === 'customers') {
          return {
            insert(payload) {
              inserts.push({ table, payload });
              return {
                select() {
                  return {
                    single: async () => ({ data: { id: 'cust-1', name: payload.name }, error: null }),
                  };
                },
              };
            },
          };
        }

        if (table === 'ai_tool_log') {
          return {
            insert(payload) {
              inserts.push({ table, payload });
              return Promise.resolve({ error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    const { executeAiTool } = await import('../src/ai/executeTool.js');
    const result = await executeAiTool({
      supabase,
      businessId: 'biz-1',
      userId: 'user-1',
      toolName: 'create_customer',
      toolInput: { name: 'Demo Customer', phone: '0000000000' },
    });

    expect(result.success).toBe(true);
    expect(result.result.customer_id).toBe('cust-1');
    expect(inserts[0]).toMatchObject({
      table: 'customers',
      payload: {
        business_id: 'biz-1',
        name: 'Demo Customer',
        phone: '0000000000',
      },
    });
  });

  it('restocks a product and records a stock movement through the AI tool path', async () => {
    const updates = [];
    const movementInserts = [];
    const supabase = {
      from(table) {
        if (table === 'products') {
          return {
            select() {
              return makeThenableResult({
                data: {
                  id: 'prod-1',
                  name: 'Blue Band',
                  stock_qty: 3,
                  reorder_level: 5,
                  is_active: true,
                },
                error: null,
              });
            },
            update(payload) {
              updates.push(payload);
              return makeThenableResult({ error: null });
            },
          };
        }

        if (table === 'stock_movements') {
          return {
            insert(payload) {
              movementInserts.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }

        if (table === 'ai_tool_log') {
          return {
            insert() {
              return Promise.resolve({ error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    const { executeAiTool } = await import('../src/ai/executeTool.js');
    const result = await executeAiTool({
      supabase,
      businessId: 'biz-1',
      userId: 'user-1',
      toolName: 'restock_product',
      toolInput: { product_id: 'prod-1', quantity: 4, note: 'Supplier delivery' },
    });

    expect(result.success).toBe(true);
    expect(result.result.quantity_after).toBe(7);
    expect(updates[0]).toMatchObject({
      stock_qty: 7,
      needs_restock: false,
    });
    expect(movementInserts[0]).toMatchObject({
      business_id: 'biz-1',
      product_id: 'prod-1',
      movement_type: 'restock',
      quantity_change: 4,
      quantity_before: 3,
      quantity_after: 7,
      note: 'Supplier delivery',
    });
  });

});

describe('AI tool helpers', () => {
  it('normalizes payment methods for Ghanaian labels', async () => {
    const { normalizePaymentMethod } = await import('../src/ai/tools.js');
    expect(normalizePaymentMethod('Mobile Money')).toBe('momo');
    expect(normalizePaymentMethod('CASH')).toBe('cash');
    expect(normalizePaymentMethod('on credit')).toBe('credit');
  });
});
