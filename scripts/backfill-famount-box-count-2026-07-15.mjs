// 🟢 DISPLAY-FIX (owner 2026-07-15) — "จำนวนกล่องขึ้น 0" — billable tb_forwarder rows with
// famount=0 while they carry weight/price (MOMO box rows whose box-count never landed).
// famount is DISPLAY-ONLY (not in ANY bill formula · split-box-rows-plan.ts:76) → money-safe.
// Set famount = the box's quantity from momo_box_detail (match ftrackingchn = box_tracking),
// else 1 (a billable row is ≥ 1 box). Fixes "0 กล่อง" on forwarder detail + customer detail.
//
//   dry:   node scripts/backfill-famount-box-count-2026-07-15.mjs
//   apply: node scripts/backfill-famount-box-count-2026-07-15.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();

const rows = (await c.query(`
  SELECT f.id, f.ftrackingchn, f.fweight, f.ftotalprice,
         (SELECT b.quantity FROM momo_box_detail b WHERE b.box_tracking = f.ftrackingchn LIMIT 1) AS bd_qty
    FROM tb_forwarder f
   WHERE coalesce(f.famount,0)=0
     AND (coalesce(f.fweight,0)>0 OR coalesce(f.ftotalprice,0)>0)
     AND f.fstatus IN ('1','2','3','4','5','6')
   ORDER BY f.id`)).rows;

const plan = rows.map((r) => ({ id: r.id, tracking: r.ftrackingchn, from: 0, to: Math.max(1, Number(r.bd_qty || 0) || 1), src: r.bd_qty ? "box_detail" : "default-1" }));

console.log(`\n════ backfill famount (box count) · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);
console.log(`billable rows famount=0 → set: ${plan.length}`);
plan.slice(0, 30).forEach((p) => console.log(`  #${p.id} ${p.tracking} famount 0→${p.to} (${p.src})`));

if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อแก้จริง\n`); await c.end(); process.exit(0); }
writeFileSync("scripts/backfill-famount-backup-2026-07-15.json", JSON.stringify({ plan }, null, 2));
let n = 0;
for (const p of plan) {
  const { rowCount } = await c.query(`UPDATE tb_forwarder SET famount=$2 WHERE id=$1 AND coalesce(famount,0)=0`, [p.id, p.to]);
  n += rowCount;
}
console.log(`\n✅ APPLIED · set famount บน ${n} แถว → box count โชว์ถูกแล้ว`);
await c.end();
