/**
 * fix-garbage-momo-cost-2026-07-18.mjs — recompute garbage MOMO cost → CBM×rate.
 *
 * Owner 2026-07-18: "ราคายอดเงิน ต้นทุน ที่ติดลบ ต่างๆ fill ให้ครบ". report-cnt shows
 * several containers with NEGATIVE profit (กำไรติดลบ) caused by GARBAGE fcosttotalprice
 * — a weight×rate or ×famount leak (the task #23 −328M bug class residue). MOMO charges
 * Pacred purely by CONTAINER CBM (mig 0260: 2500/CBM sea · 4700/CBM road) REGARDLESS of
 * weight/density (verified: a 375 kg/CBM row still costs 2500/CBM). So the correct cost of
 * every row = round2(fvolume × rate). This recomputes ONLY the clearly-garbage rows
 * (cost/CBM > 2× the container rate) — normal rows are already at CBM×rate and untouched.
 *
 * SAFETY:
 *  • fcosttotalprice is INTERNAL cost (gated to accounting/ultra · NEVER on the customer
 *    invoice, which uses ftotalprice/sell) → money-NEUTRAL to customers.
 *  • EXCLUDES box-split children (ftrackingchn LIKE '%/%', e.g. '…-2/2') — those double-count
 *    against their aggregate base and need the box-detail-reconcile, not a per-row recompute.
 *  • Backup written before --apply. Dry-run by default (the printed plan is the gate).
 *
 * RUN: SUPABASE_DB_PASSWORD=… node scripts/fix-garbage-momo-cost-2026-07-18.mjs [--apply]
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }
const c = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(PW)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});
const round2 = (n) => Math.round(n * 100) / 100;

async function main() {
  await c.connect();

  // Garbage = cost/CBM more than 2× the container's per-CBM rate (no legit MOMO cost is).
  // Box-split children ('…/M') excluded — they belong to the box-basis reconcile.
  const { rows } = await c.query(`
    SELECT id, userid, fcabinetnumber cab, fstatus, ftrackingchn, ftransporttype tt,
           famount, fweight::numeric wt, fvolume::numeric vol,
           fcosttotalprice::numeric cur_cost, ftotalprice::numeric sell
    FROM tb_forwarder
    WHERE fstatus <> '99' AND fvolume::numeric > 0
      AND ftrackingchn NOT LIKE '%/%'                       -- exclude box-split children
      AND fcosttotalprice::numeric > 100
      AND fcosttotalprice::numeric > 2 * (CASE WHEN ftransporttype='1' THEN 4700 ELSE 2500 END) * fvolume::numeric
    ORDER BY fcosttotalprice::numeric DESC`);

  const plan = rows.map((r) => {
    const rate = r.tt === "1" ? 4700 : 2500;
    const newCost = round2(Number(r.vol) * rate);
    return { id: r.id, userid: r.userid, cab: r.cab, fstatus: r.fstatus, tt: r.tt,
             vol: Number(r.vol), cur_cost: Number(r.cur_cost), new_cost: newCost, sell: Number(r.sell) };
  });

  console.log(`\n━━ GARBAGE-COST RECOMPUTE PLAN (${plan.length} rows) ━━`);
  console.table(plan);
  const curSum = plan.reduce((s, p) => s + p.cur_cost, 0);
  const newSum = plan.reduce((s, p) => s + p.new_cost, 0);
  console.log(`Σ cost: ${round2(curSum)} → ${round2(newSum)}  (removes ฿${round2(curSum - newSum)} of garbage overstatement)`);

  if (!APPLY) { console.log("\n(dry-run — pass --apply to write · backup written first)"); await c.end(); return; }

  // Backup
  const stamp = "2026-07-18";
  writeFileSync(`/tmp/backup-garbage-cost-${stamp}.json`, JSON.stringify(rows, null, 2));
  console.log(`\n📦 backup → /tmp/backup-garbage-cost-${stamp}.json`);

  await c.query("BEGIN");
  let n = 0;
  for (const p of plan) {
    const res = await c.query(
      `UPDATE tb_forwarder SET fcosttotalprice = $1 WHERE id = $2 AND fcosttotalprice::numeric = $3`,
      [p.new_cost, p.id, p.cur_cost],
    );
    n += res.rowCount;
  }
  await c.query("COMMIT");
  console.log(`\n✅ applied — ${n}/${plan.length} rows updated`);
  await c.end();
}
main().catch((e) => { console.error(e); c.end?.(); process.exit(1); });
