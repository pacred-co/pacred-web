#!/usr/bin/env node
/**
 * 2026-06-09 — apply migration 0159 to prod (heartbeat lock on tb_header_order).
 *
 * Background: Wave 31 shipped the 5-tab admin shop-order edit workflow; two
 * staff editing the same order simultaneously silently clobber each other.
 * Legacy `updateLock.php` (6 LOC) + `update.php` L499-511 jQuery setInterval
 * solved this 60-sec heartbeat lock; we port it as `hlockedby` + `hlockedat`
 * columns + Server Actions in `actions/admin/service-orders-lock.ts` + a
 * client island that heartbeats every 50 seconds (10-sec safety margin) +
 * an amber banner on the /edit page when another admin holds the lock.
 *
 * Dry-run by default — opens a transaction · runs the migration · prints
 * the resulting schema delta + index list · then ROLLBACK. Re-run with
 * `--apply` for the real COMMIT path. Mirrors `scripts/apply-migration-0158.mjs`.
 *
 * Usage:
 *   # dry-run (default · safe · ROLLBACK):
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/apply-migration-0159.mjs
 *
 *   # real apply (COMMIT):
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/apply-migration-0159.mjs --apply
 *
 * Idempotent · safe to re-run · ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const MIGRATION_PATH = resolve(process.cwd(), "supabase/migrations/0159_tb_header_order_heartbeat_lock.sql");
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
console.log(`\n=== 0159_tb_header_order_heartbeat_lock.sql · ${sql.split("\n").length} lines · ${sql.length} chars ===`);
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
       AND table_name = 'tb_header_order'
       AND column_name IN ('hlockedby', 'hlockedat')
     ORDER BY column_name
  `);
  console.log(`\nPRE state · heartbeat cols exist? ${pre.rowCount > 0 ? `yes (${pre.rowCount}/2)` : "no"}`);
  for (const row of pre.rows) {
    console.log(`  → ${JSON.stringify(row, null, 2)}`);
  }

  const preIdx = await client.query(`
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'tb_header_order'
       AND indexname = 'tb_header_order_hlockedat_idx'
  `);
  console.log(`PRE state · hlockedat index exists? ${preIdx.rowCount > 0 ? "yes" : "no"}`);
  if (preIdx.rowCount > 0) {
    console.log(`  → ${preIdx.rows[0].indexdef}`);
  }

  // Baseline row count so we can confirm zero behavioural change.
  const preCount = await client.query(`
    SELECT count(*)::int AS total FROM public.tb_header_order
  `);
  console.log(`PRE state · total tb_header_order rows: ${preCount.rows[0].total}`);

  // ─── Apply the migration ───
  console.log(`\nRunning 0159 SQL…`);
  await client.query(sql);
  console.log(`✓ SQL executed in ${Date.now() - t0}ms`);

  // ─── Post-state probe ───
  const post = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'tb_header_order'
       AND column_name IN ('hlockedby', 'hlockedat')
     ORDER BY column_name
  `);
  console.log(`\nPOST state · heartbeat cols:`);
  for (const row of post.rows) {
    console.log(`  ${JSON.stringify(row, null, 2)}`);
  }

  const postIdx = await client.query(`
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'tb_header_order'
       AND indexname = 'tb_header_order_hlockedat_idx'
  `);
  console.log(`POST state · index:`);
  console.log(`  ${postIdx.rows[0]?.indexdef ?? "(missing — INVESTIGATE)"}`);

  const postCounts = await client.query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE hlockedby IS NOT NULL)::int AS has_locker,
      count(*) FILTER (WHERE hlockedat IS NOT NULL)::int AS has_lockat
    FROM public.tb_header_order
  `);
  console.log(`POST state · lock distribution: ${JSON.stringify(postCounts.rows[0])}`);
  console.log(`  (expected immediately after apply: has_locker=0 · has_lockat=0 — pure ADD COLUMN nullable, no backfill needed)`);

  // ─── Commit or rollback ───
  if (APPLY) {
    await client.query("COMMIT");
    console.log(`\n✅ COMMITTED — 0159 applied to prod in ${Date.now() - t0}ms total.`);
    console.log(`Next: every visit to /admin/service-orders/[hNo]/edit will heartbeat the lock`);
    console.log(`      every 50 seconds via the client island in heartbeat-lock.tsx;`);
    console.log(`      a second admin opening the same order will see the amber banner.`);
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
