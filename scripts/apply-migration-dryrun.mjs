#!/usr/bin/env node
/**
 * Generic DRY-RUN / apply for any idempotent additive migration (2026-06-08).
 * Default = dry-run: BEGIN; <migration>; ROLLBACK — surfaces any error before
 * touching prod. Pass `--apply` to COMMIT. The repo's `apply-migration-generic.mjs`
 * applies DIRECTLY (no txn-rollback); this one adds the dry-run safety the owner asked for.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/apply-migration-dryrun.mjs supabase/migrations/0152_x.sql
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/apply-migration-dryrun.mjs supabase/migrations/0152_x.sql --apply
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const file = args.find((a) => !a.startsWith("--"));
if (!file) { console.error("usage: node scripts/apply-migration-dryrun.mjs <path> [--apply]"); process.exit(1); }
const MIGRATION_PATH = resolve(process.cwd(), file);
const REF = "yzljakczhwrpbxflnmco";
const PW = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PW) { console.error("FATAL: SUPABASE_DB_PASSWORD (or PG_PASSWORD) not set"); process.exit(1); }

const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
const attempts = [
  ...HOSTS.flatMap((h) => [
    `postgresql://postgres.${REF}:${encodeURIComponent(PW)}@${h}:5432/postgres`,
    `postgresql://postgres.${REF}:${encodeURIComponent(PW)}@${h}:6543/postgres`,
  ]),
  `postgresql://postgres:${encodeURIComponent(PW)}@db.${REF}.supabase.co:5432/postgres`,
];
const sql = readFileSync(MIGRATION_PATH, "utf-8");
console.log(`\n=== ${file} · ${sql.split("\n").length} lines · ${sql.length} chars ===`);
console.log(`Mode: ${APPLY ? "🚨 APPLY (COMMIT)" : "🔸 DRY-RUN (ROLLBACK)"}`);

let client = null;
for (const conn of attempts) {
  try { client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 }); await client.connect(); console.log("✓ connected"); break; }
  catch (e) { console.log(`  ✗ ${e.code ?? "err"}: ${e.message}`); client = null; }
}
if (!client) { console.error("FATAL: no connection"); process.exit(2); }

const t0 = Date.now();
try {
  await client.query("BEGIN");
  await client.query(sql);
  console.log(`✓ SQL executed in ${Date.now() - t0}ms`);
  if (APPLY) { await client.query("COMMIT"); console.log(`\n✅ COMMITTED in ${Date.now() - t0}ms`); }
  else { await client.query("ROLLBACK"); console.log(`\n🔸 DRY-RUN OK · ROLLED BACK · re-run with --apply to commit`); }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("✗ MIGRATION FAILED:", err.code, err.message);
  if (err.detail) console.error("  Detail:", err.detail);
  if (err.hint) console.error("  Hint:", err.hint);
  process.exit(3);
} finally { await client.end(); }
