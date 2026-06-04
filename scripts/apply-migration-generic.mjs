#!/usr/bin/env node
/**
 * Generic prod migration applier (2026-06-04). Adapted from
 * scripts/apply-0138-billing-run.mjs — parameterized by the migration path so
 * any idempotent additive migration can be applied with one script.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/apply-migration-generic.mjs supabase/migrations/0137_pcs_sync_state.sql
 *
 * Only run on migrations that are idempotent (create … if not exists · add
 * column if not exists · on conflict do nothing). Safe to re-run.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-migration-generic.mjs <migration-path>");
  process.exit(1);
}
const MIGRATION_PATH = resolve(process.cwd(), file);
const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) {
  console.error("FATAL: SUPABASE_DB_PASSWORD (or PG_PASSWORD) not set");
  process.exit(1);
}

const POOLER_HOST = "aws-0-ap-southeast-1.pooler.supabase.com";
const POOLER_USER = `postgres.${PROJECT_REF}`;
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;

const sql = readFileSync(MIGRATION_PATH, "utf-8");
console.log(`\n=== ${file} · ${sql.split("\n").length} lines · ${sql.length} chars ===`);

async function tryConnect(label, conn) {
  console.log(`Trying ${label}…`);
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
  { label: "session-pooler 5432", conn: `postgresql://${POOLER_USER}:${encodeURIComponent(PASSWORD)}@${POOLER_HOST}:5432/postgres` },
  { label: "transaction-pooler 6543", conn: `postgresql://${POOLER_USER}:${encodeURIComponent(PASSWORD)}@${POOLER_HOST}:6543/postgres` },
  { label: "direct 5432", conn: `postgresql://postgres:${encodeURIComponent(PASSWORD)}@${DIRECT_HOST}:5432/postgres` },
];
for (const a of attempts) {
  try { client = await tryConnect(a.label, a.conn); break; }
  catch (e) { console.log(`  ✗ ${e.code ?? "error"}: ${e.message}`); }
}
if (!client) { console.error("FATAL: could not connect to prod via any path."); process.exit(2); }

const t0 = Date.now();
try {
  await client.query(sql);
  console.log(`✓ APPLIED in ${Date.now() - t0}ms`);
} catch (err) {
  console.error("✗ MIGRATION FAILED:", err.code, err.message);
  if (err.detail) console.error("  Detail:", err.detail);
  if (err.hint) console.error("  Hint:", err.hint);
  process.exit(3);
} finally {
  await client.end();
}
