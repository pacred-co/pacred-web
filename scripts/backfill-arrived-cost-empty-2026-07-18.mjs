/**
 * backfill-arrived-cost-empty-2026-07-18.mjs — fill stored fcosttotalprice for ARRIVED
 * rows where it's still ฿0 (owner 2026-07-18 "ตู้ถึงไทยแล้ว fill ค่าต่างๆ ให้ครบ backfill").
 *
 * Scope: fstatus 4/5 (ถึงไทย/รอชำระ · NOT settled 6/7) · fvolume>0 · fcosttotalprice=0 ·
 * NOT on any non-cancelled bill. Cost = round2(fvolume × rate) where rate = the container
 * per-CBM cost (mig 0260: 2500 sea [ftransporttype='2'] / 4700 road ['1']) — the SAME
 * figure the report-cnt DETAIL page already computes LIVE (page.tsx liveCost). Backfilling
 * the STORED value just makes cockpit/reports/forwarder-detail (which read the stored col)
 * agree with the page instead of showing ฿0 (inflated 100% margin).
 *
 * SAFETY: fcosttotalprice is INTERNAL cost (gated · never on the customer invoice, which
 * uses ftotalprice/sell) → money-NEUTRAL to customers. Only fills ฿0 rows not on a bill.
 * Backup + dry-run first (the printed plan is the gate).
 *
 * RUN: SUPABASE_DB_PASSWORD=… node scripts/backfill-arrived-cost-empty-2026-07-18.mjs [--apply]
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
  const { rows } = await c.query(`
    SELECT f.id, f.userid, f.fcabinetnumber cab, f.fstatus, f.ftransporttype tt,
           f.fvolume::numeric vol, f.ftotalprice::numeric sell, f.fcosttotalprice::numeric cur_cost
    FROM tb_forwarder f
    WHERE f.fstatus IN ('4','5') AND f.fvolume::numeric > 0 AND f.fcosttotalprice::numeric = 0
      AND f.fcabinetnumber NOT IN ('','0') AND f.fcabinetnumber IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM tb_forwarder_invoice_item ii JOIN tb_forwarder_invoice iv ON iv.id=ii.invoice_id
        WHERE ii.forwarder_id = f.id AND iv.status <> 'cancelled')
    ORDER BY f.id`);

  const plan = rows.map((r) => {
    const rate = r.tt === "1" ? 4700 : 2500;
    return { id: r.id, userid: r.userid, cab: r.cab, fstatus: r.fstatus, tt: r.tt,
             vol: Number(r.vol), rate, new_cost: round2(Number(r.vol) * rate), sell: Number(r.sell) };
  });

  console.log(`\n━━ ARRIVED cost-empty BACKFILL PLAN (${plan.length} rows) ━━`);
  console.table(plan);
  console.log(`Σ cost filled: ฿${round2(plan.reduce((s, p) => s + p.new_cost, 0))} (internal · money-neutral to customers)`);

  if (!APPLY) { console.log("\n(dry-run — pass --apply · backup written first)"); await c.end(); return; }

  writeFileSync(`/tmp/backup-arrived-cost-empty-2026-07-18.json`, JSON.stringify(rows, null, 2));
  console.log(`\n📦 backup → /tmp/backup-arrived-cost-empty-2026-07-18.json`);
  await c.query("BEGIN");
  let n = 0;
  for (const p of plan) {
    const res = await c.query(
      `UPDATE tb_forwarder SET fcosttotalprice = $1 WHERE id = $2 AND fcosttotalprice::numeric = 0`,
      [p.new_cost, p.id],
    );
    n += res.rowCount;
  }
  await c.query("COMMIT");
  console.log(`\n✅ applied — ${n}/${plan.length} rows`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
