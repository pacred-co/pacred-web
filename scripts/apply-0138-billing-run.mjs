#!/usr/bin/env node
/**
 * Apply migration 0138 (tb_forwarder_invoice + tb_forwarder_invoice_item)
 * to prod. Adapted from scripts/apply-pilot-migration.mjs pattern.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD='<password>' node scripts/apply-0138-billing-run.mjs
 *
 * Idempotent: every CREATE uses `if not exists` + every policy uses
 * `drop policy if exists` + alter table uses `if exists` checks. Safe to
 * re-run on a partially-applied schema.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const MIGRATION_PATH = resolve(REPO_ROOT, "supabase/migrations/0138_forwarder_invoice.sql");

const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) {
  console.error("FATAL: SUPABASE_DB_PASSWORD (or PG_PASSWORD) env var not set");
  process.exit(1);
}

// Try pooler first (works behind IPv6-only networks · standard for Pacred);
// fall back to direct connection if needed.
const POOLER_HOST = "aws-0-ap-southeast-1.pooler.supabase.com";
const POOLER_USER = `postgres.${PROJECT_REF}`;
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;

const sql = readFileSync(MIGRATION_PATH, "utf-8");
console.log(`Migration: ${MIGRATION_PATH}`);
console.log(`  ${sql.split("\n").length} lines · ${sql.length} chars`);

async function tryConnect(label, conn) {
  console.log(`\nTrying ${label}: ${conn.replace(/:[^@]+@/, ":***@")}`);
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  console.log("✓ Connected.");
  return client;
}

let client = null;
const attempts = [
  { label: "session-pooler 5432",
    conn: `postgresql://${POOLER_USER}:${encodeURIComponent(PASSWORD)}@${POOLER_HOST}:5432/postgres` },
  { label: "transaction-pooler 6543",
    conn: `postgresql://${POOLER_USER}:${encodeURIComponent(PASSWORD)}@${POOLER_HOST}:6543/postgres` },
  { label: "direct 5432",
    conn: `postgresql://postgres:${encodeURIComponent(PASSWORD)}@${DIRECT_HOST}:5432/postgres` },
];

for (const a of attempts) {
  try {
    client = await tryConnect(a.label, a.conn);
    break;
  } catch (e) {
    console.log(`  ✗ ${e.code ?? "error"}: ${e.message}`);
  }
}

if (!client) {
  console.error("\nFATAL: Could not connect to prod via any path.");
  process.exit(2);
}

const t0 = Date.now();
try {
  await client.query(sql);
  const ms = Date.now() - t0;
  console.log(`\n✓ Migration applied in ${ms}ms`);

  // Verify both tables exist
  const tableCheck = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('tb_forwarder_invoice', 'tb_forwarder_invoice_item')
    ORDER BY table_name
  `);
  console.log("Tables present:");
  for (const row of tableCheck.rows) {
    console.log(`  ${row.table_name}`);
  }

  const hdrCount = await client.query(`SELECT COUNT(*) AS n FROM tb_forwarder_invoice`);
  const itemCount = await client.query(`SELECT COUNT(*) AS n FROM tb_forwarder_invoice_item`);
  console.log(`Row counts: tb_forwarder_invoice=${hdrCount.rows[0].n} · tb_forwarder_invoice_item=${itemCount.rows[0].n}`);

  // Verify indexes
  const idxCheck = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('tb_forwarder_invoice', 'tb_forwarder_invoice_item')
    ORDER BY indexname
  `);
  console.log(`Indexes (${idxCheck.rows.length}):`);
  for (const row of idxCheck.rows) {
    console.log(`  ${row.indexname}`);
  }

  // Verify the trigger
  const trigCheck = await client.query(`
    SELECT trigger_name, event_manipulation FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'tb_forwarder_invoice'
  `);
  console.log(`Triggers (${trigCheck.rows.length}):`);
  for (const row of trigCheck.rows) {
    console.log(`  ${row.trigger_name} (${row.event_manipulation})`);
  }

  console.log("\n✓ ALL GOOD — billing-run R-2 ready");
} catch (err) {
  console.error("\nMIGRATION FAILED:", err.code, err.message);
  if (err.detail) console.error("Detail:", err.detail);
  if (err.hint) console.error("Hint:", err.hint);
  process.exit(3);
} finally {
  await client.end();
}
