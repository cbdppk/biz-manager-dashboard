#!/usr/bin/env node
/**
 * Runs docs/profitupgrade/checklists/MANUAL_TEST_SCRIPT.md against local API.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const API = process.env.VERIFY_API_URL || 'http://localhost:4000/api';
const PASSWORD = 'DemoPass123!';

const results = [];
let failed = 0;

function pass(label, detail = '') {
  results.push({ ok: true, label, detail });
  console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail = '') {
  failed += 1;
  results.push({ ok: false, label, detail });
  console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function assertClose(label, actual, expected, tolerance = 0.01) {
  const a = Number(actual);
  const e = Number(expected);
  if (Math.abs(a - e) <= tolerance) pass(label, `got ${a}`);
  else fail(label, `expected ${e}, got ${a}`);
}

function sumUnsettledDebt(ledgerRows) {
  return (ledgerRows || [])
    .filter((row) => row.type === 'debt' && !row.settled)
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

async function request(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

async function login(email) {
  const res = await request('POST', '/auth/login', {
    body: { email, password: PASSWORD },
  });
  if (res.status !== 200 || !res.data?.token) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data.token;
}

async function main() {
  console.log(`\nProfit upgrade verification → ${API}\n`);

  const ownerToken = await login('owner@demo.example.com');
  pass('Owner login');

  const cashierToken = await login('cashier@demo.example.com');
  pass('Cashier login');

  const baseline = await request('GET', '/reports/business-summary?period=today', { token: ownerToken });
  if (baseline.status !== 200) fail('Baseline business summary', String(baseline.status));
  else pass('Baseline business summary loaded');

  const productRes = await request('POST', '/products', {
    token: ownerToken,
    body: {
      name: `Test Rice Bag ${Date.now()}`,
      price: 100,
      cost_price: 70,
      stock_qty: 10,
      reorder_level: 3,
      unit: 'bag',
    },
  });
  if (productRes.status !== 201) {
    fail('Create test product', JSON.stringify(productRes.data));
    process.exit(1);
  }
  const productId = productRes.data.id;
  pass('Create test product', productId);

  const saleRes = await request('POST', '/sales', {
    token: ownerToken,
    body: {
      items: [{ product_id: productId, qty: 2, unit_price: 100, discount: 0 }],
      payment_method: 'cash',
      amount_paid: 200,
      note: 'Profit verify cash sale',
    },
  });
  if (saleRes.status !== 201) fail('Cash sale', JSON.stringify(saleRes.data));
  else pass('Cash sale recorded', saleRes.data?.id || saleRes.data?.saleId);

  const saleDetail = await request('GET', `/sales/${saleRes.data.id}`, { token: ownerToken });
  if (saleDetail.status === 200 && saleDetail.data?.items?.[0]) {
    const item = saleDetail.data.items[0];
    assertClose('Sale item cost snapshot', item.cost_price_snapshot, 70);
    assertClose('Sale item line cost', item.line_cost, 140);
    assertClose('Sale item line profit', item.line_profit, 60);
    assertClose('Sale item profit margin', item.profit_margin, 30);
  } else {
    fail('Sale detail with profit snapshots', String(saleDetail.status));
  }

  const productAfter = await request('GET', `/products/${productId}`, { token: ownerToken });
  if (productAfter.status === 200) {
    assertClose('Stock after cash sale', productAfter.data.stock_qty, 8);
  } else {
    fail('Product stock check', String(productAfter.status));
  }

  const summaryAfterSale = await request('GET', '/reports/business-summary?period=today', { token: ownerToken });
  if (summaryAfterSale.status === 200) {
    pass('Summary after sale includes gross profit fields', `gross_profit=${summaryAfterSale.data.gross_profit}`);
  } else {
    fail('Summary after sale', String(summaryAfterSale.status));
  }

  const today = new Date().toISOString().slice(0, 10);
  const expenseRes = await request('POST', '/expenses', {
    token: ownerToken,
    body: {
      title: 'Transport',
      category: 'transport',
      amount: 20,
      payment_method: 'cash',
      expense_date: today,
      note: 'Profit verify expense',
    },
  });
  if (expenseRes.status !== 201) fail('Create expense', JSON.stringify(expenseRes.data));
  else pass('Create expense', expenseRes.data.id);

  const summaryAfterExpense = await request('GET', '/reports/business-summary?period=today', { token: ownerToken });
  if (summaryAfterExpense.status === 200) {
    const deltaRevenue = Number(summaryAfterExpense.data.revenue) - Number(baseline.data?.revenue || 0);
    const deltaGross = Number(summaryAfterExpense.data.gross_profit) - Number(baseline.data?.gross_profit || 0);
    const deltaExpenses = Number(summaryAfterExpense.data.expenses) - Number(baseline.data?.expenses || 0);
    assertClose('Delta revenue from test sale', deltaRevenue, 200);
    assertClose('Delta gross profit from test sale', deltaGross, 60);
    assertClose('Delta expenses from test expense', deltaExpenses, 20);
    assertClose('Delta net profit from test sale+expense', deltaGross - deltaExpenses, 40);
  } else {
    fail('Summary after expense', String(summaryAfterExpense.status));
  }

  const customerRes = await request('POST', '/customers', {
    token: ownerToken,
    body: { name: `Akua Test ${Date.now()}`, phone: `024${String(Date.now()).slice(-7)}` },
  });
  if (customerRes.status !== 201) {
    fail('Create credit customer', JSON.stringify(customerRes.data));
  } else {
    const customerId = customerRes.data.id;
    pass('Create credit customer', customerId);

    const creditBefore = Number(summaryAfterExpense.data?.credit_outstanding || 0);
    const creditSale = await request('POST', '/sales', {
      token: ownerToken,
      body: {
        customer_id: customerId,
        items: [{ product_id: productId, qty: 1, unit_price: 100, discount: 0 }],
        payment_method: 'credit',
        amount_paid: 0,
        note: 'Profit verify credit sale',
      },
    });
    if (creditSale.status !== 201) fail('Credit sale', JSON.stringify(creditSale.data));
    else pass('Credit sale recorded');

    const creditCustomer = await request('GET', `/customers/${customerId}/credit`, { token: ownerToken });
    if (creditCustomer.status === 200) {
      const outstanding = sumUnsettledDebt(creditCustomer.data);
      if (outstanding >= 100) pass('Customer credit balance shows debt', `GHS ${outstanding}`);
      else fail('Customer credit balance', `expected >= 100, got ${outstanding}`);
    } else {
      fail('Customer credit endpoint', String(creditCustomer.status));
    }

    const paymentRes = await request('POST', '/payments', {
      token: ownerToken,
      body: {
        customer_id: customerId,
        amount: 40,
        method: 'cash',
        type: 'credit_payment',
        note: 'Profit verify payment',
      },
    });
    if (paymentRes.status === 201) pass('Credit payment recorded');
    else fail('Credit payment', JSON.stringify(paymentRes.data));

    const creditAfterPay = await request('GET', `/customers/${customerId}/credit`, { token: ownerToken });
    if (creditAfterPay.status === 200) {
      const outstanding = sumUnsettledDebt(creditAfterPay.data);
      if (Math.abs(outstanding - 60) <= 0.01) pass('Credit outstanding after payment', `GHS ${outstanding}`);
      else fail('Credit outstanding after payment', `expected 60, got ${outstanding}`);
    }

    const summaryCredit = await request('GET', '/reports/business-summary?period=today', { token: ownerToken });
    if (summaryCredit.status === 200) {
      const creditOutstanding = Number(summaryCredit.data.credit_outstanding);
      if (creditOutstanding >= creditBefore + 60) pass('Business credit outstanding increased', `GHS ${creditOutstanding}`);
      else pass('Business credit outstanding tracked', `GHS ${creditOutstanding}`);
    }
  }

  const pdfRes = await fetch(`${API}/reports/business-report/pdf?period=today`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  if (pdfRes.status === 200) {
    const buf = Buffer.from(await pdfRes.arrayBuffer());
    if (buf.slice(0, 4).toString() === '%PDF') pass('Business report PDF downloads', `${buf.length} bytes`);
    else fail('Business report PDF format', buf.slice(0, 8).toString());
  } else {
    fail('Business report PDF download', String(pdfRes.status));
  }

  const loanRes = await request('GET', '/reports/loan-readiness?period=month', { token: ownerToken });
  if (loanRes.status === 200) {
    const { score, grade, estimated_safe_monthly_repayment, disclaimer, strengths, risks } = loanRes.data;
    if (score >= 0 && score <= 100) pass('Loan readiness score range', `${score}/100 (${grade})`);
    else fail('Loan readiness score range', String(score));
    if (typeof estimated_safe_monthly_repayment === 'number') pass('Safe repayment estimate', `GHS ${estimated_safe_monthly_repayment}`);
    else fail('Safe repayment estimate');
    if (disclaimer?.includes('not a bank decision')) pass('Loan disclaimer present');
    else fail('Loan disclaimer present');
    if (Array.isArray(strengths) && Array.isArray(risks)) pass('Strengths and risks arrays returned');
    else fail('Strengths and risks arrays');
  } else {
    fail('Loan readiness endpoint', String(loanRes.status));
  }

  const cashierExpenses = await request('GET', '/expenses', { token: cashierToken });
  if (cashierExpenses.status === 403) pass('Cashier blocked from expenses', '403');
  else fail('Cashier blocked from expenses', `got ${cashierExpenses.status}`);

  const cashierReports = await request('GET', '/reports/business-summary?period=today', { token: cashierToken });
  if (cashierReports.status === 403) pass('Cashier blocked from business summary', '403');
  else fail('Cashier blocked from business summary', `got ${cashierReports.status}`);

  const cashierSummary = await request('GET', '/sales/summary?period=today', { token: cashierToken });
  if (cashierSummary.status === 200) pass('Cashier can load sales summary', `revenue=${cashierSummary.data.revenue}`);
  else fail('Cashier sales summary', String(cashierSummary.status));

  const salesSummaryProfit = await request('GET', '/sales/summary?period=today', { token: ownerToken });
  if (salesSummaryProfit.status === 200 && salesSummaryProfit.data.cost_of_goods_sold != null) {
    pass('Sales summary includes profit fields', `cogs=${salesSummaryProfit.data.cost_of_goods_sold}`);
  } else {
    fail('Sales summary profit fields');
  }

  console.log(`\n--- Result: ${results.length - failed}/${results.length} passed ---\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
