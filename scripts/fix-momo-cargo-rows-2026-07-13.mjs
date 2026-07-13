/**
 * ════════════════════════════════════════════════════════════════════════
 * BATCH FIX — MOMO cargo row mess (ภูม 2026-07-13) · ทำทีเดียวทั้ง platform
 * ════════════════════════════════════════════════════════════════════════
 * รันบน PROD (yzljakczhwrpbxflnmco). DRY-RUN by default. --apply เพื่อเขียน.
 *
 * ⚠️ สำคัญสุด: เดฟ deploy CODE ไปแล้วแต่ "แถวข้อมูลซ้ำ" ยังอยู่ใน DB —
 *    โค้ดลบข้อมูลเก่าที่ซ้ำไม่ได้. ต้องรัน script นี้ prod ถึงจะหาย.
 *
 * PHASE 1 · DEDUP ตู้หลอก (แก้ 1783051207-type · 39→20):
 *   ลบแถวที่อยู่ใต้ routing-placeholder (PR/MO/PCS…-SEA/EK/AIR) ที่มี exact
 *   ftrackingchn twin อยู่ใต้ตู้จริง · เก็บตู้จริง · ข้าม billed (5/6/7).
 *
 * PHASE 2 · BASE ก้อนรวมซ้ำแถวย่อย (แก้ 1782103385-type · 11→6 · MONEY-NEUTRAL):
 *   แถวหลัก (ไม่มี suffix · famount>1 = ก้อนรวม) + มีแถวย่อย -N อยู่ด้วย →
 *   นับ/น้ำหนัก/คิว ซ้ำ. แก้ให้แถวหลัก = "กล่อง 1" โดย ลบส่วนของแถวย่อยออก:
 *     base.famount -= Σ(sibling.famount) · base.fweight -= Σ(sibling.fweight)
 *     base.fvolume -= Σ(sibling.fvolume)  (Σ รวมคงเดิม = MONEY-NEUTRAL ทางกายภาพ)
 *   + zero ราคาแถวหลัก (ftotalprice/frefprice=0) → ให้ re-price ที่ /review หรือ
 *     cron คิดใหม่จากน้ำหนักกล่อง-1. ข้าม billed. ข้ามถ้า residual ติดลบ (flag แต้ม).
 *
 * SAFETY: DRY-RUN default · backup JSON ก่อน --apply · ไม่แตะ fstatus 5/6/7 ·
 *         owner ดู dry-run เคาะก่อน.
 *
 * RUN:
 *   dry:   PROD_DB_PW='<prod>' node scripts/fix-momo-cargo-rows-2026-07-13.mjs
 *   apply: PROD_DB_PW='<prod>' node scripts/fix-momo-cargo-rows-2026-07-13.mjs --apply
 * ════════════════════════════════════════════════════════════════════════
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const PW = process.env.PROD_DB_PW || process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("PROD_DB_PW not set"); process.exit(1); }
const c = new pg.Client({ host:"aws-1-ap-southeast-1.pooler.supabase.com", port:5432, user:"postgres.yzljakczhwrpbxflnmco", password:PW, database:"postgres", ssl:{rejectUnauthorized:false} });
const PH = `^(PR|MO|PCS)[0-9]{8}-(SEA|EK|AIR)[0-9]{2}$`;
const n = (x) => Number(x) || 0;

await c.connect();
console.log(`\n===== MOMO CARGO FIX · ${APPLY ? "APPLY (เขียนจริง!)" : "DRY-RUN (ไม่เขียน)"} =====`);

// ── PHASE 1 · dedup ตู้หลอก ──
const { rows: dup } = await c.query(`
  select r.id, r.ftrackingchn, r.userid, r.fcabinetnumber, r.ftotalprice, s.id keep_id, s.fcabinetnumber keep_cab
    from tb_forwarder r join tb_forwarder s
      on s.ftrackingchn=r.ftrackingchn and s.id<>r.id
     and (coalesce(s.fcabinetnumber,'')<>'' and s.fcabinetnumber !~ '${PH}')
   where r.fcabinetnumber ~ '${PH}' and r.fstatus in ('1','2','3','4')
   order by r.ftrackingchn, r.id`);
console.log(`\n── PHASE 1 · ลบตู้หลอกซ้ำ: ${dup.length} แถว ──`);
const byCust1 = {};
for (const r of dup) { byCust1[r.userid]=(byCust1[r.userid]||0)+1; }
console.log("  ตามลูกค้า:", JSON.stringify(byCust1));
dup.slice(0,6).forEach(r=>console.log(`  DEL ${r.id} ${r.ftrackingchn} [${r.fcabinetnumber}] → keep ${r.keep_id} [${r.keep_cab}]`));
if (dup.length>6) console.log(`  … อีก ${dup.length-6} แถว`);

// ── PHASE 2 · base ก้อนรวมซ้ำแถวย่อย ──
// bare base rows (ftrackingchn ไม่มี -N) ที่ famount>1 + มี suffix sibling
const { rows: bases } = await c.query(`
  select b.id, b.ftrackingchn, b.userid, b.famount, b.fweight, b.fvolume, b.fstatus,
         (select count(*) from tb_forwarder s where s.ftrackingchn ~ ('^'||b.ftrackingchn||'-[0-9]')) n_sib,
         (select coalesce(sum(coalesce(s.famount,0)),0) from tb_forwarder s where s.ftrackingchn ~ ('^'||b.ftrackingchn||'-[0-9]')) sib_famount,
         (select coalesce(sum(coalesce(s.fweight,0)),0) from tb_forwarder s where s.ftrackingchn ~ ('^'||b.ftrackingchn||'-[0-9]')) sib_weight,
         (select coalesce(sum(coalesce(s.fvolume,0)),0) from tb_forwarder s where s.ftrackingchn ~ ('^'||b.ftrackingchn||'-[0-9]')) sib_vol
    from tb_forwarder b
   where b.ftrackingchn !~ '-[0-9]' and coalesce(b.famount,0) > 1 and b.fstatus in ('1','2','3','4')`);
const fixable = [], flagged = [];
for (const b of bases) {
  if (n(b.n_sib) === 0) continue;              // ไม่มีแถวย่อย = ก้อนรวมปกติ ไม่แตะ
  const resAmt = n(b.famount) - n(b.sib_famount);
  const resW   = n(b.fweight) - n(b.sib_weight);
  const resV   = n(b.fvolume) - n(b.sib_vol);
  if (resAmt >= 1 && resW >= -0.001 && resV >= -0.001) {
    fixable.push({ ...b, resAmt, resW: Math.max(0,resW), resV: Math.max(0,resV) });
  } else {
    flagged.push({ ...b, resAmt, resW, resV }); // แถวย่อยเกินก้อนรวม = ข้อมูลไม่ตรง ต้องแต้ม
  }
}
console.log(`\n── PHASE 2 · แถวหลักซ้ำแถวย่อย: แก้ได้ money-neutral ${fixable.length} · ⚠️ ต้องแต้ม ${flagged.length} ──`);
fixable.slice(0,6).forEach(b=>console.log(`  FIX ${b.id} ${b.ftrackingchn}: กล่อง ${b.famount}→${b.resAmt} · kg ${n(b.fweight)}→${b.resW.toFixed(2)} · คิว ${n(b.fvolume)}→${b.resV.toFixed(4)} (+${b.n_sib} แถวย่อย · Σ คงเดิม)`));
flagged.forEach(b=>console.log(`  ⚠️ FLAG ${b.id} ${b.ftrackingchn}: แถวย่อยเกินก้อนรวม (kg sib ${n(b.sib_weight)} > base ${n(b.fweight)}) → เช็คแต้ม`));

if (!APPLY) { console.log(`\n(DRY-RUN) ตรวจ list + owner เคาะ แล้วรัน --apply\n`); await c.end(); process.exit(0); }

// ── APPLY ──
const backup = { phase1_delete: [], phase2_before: [] };
if (dup.length) { const { rows } = await c.query(`select * from tb_forwarder where id = any($1::bigint[])`, [dup.map(r=>r.id)]); backup.phase1_delete = rows; }
if (fixable.length) { const { rows } = await c.query(`select * from tb_forwarder where id = any($1::bigint[])`, [fixable.map(b=>b.id)]); backup.phase2_before = rows; }
const bf = `scripts/_backup-momo-fix-${Date.now()}.json`;
writeFileSync(bf, JSON.stringify(backup, null, 2));
console.log(`\nbackup: ${bf}`);

if (dup.length) {
  const { rowCount } = await c.query(`delete from tb_forwarder where id = any($1::bigint[]) and fstatus in ('1','2','3','4')`, [dup.map(r=>r.id)]);
  console.log(`PHASE 1: ลบ ${rowCount} แถว`);
}
let fixed = 0;
for (const b of fixable) {
  const { rowCount } = await c.query(
    `update tb_forwarder set famount=$2, fweight=$3, fvolume=$4, ftotalprice=0, frefprice=0
       where id=$1 and fstatus in ('1','2','3','4')`,
    [b.id, b.resAmt, b.resW, b.resV]);
  fixed += rowCount;
}
console.log(`PHASE 2: แก้แถวหลัก ${fixed} แถว (zero ราคา → re-price ที่ /review). ⚠️ ${flagged.length} flagged ต้องแต้ม.`);
console.log(`\n✅ เสร็จ. ไป re-price แถว PHASE 2 ที่ /review (ราคาเป็น 0 รอคิดใหม่).`);
await c.end();
