// Read-only · classify ภูม's 21 backfill candidates into SAFE-to-revalue-UP vs DO-NOT-TOUCH.
// Corroborate the momo aggregate against Σ(momo_box_detail) — a re-value is only safe when the
// aggregate is the REAL shipment total (box details sum to it), NOT a stale/empty MOMO number.
//   run: SUPABASE_DB_PASSWORD='DqOzfEZVXfMHIryz' node scripts/momo-boxsplit-backfill-classify-2026-07-13.mjs
import pg from "pg";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("SUPABASE_DB_PASSWORD not set"); process.exit(1); }
const USER = "postgres.yzljakczhwrpbxflnmco";
const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
async function connect() { for (const h of HOSTS) { try { const c = new pg.Client({ connectionString: `postgresql://${USER}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres`, ssl: { rejectUnauthorized: false } }); await c.connect(); return c; } catch {} } throw new Error("no host"); }
const c = await connect();

const q = await c.query(`
  SELECT f.id, f.ftrackingchn, f.userid, f.fweight, f.fvolume, f.famount, f.ftotalprice, f.fstatus,
         m.weight_kg AS agg_kg, m.cbm AS agg_cbm, m.quantity AS agg_qty,
         (SELECT count(*) FROM momo_box_detail b WHERE b.base_tracking = f.ftrackingchn) AS n_boxes,
         (SELECT coalesce(sum(b.weight_kg),0) FROM momo_box_detail b WHERE b.base_tracking = f.ftrackingchn) AS boxdet_kg
    FROM tb_forwarder f
    JOIN momo_import_tracks m ON m.momo_tracking_no = f.ftrackingchn
   WHERE f.fstatus IN ('1','2','3','4')
     AND (SELECT count(*) FROM momo_box_detail b WHERE b.base_tracking = f.ftrackingchn) > 1
     AND abs(coalesce(f.fweight,0) - coalesce(m.weight_kg,0)) > greatest(1, coalesce(m.weight_kg,0)*0.02)`);

const safe = [], danger = [];
for (const r of q.rows) {
  const cur = Number(r.fweight || 0), agg = Number(r.agg_kg || 0), boxd = Number(r.boxdet_kg || 0);
  // SAFE re-value UP: aggregate is materially larger than current (genuine box-1 under-bill),
  // aggregate > 0, AND box_detail corroborates the aggregate (Σ boxes ≈ agg, within 15%).
  const aggReal = agg > 0 && boxd > 0 && Math.abs(boxd - agg) <= Math.max(2, agg * 0.15);
  const materiallyUnder = agg > cur * 1.4 && (agg - cur) > 5;
  const row = { id: r.id, tracking: r.ftrackingchn, PR: r.userid, st: r.fstatus, boxes: r.n_boxes,
    cur_kg: cur, agg_kg: agg, boxdet_kg: Number(boxd.toFixed(1)), cur_bill: Number(r.ftotalprice || 0) };
  if (aggReal && materiallyUnder) safe.push(row); else danger.push({ ...row, why: agg === 0 ? "agg=0 (MOMO ว่าง→re-value จะ ZERO บิล)" : agg < cur ? "agg<cur (re-value จะ ลด บิล · อาจ staff แก้แล้ว)" : !aggReal ? "box_detail ไม่ตรง agg (aggregate อาจ stale)" : "under น้อย" });
}

console.log(`\n===== ✅ SAFE re-value UP (genuine box-1 under-bill · box_detail ยืนยัน agg · บิลจะขึ้น) =====`);
console.log(`${safe.length} แถว`);
console.table(safe);
const dUp = safe.reduce((a, r) => a + (r.agg_kg - r.cur_kg), 0);
console.log(`Σ under-counted = +${dUp.toFixed(1)} kg (จะเก็บเพิ่มได้หลัง re-price)`);

console.log(`\n===== 🔴 DO-NOT-TOUCH (ภูม's SQL จับมาด้วย แต่ re-value จะ ทำลาย/ลด บิล) =====`);
console.log(`${danger.length} แถว — ต้อง warehouse/owner ดูรายตัว (บาง row staff แก้แล้ว · บาง row MOMO agg ว่าง/stale)`);
console.table(danger);

await c.end();
console.log(`\n✅ READ-ONLY. สรุป: ภูม's blanket re-value ปลอดภัยแค่ ${safe.length}/${q.rows.length} แถว · อีก ${danger.length} จะเสียหาย.`);
