#!/usr/bin/env node
/**
 * Apply every supabase/migrations/*.sql file in timestamp order.
 * Idempotent migrations (IF NOT EXISTS, guarded DO blocks) are safe to re-run.
 *
 * Requires SUPABASE_DB_PASSWORD in backend/.env
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const MIGRATIONS_DIR = path.join(__dirname, '../../supabase/migrations');

const BENIGN_PATTERNS = [
  /already exists/i,
  /duplicate key/i,
  /duplicate_object/i,
  /relation .* already exists/i,
  /policy .* already exists/i,
];

function isBenign(err) {
  const msg = err.message || '';
  return BENIGN_PATTERNS.some((re) => re.test(msg));
}

async function connect() {
  const hosts = [
    `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:${encodeURIComponent(PASSWORD)}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
  ];
  let lastErr;
  for (const connectionString of hosts) {
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastErr = err;
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  throw lastErr || new Error('Could not connect to Supabase Postgres');
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public._bizmanager_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz DEFAULT now()
    )
  `);
  await client.query('ALTER TABLE public._bizmanager_migrations ENABLE ROW LEVEL SECURITY');
  await client.query('ALTER TABLE public._bizmanager_migrations FORCE ROW LEVEL SECURITY');
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = '_bizmanager_migrations'
          AND policyname = 'service_role_all_bizmanager_migrations'
      ) THEN
        CREATE POLICY service_role_all_bizmanager_migrations
          ON public._bizmanager_migrations
          FOR ALL TO service_role USING (true) WITH CHECK (true);
      END IF;
    END $$
  `);
}

async function isApplied(client, filename) {
  const { rows } = await client.query(
    'SELECT 1 FROM public._bizmanager_migrations WHERE filename = $1',
    [filename]
  );
  return rows.length > 0;
}

async function markApplied(client, filename) {
  await client.query(
    'INSERT INTO public._bizmanager_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
    [filename]
  );
}

async function audit(client) {
  const { rows: noRls } = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = false
      AND tablename NOT LIKE 'pg_%'
    ORDER BY tablename
  `);

  const expectedTables = [
    'businesses', 'users', 'products', 'customers', 'sales', 'sale_items',
    'credit_ledger', 'payments', 'invoices', 'invoice_items', 'ai_tool_log',
    'stock_movements', 'menu_categories', 'menu_item_options', 'menu_item_option_values',
    'orders', 'order_items', 'recipes', 'recipe_items', 'ai_embeddings', 'expenses',
    'billing_events', 'support_requests', 'audit_logs',
  ];

  const checks = [];
  for (const table of expectedTables) {
    const { rows } = await client.query('SELECT to_regclass($1) AS reg', [`public.${table}`]);
    checks.push({ table, exists: rows[0]?.reg != null });
  }

  return { noRls: noRls.map((r) => r.tablename), checks };
}

async function main() {
  if (!PROJECT_REF) {
    console.error('Missing SUPABASE_PROJECT_REF in backend/.env');
    process.exit(1);
  }
  if (!PASSWORD) {
    console.error('Missing SUPABASE_DB_PASSWORD in backend/.env');
    process.exit(1);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = await connect();
  console.log('[migrate-all] Connected to project', PROJECT_REF);
  await ensureMigrationTable(client);

  const results = { applied: [], skipped: [], benign: [], failed: [] };

  for (const filename of files) {
    if (await isApplied(client, filename)) {
      results.skipped.push(filename);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
    try {
      await client.query(sql);
      await markApplied(client, filename);
      results.applied.push(filename);
      console.log('[migrate-all] OK', filename);
    } catch (err) {
      if (isBenign(err)) {
        await markApplied(client, filename);
        results.benign.push({ filename, message: err.message });
        console.log('[migrate-all] OK (already applied)', filename);
      } else {
        results.failed.push({ filename, message: err.message });
        console.error('[migrate-all] FAIL', filename, err.message);
      }
    }
  }

  const auditResult = await audit(client);
  await client.end();

  console.log('\n[migrate-all] Summary');
  console.log('  Applied:', results.applied.length);
  console.log('  Skipped (tracked):', results.skipped.length);
  console.log('  Benign re-run:', results.benign.length);
  console.log('  Failed:', results.failed.length);

  if (results.failed.length) {
    for (const f of results.failed) {
      console.error('  -', f.filename, ':', f.message);
    }
    process.exit(1);
  }

  const missing = auditResult.checks.filter((c) => !c.exists).map((c) => c.table);
  if (missing.length) {
    console.warn('  Tables not present (may be optional):', missing.join(', '));
  }
  if (auditResult.noRls.length) {
    console.error('  Tables WITHOUT RLS:', auditResult.noRls.join(', '));
    process.exit(1);
  }
  console.log('  All public tables have RLS enabled');
  console.log('[migrate-all] Done');
}

main().catch((err) => {
  console.error('[migrate-all] Fatal:', err.message);
  process.exit(1);
});
