/**
 * fix-payatorigin-rows-2026-07-21.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * owner พี่ป๊อป 2026-07-21 (บ่าย · ปรับจากกฎเช้า): "5 รายการที่เก็บเงินเป็นต้นทาง —
 * Flash · J&T · ไปรษณีย์ไทย · เหมาๆ · Pacred express · ที่เหลือเก็บปลายทาง · ให้ล็อคไปเลย"
 *
 * กฎเช้า (เอกชนทั้งหมด = ปลายทาง) ทำให้แถว Flash/J&T/ไปรษณีย์ ถูกตั้งเป็น "ปลายทาง"
 * + ค่าส่งไทยถูกล้างเป็น 0. กฎบ่ายย้าย 3 เจ้านี้กลับเป็น "ต้นทาง" → แถวพวกนี้ต้อง
 * กลับไปเป็น '1' และค่าส่งไทยกลับมาเข้าบิล.
 *
 * ทำอะไร: แถว unbilled ที่ขนส่ง ∈ {2 Flash, 24 J&T, 11 ไปรษณีย์} แต่ paymethod='2'
 *   → paymethod='1' + คืนค่าส่งไทยจาก backup ที่เคยล้าง (ถ้ามี) ไม่งั้นปล่อย 0 ให้
 *     auto-fill/พนักงานเติม (ไม่กุตัวเลขเอง)
 * GUARD: fstatus 1-5 · ไม่แตะ paydeposit='1' · ไม่แตะแถวบนใบวางบิล live/ใบเสร็จ
 * dry-run เป็นค่าเริ่มต้น · backup ก่อน --apply
 */
import pg from "pg";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD || process.env.PGPW;
const ORIGIN_CODES = ["2", "24", "11"];

// ค่าส่งไทยที่ถูกล้างไปตอนรัน backfill กฎเช้า (ไฟล์ backup ของสคริปต์นั้น)
const restore = new Map();
for (const f of fs.readdirSync("scripts").filter((x) => x.startsWith("_backup-cod-thship-"))) {
  for (const r of JSON.parse(fs.readFileSync(`scripts/${f}`, "utf8"))) {
    restore.set(Number(r.id), Number(r.ftransportprice) || 0);
  }
}

const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(`
  select f.id, f.userid, f.ftrackingchn, f.fstatus, f.fshipby, f.paymethod, f.ftransportprice
  from tb_forwarder f
  where f.fshipby = any($1) and f.paymethod = '2'
    and f.fstatus in ('1','2','3','4','5') and coalesce(f.paydeposit,'') <> '1'
    and not exists (select 1 from tb_forwarder_invoice_item ii join tb_forwarder_invoice i on i.id=ii.invoice_id
          where ii.forwarder_id=f.id and i.status <> 'cancelled')
    and not exists (select 1 from tb_receipt_item ri where ri.fid=f.id)
  order by f.id`, [ORIGIN_CODES]);

console.log(`${APPLY ? "APPLY" : "DRY-RUN"} — แถว Flash/J&T/ไปรษณีย์ ที่ยังเป็น "ปลายทาง": ${rows.length}`);
let restored = 0;
for (const r of rows) {
  const back = restore.get(Number(r.id));
  if (back) restored += back;
  console.log(`  #${r.id} ${r.ftrackingchn} ${r.userid} ขนส่ง ${r.fshipby} · ค่าส่งไทยคืน ฿${back ?? 0}`);
}
console.log(`  ค่าส่งไทยที่จะคืนรวม ฿${restored.toFixed(2)} (ที่เหลือปล่อย 0 ให้ auto-fill/พนักงานเติม)`);

if (APPLY && rows.length > 0) {
  const stamp = Date.now();
  fs.writeFileSync(`scripts/_backup-payatorigin-${stamp}.json`, JSON.stringify(rows, null, 1), "utf8");
  await c.query("begin");
  try {
    let n = 0;
    for (const r of rows) {
      const price = restore.get(Number(r.id)) ?? (Number(r.ftransportprice) || 0);
      const res = await c.query(
        `update tb_forwarder set paymethod='1', ftransportprice=$2, adminidupdate='origin-fix'
         where id=$1 and paymethod='2' and fstatus in ('1','2','3','4','5')`, [r.id, price]);
      n += res.rowCount ?? 0;
    }
    await c.query("commit");
    console.log(`APPLIED — ${n} แถว → ต้นทาง`);
  } catch (e) { await c.query("rollback"); console.error("ROLLED BACK:", e.message); process.exitCode = 1; }
  const left = await c.query(`select count(*)::int n from tb_forwarder where fshipby = any($1) and paymethod='2' and fstatus in ('1','2','3','4','5')`, [ORIGIN_CODES]);
  console.log("เหลือค้าง (ควร 0):", left.rows[0].n);
}
await c.end();
