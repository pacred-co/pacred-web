#!/usr/bin/env node
/**
 * 2026-06-08 — apply migration 0149 to prod (delivery_feedback · Phase 4a).
 *
 * Dry-run by default — opens a transaction · runs the migration · prints the
 * resulting schema delta · then ROLLBACK. Re-run with `--apply` for the real
 * COMMIT path. Mirrors scripts/apply-migration-0150.mjs (which 0149 lacked).
 *
 * Usage:
 *   # dry-run (default · safe · ROLLBACK):
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/apply-migration-0149.mjs
 *   # real apply (COMMIT):
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/apply-migration-0149.mjs --apply
 *
 * Idempotent · safe to re-run · `create table if not exists` (new isolated
 * table · FK → tb_forwarder · no touch to existing data).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const MIGRATION_PATH = resolve(process.cwd(), "supabase/migrations/0149_delivery_feedback.sql");
const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) {
  console.error("FATAL: SUPABASE_DB_PASSWORD (or PG_PASSWORD) not set");
  process.exit(1);
}

const POOLER_HOSTS = [
  "aws-1-ap-southeast-1.pooler.supabase.com",
  "aws-0-ap-southeast-1.pooler.supabase.com",
];
const POOLER_USER = `postgres.${PROJECT_REF}`;
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;

const sql = readFileSync(MIGRATION_PATH, "utf-8");
console.log(`\n=== 0149_delivery_feedback.sql · ${sql.split("\n").length} lines · ${sql.length} chars ===`);
console.log(`Mode: ${APPLY ? "🚨 APPLY (COMMIT)" : "🔸 DRY-RUN (ROLLBACK)"}`);

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
  ...POOLER_HOSTS.flatMap((h) => [
    { label: `session-pooler ${h}:5432`, conn: `postgresql://${POOLER_USER}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres` },
    { label: `transaction-pooler ${h}:6543`, conn: `postgresql://${POOLER_USER}:${encodeURIComponent(PASSWORD)}@${h}:6543/postgres` },
  ]),
  { label: "direct 5432", conn: `postgresql://postgres:${encodeURIComponent(PASSWORD)}@${DIRECT_HOST}:5432/postgres` },
];
for (const a of attempts) {
  try { client = await tryConnect(a.label, a.conn); break; }
  catch (e) { console.log(`  ✗ ${e.code ?? "error"}: ${e.message}`); }
}
if (!client) { console.error("FATAL: could not connect to prod via any path."); process.exit(2); }

const t0 = Date.now();
try {
  await client.query("BEGIN");

  const pre = await client.query(
    `select count(*)::int AS n from information_schema.tables
      where table_schema='public' and table_name='delivery_feedback'`,
  );
  console.log(`\nPRE state · delivery_feedback table exists? ${pre.rows[0].n > 0 ? "yes" : "no"}`);

  console.log(`\nRunning 0149 SQL…`);
  await client.query(sql);
  console.log(`✓ SQL executed in ${Date.now() - t0}ms`);

  const cols = await client.query(
    `select column_name, data_type, is_nullable
       from information_schema.columns
      where table_schema='public' and table_name='delivery_feedback'
      order by ordinal_position`,
  );
  console.log(`\nPOST state · delivery_feedback columns (${cols.rowCount}):`);
  for (const r of cols.rows) console.log(`  • ${r.column_name.padEnd(14)} ${r.data_type.padEnd(26)} null=${r.is_nullable}`);

  const rls = await client.query(
    `select relrowsecurity from pg_class where relname='delivery_feedback' and relnamespace='public'::regnamespace`,
  );
  console.log(`POST state · RLS enabled? ${rls.rows[0]?.relrowsecurity ? "yes" : "no"}`);

  if (APPLY) {
    await client.query("COMMIT");
    console.log(`\n✅ COMMITTED — 0149 applied to prod in ${Date.now() - t0}ms total.`);
  } else {
    await client.query("ROLLBACK");
    console.log(`\n🔸 DRY-RUN — rolled back. Re-run with --apply to commit.`);
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("✗ MIGRATION FAILED:", err.code, err.message);
  if (err.detail) console.error("  Detail:", err.detail);
  if (err.hint) console.error("  Hint:", err.hint);
  process.exit(3);
} finally {
  await client.end();
}
