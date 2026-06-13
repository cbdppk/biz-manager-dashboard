import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function makeApp() {
  vi.resetModules();
  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'supabase-test-key';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'supabase-test-publishable-key';
  process.env.JWT_SECRET = 'jwt-test-secret';
  process.env.FRONTEND_URL = 'https://configured.example';
  process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token';
  process.env.PAYSTACK_SECRET_KEY = 'paystack-test-secret';

  const mod = await import('../src/index.js');
  const createApp = mod.createApp || mod.default?.createApp;
  return createApp();
}

describe('backend app', () => {
  let app;

  beforeEach(async () => {
    app = await makeApp();
  });

  it('serves the health endpoint without authentication', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.ts).toBeTypeOf('string');
  });

  it('allows same-host Vercel browser requests even when FRONTEND_URL is stale', async () => {
    const response = await request(app)
      .options('/api/auth/login')
      .set('Host', 'bizmanager-dashboard.vercel.app')
      .set('Origin', 'https://bizmanager-dashboard.vercel.app')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://bizmanager-dashboard.vercel.app');
  });

  it('allows the production app origin even when Vercel forwards an internal host', async () => {
    const response = await request(app)
      .options('/api/auth/login')
      .set('Host', 'internal.vercel.test')
      .set('Origin', 'https://bizmanager-dashboard.vercel.app')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://bizmanager-dashboard.vercel.app');
  });

  it('trusts the Vercel proxy so rate limiting can use forwarded client IPs', () => {
    expect(app.get('trust proxy')).toBe(1);
  });

  it('requires authentication on all protected API routes', async () => {
    const protectedRoutes = [
      ['get', '/api/auth/me'],
      ['post', '/api/auth/change-password'],
      ['get', '/api/products'],
      ['get', '/api/sales'],
      ['get', '/api/customers'],
      ['get', '/api/invoices'],
      ['post', '/api/payments'],
      ['get', '/api/settings'],
      ['get', '/api/billing/status'],
      ['post', '/api/billing/subscribe'],
      ['get', '/api/menu/categories'],
      ['get', '/api/orders'],
      ['post', '/api/orders/daily-close'],
      ['get', '/api/orders/kitchen/queue'],
      ['get', '/api/recipes'],
      ['get', '/api/reports/food'],
      ['get', '/api/reports/business-summary'],
      ['get', '/api/reports/loan-readiness'],
      ['get', '/api/reports/business-report/pdf'],
      ['get', '/api/expenses'],
      ['post', '/api/expenses'],
    ];

    for (const [method, url] of protectedRoutes) {
      const req = request(app)[method](url);
      const response = method === 'post' ? await req.send({}) : await req;
      expect(response.status, `${method.toUpperCase()} ${url}`).toBe(401);
    }
  });

  it('does not rate limit normal auth/me traffic with the login limiter', async () => {
    let lastResponse;

    for (let count = 0; count < 12; count += 1) {
      lastResponse = await request(app).get('/api/auth/me');
    }

    expect(lastResponse.status).toBe(401);
    expect(lastResponse.body.error).not.toBe('Too many auth attempts.');
  });

  it('keeps WhatsApp verification public and validates the token', async () => {
    const denied = await request(app)
      .get('/api/whatsapp/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': '12345',
      });

    expect(denied.status).toBe(403);

    const verified = await request(app)
      .get('/api/whatsapp/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify-token',
        'hub.challenge': '12345',
      });

    expect(verified.status).toBe(200);
    expect(verified.text).toBe('12345');
  });

  it('rejects Paystack webhook calls with an invalid signature', async () => {
    const response = await request(app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'invalid-signature')
      .send({
        event: 'charge.success',
        data: {
          metadata: {
            business_id: 'biz-1',
            plan: 'basic',
          },
        },
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid signature.');
  });

  it('rate limits repeated WhatsApp webhook posts', async () => {
    let lastResponse;

    for (let count = 0; count < 31; count += 1) {
      lastResponse = await request(app)
        .post('/api/whatsapp/webhook')
        .send({ entry: [] });
    }

    expect(lastResponse.status).toBe(429);
    expect(lastResponse.body.error).toBe('Too many WhatsApp webhook requests.');
  });
});
