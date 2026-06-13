const BASE_URL = process.env.BIZMANAGER_BASE_URL || 'http://127.0.0.1:4000';
const API_URL = `${BASE_URL}/api`;

const OWNER_EMAIL = 'owner@demo.example.com';
const CASHIER_EMAIL = 'cashier@demo.example.com';
const PASSWORD = 'DemoPass123!';
const DRAFT_INVOICE_ID = 'f1bbf1ae-b738-4f27-8c69-f89d3c33a004';

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { response, body };
}

async function login(email) {
  const { response, body } = await requestJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD }),
  });

  if (!response.ok || !body?.token) {
    throw new Error(`Login failed for ${email}: ${body?.error || response.status}`);
  }

  return body.token;
}

async function expectStatus(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${name} returned ${actual}, expected ${expected}`);
  }
  console.log(`PASS ${name} -> ${actual}`);
}

async function run() {
  const health = await fetch(`${BASE_URL}/health`);
  await expectStatus('GET /health', health.status, 200);

  const ownerToken = await login(OWNER_EMAIL);
  const cashierToken = await login(CASHIER_EMAIL);

  const authHeader = { Authorization: `Bearer ${ownerToken}` };
  const cashierHeader = { Authorization: `Bearer ${cashierToken}` };

  const checks = [
    ['/auth/me', 200],
    ['/products', 200],
    ['/customers', 200],
    ['/sales', 200],
    ['/invoices', 200],
    ['/settings', 200],
    ['/billing/status', 200],
  ];

  for (const [path, expected] of checks) {
    const { response } = await requestJson(path, { headers: authHeader });
    await expectStatus(`GET ${path}`, response.status, expected);
  }

  const cashierSettings = await requestJson('/settings', { headers: cashierHeader });
  await expectStatus('GET /settings as cashier', cashierSettings.response.status, 403);

  const cashierSales = await requestJson('/sales', { headers: cashierHeader });
  await expectStatus('GET /sales as cashier', cashierSales.response.status, 403);

  const cashierInvoices = await requestJson('/invoices', { headers: cashierHeader });
  await expectStatus('GET /invoices as cashier', cashierInvoices.response.status, 403);

  const cashierBilling = await requestJson('/billing/status', { headers: cashierHeader });
  await expectStatus('GET /billing/status as cashier', cashierBilling.response.status, 403);

  const pdfResponse = await fetch(`${API_URL}/invoices/${DRAFT_INVOICE_ID}/pdf`, {
    headers: authHeader,
  });
  await expectStatus('GET /invoices/:id/pdf', pdfResponse.status, 200);

  const subscribe = await requestJson('/billing/subscribe', {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ plan: 'basic' }),
  });

  if (subscribe.response.ok) {
    if (!subscribe.body?.checkout_url && !subscribe.body?.authorization_url) {
      throw new Error('Billing subscribe succeeded without a checkout URL.');
    }
    console.log('PASS POST /billing/subscribe -> 200');
  } else {
    console.log(`WARN POST /billing/subscribe -> ${subscribe.response.status}${subscribe.body?.error ? ` (${subscribe.body.error})` : ''}`);
  }

  const aiInsights = await requestJson('/ai/insights?context=sales&period=week', {
    headers: authHeader,
  });

  if (aiInsights.response.ok) {
    console.log('PASS GET /ai/insights -> 200');
  } else {
    console.log(`WARN GET /ai/insights -> ${aiInsights.response.status}`);
  }

  console.log('Live smoke complete.');
}

run().catch((error) => {
  console.error(`Smoke failed: ${error.message}`);
  process.exitCode = 1;
});
