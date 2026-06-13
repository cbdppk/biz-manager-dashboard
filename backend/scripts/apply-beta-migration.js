#!/usr/bin/env node
/**
 * Apply supabase/migrations/20260521120000_beta_schema_gaps.sql to remote Postgres.
 *
 * Requires in backend/.env (or env):
 *   SUPABASE_DB_PASSWORD — Database password from Supabase Dashboard → Project Settings → Database
 *
 * Optional:
 *   SUPABASE_PROJECT_REF — Supabase project reference
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const MIGRATION = path.join(__dirname, '../../supabase/migrations/20260521120000_beta_schema_gaps.sql');

async function main() {
  if (!PASSWORD) {
    console.error('Missing SUPABASE_DB_PASSWORD. Add it to backend/.env from Supabase Dashboard → Database → Database password.');
    process.exit(1);
  }
  if (!PROJECT_REF) {
    console.error('Missing SUPABASE_PROJECT_REF. Add it to backend/.env from Supabase Dashboard → Project Settings → General.');
    process.exit(1);
  }

  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const hosts = [
    `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:${encodeURIComponent(PASSWORD)}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
  ];

  let lastErr;
  for (const connectionString of hosts) {
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      console.log('[migrate] Connected, applying beta_schema_gaps…');
      await client.query(sql);
      const { rows } = await client.query(
        "SELECT to_regclass('public.ai_embeddings') AS table_exists"
      );
      await client.end();
      console.log('[migrate] Success. ai_embeddings:', rows[0]?.table_exists || 'missing');
      return;
    } catch (err) {
      lastErr = err;
      try { await client.end(); } catch { /* ignore */ }
      console.warn('[migrate] Connection failed:', err.message);
    }
  }

  console.error('[migrate] Failed:', lastErr?.message || 'unknown');
  process.exit(1);
}

main();
