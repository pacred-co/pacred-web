// ════════════════════════════════════════════════════════════════════════════
// FIX — หัวสรุป (basis=0) ถือเงินซ้ำกับกล่องย่อยที่ถือเงินอยู่แล้ว = คิดซ้ำ 2 เท่า
//
// Surfaced by reconcile-box-basis-from-momo-2026-07-17 (which proved it did NOT move any
// money — Σ ftotalprice identical before/after). Zeroing the header's basis made a
// PRE-EXISTING double-count visible:
//   519220849050  หัว ฿415.00 + กล่อง ฿415.00 = ฿830   ← หัวถือ "ยอดรวม" ซ้ำกับกล่อง
//   888073011722  หัว ฿ 88.45 + กล่อง ฿141.05 = ฿229.50
//   SF5117630215855 หัว ฿453.84 + กล่อง ฿490.88 = ฿944.72
//
// THE RULE: after the box basis is reconciled, a header row has NO basis (0 kg / 0 คิว) —
// it cannot justify a freight price. When its boxes already carry the freight, the header's
// ftotalprice is a leftover from when it WAS the aggregate → zero it. When the boxes carry
// ฿0 (519218029029), the header is the shipment's only money-bearing row → KEEP it.
//
// GUARDS: UNBILLED only (fstatus NOT IN 5,6,7,8 — nobody has been charged these yet) ·
// header must truly have basis 0 · its boxes must carry money > 0 · backup · txn ·
// per-shipment Σ printed before/after so the owner sees exactly what each customer owes.
//
// RUN:  node scripts/fix-header-money-dup-2026-07-17.mjs           (dry-run)
//       node scripts/fix-header-money-dup-2026-07-17.mjs --apply
// ════════════════════════════════════════════════════════════════════════════
import { writeFileSync } from "node:fs";
import pg from "pg";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host:"aws-1-ap-southeast-1.pooler.supabase.com", port:5432,
  user:"postgres.yzljakczhwrpbxflnmco", password:process.env.SUPABASE_DB_PASSWORD,
  database:"postgres", ssl:{rejectUnauthorized:false} });
await c.connect();

const { rows } = await c.query(`
  WITH r AS (SELECT id, ftrackingchn, regexp_replace(ftrackingchn,'-[0-9]+(/[0-9]+)?$','') base,
                    famount, fweight, fvolume, ftotalprice::numeric p, fstatus,
                    fcabinetnumber cab, userid pr, (ftrackingchn ~ '-[0-9]+(/[0-9]+)?$') is_box
               FROM tb_forwarder)
  SELECT base, min(cab) cab, min(pr) pr, string_agg(DISTINCT fstatus,'/') st,
         json_agg(json_build_object('id',id,'t',ftrackingchn,'p',p,'box',is_box)
                  ORDER BY id) rows_json,
         sum(p) FILTER (WHERE NOT is_box AND famount=0 AND COALESCE(fweight,0)=0 AND COALESCE(fvolume,0)=0) header_money,
         sum(p) FILTER (WHERE is_box) box_money, sum(p) total,
         bool_or(fstatus IN ('5','6','7','8')) billed
    FROM r GROUP BY base
   HAVING sum(p) FILTER (WHERE NOT is_box AND famount=0 AND COALESCE(fweight,0)=0 AND COALESCE(fvolume,0)=0) > 0
      AND sum(p) FILTER (WHERE is_box) > 0
   ORDER BY 8 DESC`);

const plans = [], skips = [];
for (const r of rows) {
  if (r.billed) { skips.push({ ...r, why: "วางบิล/จ่ายแล้ว — ต้อง owner/บัญชี ตัดสิน" }); continue; }
  const headers = r.rows_json.filter((x) => !x.box && Number(x.p) > 0);
  plans.push({ ...r, headerIds: headers.map((h) => h.id) });
}
console.log(`📋 หัวสรุปที่ถือเงินซ้ำ → ล้างเป็น ฿0 (กล่องย่อยถือเงินจริงอยู่แล้ว): ${plans.length}\n`);
for (const p of plans) {
  console.log(`  ${p.base.padEnd(18)} ${p.pr}  ${p.cab||'-'}`);
  console.log(`     ก่อน: ฿${p.total}  (หัว ฿${p.header_money} + กล่อง ฿${p.box_money})`);
  console.log(`     หลัง: ฿${p.box_money}  ← ลูกค้าจ่ายจริงเท่านี้  (ลดลง ฿${p.header_money})`);
}
if (skips.length) { console.log(`\n⏭️  ข้าม (วางบิลแล้ว · owner เคาะ): ${skips.length}`); skips.forEach(s=>console.log(`   ${s.base} — ฿${s.total} [st ${s.st}]`)); }
if (!APPLY) { console.log("\n(dry-run — ใส่ --apply)"); await c.end(); process.exit(0); }
if (plans.length === 0) { await c.end(); process.exit(0); }

const ids = plans.flatMap((p) => p.headerIds);
const { rows: bak } = await c.query(`SELECT * FROM tb_forwarder WHERE id = ANY($1)`, [ids]);
writeFileSync("scripts/_backup-header-money-dup-2026-07-17.json", JSON.stringify(bak, null, 2));
console.log(`\n💾 backup → scripts/_backup-header-money-dup-2026-07-17.json (${bak.length} แถว)`);
await c.query("BEGIN");
try {
  const res = await c.query(
    `UPDATE tb_forwarder SET ftotalprice = 0
      WHERE id = ANY($1) AND fstatus NOT IN ('5','6','7','8')
        AND COALESCE(famount,0)=0 AND COALESCE(fweight,0)=0 AND COALESCE(fvolume,0)=0`, [ids]);
  for (const p of plans) {
    const { rows: a } = await c.query(
      `SELECT COALESCE(SUM(ftotalprice),0) t FROM tb_forwarder
        WHERE regexp_replace(ftrackingchn,'-[0-9]+(/[0-9]+)?$','') = $1`, [p.base]);
    if (Math.abs(Number(a[0].t) - Number(p.box_money)) > 0.01)
      throw new Error(`INVARIANT FAIL ${p.base}: ได้ ฿${a[0].t} ต้องเป็น ฿${p.box_money}`);
  }
  await c.query("COMMIT");
  console.log(`\n✅ ล้าง ${res.rowCount} หัวสรุป · ทุกชิปเม้นเหลือยอดเดียว (= ที่กล่องถือ) ✓`);
} catch (e) { await c.query("ROLLBACK"); console.error("❌ ROLLBACK:", e.message); process.exit(1); }
await c.end();
