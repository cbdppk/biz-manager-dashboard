import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import { createRequire } from 'module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

vi.mock('../src/helpers/arkesel.js', () => ({
  sendSMS: vi.fn(async () => ({ success: true })),
}));

vi.mock('../src/helpers/whatsapp.js', () => ({
  sendWhatsAppMessage: vi.fn(async () => ({ success: true })),
}));

function installModuleMock(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  delete require.cache[resolved];
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

function createQueryChain(result) {
  return {
    eq() {
      return this;
    },
    maybeSingle: async () => result,
    single: async () => result,
    order() {
      return this;
    },
  };
}

function signPaystackBody(body, secret) {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

async function makeBillingApp({ currentExpiry = '2026-05-01T00:00:00.000Z' } = {}) {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'supabase-test-key';
  process.env.JWT_SECRET = 'jwt-test-secret';
  process.env.PAYSTACK_SECRET_KEY = 'paystack-test-secret';
  process.env.NODE_ENV = 'test';

  const billingEvents = new Set();
  let updatedBusiness = null;
  let extendCount = 0;

  const supabase = {
    from: vi.fn((table) => {
    if (table === 'billing_events') {
      return {
        select() {
          return {
            eq(_column, value) {
              return {
                maybeSingle: async () => (
                  billingEvents.has(value)
                    ? { data: { id: 'existing-event' }, error: null }
                    : { data: null, error: null }
                ),
              };
            },
          };
        },
        insert(payload) {
          if (billingEvents.has(payload.provider_ref)) {
            return Promise.resolve({ error: { code: '23505', message: 'duplicate key value' } });
          }
          billingEvents.add(payload.provider_ref);
          return Promise.resolve({ error: null });
        },
      };
    }

    if (table === 'businesses') {
      return {
        select() {
          return {
            eq() {
              return this;
            },
            single: async () => ({
              data: { subscription_expires_at: currentExpiry, name: 'BizManager Demo', whatsapp_enabled: false },
              error: null,
            }),
          };
        },
        update(payload) {
          updatedBusiness = payload;
          extendCount += 1;
          return {
            eq() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    }

    if (table === 'users') {
      return {
        select() {
          return createQueryChain({
            data: { phone: null },
            error: null,
          });
        },
      };
    }

    if (table === 'audit_logs') {
      return {
        insert: async () => ({ error: null }),
      };
    }

    throw new Error(`Unhandled table mock: ${table}`);
    }),
  };

  installModuleMock('../src/config/supabase.js', supabase);
  delete require.cache[require.resolve('../src/routes/billing.js')];
  const billingRoutes = require('../src/routes/billing.js');

  const app = express();
  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billingRoutes.paystackWebhook);
  app.use(express.json());
  app.use('/api/billing', billingRoutes);

  return {
    app,
    billingRoutes,
    getUpdatedBusiness: () => updatedBusiness,
    getExtendCount: () => extendCount,
    billingEvents,
  };
}

function chargeSuccessPayload({
  reference = 'ref-001',
  plan = 'basic',
  businessId = 'biz-1',
  amount = 7900,
  currency = 'GHS',
} = {}) {
  return {
    event: 'charge.success',
    data: {
      reference,
      amount,
      currency,
      metadata: { business_id: businessId, plan },
    },
  };
}

describe('billing webhook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extends the subscription from the later of now or the current expiry', async () => {
    const now = new Date('2026-04-09T00:00:00.000Z').getTime();
    const currentExpiry = '2099-05-01T00:00:00.000Z';
    const { billingRoutes } = await makeBillingApp({ currentExpiry });

    const extended = billingRoutes.calculateSubscriptionExpiry(currentExpiry, now);

    expect(new Date(extended).getTime()).toBeGreaterThan(new Date(currentExpiry).getTime());
  });

  it('derives explicit trial, active, and expired billing states', async () => {
    const now = new Date('2026-05-01T00:00:00.000Z').getTime();
    const { billingRoutes } = await makeBillingApp();

    expect(billingRoutes.deriveBillingStatus({
      subscription_tier: 'free',
      trial_ends_at: '2026-05-08T00:00:00.000Z',
      subscription_expires_at: null,
    }, now)).toMatchObject({ status: 'trial', days_remaining: 7, is_expired: false });

    expect(billingRoutes.deriveBillingStatus({
      subscription_tier: 'basic',
      trial_ends_at: '2026-04-01T00:00:00.000Z',
      subscription_expires_at: '2026-05-31T00:00:00.000Z',
    }, now)).toMatchObject({ status: 'active', days_remaining: 30, is_expired: false });

    expect(billingRoutes.deriveBillingStatus({
      subscription_tier: 'pro',
      trial_ends_at: null,
      subscription_expires_at: '2026-04-01T00:00:00.000Z',
    }, now)).toMatchObject({ status: 'expired', days_remaining: 0, is_expired: true });
  });

  it('keeps billing status behind auth middleware', async () => {
    const { app } = await makeBillingApp();
    const response = await request(app).get('/api/billing/status');

    expect(response.status).toBe(401);
  });

  it('extends subscription once for a valid charge.success webhook', async () => {
    const { billingRoutes, getUpdatedBusiness, getExtendCount } = await makeBillingApp();
    const event = chargeSuccessPayload();

    await billingRoutes.processChargeSuccess(event);

    expect(getUpdatedBusiness()).toMatchObject({ subscription_tier: 'basic' });
    expect(getExtendCount()).toBe(1);
  });

  it('does not extend subscription twice for duplicate charge.success', async () => {
    const { billingRoutes, getExtendCount } = await makeBillingApp();
    const event = chargeSuccessPayload({ reference: 'ref-dup' });

    await billingRoutes.processChargeSuccess(event);
    await billingRoutes.processChargeSuccess(event);

    expect(getExtendCount()).toBe(1);
  });

  it('ignores charge.success with wrong amount or currency', async () => {
    const { billingRoutes, getExtendCount } = await makeBillingApp();

    await billingRoutes.processChargeSuccess(chargeSuccessPayload({ amount: 1, reference: 'bad-amount' }));
    await billingRoutes.processChargeSuccess(chargeSuccessPayload({ currency: 'USD', reference: 'bad-currency' }));
    await billingRoutes.processChargeSuccess(chargeSuccessPayload({ plan: 'enterprise', reference: 'bad-plan' }));

    expect(getExtendCount()).toBe(0);
  });
});
