/**
 * backfill-cod-th-shipping-zero-2026-07-21.mjs
 * ═══════════════════════════════════════════════════════════════════════
 * owner 2026-07-21: "พอเลือกชำระปลายทาง ก็ต้องไม่ใส่ ค่าขนส่งไทย ค่าขนส่งไทย
 * ก็ควรเป็น 0 ด้วยนะครับ ถ้าเก็บปลายทาง"
 *
 * ล้าง ftransportprice ของแถวที่เก็บ "ปลายทาง" (paymethod='2') ให้เป็น 0.
 *
 * MONEY-NEUTRAL ต่อบิลลูกค้า — ทุกตัวคิดเงินตัดขาในไทยทิ้งอยู่แล้วเมื่อ COD
 * (`domesticLeg = paymethod === '2' ? 0 : ftransportprice` · outstanding.ts ·
 * forwarder-debit-total.ts · forwarder-collect-total.ts · auto-issue-receipt) →
 * ยอดที่ลูกค้าจ่ายไม่ขยับ. สิ่งที่หายคือ "ตัวเลขค้างบนแถว" ที่อ่านเหมือนเป็นยอดเก็บ
 * และจะกลายเป็นยอดจริงทันทีที่มีอะไรพลิกแถวกลับเป็นต้นทาง.
 * ฝั่งขนส่งเก็บปลายทางไม่กระทบ: CSV Flash คำนวณยอดเก็บสดจากเรทเดิม (flash-pickup.ts).
 *
 * GUARDS (fail-closed ทุกชั้น · เลียนแบบ residue-absorb):
 *   • เฉพาะ fstatus 1-5 (ยังไม่จ่าย) · ข้าม 6-8/99
 *   • ข้าม paydeposit='1' (วางบิลล่วงหน้าที่จ่ายแล้ว — เงินเก็บไปแล้ว)
 *   • ข้ามแถวที่อยู่บนใบวางบิล/ใบกำกับที่ยัง live (ไม่ cancelled)
 *   • ข้ามแถวที่มีใบเสร็จผูก
 *   • dry-run เป็นค่าเริ่มต้น + เขียน backup JSON ก่อน --apply
 *
 * RUN:  node --env-file=.env.local scripts/backfill-cod-th-shipping-zero-2026-07-21.mjs
 *       node --env-file=.env.local scripts/backfill-cod-th-shipping-zero-2026-07-21.mjs --apply
 */
import pg from "pg";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD || process.env.PGPW;
if (!PW) { console.error("missing SUPABASE_DB_PASSWORD / PGPW"); process.exit(1); }

const client = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: PW,
  database: "postgres", ssl: { rejectUnauthorized: false },
});

const SELECT = `
  select f.id, f.ftrackingchn, f.userid, f.fstatus, f.fshipby, f.paymethod,
         f.ftransportprice, f.paydeposit
  from tb_forwarder f
  where f.paymethod = '2'
    and coalesce(f.ftransportprice, 0) > 0
    and f.fstatus in ('1','2','3','4','5')
    and coalesce(f.paydeposit,'') <> '1'
    and not exists (
      select 1 from tb_forwarder_invoice_item ii
      join tb_forwarder_invoice i on i.id = ii.invoice_id
      where ii.forwarder_id = f.id and i.status <> 'cancelled')
    and not exists (
      select 1 from tb_receipt_item ri where ri.fid = f.id)
  order by f.id`;

async function main() {
  await client.connect();
  const { rows } = await client.query(SELECT);
  const sum = rows.reduce((a, r) => a + Number(r.ftransportprice || 0), 0);
  console.log(`${APPLY ? "APPLY" : "DRY-RUN"} — ${rows.length} แถว · ค่าส่งไทยรวมที่จะล้าง ฿${sum.toFixed(2)}`);
  for (const r of rows.slice(0, 20)) {
    console.log(`  #${r.id} ${r.ftrackingchn} ${r.userid} st${r.fstatus} ${r.fshipby} ฿${r.ftransportprice}`);
  }
  if (rows.length > 20) console.log(`  … อีก ${rows.length - 20} แถว`);

  // แถวที่ถูกกันไว้ (โชว์ให้เห็นว่ากันจริง)
  const skipped = await client.query(`
    select count(*) filter (where f.fstatus not in ('1','2','3','4','5'))::int billed,
           count(*) filter (where coalesce(f.paydeposit,'') = '1')::int advance_paid
    from tb_forwarder f
    where f.paymethod='2' and coalesce(f.ftransportprice,0) > 0`);
  console.log("กันไว้ไม่แตะ:", JSON.stringify(skipped.rows[0]));

  if (!APPLY || rows.length === 0) { await client.end(); return; }

  const stamp = Date.now();
  const backup = `scripts/_backup-cod-thship-${stamp}.json`;
  fs.writeFileSync(backup, JSON.stringify(rows, null, 1), "utf8");
  console.log("backup →", backup);

  await client.query("begin");
  try {
    const ids = rows.map((r) => Number(r.id));
    const res = await client.query(
      `update tb_forwarder set ftransportprice = 0, adminidupdate = 'cod-zero'
       where id = any($1) and paymethod = '2' and coalesce(ftransportprice,0) > 0`,
      [ids],
    );
    await client.query("commit");
    console.log(`APPLIED — ${res.rowCount} แถว → ค่าส่งไทย ฿0`);
  } catch (e) {
    await client.query("rollback");
    console.error("ROLLED BACK:", e.message);
    process.exitCode = 1;
  }
  const after = await client.query(SELECT);
  console.log("เหลือค้าง (ควร 0):", after.rows.length);
  await client.end();
}
main();
