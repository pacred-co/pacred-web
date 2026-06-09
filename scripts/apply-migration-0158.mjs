#!/usr/bin/env node
/**
 * 2026-06-09 — apply migration 0158 to prod (per-item delivered-at on tb_forwarder_driver_item).
 *
 * Background: round-6 agent A swapped /admin/driver-runs from the §0e
 * rebuilt-empty `forwarder_driver` (0 rows) to live `tb_forwarder_driver_item`
 * (29,782 rows). The page proxied "delivered in last 7 days" via
 * tb_forwarder_driver.fddate (= batch creation date) — imprecise. 0158 adds
 * the missing per-item `fdicompletedat timestamptz` column + partial DESC
 * index on `WHERE fdistatus='2'` so the disbursement filter can ask the
 * precise question. The action `markDriverItemDelivered` writes the
 * timestamp in the same UPDATE as the fdistatus flip.
 *
 * Dry-run by default — opens a transaction · runs the migration · prints
 * the resulting schema delta · then ROLLBACK. Re-run with `--apply` for
 * the real COMMIT path. Mirrors `scripts/apply-migration-0150.mjs`.
 *
 * Usage:
 *   # dry-run (default · safe · ROLLBACK):
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/apply-migration-0158.mjs
 *
 *   # real apply (COMMIT):
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/apply-migration-0158.mjs --apply
 *
 * Idempotent · safe to re-run · ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const MIGRATION_PATH = resolve(process.cwd(), "supabase/migrations/0158_tb_forwarder_driver_item_completed_at.sql");
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
console.log(`\n=== 0158_tb_forwarder_driver_item_completed_at.sql · ${sql.split("\n").length} lines · ${sql.length} chars ===`);
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
       AND table_name = 'tb_forwarder_driver_item'
       AND column_name = 'fdicompletedat'
  `);
  console.log(`\nPRE state · fdicompletedat column exists? ${pre.rowCount > 0 ? "yes" : "no"}`);
  if (pre.rowCount > 0) {
    console.log(`  → ${JSON.stringify(pre.rows[0], null, 2)}`);
  }

  const preIdx = await client.query(`
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'tb_forwarder_driver_item'
       AND indexname = 'tb_forwarder_driver_item_fdicompletedat_idx'
  `);
  console.log(`PRE state · partial index exists? ${preIdx.rowCount > 0 ? "yes" : "no"}`);
  if (preIdx.rowCount > 0) {
    console.log(`  → ${preIdx.rows[0].indexdef}`);
  }

  // Baseline row counts so we can confirm zero behavioural change.
  const preCounts = await client.query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE fdistatus = '')::int AS pending,
      count(*) FILTER (WHERE fdistatus = '1')::int AS loaded,
      count(*) FILTER (WHERE fdistatus = '2')::int AS delivered,
      count(*) FILTER (WHERE fdistatus = '3')::int AS failed
    FROM public.tb_forwarder_driver_item
  `);
  console.log(`PRE state · row distribution: ${JSON.stringify(preCounts.rows[0])}`);

  // ─── Apply the migration ───
  console.log(`\nRunning 0158 SQL…`);
  await client.query(sql);
  console.log(`✓ SQL executed in ${Date.now() - t0}ms`);

  // ─── Post-state probe ───
  const post = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'tb_forwarder_driver_item'
       AND column_name = 'fdicompletedat'
  `);
  console.log(`\nPOST state · fdicompletedat column:`);
  console.log(`  ${JSON.stringify(post.rows[0], null, 2)}`);

  const postIdx = await client.query(`
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'tb_forwarder_driver_item'
       AND indexname = 'tb_forwarder_driver_item_fdicompletedat_idx'
  `);
  console.log(`POST state · partial index:`);
  console.log(`  ${postIdx.rows[0]?.indexdef ?? "(missing — INVESTIGATE)"}`);

  const postCounts = await client.query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE fdicompletedat IS NOT NULL)::int AS has_completedat,
      count(*) FILTER (WHERE fdicompletedat IS NULL AND fdistatus = '2')::int AS delivered_without_completedat
    FROM public.tb_forwarder_driver_item
  `);
  console.log(`POST state · fdicompletedat distribution: ${JSON.stringify(postCounts.rows[0])}`);
  console.log(`  (expected immediately after apply: has_completedat=0 · delivered_without_completedat≈28k — NOT backfilled by design · page falls back to batch.fddate proxy for NULL)`);

  // ─── Commit or rollback ───
  if (APPLY) {
    await client.query("COMMIT");
    console.log(`\n✅ COMMITTED — 0158 applied to prod in ${Date.now() - t0}ms total.`);
    console.log(`Next: deliveries via /admin/drivers/work or /admin/drivers/[id] will start writing fdicompletedat;`);
    console.log(`      /admin/driver-runs "เสร็จล่าสุด 7 วัน" filter will use it (NULL rows fall back to batch.fddate proxy).`);
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
