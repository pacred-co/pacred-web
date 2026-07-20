/**
 * heal-live-fanout-2026-07-20.ts — heal the PR179 1783582423 "aggregate fanout"
 * (owner 2026-07-20 "ทำไมบัคเบิ้ลกระจุย · แก้ที่ต้นตอ · งานอื่นๆ ที่เป็นแบบนี้แก้ให้หมด").
 *
 * WHAT HAPPENED: fillLiveDataForParcels (MOMO Live pass 2 · pre-fix) aggregated the
 * Live metrics per BASE and filled EVERY sibling row of the split family with the
 * whole-shipment Σ (116 กล่อง · 2,007.28 kg · 15.8228 คิว) → the container Σ inflated
 * ~22× (P cost ฿880k · profit −฿868k on the report). The per-suffix truth survives in
 * momo_box_detail + momo_import_tracks.
 *
 * THE BRAIN: this script reuses the SAME pure plan the cron self-heal (pass 6) runs —
 * planBoxDetailReconcile, now extended with the PROPER-SPLIT shape — and applies its
 * detailFixes with the writer's exact guards (unbilled WHERE · famountcount latch).
 * Prod-wide scan (2026-07-20) confirmed this family is the ONLY fanout instance.
 *
 * Usage:
 *   DBPW=… tsx scripts/heal-live-fanout-2026-07-20.ts           (dry-run)
 *   DBPW=… tsx scripts/heal-live-fanout-2026-07-20.ts --apply
 */
import pg from "pg";
import fs from "node:fs";
import { planBoxDetailReconcile } from "../lib/integrations/momo-web/box-detail-reconcile-plan";

const APPLY = process.argv.includes("--apply");
const BASE = "1783582423";

async function main() {
  const c = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com",
    port: 5432,
    user: "postgres.yzljakczhwrpbxflnmco",
    password: process.env.DBPW,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows: group } = await c.query(
    `SELECT id, ftrackingchn, fstatus, famount, famountcount, fweight, fvolume, fwidth, flength, fheight,
            ftotalprice, frefrate, frefprice, userid
     FROM tb_forwarder WHERE ftrackingchn LIKE $1 ORDER BY id`,
    [`${BASE}%`],
  );
  const { rows: boxes } = await c.query(
    `SELECT box_tracking, width, length, height, weight_kg, cbm, quantity
     FROM momo_box_detail WHERE base_tracking = $1`,
    [BASE],
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

  console.log(`plan: ${plan.detailFixes.length} fixes · ${plan.bareZeroes.length} bare-zeroes · ${plan.reviews.length} reviews`);
  for (const f of plan.detailFixes) {
    const cur = group.find((g) => Number(g.id) === f.id);
    console.log(
      `  #${f.id} ${f.tracking}: (${cur?.famount}/${cur?.fweight}/${cur?.fvolume}) → (${f.truth.famount}/${f.truth.fweight}/${f.truth.fvolume})`,
    );
  }
  if (plan.bareZeroes.length > 0 || plan.reviews.length > 0) {
    console.error("REFUSE — expected pure detail-fixes only for this family");
    await c.end();
    process.exit(1);
  }
  if (plan.detailFixes.length === 0) {
    console.log("nothing to heal — family already converged.");
    await c.end();
    process.exit(0);
  }
  if (!APPLY) {
    console.log("\nDRY-RUN — re-run with --apply.");
    await c.end();
    process.exit(0);
  }

  fs.writeFileSync(`scripts/_backup-heal-fanout-${Date.now()}.json`, JSON.stringify({ group, boxes }, null, 2));

  let applied = 0;
  for (const f of plan.detailFixes) {
    // The writer's exact guards: unbilled-only WHERE (TOCTOU) + famountcount latch
    // (truth.fvolume = row TOTAL → consumers must not re-multiply by famount).
    const upd = await c.query(
      `UPDATE tb_forwarder
       SET famount = $1, fweight = $2, fvolume = $3, fwidth = $4, flength = $5, fheight = $6, famountcount = '1'
       WHERE id = $7 AND fstatus IN ('1','2','3','4') RETURNING id`,
      [f.truth.famount, f.truth.fweight, f.truth.fvolume, f.truth.fwidth, f.truth.flength, f.truth.fheight, f.id],
    );
    if (upd.rowCount === 1) applied += 1;
    else console.error(`  skip #${f.id} (raced into billing?)`);
  }
  console.log(`applied ${applied}/${plan.detailFixes.length}`);

  const v = await c.query(
    `SELECT COUNT(*)::int n, SUM(famount)::int qty, ROUND(SUM(fweight)::numeric,2) wt,
            ROUND(SUM(CASE WHEN famountcount='1' THEN fvolume ELSE fvolume*GREATEST(famount,1) END)::numeric,6) cbm
     FROM tb_forwarder WHERE ftrackingchn LIKE $1`,
    [`${BASE}%`],
  );
  console.log(`verify family Σ: ${JSON.stringify(v.rows[0])} (expect 23 rows · 116 กล่อง · ≈2007.28 kg · ≈15.8226 คิว)`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
