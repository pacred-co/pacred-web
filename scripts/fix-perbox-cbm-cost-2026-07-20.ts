/**
 * fix-perbox-cbm-cost-2026-07-20.ts — 3 rows store the PER-BOX คิว under the
 * famountcount='1' (row-total) flag → the container COST is understated ≈฿8,064
 * (owner 2026-07-20 "ตรวจข้อมูลให้ถูกต้องก่อน จากนั้น fill ไปเลยครับ").
 *
 * VERIFIED (2026-07-20 · box_detail dims corroborate per-piece on all 3):
 *   52154 (PR134 · GZS260628-1 · st5): fvolume 0.0405 = per-box · true 0.0405×40 = 1.6200
 *          cost 101.25 → 1.62×2500 = 4,050.00
 *   52422 (PR566 · GZE260709-1 · st6): 0.050630 per-box · true = staging total 0.658125
 *          cost 237.96 → 0.658125×4700 = 3,093.19
 *   52184 (PR9820 · GZE260701-1 · st6): 0.0536 per-box · true 0.0536×6 = 0.321600
 *          cost 251.92 → 0.3216×4700 = 1,511.52
 *
 * 💰 MONEY-SAFETY: SELL untouched — all 3 are weight-priced (sell = fweight ×
 * frefrate exactly: 660×28=18,480 · 195×17=3,315 · 72×17=1,224) so fvolume is NOT
 * in their sell formula; invoices stay frozen. COST is editable on billed rows per
 * the standing rule (cost-editable-sell-locked). The WHERE re-asserts the exact
 * current values (TOCTOU) and the script re-reads sell after to prove it unmoved.
 *
 * Usage:
 *   DBPW=… tsx scripts/fix-perbox-cbm-cost-2026-07-20.ts           (dry-run)
 *   DBPW=… tsx scripts/fix-perbox-cbm-cost-2026-07-20.ts --apply
 */
import pg from "pg";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");

const FIXES = [
  { id: 52154, expSell: 18480.0, expVol: 0.0405, newVol: 1.62, rate: 2500, newCost: 4050.0 },
  { id: 52422, expSell: 3315.0, expVol: 0.05063, newVol: 0.658125, rate: 4700, newCost: 3093.19 },
  { id: 52184, expSell: 1224.0, expVol: 0.0536, newVol: 0.3216, rate: 4700, newCost: 1511.52 },
];

async function main() {
  const c = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
    user: "postgres.yzljakczhwrpbxflnmco", password: process.env.DBPW,
    database: "postgres", ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows } = await c.query(
    `SELECT id, ftrackingchn, userid, fstatus, famount, famountcount, fweight, fvolume, ftotalprice, fcosttotalprice
     FROM tb_forwarder WHERE id = ANY($1::bigint[]) ORDER BY id`,
    [FIXES.map((f) => f.id)],
  );
  for (const r of rows) console.log("  " + JSON.stringify(r));

  let refuse = false;
  for (const f of FIXES) {
    const r = rows.find((x) => Number(x.id) === f.id);
    if (!r) { console.error(`REFUSE — #${f.id} not found`); refuse = true; continue; }
    if (Math.abs(Number(r.ftotalprice) - f.expSell) > 0.005 || Math.abs(Number(r.fvolume) - f.expVol) > 0.0001) {
      console.error(`REFUSE — #${f.id} state changed (sell ${r.ftotalprice} vol ${r.fvolume})`);
      refuse = true;
      continue;
    }
    console.log(`  PLAN #${f.id}: fvolume ${r.fvolume} → ${f.newVol} · cost ${r.fcosttotalprice} → ${f.newCost} (rate ${f.rate}) · sell ${r.ftotalprice} UNCHANGED`);
  }
  if (refuse) { await c.end(); process.exit(1); }
  if (!APPLY) { console.log("\nDRY-RUN — re-run with --apply."); await c.end(); process.exit(0); }

  fs.writeFileSync(`scripts/_backup-perbox-cost-${Date.now()}.json`, JSON.stringify(rows, null, 2));
  for (const f of FIXES) {
    const u = await c.query(
      `UPDATE tb_forwarder SET fvolume=$1, fcosttotalprice=$2
       WHERE id=$3 AND ftotalprice=$4 AND famountcount='1' RETURNING id, ftotalprice`,
      [f.newVol, f.newCost, f.id, f.expSell],
    );
    if (u.rowCount !== 1) { console.error(`  ✗ #${f.id} matched ${u.rowCount} — skipped`); continue; }
    console.log(`  ✓ #${f.id} applied · sell still ${u.rows[0].ftotalprice}`);
  }
  const { rows: after } = await c.query(
    `SELECT id, fvolume, fcosttotalprice, ftotalprice FROM tb_forwarder WHERE id = ANY($1::bigint[]) ORDER BY id`,
    [FIXES.map((f) => f.id)],
  );
  console.log("verify:", JSON.stringify(after));
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
