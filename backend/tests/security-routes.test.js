import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createRequire } from 'module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

function authHeader(tokenVersion = 0) {
  const token = jwt.sign({ userId: 'user-1', tokenVersion }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return `Bearer ${token}`;
}

function createAuthUserChain(role = 'owner') {
  return {
    eq() {
      return this;
    },
    single: async () => ({
      data: {
        id: 'user-1',
        business_id: 'biz-1',
        role,
        is_active: true,
        token_version: 0,
      },
      error: null,
    }),
  };
}

function installModuleMock(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  delete require.cache[resolved];
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
  return resolved;
}

function resetRouteModules(...paths) {
  for (const relativePath of paths) {
    delete require.cache[require.resolve(relativePath)];
  }
}

describe('backend security regressions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'supabase-test-key';
    process.env.JWT_SECRET = 'jwt-test-secret';
    process.env.NODE_ENV = 'test';
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.META_APP_SECRET;
  });

  it('records cash payments without chaining onto an already executed insert', async () => {
    const insertedPayments = [];
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'users') {
          return { select: () => createAuthUserChain() };
        }

        if (table === 'payments') {
          return {
            insert(payload) {
              insertedPayments.push(payload);
              return {
                select() {
                  return {
                    single: async () => ({ data: { id: 'payment-1', ...payload }, error: null }),
                  };
                },
              };
            },
          };
        }

        throw new Error(`Unhandled table mock: ${table}`);
      }),
    };

    installModuleMock('../src/config/supabase.js', supabase);
    resetRouteModules('../src/middleware/auth.js', '../src/middleware/tenantScope.js', '../src/routes/payments.js');

    const paymentsRoutes = require('../src/routes/payments.js');
    const app = express();
    app.use(express.json());
    app.use('/api/payments', paymentsRoutes);

    const response = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader())
      .send({ amount: 25, method: 'cash', note: 'counter payment' });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe('payment-1');
    expect(insertedPayments[0]).toMatchObject({
      business_id: 'biz-1',
      amount: 25,
      method: 'cash',
      status: 'completed',
    });
  });

  it('scopes successful MoMo status updates to the authenticated business', async () => {
    const eqCalls = [];
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'users') {
          return { select: () => createAuthUserChain() };
        }

        if (table === 'payments') {
          return {
            select() {
              return {
                eq(column, value) {
                  eqCalls.push([column, value]);
                  return this;
                },
                single: async () => ({ data: { id: 'payment-1' }, error: null }),
              };
            },
            update() {
              return {
                eq(column, value) {
                  eqCalls.push([column, value]);
                  return this;
                },
              };
            },
          };
        }

        throw new Error(`Unhandled table mock: ${table}`);
      }),
    };
    const momo = {
      initiateMoMoPayment: vi.fn(),
      checkMoMoStatus: vi.fn(async () => ({ status: 'SUCCESSFUL' })),
    };

    installModuleMock('../src/config/supabase.js', supabase);
    installModuleMock('../src/helpers/momo.js', momo);
    resetRouteModules('../src/middleware/auth.js', '../src/middleware/tenantScope.js', '../src/routes/payments.js');

    const paymentsRoutes = require('../src/routes/payments.js');
    const app = express();
    app.use(express.json());
    app.use('/api/payments', paymentsRoutes);

    const response = await request(app)
      .get('/api/payments/momo/status/ref-123')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(eqCalls).toContainEqual(['provider_ref', 'ref-123']);
    expect(eqCalls).toContainEqual(['business_id', 'biz-1']);
  });

  it('rejects protected invoice fields instead of passing them to service-role updates', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'users') {
          return { select: () => createAuthUserChain() };
        }

        throw new Error(`Unexpected table access after validation failure: ${table}`);
      }),
    };

    installModuleMock('../src/config/supabase.js', supabase);
    resetRouteModules('../src/middleware/auth.js', '../src/middleware/tenantScope.js', '../src/routes/invoices.js');

    const invoiceRoutes = require('../src/routes/invoices.js');
    const app = express();
    app.use(express.json());
    app.use('/api/invoices', invoiceRoutes);

    const response = await request(app)
      .patch('/api/invoices/00000000-0000-4000-8000-000000000001')
      .set('Authorization', authHeader())
      .send({ business_id: 'other-business', note: 'try to move invoice' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });

  it('does not delete invoice item rows before proving invoice ownership', async () => {
    let invoiceItemsDeleteCalled = false;
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'users') {
          return { select: () => createAuthUserChain() };
        }

        if (table === 'invoices') {
          return {
            select() {
              return {
                eq() {
                  return this;
                },
                single: async () => ({ data: null, error: { message: 'not found' } }),
              };
            },
          };
        }

        if (table === 'invoice_items') {
          invoiceItemsDeleteCalled = true;
          return {
            delete() {
              return {
                eq: async () => ({ data: null, error: null }),
              };
            },
          };
        }

        throw new Error(`Unhandled table mock: ${table}`);
      }),
    };

    installModuleMock('../src/config/supabase.js', supabase);
    resetRouteModules('../src/middleware/auth.js', '../src/middleware/tenantScope.js', '../src/routes/invoices.js');

    const invoiceRoutes = require('../src/routes/invoices.js');
    const app = express();
    app.use(express.json());
    app.use('/api/invoices', invoiceRoutes);

    const response = await request(app)
      .delete('/api/invoices/00000000-0000-4000-8000-000000000001')
      .set('Authorization', authHeader());

    expect(response.status).toBe(404);
    expect(invoiceItemsDeleteCalled).toBe(false);
  });

  it('rejects sales for customers outside the authenticated business', async () => {
    let salesInsertCalled = false;
    const customerEqCalls = [];
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'users') {
          return { select: () => createAuthUserChain() };
        }

        if (table === 'customers') {
          return {
            select() {
              return {
                eq(column, value) {
                  customerEqCalls.push([column, value]);
                  return this;
                },
                single: async () => ({ data: null, error: { message: 'not found' } }),
              };
            },
          };
        }

        if (table === 'sales') {
          salesInsertCalled = true;
        }

        throw new Error(`Unexpected table access after customer guard: ${table}`);
      }),
    };

    installModuleMock('../src/config/supabase.js', supabase);
    resetRouteModules('../src/middleware/auth.js', '../src/middleware/tenantScope.js', '../src/routes/sales.js');

    const salesRoutes = require('../src/routes/sales.js');
    const app = express();
    app.use(express.json());
    app.use('/api/sales', salesRoutes);

    const customerId = '00000000-0000-4000-8000-000000000002';
    const response = await request(app)
      .post('/api/sales')
      .set('Authorization', authHeader())
      .send({
        customer_id: customerId,
        payment_method: 'cash',
        amount_paid: 10,
        items: [{ product_id: '00000000-0000-4000-8000-000000000003', qty: 1, unit_price: 10 }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Customer does not belong to this business.');
    expect(customerEqCalls).toContainEqual(['id', customerId]);
    expect(customerEqCalls).toContainEqual(['business_id', 'biz-1']);
    expect(salesInsertCalled).toBe(false);
  });

  it('accepts sales for customers belonging to the authenticated business', async () => {
    const createSale = vi.fn(async () => ({
      saleId: 'sale-1',
      sale: { id: 'sale-1', total_amount: 10 },
      method: 'cash',
      total: 10,
      balance: 0,
    }));
    const customerEqCalls = [];
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'users') {
          return { select: () => createAuthUserChain() };
        }

        if (table === 'customers') {
          return {
            select() {
              return {
                eq(column, value) {
                  customerEqCalls.push([column, value]);
                  return this;
                },
                single: async () => ({ data: { id: '00000000-0000-4000-8000-000000000010' }, error: null }),
              };
            },
          };
        }

        throw new Error(`Unexpected table access after sale creation: ${table}`);
      }),
    };

    delete require.cache[require.resolve('../src/services/sales.js')];
    const { assertSaleCustomerOwnership } = require('../src/services/sales.js');

    installModuleMock('../src/config/supabase.js', supabase);
    installModuleMock('../src/services/sales.js', { createSale, assertSaleCustomerOwnership });
    resetRouteModules('../src/middleware/auth.js', '../src/middleware/tenantScope.js', '../src/routes/sales.js');

    const salesRoutes = require('../src/routes/sales.js');
    const app = express();
    app.use(express.json());
    app.use('/api/sales', salesRoutes);

    const customerId = '00000000-0000-4000-8000-000000000010';
    const response = await request(app)
      .post('/api/sales')
      .set('Authorization', authHeader())
      .send({
        customer_id: customerId,
        payment_method: 'cash',
        amount_paid: 10,
        items: [{ product_id: '00000000-0000-4000-8000-000000000003', qty: 1, unit_price: 10 }],
      });

    expect(response.status).toBe(201);
    expect(customerEqCalls).toContainEqual(['id', customerId]);
    expect(customerEqCalls).toContainEqual(['business_id', 'biz-1']);
    expect(createSale).toHaveBeenCalled();
  });

  it('rejects invoice create payloads with protected fields', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'users') {
          return { select: () => createAuthUserChain() };
        }
        throw new Error(`Unexpected table access after validation failure: ${table}`);
      }),
    };

    installModuleMock('../src/config/supabase.js', supabase);
    resetRouteModules('../src/middleware/auth.js', '../src/middleware/tenantScope.js', '../src/routes/invoices.js');

    const invoiceRoutes = require('../src/routes/invoices.js');
    const app = express();
    app.use(express.json());
    app.use('/api/invoices', invoiceRoutes);

    const response = await request(app)
      .post('/api/invoices')
      .set('Authorization', authHeader())
      .send({
        business_id: 'other-business',
        invoice_number: 'INV-999',
        total_amount: 500,
        items: [{ product_name: 'Item', qty: 1, unit_price: 10 }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });

  it('returns 404 for MoMo references owned by another business without calling the provider', async () => {
    const momo = {
      initiateMoMoPayment: vi.fn(),
      checkMoMoStatus: vi.fn(async () => ({ status: 'SUCCESSFUL' })),
    };
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'users') {
          return { select: () => createAuthUserChain() };
        }

        if (table === 'payments') {
          return {
            select() {
              return {
                eq() {
                  return this;
                },
                single: async () => ({ data: null, error: { message: 'not found' } }),
              };
            },
          };
        }

        throw new Error(`Unhandled table mock: ${table}`);
      }),
    };

    installModuleMock('../src/config/supabase.js', supabase);
    installModuleMock('../src/helpers/momo.js', momo);
    resetRouteModules('../src/middleware/auth.js', '../src/middleware/tenantScope.js', '../src/routes/payments.js');

    const paymentsRoutes = require('../src/routes/payments.js');
    const app = express();
    app.use(express.json());
    app.use('/api/payments', paymentsRoutes);

    const response = await request(app)
      .get('/api/payments/momo/status/other-biz-ref')
      .set('Authorization', authHeader());

    expect(response.status).toBe(404);
    expect(momo.checkMoMoStatus).not.toHaveBeenCalled();
  });

  it('rejects invoice items that do not belong to the authenticated business', async () => {
    let invoiceInsertCalled = false;
    const supabase = {
      rpc: vi.fn(async () => ({ data: 'INV-001', error: null })),
      from: vi.fn((table) => {
        if (table === 'users') {
          return { select: () => createAuthUserChain() };
        }

        if (table === 'products') {
          return {
            select() {
              return {
                eq() {
                  return this;
                },
                in: async () => ({ data: [], error: null }),
              };
            },
          };
        }

        if (table === 'invoices') {
          invoiceInsertCalled = true;
        }

        throw new Error(`Unexpected table access after product guard: ${table}`);
      }),
    };

    installModuleMock('../src/config/supabase.js', supabase);
    resetRouteModules('../src/middleware/auth.js', '../src/middleware/tenantScope.js', '../src/routes/invoices.js');

    const invoiceRoutes = require('../src/routes/invoices.js');
    const app = express();
    app.use(express.json());
    app.use('/api/invoices', invoiceRoutes);

    const response = await request(app)
      .post('/api/invoices')
      .set('Authorization', authHeader())
      .send({
        status: 'draft',
        items: [{ product_id: '00000000-0000-4000-8000-000000000004', qty: 1, unit_price: 20 }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invoice items must belong to this business.');
    expect(invoiceInsertCalled).toBe(false);
  });

  it('prevents managers from changing staff roles', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'users') {
          return {
            select() {
              return createAuthUserChain('manager');
            },
          };
        }

        throw new Error(`Unexpected table access after authorization failure: ${table}`);
      }),
    };

    installModuleMock('../src/config/supabase.js', supabase);
    resetRouteModules('../src/middleware/auth.js', '../src/middleware/tenantScope.js', '../src/routes/settings.js');

    const settingsRoutes = require('../src/routes/settings.js');
    const app = express();
    app.use(express.json());
    app.use('/api/settings', settingsRoutes);

    const response = await request(app)
      .patch('/api/settings/staff/00000000-0000-4000-8000-000000000002')
      .set('Authorization', authHeader())
      .send({ role: 'cashier' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Only owners can change staff roles.');
  });

  it('keeps catalog and AI mutation endpoints off limits to cashiers', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'users') {
          return { select: () => createAuthUserChain('cashier') };
        }

        throw new Error(`Unexpected table access after role guard: ${table}`);
      }),
    };

    installModuleMock('../src/config/supabase.js', supabase);
    resetRouteModules(
      '../src/middleware/auth.js',
      '../src/middleware/tenantScope.js',
      '../src/routes/products.js',
      '../src/routes/menu.js',
      '../src/routes/recipes.js',
      '../src/routes/ai.js'
    );

    const productsRoutes = require('../src/routes/products.js');
    const menuRoutes = require('../src/routes/menu.js');
    const recipesRoutes = require('../src/routes/recipes.js');
    const aiRoutes = require('../src/routes/ai.js');
    const app = express();
    app.use(express.json());
    app.use('/api/products', productsRoutes);
    app.use('/api/menu', menuRoutes);
    app.use('/api/recipes', recipesRoutes);
    app.use('/api/ai', aiRoutes);

    const checks = [
      request(app).post('/api/products').set('Authorization', authHeader()).send({}),
      request(app).post('/api/menu/categories').set('Authorization', authHeader()).send({}),
      request(app).post('/api/menu/items/options').set('Authorization', authHeader()).send({}),
      request(app).post('/api/recipes').set('Authorization', authHeader()).send({}),
      request(app).post('/api/ai/execute-tool').set('Authorization', authHeader()).send({ tool_name: 'create_product', tool_input: {} }),
    ];

    const responses = await Promise.all(checks);
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body.error).toBeTruthy();
    }
  });

  it('requires WhatsApp webhook signatures in production when no signing secret is configured', async () => {
    process.env.NODE_ENV = 'production';

    resetRouteModules('../src/routes/whatsapp.js');
    const whatsappRoutes = require('../src/routes/whatsapp.js');

    const app = express();
    app.use(express.json({
      verify: (req, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    }));
    app.use('/api/whatsapp', whatsappRoutes);

    const response = await request(app)
      .post('/api/whatsapp/webhook')
      .send({ entry: [] });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('WhatsApp webhook signing secret is not configured.');
  });
});
