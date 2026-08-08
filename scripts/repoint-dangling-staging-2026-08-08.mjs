/**
 * repoint-dangling-staging-2026-08-08.mjs — ชี้ staging กลับไปที่แถวที่ยังอยู่จริง
 *
 * data-health `dangling_staging_ptr` แดง 54 ครั้ง (06-08/08) — staging 2 แถวชี้
 * tb_forwarder ที่ถูกลบไปแล้ว (53487/53488).
 *
 * เรื่องจริงจาก audit log:
 *   03/08  MOMO commit → สร้าง #53487/#53488 ด้วยเลขสั้น `KY295984064-N/2`
 *   05/08  โกดังยิงรับ → สร้าง #53344/#53345 ด้วย **เลขเต็ม** `KY295984064000250450-N/2`
 *   06/08  แอดมินลบ #53487/#53488 (ตัวซ้ำเลขสั้น) — **ถูกต้องแล้ว**
 * ⇒ ของไม่ได้หาย · ตัวชี้ค้างเฉยๆ → ชี้กลับไปที่แถวที่ยังอยู่ (เลขเต็ม)
 *
 * ทำไมต้องแก้: ตัวชี้ค้าง = cron ไม่ commit ซ้ำก็จริง แต่ถ้าใครล้าง committed_at
 * เมื่อไหร่ จะปั๊มแถวซ้ำทันที (เครื่องปั๊ม dup) + คิว incidents ไม่มีวันว่าง
 *
 * เขียนแค่ `committed_forwarder_id` — ไม่แตะเงิน/สถานะ/เลขแทรค
 * dry-run เป็นค่าเริ่มต้น · --apply ถึงเขียน · backup + txn
 */
import { writeFileSync } from "node:fs";
import pg from "pg";
const APPLY = process.argv.includes("--apply");
const PW = process.env.PGPW;
if (!PW) { console.error("ต้องส่ง PGPW"); process.exit(1); }
const c = new pg.Client({ host:"aws-1-ap-southeast-1.pooler.supabase.com", port:5432,
  user:"postgres.yzljakczhwrpbxflnmco", password:PW, database:"postgres", ssl:{rejectUnauthorized:false} });
await c.connect();
try {
  const { rows: dangling } = await c.query(`
    select id, momo_tracking_no, committed_forwarder_id from momo_import_tracks
     where committed_forwarder_id is not null
       and not exists (select 1 from tb_forwarder f where f.id = momo_import_tracks.committed_forwarder_id)`);
  const plan = [], orphan = [];
  for (const d of dangling) {
    const tk = String(d.momo_tracking_no ?? "").trim();
    const m = /^(.+?)(-\d+\/\d+)$/.exec(tk);           // แยก base กับ suffix กล่อง
    const base = m ? m[1] : tk, suffix = m ? m[2] : "";
    // หาแถวที่ยังอยู่: เลขที่ "ขึ้นต้นด้วย base" + suffix กล่องเดียวกัน (เลขเต็มยาวกว่า)
    const { rows: alive } = await c.query(
      `select id, ftrackingchn, userid, fstatus, ftotalprice from tb_forwarder
        where ftrackingchn like $1 || '%' and ($2 = '' or ftrackingchn like '%' || $2)
        order by id limit 2`, [base, suffix]);
    if (alive.length === 1) plan.push({ staging: d.id, tk, from: d.committed_forwarder_id, to: alive[0].id, alive: alive[0] });
    else orphan.push({ staging: d.id, tk, from: d.committed_forwarder_id, found: alive.length });
  }
  console.log(`\n━━ ชี้ staging กลับแถวที่ยังอยู่ ━━
  ตัวชี้ค้าง       : ${dangling.length}
  ✅ หาแถวเจอ 1:1 : ${plan.length}
  🟠 หาไม่เจอ/กำกวม : ${orphan.length} (ไม่แตะ — ต้องให้คนดู)`);
  console.table(plan.map(p => ({ staging: p.staging.slice(0,8), เลขในstaging: p.tk,
    "ชี้เดิม(ถูกลบ)": p.from, "→ ชี้ใหม่": p.to, เลขจริง: p.alive.ftrackingchn,
    ลูกค้า: p.alive.userid, สถานะ: p.alive.fstatus, ราคา: p.alive.ftotalprice })));
  if (orphan.length) console.table(orphan);
  if (!APPLY) { console.log("\n(dry-run — ใส่ --apply)"); process.exit(0); }
  const stamp = Date.now();
  writeFileSync(`scripts/_backup-dangling-${stamp}.json`, JSON.stringify({ dangling, plan, orphan }, null, 1));
  await c.query("begin");
  for (const p of plan) {
    const r = await c.query(`update momo_import_tracks set committed_forwarder_id=$2, updated_at=now()
      where id=$1 and committed_forwarder_id=$3`, [p.staging, p.to, p.from]);
    if (r.rowCount !== 1) throw new Error(`${p.tk}: เขียน ${r.rowCount} (คาด 1)`);
  }
  const { rows: after } = await c.query(`select count(*)::int n from momo_import_tracks
    where committed_forwarder_id is not null
      and not exists (select 1 from tb_forwarder f where f.id = momo_import_tracks.committed_forwarder_id)`);
  await c.query("commit");
  console.log(`\n✅ ชี้ใหม่ ${plan.length} แถว · ตัวชี้ค้างเหลือ ${after[0].n}`);
} catch (e) { try { await c.query("rollback"); } catch {} ; console.error("❌", e.message); process.exitCode = 1; }
finally { await c.end(); }
