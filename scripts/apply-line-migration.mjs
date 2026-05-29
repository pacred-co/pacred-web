#!/usr/bin/env node
/**
 * One-off migration runner for 0131_line_oa_inbox.sql (LINE OA inbox).
 *
 * Applies the 4 new isolated LINE tables to prod via a direct pg connection.
 * Purely additive + idempotent (create … if not exists / seed on conflict do
 * nothing) — re-running is a safe no-op. Touches NO existing table.
 *
 * The prod DB password comes from PG_PASSWORD. Easiest + leak-safe: put
 * `PG_PASSWORD=<prod-db-password>` in `.env.local`, then let Node load it:
 *
 *   node --env-file=.env.local scripts/apply-line-migration.mjs
 *
 * (Get the password from Supabase Dashboard → Project Settings → Database →
 *  Connection string / Database password. NEVER paste it in chat or commit it.)
 *
 * Verifies by counting all 4 tables after apply.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const MIGRATION_PATH = resolve(REPO_ROOT, "supabase/migrations/0131_line_oa_inbox.sql");

const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.PG_PASSWORD;
if (!PASSWORD) {
  console.error("FATAL: PG_PASSWORD not set.");
  console.error("Run:  node --env-file=.env.local scripts/apply-line-migration.mjs");
  console.error("(add PG_PASSWORD=<prod-db-password> to .env.local first)");
  process.exit(1);
}

// Direct DB connection (NOT the pooler) so DDL runs cleanly.
const conn = `postgresql://postgres:${encodeURIComponent(PASSWORD)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
const sql = readFileSync(MIGRATION_PATH, "utf-8");
const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

console.log(`Connecting to prod (${PROJECT_REF})...`);
await client.connect();
console.log("Connected.");

console.log(`Running migration: ${MIGRATION_PATH} (${sql.split("\n").length} lines)`);
const t0 = Date.now();
try {
  await client.query(sql);
  console.log(`✓ Migration applied in ${Date.now() - t0}ms`);

  for (const table of ["customers_line", "line_messages", "line_webhook_events", "line_lead_sources"]) {
    const r = await client.query(`SELECT count(*)::int AS n FROM public.${table}`);
    console.log(`  ${table.padEnd(22)} = ${r.rows[0].n} rows`);
  }
  console.log("Expect: line_lead_sources = 3 (Facebook / Google / YouTube), others = 0");
} catch (err) {
  console.error("MIGRATION FAILED:", err.message);
  process.exit(2);
} finally {
  await client.end();
}
