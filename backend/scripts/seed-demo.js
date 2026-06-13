/**
 * DEMO ONLY — local/staging seed for Sample Ventures Demo.
 * Run explicitly: npm --prefix backend run seed:demo
 * Requires SUPABASE_URL + SUPABASE_SECRET_KEY. Never run in production deploy hooks.
 * Resets fixed demo business_id rows only; logs demo credentials to terminal.
 */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const BUSINESS_ID = 'c783fce2-30a2-4ed3-9be1-929d4bd6f001';
const PASSWORD = 'DemoPass123!';

const DEMO_USERS = {
  owner: {
    email: 'owner@demo.example.com',
    name: 'Efua Mensah',
    phone: '0000000101',
    role: 'owner',
  },
  manager: {
    email: 'manager@demo.example.com',
    name: 'Kojo Addo',
    phone: '0000000102',
    role: 'manager',
  },
  cashier: {
    email: 'cashier@demo.example.com',
    name: 'Yaw Boateng',
    phone: '0000000103',
    role: 'cashier',
  },
};

const CUSTOMER_IDS = {
  ama: '3432a2df-a244-45bd-8998-6625f4f0c001',
  kofi: '3432a2df-a244-45bd-8998-6625f4f0c002',
  abena: '3432a2df-a244-45bd-8998-6625f4f0c003',
};

const PRODUCT_IDS = {
  cowbell: '2b16a484-ae75-4c2a-98e2-6e6dfb87a101',
  milo: '2b16a484-ae75-4c2a-98e2-6e6dfb87a102',
  indomie: '2b16a484-ae75-4c2a-98e2-6e6dfb87a103',
  peak: '2b16a484-ae75-4c2a-98e2-6e6dfb87a104',
  blueband: '2b16a484-ae75-4c2a-98e2-6e6dfb87a105',
  kasapreko: '2b16a484-ae75-4c2a-98e2-6e6dfb87a106',
  tomato: '2b16a484-ae75-4c2a-98e2-6e6dfb87a107',
  rice: '2b16a484-ae75-4c2a-98e2-6e6dfb87a108',
};

const SALE_IDS = {
  todayCash: '89ef709f-08aa-48aa-bfd2-62f2f98d5101',
  todayCard: '89ef709f-08aa-48aa-bfd2-62f2f98d5102',
  yesterdayMomo: '89ef709f-08aa-48aa-bfd2-62f2f98d5103',
  creditSale: '89ef709f-08aa-48aa-bfd2-62f2f98d5104',
  partialSale: '89ef709f-08aa-48aa-bfd2-62f2f98d5105',
  lastWeekSale: '89ef709f-08aa-48aa-bfd2-62f2f98d5106',
  previousWeekSale: '89ef709f-08aa-48aa-bfd2-62f2f98d5107',
};

const INVOICE_IDS = {
  paid: 'f1bbf1ae-b738-4f27-8c69-f89d3c33a001',
  sent: 'f1bbf1ae-b738-4f27-8c69-f89d3c33a002',
  overdue: 'f1bbf1ae-b738-4f27-8c69-f89d3c33a003',
  draft: 'f1bbf1ae-b738-4f27-8c69-f89d3c33a004',
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const HASH_ROUNDS = 12;

function isoDaysFromNow(days, hour = 10, minute = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

function isoDaysAgo(days, hour = 10, minute = 0) {
  return isoDaysFromNow(-days, hour, minute);
}

function dueDateFromNow(days) {
  return isoDaysFromNow(days, 0, 0).slice(0, 10);
}

async function findSeededUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function ensureSeededUserId(user) {
  const existing = await findSeededUserByEmail(user.email);
  return existing?.id || uuidv4();
}

async function deleteByBusinessId(table) {
  const { error } = await supabase.from(table).delete().eq('business_id', BUSINESS_ID);
  if (error) throw error;
}

async function insertRowsWithFallback(table, rows, optionalColumns = []) {
  let result = await supabase.from(table).insert(rows);

  if (!result.error) {
    return result;
  }

  const missingOptionalColumn = optionalColumns.some((column) => result.error.message?.includes(column));
  if (!missingOptionalColumn) {
    return result;
  }

  const sanitizedRows = rows.map((row) => {
    const next = { ...row };
    for (const column of optionalColumns) delete next[column];
    return next;
  });

  return supabase.from(table).insert(sanitizedRows);
}

function buildProducts() {
  const catalog = [
    {
      id: PRODUCT_IDS.cowbell,
      name: 'Cowbell Milk',
      sku: 'CBL-001',
      category: 'Dairy',
      selling_price: 4.5,
      cost_price: 3.1,
      start_stock: 18,
      reorder_level: 8,
      unit: 'sachet',
    },
    {
      id: PRODUCT_IDS.milo,
      name: 'Milo Sachet',
      sku: 'MIL-002',
      category: 'Beverages',
      selling_price: 6,
      cost_price: 4.4,
      start_stock: 9,
      reorder_level: 5,
      unit: 'sachet',
    },
    {
      id: PRODUCT_IDS.indomie,
      name: 'Indomie Chicken',
      sku: 'IND-003',
      category: 'Groceries',
      selling_price: 7.5,
      cost_price: 5.2,
      start_stock: 30,
      reorder_level: 8,
      unit: 'pack',
    },
    {
      id: PRODUCT_IDS.peak,
      name: 'Peak Milk Tin',
      sku: 'PEA-004',
      category: 'Dairy',
      selling_price: 22,
      cost_price: 17,
      start_stock: 7,
      reorder_level: 5,
      unit: 'tin',
    },
    {
      id: PRODUCT_IDS.blueband,
      name: 'Blue Band',
      sku: 'BLU-005',
      category: 'Groceries',
      selling_price: 18,
      cost_price: 13.5,
      start_stock: 14,
      reorder_level: 6,
      unit: 'tub',
    },
    {
      id: PRODUCT_IDS.kasapreko,
      name: 'Kasapreko Cola',
      sku: 'KAS-006',
      category: 'Drinks',
      selling_price: 5.5,
      cost_price: 3.6,
      start_stock: 20,
      reorder_level: 10,
      unit: 'bottle',
    },
    {
      id: PRODUCT_IDS.tomato,
      name: 'Ideal Tomato Mix',
      sku: 'IDE-007',
      category: 'Groceries',
      selling_price: 9,
      cost_price: 6.6,
      start_stock: 10,
      reorder_level: 6,
      unit: 'tin',
    },
    {
      id: PRODUCT_IDS.rice,
      name: 'Rice 5kg',
      sku: 'RIC-008',
      category: 'Staples',
      selling_price: 85,
      cost_price: 70,
      start_stock: 9,
      reorder_level: 3,
      unit: 'bag',
    },
  ];

  return catalog.map((product) => ({
    ...product,
    sold_qty: 0,
  }));
}

function buildSales(productMap, userIds) {
  return [
    {
      id: SALE_IDS.todayCash,
      customer_id: CUSTOMER_IDS.ama,
      cashier_id: userIds.cashier,
      payment_method: 'cash',
      amount_paid: null,
      note: 'Morning counter sale',
      created_at: isoDaysAgo(0, 9, 15),
      items: [
        { product_id: PRODUCT_IDS.cowbell, qty: 4 },
        { product_id: PRODUCT_IDS.milo, qty: 2 },
        { product_id: PRODUCT_IDS.kasapreko, qty: 3 },
      ],
    },
    {
      id: SALE_IDS.todayCard,
      customer_id: null,
      cashier_id: userIds.manager,
      payment_method: 'card',
      amount_paid: null,
      note: 'Bulk restock purchase',
      created_at: isoDaysAgo(0, 13, 10),
      items: [
        { product_id: PRODUCT_IDS.rice, qty: 1 },
        { product_id: PRODUCT_IDS.blueband, qty: 2 },
        { product_id: PRODUCT_IDS.peak, qty: 1 },
      ],
    },
    {
      id: SALE_IDS.yesterdayMomo,
      customer_id: CUSTOMER_IDS.kofi,
      cashier_id: userIds.cashier,
      payment_method: 'momo',
      amount_paid: null,
      note: 'MoMo payment from regular customer',
      created_at: isoDaysAgo(1, 16, 40),
      items: [
        { product_id: PRODUCT_IDS.indomie, qty: 5 },
        { product_id: PRODUCT_IDS.tomato, qty: 2 },
      ],
    },
    {
      id: SALE_IDS.creditSale,
      customer_id: CUSTOMER_IDS.abena,
      cashier_id: userIds.cashier,
      payment_method: 'credit',
      amount_paid: 0,
      note: 'Credit sale awaiting collection',
      created_at: isoDaysAgo(3, 11, 20),
      items: [
        { product_id: PRODUCT_IDS.rice, qty: 1 },
        { product_id: PRODUCT_IDS.peak, qty: 1 },
        { product_id: PRODUCT_IDS.blueband, qty: 2 },
      ],
    },
    {
      id: SALE_IDS.partialSale,
      customer_id: CUSTOMER_IDS.ama,
      cashier_id: userIds.manager,
      payment_method: 'cash',
      amount_paid: 20,
      note: 'Partially settled order',
      created_at: isoDaysAgo(5, 14, 5),
      items: [
        { product_id: PRODUCT_IDS.tomato, qty: 3 },
        { product_id: PRODUCT_IDS.cowbell, qty: 2 },
        { product_id: PRODUCT_IDS.milo, qty: 2 },
      ],
    },
    {
      id: SALE_IDS.lastWeekSale,
      customer_id: CUSTOMER_IDS.kofi,
      cashier_id: userIds.cashier,
      payment_method: 'cash',
      amount_paid: null,
      note: 'Weekend store traffic',
      created_at: isoDaysAgo(9, 12, 30),
      items: [
        { product_id: PRODUCT_IDS.indomie, qty: 6 },
        { product_id: PRODUCT_IDS.kasapreko, qty: 4 },
      ],
    },
    {
      id: SALE_IDS.previousWeekSale,
      customer_id: CUSTOMER_IDS.ama,
      cashier_id: userIds.manager,
      payment_method: 'cash',
      amount_paid: null,
      note: 'Previous week repeat buyer',
      created_at: isoDaysAgo(12, 10, 0),
      items: [
        { product_id: PRODUCT_IDS.cowbell, qty: 3 },
        { product_id: PRODUCT_IDS.rice, qty: 1 },
      ],
    },
  ].map((sale) => {
    const items = sale.items.map((item) => {
      const product = productMap[item.product_id];
      const unit_price = item.unit_price ?? product.selling_price;
      const subtotal = Number((item.qty * unit_price).toFixed(2));
      product.sold_qty += item.qty;

      return {
        sale_id: sale.id,
        product_id: item.product_id,
        qty: item.qty,
        unit_price,
        discount: 0,
        subtotal,
        created_at: sale.created_at,
      };
    });

    const total = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
    const amount_paid = sale.amount_paid == null ? total : sale.amount_paid;
    const balance = Number((total - amount_paid).toFixed(2));
    const status = balance === 0 ? 'paid' : 'partial';

    return {
      row: {
        id: sale.id,
        business_id: BUSINESS_ID,
        customer_id: sale.customer_id,
        cashier_id: sale.cashier_id,
        total_amount: total,
        amount_paid,
        balance,
        payment_method: sale.payment_method,
        note: sale.note,
        status,
        created_at: sale.created_at,
      },
      items,
    };
  });
}

function buildCustomers() {
  return [
    {
      id: CUSTOMER_IDS.ama,
      business_id: BUSINESS_ID,
      name: 'Demo Customer',
      phone: '0000000201',
      email: 'demo.customer@example.com',
      address: 'Adenta, Accra',
      credit_limit: 400,
      created_at: isoDaysAgo(45, 9, 0),
    },
    {
      id: CUSTOMER_IDS.kofi,
      business_id: BUSINESS_ID,
      name: 'Sample Client',
      phone: '0000000202',
      email: 'sample.client@example.com',
      address: 'Kokomlemle, Accra',
      credit_limit: 250,
      created_at: isoDaysAgo(36, 13, 10),
    },
    {
      id: CUSTOMER_IDS.abena,
      business_id: BUSINESS_ID,
      name: 'Example User',
      phone: '0000000203',
      email: 'example.user@example.com',
      address: 'Kasoa, Central Region',
      credit_limit: 600,
      created_at: isoDaysAgo(20, 8, 45),
    },
  ];
}

function buildInvoices() {
  const rows = [
    {
      id: INVOICE_IDS.paid,
      customer_id: CUSTOMER_IDS.ama,
      invoice_number: 'INV-0010',
      status: 'paid',
      due_date: dueDateFromNow(-7),
      note: 'Paid during in-store pickup',
      created_at: isoDaysAgo(14, 9, 0),
      items: [
        { product_id: PRODUCT_IDS.rice, product_name: 'Rice 5kg', qty: 1, unit_price: 85 },
        { product_id: PRODUCT_IDS.blueband, product_name: 'Blue Band', qty: 2, unit_price: 18 },
      ],
    },
    {
      id: INVOICE_IDS.sent,
      customer_id: CUSTOMER_IDS.kofi,
      invoice_number: 'INV-0011',
      status: 'sent',
      due_date: dueDateFromNow(5),
      note: 'Awaiting payment before dispatch',
      created_at: isoDaysAgo(2, 15, 20),
      items: [
        { product_id: PRODUCT_IDS.indomie, product_name: 'Indomie Chicken', qty: 5, unit_price: 7.5 },
        { product_id: PRODUCT_IDS.tomato, product_name: 'Ideal Tomato Mix', qty: 2, unit_price: 9 },
      ],
    },
    {
      id: INVOICE_IDS.overdue,
      customer_id: CUSTOMER_IDS.abena,
      invoice_number: 'INV-0012',
      status: 'overdue',
      due_date: dueDateFromNow(-2),
      note: 'Customer asked for a short extension',
      created_at: isoDaysAgo(8, 11, 0),
      items: [
        { product_id: PRODUCT_IDS.rice, product_name: 'Rice 5kg', qty: 1, unit_price: 85 },
        { product_id: PRODUCT_IDS.peak, product_name: 'Peak Milk Tin', qty: 1, unit_price: 22 },
        { product_id: PRODUCT_IDS.blueband, product_name: 'Blue Band', qty: 2, unit_price: 18 },
      ],
    },
    {
      id: INVOICE_IDS.draft,
      customer_id: CUSTOMER_IDS.ama,
      invoice_number: 'INV-0013',
      status: 'draft',
      due_date: dueDateFromNow(10),
      note: 'Prepared for WhatsApp follow-up',
      created_at: isoDaysAgo(0, 8, 30),
      items: [
        { product_id: PRODUCT_IDS.cowbell, product_name: 'Cowbell Milk', qty: 2, unit_price: 4.5 },
        { product_id: PRODUCT_IDS.milo, product_name: 'Milo Sachet', qty: 2, unit_price: 6 },
      ],
    },
  ];

  return rows.map((invoice) => {
    const items = invoice.items.map((item) => ({
      invoice_id: invoice.id,
      product_id: item.product_id,
      product_name: item.product_name,
      qty: item.qty,
      unit_price: item.unit_price,
      subtotal: Number((item.qty * item.unit_price).toFixed(2)),
      created_at: invoice.created_at,
    }));

    return {
      row: {
        id: invoice.id,
        business_id: BUSINESS_ID,
        customer_id: invoice.customer_id,
        invoice_number: invoice.invoice_number,
        total_amount: Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)),
        status: invoice.status,
        due_date: invoice.due_date,
        note: invoice.note,
        created_at: invoice.created_at,
      },
      items,
    };
  });
}

async function seed() {
  const required = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const ownerId = await ensureSeededUserId(DEMO_USERS.owner);
  const managerId = await ensureSeededUserId(DEMO_USERS.manager);
  const cashierId = await ensureSeededUserId(DEMO_USERS.cashier);

  const userIds = {
    owner: ownerId,
    manager: managerId,
    cashier: cashierId,
  };
  const passwordHash = await bcrypt.hash(PASSWORD, HASH_ROUNDS);

  await deleteByBusinessId('payments');
  await deleteByBusinessId('credit_ledger');
  await deleteByBusinessId('invoices');
  await deleteByBusinessId('sales');
  await deleteByBusinessId('ai_tool_log');
  await deleteByBusinessId('customers');
  await deleteByBusinessId('products');

  const { error: deleteUsersError } = await supabase.from('users').delete().eq('business_id', BUSINESS_ID);
  if (deleteUsersError) throw deleteUsersError;

  const businessRow = {
    id: BUSINESS_ID,
    name: 'Sample Ventures Demo',
    phone: '0000000100',
    sector: 'retail',
    owner_id: userIds.owner,
    whatsapp_enabled: true,
    subscription_tier: 'free',
    trial_ends_at: isoDaysFromNow(2, 8, 0),
    subscription_expires_at: null,
    low_stock_alerts: true,
    daily_summary_sms: true,
    invoice_sequence: 13,
    created_at: isoDaysAgo(60, 8, 0),
  };

  const { error: businessError } = await supabase
    .from('businesses')
    .upsert(businessRow, { onConflict: 'id' });
  if (businessError) throw businessError;

  const userRows = [
    {
      id: userIds.owner,
      business_id: BUSINESS_ID,
      email: DEMO_USERS.owner.email,
      name: DEMO_USERS.owner.name,
      phone: DEMO_USERS.owner.phone,
      role: DEMO_USERS.owner.role,
      is_active: true,
      password_hash: passwordHash,
      created_at: isoDaysAgo(60, 8, 5),
    },
    {
      id: userIds.manager,
      business_id: BUSINESS_ID,
      email: DEMO_USERS.manager.email,
      name: DEMO_USERS.manager.name,
      phone: DEMO_USERS.manager.phone,
      role: DEMO_USERS.manager.role,
      is_active: true,
      password_hash: passwordHash,
      created_at: isoDaysAgo(42, 11, 0),
    },
    {
      id: userIds.cashier,
      business_id: BUSINESS_ID,
      email: DEMO_USERS.cashier.email,
      name: DEMO_USERS.cashier.name,
      phone: DEMO_USERS.cashier.phone,
      role: DEMO_USERS.cashier.role,
      is_active: true,
      password_hash: passwordHash,
      created_at: isoDaysAgo(38, 12, 30),
    },
  ];

  const { error: usersError } = await supabase.from('users').upsert(userRows, { onConflict: 'id' });
  if (usersError) throw usersError;

  const { data: insertedUsers, error: insertedUsersError } = await supabase
    .from('users')
    .select('id, email, business_id, is_active')
    .in('id', Object.values(userIds));
  if (insertedUsersError) throw insertedUsersError;
  if ((insertedUsers || []).length !== Object.keys(userIds).length || insertedUsers.some((user) => user.is_active !== true)) {
    throw new Error('Demo auth users were not fully mirrored into the users table.');
  }

  const customers = buildCustomers();
  const { error: customerError } = await insertRowsWithFallback('customers', customers, ['address', 'credit_limit']);
  if (customerError) throw customerError;

  const products = buildProducts();
  const productMap = Object.fromEntries(products.map((product) => [product.id, product]));
  const sales = buildSales(productMap, userIds);

  const productRows = products.map((product) => ({
    id: product.id,
    business_id: BUSINESS_ID,
    name: product.name,
    sku: product.sku,
    category: product.category,
    selling_price: product.selling_price,
    cost_price: product.cost_price,
    stock_qty: product.start_stock - product.sold_qty,
    reorder_level: product.reorder_level,
    unit: product.unit,
    is_active: true,
    needs_restock: (product.start_stock - product.sold_qty) <= product.reorder_level,
    created_at: isoDaysAgo(48, 9, 0),
  }));

  const { error: productError } = await insertRowsWithFallback('products', productRows, ['category', 'needs_restock']);
  if (productError) throw productError;

  const saleRows = sales.map((sale) => sale.row);
  const saleItems = sales.flatMap((sale) => sale.items);

  const { error: salesError } = await supabase.from('sales').insert(saleRows);
  if (salesError) throw salesError;

  const { error: saleItemsError } = await supabase.from('sale_items').insert(saleItems);
  if (saleItemsError) throw saleItemsError;

  const creditLedgerRows = [
    {
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_IDS.abena,
      sale_id: SALE_IDS.creditSale,
      amount: 103,
      type: 'debt',
      due_date: dueDateFromNow(7),
      settled: false,
      created_at: isoDaysAgo(3, 11, 30),
    },
    {
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_IDS.abena,
      sale_id: null,
      amount: 40,
      type: 'payment',
      due_date: null,
      settled: true,
      created_at: isoDaysAgo(1, 10, 0),
    },
    {
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_IDS.ama,
      sale_id: SALE_IDS.partialSale,
      amount: 28,
      type: 'debt',
      due_date: dueDateFromNow(10),
      settled: false,
      created_at: isoDaysAgo(5, 14, 10),
    },
  ];

  const { error: creditError } = await supabase.from('credit_ledger').insert(creditLedgerRows);
  if (creditError) throw creditError;

  const paymentRows = [
    {
      business_id: BUSINESS_ID,
      sale_id: null,
      customer_id: CUSTOMER_IDS.abena,
      amount: 40,
      method: 'momo',
      provider_ref: 'demo-credit-payment-001',
      status: 'completed',
      note: 'Partial debt repayment',
      created_at: isoDaysAgo(1, 10, 0),
    },
    {
      business_id: BUSINESS_ID,
      sale_id: SALE_IDS.yesterdayMomo,
      customer_id: CUSTOMER_IDS.kofi,
      amount: 55.5,
      method: 'momo',
      provider_ref: 'demo-momo-collection-001',
      status: 'completed',
      note: 'Completed MoMo checkout',
      created_at: isoDaysAgo(1, 16, 45),
    },
  ];

  const { error: paymentsError } = await insertRowsWithFallback('payments', paymentRows, ['customer_id', 'note']);
  if (paymentsError) throw paymentsError;

  const invoices = buildInvoices();
  const invoiceRows = invoices.map((invoice) => invoice.row);
  const invoiceItems = invoices.flatMap((invoice) => invoice.items);

  const { error: invoicesError } = await supabase.from('invoices').insert(invoiceRows);
  if (invoicesError) throw invoicesError;

  const { error: invoiceItemsError } = await insertRowsWithFallback('invoice_items', invoiceItems, ['product_name', 'created_at']);
  if (invoiceItemsError) throw invoiceItemsError;

  const { error: aiLogError } = await supabase.from('ai_tool_log').insert([
    {
      business_id: BUSINESS_ID,
      tool_name: 'flag_low_stock',
      input: { product_id: PRODUCT_IDS.milo, product_name: 'Milo Sachet' },
      result: 'Product flagged for follow-up order.',
      created_at: isoDaysAgo(1, 8, 10),
    },
    {
      business_id: BUSINESS_ID,
      tool_name: 'draft_invoice',
      input: { customer_id: CUSTOMER_IDS.ama },
      result: JSON.stringify({ invoice_id: INVOICE_IDS.draft, invoice_number: 'INV-0013' }),
      created_at: isoDaysAgo(0, 8, 35),
    },
  ]);
  if (aiLogError) throw aiLogError;

  console.log('Seed complete for Sample Ventures Demo');
  console.log(`Business ID: ${BUSINESS_ID}`);
  console.log('Logins:');
  console.log(`- Owner:   ${DEMO_USERS.owner.email} / ${PASSWORD}`);
  console.log(`- Manager: ${DEMO_USERS.manager.email} / ${PASSWORD}`);
  console.log(`- Cashier: ${DEMO_USERS.cashier.email} / ${PASSWORD}`);
  console.log(`Products: ${productRows.length}`);
  console.log(`Customers: ${customers.length}`);
  console.log(`Sales: ${saleRows.length}`);
  console.log(`Invoices: ${invoiceRows.length}`);
}

seed().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
});
