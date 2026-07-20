/**
 * heal-live-fanout2-2026-07-20.ts — the SECOND Live-fanout family found by the
 * prod sweep (owner 2026-07-20 "งานอื่นๆที่เป็นแบบนี้ แก้ให้หมดให้จบเลย").
 *
 * PR208 base 1784190161 (ตู้ GZE260718-1 · 11 live rows · fstatus 3 · unbilled):
 *   - row 52852 (-4) carries the WHOLE-SHIPMENT Σ (15 กล่อง · 582 kg · 2.0000 คิว)
 *     instead of its own box (1 · 43.5 kg · 0.13455). Same root as PR179, but only
 *     ONE row was hit — fill-when-empty meant only the row that happened to be
 *     weightless received the aggregate.
 *   - this family has NO tb_forwarder bare row (momo_box_detail does have box #1),
 *     which is why the pre-fix self-heal refused it (aggregate_on_detail_no_bare).
 *   - 10 sibling rows show famount=0 → "0 ลัง" on every cargo screen. Repaired via
 *     the plan's money-neutral countFixes (famountcount='1' ⇒ famount multiplies
 *     nothing).
 *
 * Uses the SAME pure plan the cron self-heal runs, and the writer's exact guards.
 *
 * Usage:
 *   DBPW=… tsx scripts/heal-live-fanout2-2026-07-20.ts           (dry-run)
 *   DBPW=… tsx scripts/heal-live-fanout2-2026-07-20.ts --apply
 */
import pg from "pg";
import fs from "node:fs";
import { planBoxDetailReconcile } from "../lib/integrations/momo-web/box-detail-reconcile-plan";

const APPLY = process.argv.includes("--apply");
const BASE = process.env.BASE || "1784190161";

async function main() {
  const c = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
    user: "postgres.yzljakczhwrpbxflnmco", password: process.env.DBPW,
    database: "postgres", ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows: group } = await c.query(
    `SELECT id, ftrackingchn, fstatus, famount, famountcount, fweight, fvolume, fwidth, flength, fheight,
            ftotalprice, frefrate, frefprice FROM tb_forwarder WHERE ftrackingchn LIKE $1 ORDER BY id`,
    [`${BASE}%`],
  );
  const { rows: boxes } = await c.query(
    `SELECT box_tracking, width, length, height, weight_kg, cbm, quantity
     FROM momo_box_detail WHERE base_tracking = $1`, [BASE],
  );
  const plan = planBoxDetailReconcile(
    group.map((r) => ({
      id: Number(r.id), ftrackingchn: String(r.ftrackingchn), fstatus: String(r.fstatus),
      famount: Number(r.famount), famountcount: r.famountcount == null ? null : String(r.famountcount),
      fweight: Number(r.fweight), fvolume: Number(r.fvolume), fwidth: Number(r.fwidth),
      flength: Number(r.flength), fheight: Number(r.fheight), ftotalprice: Number(r.ftotalprice),
      frefrate: Number(r.frefrate), frefprice: r.frefprice == null ? null : String(r.frefprice),
    })),
    boxes.map((b) => ({
      boxTracking: String(b.box_tracking), width: Number(b.width), length: Number(b.length),
      height: Number(b.height), weightKg: Number(b.weight_kg), cbm: Number(b.cbm), quantity: Number(b.quantity),
    })),
  );

  console.log(`plan: ${plan.detailFixes.length} basis-fixes · ${plan.countFixes.length} count-fixes · ${plan.bareZeroes.length} bare-zeroes · ${plan.reviews.length} reviews`);
  for (const f of plan.detailFixes) {
    const cur = group.find((g) => Number(g.id) === f.id);
    console.log(`  BASIS #${f.id} ${f.tracking}: (${cur?.famount}/${cur?.fweight}/${cur?.fvolume}) → (${f.truth.famount}/${f.truth.fweight}/${f.truth.fvolume}) priced=${f.priced}`);
  }
  for (const cf of plan.countFixes) console.log(`  COUNT #${cf.id} ${cf.tracking}: famount → ${cf.famount}`);
  for (const r of plan.reviews) console.log(`  REVIEW ${r.kind} #${r.id} ${r.tracking}`);
  if (plan.bareZeroes.length > 0) { console.error("REFUSE — unexpected bare-zero for this family"); await c.end(); process.exit(1); }
  if (plan.detailFixes.length === 0 && plan.countFixes.length === 0) { console.log("nothing to heal."); await c.end(); process.exit(0); }
  if (!APPLY) { console.log("\nDRY-RUN — re-run with --apply."); await c.end(); process.exit(0); }

  fs.writeFileSync(`scripts/_backup-heal-fanout2-${Date.now()}.json`, JSON.stringify({ base: BASE, group, boxes }, null, 2));

  let basisApplied = 0, countApplied = 0;
  for (const f of plan.detailFixes) {
    if (f.priced) { console.error(`  SKIP priced #${f.id} — money decision, not for this script`); continue; }
    const u = await c.query(
      `UPDATE tb_forwarder SET famount=$1, fweight=$2, fvolume=$3, fwidth=$4, flength=$5, fheight=$6, famountcount='1'
       WHERE id=$7 AND fstatus IN ('1','2','3','4') RETURNING id`,
      [f.truth.famount, f.truth.fweight, f.truth.fvolume, f.truth.fwidth, f.truth.flength, f.truth.fheight, f.id],
    );
    if (u.rowCount === 1) basisApplied += 1;
  }
  for (const cf of plan.countFixes) {
    const u = await c.query(
      `UPDATE tb_forwarder SET famount=$1 WHERE id=$2 AND famountcount='1' AND fstatus IN ('1','2','3','4') RETURNING id`,
      [cf.famount, cf.id],
    );
    if (u.rowCount === 1) countApplied += 1;
  }
  console.log(`applied — basis ${basisApplied}/${plan.detailFixes.length} · count ${countApplied}/${plan.countFixes.length}`);

  const v = await c.query(
    `SELECT COUNT(*)::int rows, SUM(famount)::int boxes, ROUND(SUM(fweight)::numeric,2) wt,
            ROUND(SUM(CASE WHEN famountcount='1' THEN fvolume ELSE fvolume*GREATEST(famount,1) END)::numeric,6) cbm
     FROM tb_forwarder WHERE ftrackingchn LIKE $1`, [`${BASE}%`]);
  console.log(`verify: ${JSON.stringify(v.rows[0])}`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
