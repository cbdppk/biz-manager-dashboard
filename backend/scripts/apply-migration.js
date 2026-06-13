#!/usr/bin/env node
/**
 * Apply a single file from supabase/migrations/ to remote Postgres.
 *
 * Usage: node scripts/apply-migration.js <migration-filename.sql>
 *
 * Requires SUPABASE_DB_PASSWORD in backend/.env
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const filename = process.argv[2];

async function main() {
  if (!filename) {
    console.error('Usage: node scripts/apply-migration.js <migration-filename.sql>');
    process.exit(1);
  }
  if (!PASSWORD) {
    console.error('Missing SUPABASE_DB_PASSWORD in backend/.env');
    process.exit(1);
  }
  if (!PROJECT_REF) {
    console.error('Missing SUPABASE_PROJECT_REF in backend/.env');
    process.exit(1);
  }

  const migrationPath = path.join(__dirname, '../../supabase/migrations', filename);
  if (!fs.existsSync(migrationPath)) {
    console.error('Migration not found:', migrationPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  const hosts = [
    `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:${encodeURIComponent(PASSWORD)}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
  ];

  let lastErr;
  for (const connectionString of hosts) {
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      console.log('[migrate] Connected, applying', filename, '…');
      await client.query(sql);
      await client.end();
      console.log('[migrate] Success:', filename);
      return;
    } catch (err) {
      lastErr = err;
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      console.warn('[migrate] Connection failed:', err.message);
    }
  }

  console.error('[migrate] Failed:', lastErr?.message || 'unknown');
  process.exit(1);
}

main();
