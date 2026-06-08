#!/usr/bin/env node
/**
 * 2026-06-08 — apply migration 0150 to prod (B4 / backlog #259 — cabinet lock flag).
 *
 * Dry-run by default — opens a transaction · runs the migration · prints the
 * resulting schema delta · then ROLLBACK. Re-run with `--apply` for the real
 * COMMIT path. Adapted from `scripts/apply-migration-generic.mjs` with the
 * dry-run loop bolted on.
 *
 * Usage:
 *   # dry-run (default · safe · ROLLBACK):
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/apply-migration-0150.mjs
 *
 *   # real apply (COMMIT):
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/apply-migration-0150.mjs --apply
 *
 * Idempotent · safe to re-run · ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const MIGRATION_PATH = resolve(process.cwd(), "supabase/migrations/0150_tb_forwarder_cabinet_locked.sql");
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
console.log(`\n=== 0150_tb_forwarder_cabinet_locked.sql · ${sql.split("\n").length} lines · ${sql.length} chars ===`);
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

  // ─── Pre-state probe ───
  const pre = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'tb_forwarder'
       AND column_name = 'fcabinet_locked'
  `);
  console.log(`\nPRE state · fcabinet_locked column exists? ${pre.rowCount > 0 ? "yes" : "no"}`);
  if (pre.rowCount > 0) {
    console.log(`  → ${JSON.stringify(pre.rows[0], null, 2)}`);
  }

  const preIdx = await client.query(`
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'tb_forwarder'
       AND indexname = 'tb_forwarder_fcabinet_locked_idx'
  `);
  console.log(`PRE state · partial index exists? ${preIdx.rowCount > 0 ? "yes" : "no"}`);
  if (preIdx.rowCount > 0) {
    console.log(`  → ${preIdx.rows[0].indexdef}`);
  }

  // ─── Apply the migration ───
  console.log(`\nRunning 0150 SQL…`);
  await client.query(sql);
  console.log(`✓ SQL executed in ${Date.now() - t0}ms`);

  // ─── Post-state probe ───
  const post = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'tb_forwarder'
       AND column_name = 'fcabinet_locked'
  `);
  console.log(`\nPOST state · fcabinet_locked column:`);
  console.log(`  ${JSON.stringify(post.rows[0], null, 2)}`);

  const postIdx = await client.query(`
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'tb_forwarder'
       AND indexname = 'tb_forwarder_fcabinet_locked_idx'
  `);
  console.log(`POST state · partial index:`);
  console.log(`  ${postIdx.rows[0]?.indexdef ?? "(missing — INVESTIGATE)"}`);

  const counts = await client.query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE fcabinet_locked = true)::int AS locked,
      count(*) FILTER (WHERE fcabinet_locked = false)::int AS unlocked
    FROM public.tb_forwarder
  `);
  console.log(`POST state · row distribution: ${JSON.stringify(counts.rows[0])}`);

  // ─── Commit or rollback ───
  if (APPLY) {
    await client.query("COMMIT");
    console.log(`\n✅ COMMITTED — 0150 applied to prod in ${Date.now() - t0}ms total.`);
    console.log(`Next: run \`node --env-file=.env.local scripts/probe-fcabinet-locked-0150.mjs\` to verify wiring.`);
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
