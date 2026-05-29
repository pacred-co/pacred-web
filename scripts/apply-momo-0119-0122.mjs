#!/usr/bin/env node
/**
 * Apply MOMO Phase A-D migrations 0119-0122 to prod, in order.
 * All idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 *
 * Usage: PG_PASSWORD='<password>' node scripts/apply-momo-0119-0122.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const FILES = [
  "0119_momo_disambiguate_container_naming.sql",
  "0120_momo_raw_events_and_detail_tables.sql",
  "0121_momo_tracking_links_and_status_snapshot.sql",
  "0122_momo_sync_run_items.sql",
];

const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.PG_PASSWORD;
if (!PASSWORD) {
  console.error("FATAL: PG_PASSWORD not set");
  process.exit(1);
}
const conn = `postgresql://postgres:${encodeURIComponent(PASSWORD)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

console.log(`Connecting to prod (${PROJECT_REF})...`);
await client.connect();
console.log("Connected.\n");

for (const f of FILES) {
  const path = resolve(REPO_ROOT, "supabase/migrations", f);
  const sql = readFileSync(path, "utf-8");
  const t0 = Date.now();
  try {
    await client.query(sql);
    console.log(`✓ ${f} applied in ${Date.now() - t0}ms`);
  } catch (err) {
    console.error(`✗ ${f} FAILED: ${err.message}`);
    await client.end();
    process.exit(2);
  }
}

await client.end();
console.log("\nAll 4 migrations applied.");
