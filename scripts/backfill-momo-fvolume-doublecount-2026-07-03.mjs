#!/usr/bin/env node
/**
 * backfill-momo-fvolume-doublecount-2026-07-03.mjs
 *
 * ── WHAT THIS FIXES ───────────────────────────────────────────────────
 * `adminUpdateMomoBoxDetails` (actions/admin/forwarder-box-detail.ts) recomputed
 * tb_forwarder.fvolume to a whole-tracking TOTAL CBM but NEVER latched
 * famountcount='1'. On rows whose famountcount is NULL (≠'1') and famount>1 the
 * platform CBM rule `CBMProduct = (famountcount=='1') ? fvolume : fvolume*famount`
 * then re-multiplied by famount — inflating BOTH the stored fvolume (it ended up
 * = per-box-CBM × famount²) AND the derived ftotalprice by an extra ×famount.
 * report-cnt showed ราคาขาย ฿190M for container GZE260627-1 (row 52225: 62×34×46,
 * famount 70, fvolume 475.1432 = 0.096968 × 70², ftotalprice 189,582,136.80).
 *
 * ── PRECISE CORRUPTION SIGNATURE (verified: catches exactly the bad rows, 0 false
 *    positives DB-wide) ──────────────────────────────────────────────────
 *   the row carries its own box dims (fwidth·flength·fheight > 0)  AND
 *   famount > 1  AND  famountcount ≠ '1'  AND  fstatus ∉ {5,6,7} (NOT billed)  AND
 *   stored fvolume ≈ (fwidth·flength·fheight/1e6) × famount²  (rel. tol 1%)
 *       └ i.e. the per-box CBM got multiplied by famount TWICE.
 *
 * ── CORRECTION (money-consistent per the PER-BOX convention) ──────────────
 *   fvolume      → round6( fvolume / famount )   = per-box CBM × famount = the TRUE total
 *   famountcount → '1'                            = so consumers read fvolume as the total
 *                                                    (never ×famount again)
 *   ftotalprice  → round2( newFvolume × frefrate ) for CBM-priced rows (frefprice='2',
 *                    frefrate>0) — the ฿/CBM unit rate is intact (only fvolume was
 *                    corrupted), so scaling from it is exact. A row that is NOT CBM-priced
 *                    or has no positive rate → BASIS fixed, price DEFERRED to the app
 *                    (never a silent ฿0).
 *
 * ── SAFETY ────────────────────────────────────────────────────────────
 *   • DRY-RUN default; --apply writes a JSON backup FIRST.
 *   • BILLED-ROW GUARD: fstatus ∈ {5,6,7} excluded in the candidate query AND the
 *     UPDATE re-asserts `AND fstatus NOT IN ('5','6','7')` (TOCTOU-safe).
 *   • IDEMPOTENT: a fixed row has famountcount='1' → drops out of the predicate → no-op re-run.
 *   • Password from env only (never hardcoded/printed).
 *   • Writes ONLY fvolume / famountcount / ftotalprice on matched rows.
 *
 * RUN (DB pw in env · .env.local's is stale → pass the prod pw inline):
 *   SUPABASE_DB_PASSWORD='<prod>' node scripts/backfill-momo-fvolume-doublecount-2026-07-03.mjs                 # dry-run all
 *   SUPABASE_DB_PASSWORD='<prod>' node scripts/backfill-momo-fvolume-doublecount-2026-07-03.mjs --container GZE260627-1
 *   SUPABASE_DB_PASSWORD='<prod>' node scripts/backfill-momo-fvolume-doublecount-2026-07-03.mjs --fid 52225
 *   SUPABASE_DB_PASSWORD='<prod>' node scripts/backfill-momo-fvolume-doublecount-2026-07-03.mjs --apply
 */
import pg from "pg";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.argv.includes("--apply");
const CONTAINER = (process.argv.find((a) => a.startsWith("--container=")) || "").split("=")[1]
  || (process.argv.includes("--container") ? process.argv[process.argv.indexOf("--container") + 1] : null);
const FID = (process.argv.find((a) => a.startsWith("--fid=")) || "").split("=")[1]
  || (process.argv.includes("--fid") ? process.argv[process.argv.indexOf("--fid") + 1] : null);

const RUN_STAMP = "2026-07-03";
const BACKUP_PATH = resolve(process.cwd(), `scripts/backfill-momo-fvolume-doublecount-${RUN_STAMP}-backup.json`);
const TOL = 0.01; // relative tolerance proving fvolume ≈ dims_CBM × famount²

const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) {
  console.error("FATAL: SUPABASE_DB_PASSWORD not set — refusing to run.");
  process.exit(1);
}
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6;

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  database: "postgres",
  password: PASSWORD,
  ssl: { rejectUnauthorized: false },
});

console.log("───────────────────────────────────────────────────────────────");
console.log(`backfill MOMO fvolume double-count · mode = ${APPLY ? "🔴 APPLY (writing)" : "🟡 DRY-RUN"}`);
if (CONTAINER) console.log(`scope: container = ${CONTAINER}`);
if (FID) console.log(`scope: fid = ${FID}`);
console.log("───────────────────────────────────────────────────────────────\n");

await c.connect();

// Candidate query — the precise row-dims double-count signature, non-billed only.
const where = [
  "famount > 1",
  "fwidth::numeric > 0 AND flength::numeric > 0 AND fheight::numeric > 0",
  "coalesce(nullif(btrim(famountcount::text),''),'x') <> '1'",
  "fstatus NOT IN ('5','6','7')",
];
const params = [];
if (CONTAINER) { params.push(CONTAINER); where.push(`fcabinetnumber = $${params.length}`); }
if (FID) { params.push(FID); where.push(`id = $${params.length}`); }

const { rows } = await c.query(
  `SELECT id, ftrackingchn, fcabinetnumber, fstatus, famount,
          fvolume::numeric fv, frefprice, frefrate::numeric fr, ftotalprice::numeric tp,
          (fwidth::numeric*flength::numeric*fheight::numeric/1e6) perbox
     FROM tb_forwarder
    WHERE ${where.join(" AND ")}`,
  params,
);

const plan = [];
const skipped = [];
for (const r of rows) {
  const expectSq = r.perbox * r.famount * r.famount; // the corrupted value = per-box × famount²
  if (!(expectSq > 0) || Math.abs(r.fv - expectSq) / expectSq >= TOL) {
    skipped.push({ id: r.id, reason: "not the ×famount² signature", fv: round6(r.fv), expectSq: round6(expectSq) });
    continue;
  }
  const newFvolume = round6(r.fv / r.famount); // = per-box × famount = the true total
  const cbmPriced = String(r.frefprice ?? "").trim() === "2" && r.fr > 0;
  const newTotal = cbmPriced ? round2(newFvolume * r.fr) : null; // exact for CBM-priced; else defer
  plan.push({
    id: r.id, tracking: r.ftrackingchn, container: r.fcabinetnumber, famount: r.famount,
    oldFvolume: round6(r.fv), newFvolume, oldTotal: round2(r.tp), newTotal, frefrate: r.fr,
    priceDeferred: !cbmPriced,
  });
}

console.log(`candidates scanned: ${rows.length} · to fix: ${plan.length} · skipped(not-signature): ${skipped.length}\n`);
console.log("── per-row plan ──");
for (const p of plan) {
  console.log(
    `  #${p.id} ${String(p.tracking).padEnd(22)} ${p.container} · famount ${p.famount} · ` +
    `fvolume ${p.oldFvolume} → ${p.newFvolume} · ราคาขาย ${p.oldTotal.toLocaleString()} → ` +
    (p.priceDeferred ? "(defer · not CBM-priced)" : p.newTotal.toLocaleString()) + " · famountcount → '1'",
  );
}
if (skipped.length) {
  console.log(`\n── skipped (${skipped.length}) — not the exact signature, left untouched ──`);
  skipped.slice(0, 20).forEach((s) => console.log(`  #${s.id}: ${s.reason} (fv ${s.fv} vs ×fa² ${s.expectSq})`));
}

if (!APPLY) {
  console.log(`\n(dry-run — nothing written. Re-run with --apply to fix the ${plan.length} rows.)\n`);
  await c.end();
  process.exit(0);
}
if (plan.length === 0) {
  console.log("\n(--apply given but 0 rows to fix.)\n");
  await c.end();
  process.exit(0);
}

// Backup BEFORE any write.
writeFileSync(BACKUP_PATH, JSON.stringify({ stamp: RUN_STAMP, count: plan.length, rows: plan }, null, 2), "utf-8");
console.log(`\n✓ backup written: ${BACKUP_PATH} (${plan.length} rows)`);

let written = 0;
for (const p of plan) {
  // TOCTOU-safe: re-assert non-billed + still-double-counted (famountcount≠'1') in the WHERE.
  const sets = ["fvolume = $2", "famountcount = '1'"];
  const vals = [p.id, p.newFvolume];
  if (p.newTotal != null) { sets.push(`ftotalprice = $${vals.length + 1}`); vals.push(p.newTotal); }
  const res = await c.query(
    `UPDATE tb_forwarder SET ${sets.join(", ")}
      WHERE id = $1
        AND fstatus NOT IN ('5','6','7')
        AND coalesce(nullif(btrim(famountcount::text),''),'x') <> '1'`,
    vals,
  );
  if (res.rowCount === 1) written++;
  else console.log(`  ⚠ #${p.id}: 0 rows updated (billed or already fixed since scan) — left untouched`);
  process.stdout.write(`\r  fixed ${written}/${plan.length}`);
}
console.log(`\n\n✓ applied: ${written} row(s) corrected. Backup at ${BACKUP_PATH}`);
await c.end();
