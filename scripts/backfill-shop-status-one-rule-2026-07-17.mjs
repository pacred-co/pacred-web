#!/usr/bin/env node
/**
 * One-time backfill (owner 2026-07-17 · P22332 "มีแทรคกิ้งหมดแล้ว แต่สถานะยังไม่เดิน"):
 * bring every ฝากสั่งซื้อ order onto the 3-stage rule after mig 0259 closed the
 * missing tb_order side of the re-derive.
 *
 * WHY a backfill is needed at all: a trigger only fires on a WRITE. Orders whose
 * tracking was keyed in while the goods had ALREADY arrived (the P22332 shape)
 * are pinned at a stale status and nothing will ever write their row again —
 * mig 0259 fixes them going FORWARD; this clears the existing backlog.
 *
 *   DRY-RUN:  SUPABASE_DB_PASSWORD='<pw>' node scripts/backfill-shop-status-one-rule-2026-07-17.mjs
 *   APPLY:    SUPABASE_DB_PASSWORD='<pw>' node scripts/backfill-shop-status-one-rule-2026-07-17.mjs --apply
 *
 * ⚠️ REQUIRES migration 0259 to be applied first (it CALLS the DB rule).
 *
 * ── ONE RULE ────────────────────────────────────────────────────────────────
 * This script does NOT re-implement the rule. It calls the DB functions that mig
 * 0259 installed — the SAME ones both triggers use:
 *   read  → derive_shop_order_status(hno)   ('4' | '40' | '5')
 *   write → apply_shop_order_status(hno)    (guarded · idempotent · status-only)
 * (The 2026-06-30 predecessor hand-wrote the rollup SQL — a 3rd copy of the rule.
 * Copies drift; that drift IS the owner's recurring complaint. Hence: call it.)
 *
 * ── SAFETY ──────────────────────────────────────────────────────────────────
 *   · DRY-RUN by default — --apply required to write.
 *   · Backup JSON of every touched row written BEFORE the txn.
 *   · ONE transaction (BEGIN/COMMIT · ROLLBACK on any error).
 *   · Idempotent: re-run = 0 writes (apply_shop_order_status no-ops when converged).
 *   · STATUS-ONLY — writes hstatus/hdateupdate/hdate5 via the guarded DB fn.
 *     NEVER money/paid/wallet/receipt.
 *   · NEVER re-opens a '5'/'6'/'99'. A wrongly-'5' order is REPORTED for owner
 *     review only — never auto-demoted. (The 2026-06-30 script DID demote 5→40/4;
 *     that is deliberately NOT repeated here.)
 */
import pg from "pg";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const PROJECT_REF = process.env.PROJECT_REF || "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("FATAL: SUPABASE_DB_PASSWORD not set"); process.exit(1); }

const hosts = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
let client = null;
for (const h of hosts) {
  try {
    const c = new pg.Client({
      connectionString: `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres`,
      ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12_000,
    });
    await c.connect(); client = c; console.log(`✓ connected ${h}`); break;
  } catch (e) { console.log(`  ${h} failed: ${e.message}`); }
}
if (!client) { console.error("FATAL: could not connect"); process.exit(1); }

// Guard: the rule fn must exist (mig 0259 applied).
const { rows: fnRows } = await client.query(
  `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('derive_shop_order_status','apply_shop_order_status')`,
);
if (fnRows.length < 2) {
  console.error("FATAL: migration 0259 not applied (derive/apply_shop_order_status missing). Apply it first.");
  await client.end(); process.exit(1);
}

// Read the CURRENT vs DERIVED for every order the rule governs, plus the '5's
// (report-only). The derive fn is the ONE rule — no local copy.
const { rows } = await client.query(`
  SELECT h.hno,
         btrim(COALESCE(h.hstatus,'')) AS cur,
         h.userid,
         public.derive_shop_order_status(h.hno) AS target,
         (SELECT COUNT(*) FROM tb_order o WHERE o.hno = h.hno
            AND (COALESCE(btrim(o.cnameshop),'')<>'' OR COALESCE(btrim(o.ctitle),'')<>'' OR COALESCE(btrim(o.ctrackingnumber),'')<>''))::int AS shops
  FROM tb_header_order h
  WHERE btrim(COALESCE(h.hstatus,'')) IN ('3','4','40','5')
  ORDER BY h.hno
`);

const writes = [];      // SAFE: {4,40} re-derive · '3' forward-pull
const reviewFive = [];  // wrongly-'5' → owner review ONLY (never auto-written)
let alreadyOk = 0;

for (const r of rows) {
  const { hno, cur, target, userid, shops } = r;
  if (cur === "5") {
    if (target === "5") alreadyOk++;
    else reviewFive.push({ hno, userid, cur, target, shops });
    continue; // NEVER auto-demote a completed order.
  }
  if (cur === "4" || cur === "40") {
    if (cur !== target) writes.push({ hno, userid, from: cur, to: target, shops });
    else alreadyOk++;
    continue;
  }
  if (cur === "3") {
    // forward-PULL only — 3→4 belongs to the shop-tracking handler, not this gate.
    if (target === "40" || target === "5") writes.push({ hno, userid, from: cur, to: target, shops });
    else alreadyOk++;
  }
}

console.log(`\n${APPLY ? "APPLY" : "DRY-RUN"} — ฝากสั่งซื้อ status backfill (ONE rule · mig 0259)`);
console.log(`  scanned (hstatus 3/4/40/5):                   ${rows.length}`);
console.log(`  already correct (no-op · idempotent):         ${alreadyOk}`);
console.log(`  SAFE writes ({4,40} re-derive · 3 fwd-pull):  ${writes.length}`);
console.log(`  wrongly-'5' (REVIEW only · NOT written):      ${reviewFive.length}`);

if (writes.length) {
  console.log(`\n  -- writes (hno: from → to · why) --`);
  for (const w of writes) {
    const why = w.to === "40" ? "ทุกร้านถึงโกดังจีน (fstatus≥2) ยังไม่ได้เลขตู้"
      : w.to === "5" ? "ทุกร้านได้เลขตู้/ถึงไทย"
      : "ยังมีร้านที่ยังไม่ถึง/ยังไม่ส่ง (down-correct)";
    console.log(`    ${w.hno} (${w.userid} · ${w.shops} ร้าน): ${w.from} → ${w.to}  ·  ${why}`);
  }
  console.log(`  P22332 present: ${writes.some((w) => w.hno === "P22332")}`);
}

if (reviewFive.length) {
  console.log(`\n  -- ⚠️ wrongly-'5' — OWNER REVIEW (never auto-demoted) --`);
  for (const v of reviewFive) {
    console.log(`    ${v.hno} (${v.userid} · ${v.shops} ร้าน): stored '5' but rule says '${v.target}'`);
  }
}

if (!APPLY) {
  console.log(`\nDRY-RUN — nothing written. Re-run with --apply to write the ${writes.length} row(s).`);
  await client.end(); process.exit(0);
}

if (writes.length === 0) {
  console.log(`\nNothing to write (already converged). Exiting.`);
  await client.end(); process.exit(0);
}

// Backup BEFORE the txn.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `scripts/_backup-shop-status-${stamp}.json`;
fs.writeFileSync(backupPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  migration: "0259_shop_status_one_rule_both_sides",
  note: "restore: UPDATE tb_header_order SET hstatus=<from> WHERE hno=<hno>;",
  rows: writes,
}, null, 2));
console.log(`\n✓ backup → ${backupPath}`);

// ONE txn · the guarded DB fn is the ONE writer.
let wrote = 0;
try {
  await client.query("BEGIN");
  for (const w of writes) {
    await client.query("SELECT public.apply_shop_order_status($1)", [w.hno]);
    const { rows: after } = await client.query(
      "SELECT btrim(COALESCE(hstatus,'')) AS s FROM tb_header_order WHERE hno=$1", [w.hno],
    );
    const got = after[0]?.s;
    if (got !== w.to) {
      throw new Error(`invariant FAILED ${w.hno}: expected '${w.to}' got '${got}' — rolling back`);
    }
    wrote++;
    console.log(`    ✓ ${w.hno}: ${w.from} → ${got}`);
  }
  await client.query("COMMIT");
  console.log(`\n✓ COMMIT — ${wrote} order(s) re-derived. Re-run = 0 writes (idempotent).`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error(`\n✗ ROLLBACK — ${e.message}`);
  await client.end(); process.exit(1);
}

await client.end();
