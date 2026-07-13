// APPLY (owner เคาะ 2026-07-13) — the 6 SAFE MOMO under-bill rows (box-1 valuation ·
// box_detail corroborates the aggregate) + normalize the 1 paymethod sibling.
//
// STAGE 1 (this script): re-value dims to the momo aggregate + ZERO the rate columns
//   (frefrate/frefprice/ftotalprice) so the PROVEN re-price script picks them up.
//   Also normalize the 1 COD sibling paymethod. Backup written before any write.
// STAGE 2 (run AFTER, separately): `node --env-file=.env.local scripts/backfill-momo-forwarder-rates.mjs --apply`
//   → re-prices exactly these 6 (prod currently has 0 other blank-rate MOMO rows · verified).
// STAGE 3 (box-split into scannable sub-rows): server-only lib → run via the admin
//   measure/commit path or a cron liveBoxSplit(allowPriced) pass — money-neutral, deferred.
//
//   dry:   SUPABASE_DB_PASSWORD='…' node scripts/momo-boxsplit-backfill-apply-2026-07-13.mjs
//   apply: SUPABASE_DB_PASSWORD='…' node scripts/momo-boxsplit-backfill-apply-2026-07-13.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("SUPABASE_DB_PASSWORD not set"); process.exit(1); }
const USER = "postgres.yzljakczhwrpbxflnmco";
const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
async function connect() { for (const h of HOSTS) { try { const c = new pg.Client({ connectionString: `postgresql://${USER}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres`, ssl: { rejectUnauthorized: false } }); await c.connect(); return c; } catch {} } throw new Error("no host"); }

// The 6 SAFE rows (owner-approved · classify script verdict · box_detail ≈ aggregate).
const SAFE_IDS = [52109, 52115, 52128, 52111, 52095, 52305];
// The 1 paymethod sibling to normalize (base COD · sibling kept '1').
const PAYMETHOD_SIBLING_ID = 52577;

const c = await connect();

// ── Load current state + the momo aggregate for the 6 ──
const cur = await c.query(`
  SELECT f.id, f.ftrackingchn, f.userid, f.fstatus, f.famountcount,
         f.fweight, f.fvolume, f.famount, f.frefrate, f.frefprice, f.ftotalprice,
         m.weight_kg AS agg_kg, m.cbm AS agg_cbm, m.quantity AS agg_qty
    FROM tb_forwarder f
    JOIN momo_import_tracks m ON m.momo_tracking_no = f.ftrackingchn
   WHERE f.id = ANY($1::int[])`, [SAFE_IDS]);

if (cur.rows.length !== SAFE_IDS.length) {
  console.error(`✗ expected ${SAFE_IDS.length} rows, got ${cur.rows.length} — aborting (data changed?)`);
  await c.end(); process.exit(1);
}

// Guard: none may be billed (fstatus 5/6/7) — re-value must never touch a billed row.
const billed = cur.rows.filter(r => ["5", "6", "7"].includes(String(r.fstatus)));
if (billed.length) { console.error("✗ some rows are BILLED (fstatus 5/6/7) — aborting:", billed.map(r => r.id)); await c.end(); process.exit(1); }

// Backup
const pmSib = await c.query(`SELECT id, ftrackingchn, paymethod, fstatus FROM tb_forwarder WHERE id=$1`, [PAYMETHOD_SIBLING_ID]);
const backup = { at: "2026-07-13", stage: "revalue+zero-rate", rows: cur.rows, paymethod_sibling: pmSib.rows };
const backupPath = `scripts/momo-boxsplit-backfill-backup-2026-07-13.json`;
writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log(`📦 backup → ${backupPath}\n`);

console.log(`===== STAGE 1: re-value dims + ZERO rate (${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"}) =====`);
console.table(cur.rows.map(r => ({
  id: r.id, tracking: r.ftrackingchn, PR: r.userid, st: r.fstatus, amtcount: r.famountcount,
  kg: `${Number(r.fweight)}→${Number(r.agg_kg)}`, cbm: `${Number(r.fvolume)}→${Number(r.agg_cbm)}`,
  qty: `${r.famount}→${Math.round(Number(r.agg_qty))}`, old_total: Number(r.ftotalprice || 0),
})));

if (APPLY) {
  for (const r of cur.rows) {
    await c.query(
      `UPDATE tb_forwarder
          SET fweight=$2, fvolume=$3, famount=$4, frefrate=0, frefprice='0', ftotalprice=0
        WHERE id=$1 AND fstatus NOT IN ('5','6','7')`,
      [r.id, Number(r.agg_kg), Number(r.agg_cbm), Math.round(Number(r.agg_qty))]
    );
  }
  // Normalize the COD sibling paymethod (data-hygiene · ฿0 COD stays ฿0 · never touch ftransportprice)
  const pm = await c.query(
    `UPDATE tb_forwarder SET paymethod='2' WHERE id=$1 AND coalesce(paymethod,'')<>'2' AND fstatus IN ('1','2','3','4','5')`,
    [PAYMETHOD_SIBLING_ID]);
  console.log(`\n✅ STAGE 1 applied: re-valued ${cur.rows.length} rows + zeroed rate · paymethod sibling normalized (${pm.rowCount} row).`);
  console.log(`➡️  NOW RUN STAGE 2:  node --env-file=.env.local scripts/backfill-momo-forwarder-rates.mjs --apply`);
} else {
  console.log(`\n🟡 DRY-RUN — no writes. Re-run with --apply.`);
  console.log(`   paymethod sibling ${PAYMETHOD_SIBLING_ID}: would set paymethod → '2' (COD hygiene).`);
}

await c.end();
