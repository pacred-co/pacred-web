#!/usr/bin/env node
/**
 * scripts/reconcile-migrations.mjs
 *
 * Bring ANY Supabase project's schema up to parity with the repo's migration
 * set — used 2026-06-11 to sync the shared DEV project (lozntlidlqqzzcaathnm,
 * the one น้องๆ develop against) to PROD (yzljakczhwrpbxflnmco), which had
 * drifted (dev was NON-CONTIGUOUSLY migrated — had 0152/0172/0175 but missing
 * 0154/0158/0167/0173/0174/0176).
 *
 * WHY a reconciler (not a linear apply): a `git pull` moves CODE, not SCHEMA.
 * Each env's migrations are applied by hand, so an env can be patchy. This runs
 * every migration in a numeric range in order, each in its OWN transaction:
 *   - success            → COMMIT (a missing migration just got applied; an
 *                          already-applied idempotent one is a harmless no-op —
 *                          every recent migration uses IF NOT EXISTS / OR REPLACE)
 *   - benign error       → ROLLBACK + skip ("already exists" / "duplicate" /
 *                          "does not exist" = already-applied non-idempotent DDL)
 *   - real error         → ROLLBACK + FLAG in the summary for human review
 *
 * ⚠️ SEED-DATA DUP GUARD: a migration that is `CREATE TABLE IF NOT EXISTS` +
 *   a plain (non-ON-CONFLICT) `INSERT` would DUPLICATE its seed if re-run on an
 *   env that already has it. Pass such already-applied migrations in --skip.
 *   (Grep the range for `insert into` first; on 2026-06-11 only 0152 + 0167 had
 *   seeds — 0152 was already on dev so it was skipped; 0167 was missing so its
 *   first-time apply was correct.)
 *
 * ⚠️ MARKER LESSON: to VERIFY parity afterwards, read the ACTUAL object name
 *   out of the migration file (`grep -i 'create table\|add column'`) — do NOT
 *   guess (0154 = `customer_tag` not `tb_customer_tag`; 0158's cost_unit_thb is
 *   on `tb_forwarder_item` not `tb_order`; 0167 = `freight_commission_tiers`
 *   not `_ledger`). Guessed markers gave false "MISSING" on objects that were
 *   actually present.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/reconcile-migrations.mjs \
 *       --ref <project-ref> --from 0146 --to 0176 --skip 0152
 *   (default --ref = the prod ref; ALWAYS pass --ref for a non-prod env.)
 */
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";

const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REF  = get("--ref", "yzljakczhwrpbxflnmco");
const FROM = get("--from", "0001");
const TO   = get("--to", "9999");
const SKIP = new Set((get("--skip", "") || "").split(",").filter(Boolean));
const APPLY = !args.includes("--dry-run"); // default APPLIES (the whole point);
                                           // --dry-run lists what WOULD run
const PW = process.env.SUPABASE_DB_PASSWORD; // for a non-prod env, set this to that env's DB password
if (!PW) { console.error("FATAL: SUPABASE_DB_PASSWORD not set"); process.exit(1); }
const enc = encodeURIComponent(PW);
const ATTEMPTS = [
  `postgresql://postgres.${REF}:${enc}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres.${REF}:${enc}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres:${enc}@db.${REF}.supabase.co:5432/postgres`,
];
async function connect() {
  for (const c of ATTEMPTS) {
    try { const cl = new pg.Client({ connectionString: c, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 }); await cl.connect(); return cl; }
    catch (e) { /* next */ }
  }
  throw new Error("no connection to " + REF);
}

const files = readdirSync("supabase/migrations")
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .filter((f) => { const n = f.slice(0, 4); return n >= FROM && n <= TO; })
  .sort();

console.log(`\n=== reconcile ${files.length} migrations [${FROM}..${TO}] → ${REF} · ${APPLY ? "APPLY" : "DRY-RUN"} ===`);
if (SKIP.size) console.log(`skip: ${[...SKIP].join(", ")}\n`);

const c = await connect();
console.log("✓ connected\n");
let applied = 0, skipped = 0; const errors = [];
for (const f of files) {
  const num = f.slice(0, 4);
  if (SKIP.has(num)) { console.log(`  ⊘ ${f}  (--skip)`); skipped++; continue; }
  if (!APPLY) { console.log(`  · ${f}  (would run)`); continue; }
  const sql = readFileSync("supabase/migrations/" + f, "utf-8");
  try {
    await c.query("BEGIN"); await c.query(sql); await c.query("COMMIT");
    console.log(`  ✓ ${f}`); applied++;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    const benign = /already exists|duplicate|does not exist|cannot drop|is not unique/i.test(e.message || "");
    if (benign) { console.log(`  ⊘ ${f}  skip (${(e.message || "").slice(0, 70)})`); skipped++; }
    else { console.log(`  ⚠ ${f}  ERROR: ${(e.message || "").slice(0, 90)}`); errors.push({ f, code: e.code, msg: (e.message || "").slice(0, 120) }); }
  }
}
console.log(`\n=== ${applied} applied/ok · ${skipped} skipped · ${errors.length} real-errors ===`);
for (const e of errors) console.log(`   ⚠ ${e.f}: [${e.code}] ${e.msg}`);
await c.end();
if (errors.length) process.exit(3);
