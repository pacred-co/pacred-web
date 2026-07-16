// Backfill — ใบวางบิล paid แต่ tb_forwarder ยังค้าง fstatus<6 (owner 2026-07-16
// "บางงานเก็บตังไปแล้ว ส่งไปแล้ว ก็ไล่ backfill ให้ครบ · รายการตู้จะได้ตรงเป็นปัจจุบัน").
// markBillingRunPaid syncs 5→6 going forward; these predate/missed it. Money-neutral:
// the money already moved (invoice.status='paid') — this only lets the status catch up.
// GUARDS: only fstatus='5' · invoice really paid · no open driver stop · backup + txn.
import { writeFileSync } from "node:fs";
import pg from "pg";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host:"aws-1-ap-southeast-1.pooler.supabase.com", port:5432,
  user:"postgres.yzljakczhwrpbxflnmco", password:process.env.SUPABASE_DB_PASSWORD,
  database:"postgres", ssl:{rejectUnauthorized:false} });
await c.connect();
const { rows } = await c.query(`
  SELECT DISTINCT f.id, f.ftrackingchn, f.fstatus, i.id inv, i.paid_at
    FROM tb_forwarder_invoice i
    JOIN tb_forwarder_invoice_item it ON it.invoice_id=i.id
    JOIN tb_forwarder f ON f.id=it.forwarder_id
   WHERE i.status='paid' AND f.fstatus='5'
     AND NOT EXISTS (SELECT 1 FROM tb_forwarder_tran_th_sub d WHERE d.fid=f.id)
   ORDER BY f.id`);
console.log(`พบ ${rows.length} แถว (บิลจ่ายแล้ว · สถานะค้าง 5 → ควรเป็น 6 เตรียมส่ง):`);
rows.forEach(r => console.log(`  #${r.id} ${r.ftrackingchn} · บิล ${r.inv} จ่าย ${String(r.paid_at).slice(0,10)}`));
if (!APPLY) { console.log("\n(dry-run — ใส่ --apply)"); await c.end(); process.exit(0); }
if (rows.length === 0) { await c.end(); process.exit(0); }
const { rows: bak } = await c.query(`SELECT * FROM tb_forwarder WHERE id=ANY($1)`, [rows.map(r=>+r.id)]);
writeFileSync("scripts/_backup-paid-fstatus-2026-07-16.json", JSON.stringify(bak,null,2));
console.log(`💾 backup → scripts/_backup-paid-fstatus-2026-07-16.json`);
await c.query("BEGIN");
try {
  const res = await c.query(
    `UPDATE tb_forwarder SET fstatus='6', fdatestatus6=COALESCE(fdatestatus6, now())
      WHERE id=ANY($1) AND fstatus='5'`, [rows.map(r=>+r.id)]);
  await c.query("COMMIT");
  console.log(`✅ อัพเดท ${res.rowCount} แถว → fstatus 6 (เตรียมส่ง)`);
} catch (e) { await c.query("ROLLBACK"); console.error("❌ ROLLBACK:", e.message); process.exit(1); }
await c.end();
