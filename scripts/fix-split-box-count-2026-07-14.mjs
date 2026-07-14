// 🔴 FIX (owner 2026-07-14 · LJ20503022) — split-box rows lost their box count, and a
// MOMO phantom bill-header sits IN BILLING with ฿0 while the money lives on rows that are
// not billable yet → "จะเก็บตังยังไง".
//
// A) 10 split rows have fweight>0 but famount=0 → box_detail says qty=1 each → set famount=1.
//    (Display summed 0 boxes; billing/box counts wrong.)
// B) LJ20503022: the BARE row 52399 is a MOMO หัวบิลผี (0 kg · ฿0 · famount=2) that is
//    fstatus=5 (in billing) while its 2 real boxes (฿1,704 total) sit at fstatus=4 → billing
//    would collect ฿0. It is in NO invoice (verified) → delete the phantom, and advance the
//    2 priced boxes 4→5 so the money is collectable (restores the state the base was in).
//
//   dry:   node scripts/fix-split-box-count-2026-07-14.mjs
//   apply: node scripts/fix-split-box-count-2026-07-14.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();

// ── A) split rows with weight but famount=0 → famount = box_detail.quantity (default 1) ──
const a = (await c.query(`
  SELECT f.id, f.ftrackingchn, f.userid, f.fweight, f.ftotalprice, f.fstatus,
         coalesce((SELECT b.quantity FROM momo_box_detail b WHERE b.box_tracking = f.ftrackingchn), 1) AS qty
    FROM tb_forwarder f
   WHERE f.ftrackingchn ~ '-[0-9]' AND coalesce(f.famount,0)=0 AND coalesce(f.fweight,0)>0
     AND f.fstatus IN ('1','2','3','4','5') ORDER BY f.ftrackingchn`)).rows;

// ── B) phantom bill-header (0 kg · ฿0) that has real siblings — must not be the billable row ──
const b = (await c.query(`
  SELECT p.id, p.ftrackingchn, p.userid, p.famount, p.fstatus,
         (SELECT count(*) FROM tb_forwarder_invoice_item ii WHERE ii.forwarder_id = p.id) AS in_invoice,
         (SELECT string_agg(s.id::text||':'||s.fstatus||':฿'||round(coalesce(s.ftotalprice,0)), ' · ')
            FROM tb_forwarder s WHERE s.ftrackingchn ~ ('^'||p.ftrackingchn||'-[0-9]')) AS sibs,
         (SELECT coalesce(sum(s.ftotalprice),0) FROM tb_forwarder s WHERE s.ftrackingchn ~ ('^'||p.ftrackingchn||'-[0-9]')) AS sib_baht
    FROM tb_forwarder p
   WHERE p.ftrackingchn !~ '-[0-9]' AND coalesce(p.fweight,0)=0 AND coalesce(p.ftotalprice,0)=0
     AND (SELECT count(*) FROM tb_forwarder s WHERE s.ftrackingchn ~ ('^'||p.ftrackingchn||'-[0-9]'))>0`)).rows;

console.log(`\n════ split box-count / phantom-header fix · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);
console.log(`\nA) แถวย่อยมีน้ำหนักแต่ famount=0 → set famount (จาก box_detail): ${a.length} แถว`);
a.forEach(r => console.log(`   #${r.id} ${r.ftrackingchn} [${r.userid}] ${Number(r.fweight)}kg ฿${Number(r.ftotalprice).toFixed(0)} st=${r.fstatus} → famount 0→${r.qty}`));

console.log(`\nB) หัวบิลผี (0kg/฿0) ที่มีแถวย่อยจริง: ${b.length} ชิปเมนต์`);
const toDelete = [], toAdvance = [];
for (const p of b) {
  const inInv = Number(p.in_invoice) > 0;
  console.log(`   ${p.ftrackingchn} [${p.userid}] phantom #${p.id} (${p.famount}box · st=${p.fstatus}) ${inInv ? "⚠️ อยู่ในใบวางบิล → ไม่ลบ" : "· ไม่อยู่ในบิล → ลบได้"}`);
  console.log(`     แถวย่อยจริง: ${p.sibs}  (Σ ฿${Number(p.sib_baht).toFixed(2)})`);
  if (inInv) continue;
  toDelete.push(p.id);
  // if the phantom was already at billing (5) but its real boxes are behind (4) → advance them
  if (String(p.fstatus) === "5") {
    const sib = (await c.query(`SELECT id FROM tb_forwarder WHERE ftrackingchn ~ ('^'||$1||'-[0-9]') AND fstatus='4' AND coalesce(ftotalprice,0)>0`, [p.ftrackingchn])).rows;
    sib.forEach(s => toAdvance.push(s.id));
    if (sib.length) console.log(`     → ดันแถวย่อยที่มีราคา ${sib.map(s => "#" + s.id).join(",")} จาก fstatus 4 → 5 (ให้เก็บเงินได้)`);
  }
}

if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อแก้จริง\n`); await c.end(); process.exit(0); }

const backup = { at: "2026-07-14", famount_rows: a, phantoms: b, toDelete, toAdvance };
writeFileSync("scripts/fix-split-box-count-backup-2026-07-14.json", JSON.stringify(backup, null, 2));
console.log(`\nbackup: scripts/fix-split-box-count-backup-2026-07-14.json`);

await c.query("begin");
try {
  let n1 = 0;
  for (const r of a) {
    const { rowCount } = await c.query(`UPDATE tb_forwarder SET famount=$2 WHERE id=$1 AND coalesce(famount,0)=0`, [r.id, r.qty]);
    n1 += rowCount;
  }
  let n2 = 0;
  if (toDelete.length) {
    const { rowCount } = await c.query(`DELETE FROM tb_forwarder WHERE id = ANY($1::bigint[]) AND coalesce(fweight,0)=0 AND coalesce(ftotalprice,0)=0
      AND NOT EXISTS (SELECT 1 FROM tb_forwarder_invoice_item ii WHERE ii.forwarder_id = tb_forwarder.id)`, [toDelete]);
    n2 = rowCount;
  }
  let n3 = 0;
  if (toAdvance.length) {
    const { rowCount } = await c.query(`UPDATE tb_forwarder SET fstatus='5', fdatestatus5=now() WHERE id = ANY($1::bigint[]) AND fstatus='4' AND coalesce(ftotalprice,0)>0`, [toAdvance]);
    n3 = rowCount;
  }
  await c.query("commit");
  console.log(`\n✅ APPLIED · famount set ${n1} แถว · ลบหัวบิลผี ${n2} แถว · ดัน 4→5 ${n3} แถว`);
} catch (e) { await c.query("rollback"); console.error("❌ ROLLED BACK:", e.message); }
await c.end();
