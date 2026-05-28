#!/usr/bin/env node
/**
 * One-off migration runner for the camelCase pilot (0113).
 *
 * Reads the SQL file + executes it against prod via pg client.
 * Connection uses the prod DB password from PG_PASSWORD env (set inline
 * at invocation — never commit credentials).
 *
 * Usage:
 *   PG_PASSWORD='<password>' node scripts/apply-pilot-migration.mjs
 *
 * Safe: the migration uses DO $$ ... EXCEPTION blocks + IF EXISTS guards
 * so re-running is a no-op for already-applied renames.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const MIGRATION_PATH = resolve(REPO_ROOT, "supabase/migrations/0115_align_container_payment_tables.sql");

// Prod connection — Supabase direct DB (NOT pooler) so DDL works cleanly.
const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.PG_PASSWORD;
if (!PASSWORD) {
  console.error("FATAL: PG_PASSWORD env var not set");
  process.exit(1);
}

// Try direct connection first (db.<ref>.supabase.co:5432).
// Fall back to session-mode pooler if direct fails (IPv6 etc).
const conn = `postgresql://postgres:${encodeURIComponent(PASSWORD)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;

const sql = readFileSync(MIGRATION_PATH, "utf-8");

const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

console.log(`Connecting to prod (${PROJECT_REF})...`);
await client.connect();
console.log("Connected.");

console.log(`Running migration: ${MIGRATION_PATH}`);
console.log(`  ${sql.split("\n").length} lines · ${(sql.match(/DO \$\$/g) ?? []).length} DO blocks`);

const t0 = Date.now();
try {
  await client.query(sql);
  const ms = Date.now() - t0;
  console.log(`✓ Migration applied in ${ms}ms`);

  // Verify a sample rename
  const verify = await client.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public'
    AND table_name IN ('tb_cnt', 'tb_cnt_item', 'tb_check_forwarder')
    AND column_name IN ('id', 'ID', 'cntstatus', 'cntStatus', 'cntname', 'cntName', 'cfstatus', 'cfStatus', 'fcabinetnumber', 'fCabinetNumber')
    ORDER BY table_name, column_name
  `);
  console.log("Verify batch 2a sample columns:");
  for (const row of verify.rows) {
    console.log(`  ${row.table_name}.${row.column_name}`);
  }
} catch (err) {
  console.error("MIGRATION FAILED:", err.message);
  process.exit(2);
} finally {
  await client.end();
}
