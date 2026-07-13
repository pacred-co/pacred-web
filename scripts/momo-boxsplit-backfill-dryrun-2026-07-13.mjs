// Read-only dry-run for ภูม's handoff BUG-1 (MOMO box-split under-bill re-value) + BUG-2 (paymethod normalize).
// PROD probe · SELECT only · NO writes. Presents the Σ delta for owner sign-off.
//   run: SUPABASE_DB_PASSWORD='DqOzfEZVXfMHIryz' node scripts/momo-boxsplit-backfill-dryrun-2026-07-13.mjs
import pg from "pg";

const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("SUPABASE_DB_PASSWORD not set — aborting."); process.exit(1); }
const PROJECT_REF = "yzljakczhwrpbxflnmco"; // PROD
const USER = `postgres.${PROJECT_REF}`;
const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];

async function connect() {
  for (const h of HOSTS) {
    try {
      const c = new pg.Client({ connectionString: `postgresql://${USER}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres`, ssl: { rejectUnauthorized: false } });
      await c.connect();
      return c;
    } catch (e) { /* try next host */ }
  }
  throw new Error("could not connect to any pooler host");
}

const c = await connect();

// ── BUG-1: unbilled multi-box aggregate rows whose fweight ≉ momo aggregate (under-billed) ──
const bug1 = await c.query(`
  SELECT f.id, f.ftrackingchn, f.userid,
         f.fweight, f.fvolume, f.famount, f.ftotalprice, f.fstatus, f.frefrate,
         m.weight_kg AS agg_kg, m.cbm AS agg_cbm, m.quantity AS agg_qty,
         (SELECT count(*) FROM momo_box_detail b WHERE b.base_tracking = f.ftrackingchn) AS n_boxes
    FROM tb_forwarder f
    JOIN momo_import_tracks m ON m.momo_tracking_no = f.ftrackingchn
   WHERE f.fstatus IN ('1','2','3','4')
     AND (SELECT count(*) FROM momo_box_detail b WHERE b.base_tracking = f.ftrackingchn) > 1
     AND abs(coalesce(f.fweight,0) - coalesce(m.weight_kg,0)) > greatest(1, coalesce(m.weight_kg,0)*0.02)
   ORDER BY (coalesce(m.weight_kg,0) - coalesce(f.fweight,0)) DESC`);

console.log(`\n================ BUG-1: ตู้เก่า under-bill + ยังไม่แตกกล่อง (fstatus 1-4) ================`);
console.log(`พบ ${bug1.rows.length} แถว\n`);
let curKg = 0, aggKg = 0, curPrice = 0;
for (const r of bug1.rows) {
  curKg += Number(r.fweight || 0); aggKg += Number(r.agg_kg || 0); curPrice += Number(r.ftotalprice || 0);
}
console.table(bug1.rows.slice(0, 40).map(r => ({
  id: r.id, tracking: r.ftrackingchn, PR: r.userid, fstatus: r.fstatus, boxes: r.n_boxes,
  cur_kg: Number(r.fweight || 0), agg_kg: Number(r.agg_kg || 0),
  cur_cbm: Number(r.fvolume || 0), agg_cbm: Number(r.agg_cbm || 0),
  cur_qty: r.famount, agg_qty: r.agg_qty,
  cur_bill: Number(r.ftotalprice || 0), rate: Number(r.frefrate || 0),
})));
if (bug1.rows.length > 40) console.log(`  … +${bug1.rows.length - 40} more rows`);
console.log(`\nΣ current fweight   = ${curKg.toFixed(2)} kg`);
console.log(`Σ correct agg_kg    = ${aggKg.toFixed(2)} kg   (Δ = +${(aggKg - curKg).toFixed(2)} kg under-counted)`);
console.log(`Σ current ftotalprice = ฿${curPrice.toFixed(2)}   (บิลปัจจุบัน · จะสูงขึ้นหลัง re-value+re-price)`);
console.log(`⚠️  ต้อง re-price (computeAndFillForwarderImportRate) ต่อแถวถึงได้ Σ บิลใหม่ที่แม่นยำ — dry-run นี้โชว์ weight/cbm delta ก่อน owner เคาะ`);

// ── BUG-2: sibling rows whose paymethod ≠ '2' but a base-tracking sibling is COD ──
const bug2 = await c.query(`
  SELECT s.id, s.ftrackingchn, s.paymethod AS sib_pm, s.fstatus, b.ftrackingchn AS base_tracking
    FROM tb_forwarder s
    JOIN tb_forwarder b ON b.ftrackingchn = regexp_replace(s.ftrackingchn, '-[0-9]+(/[0-9]+)?$', '')
   WHERE b.paymethod = '2' AND coalesce(s.paymethod,'') <> '2'
     AND s.fstatus IN ('1','2','3','4','5')
   ORDER BY b.ftrackingchn`);
console.log(`\n================ BUG-2: paymethod normalize (sibling ≠ '2' แต่ base COD) ================`);
console.log(`พบ ${bug2.rows.length} แถว (data-hygiene · ไม่ขึ้นบิล · ฿0 ค่าส่งไทย COD ถูกอยู่แล้ว)`);
console.table(bug2.rows.slice(0, 30).map(r => ({ id: r.id, tracking: r.ftrackingchn, sib_pm: r.sib_pm || "(null)", base: r.base_tracking, fstatus: r.fstatus })));
if (bug2.rows.length > 30) console.log(`  … +${bug2.rows.length - 30} more`);

await c.end();
console.log(`\n✅ DRY-RUN read-only · ไม่แตะ prod. รอ owner เคาะ Σ delta ก่อน --apply.`);
