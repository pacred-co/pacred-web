/**
 * fix-shop-crate-total-2026-07-27.mjs — เก็บขาดค่าลังไม้บนฝากสั่งซื้อ (owner P22456)
 *
 * เงื่อนไขที่นับว่า "โดน": crate='1' + pricecrate>0 + hrate>0 + ยอดที่เก็บ (htotalpriceuser)
 * = สูตรเดิมไม่มีลัง (±0.02) และ ≠ สูตรใหม่มีลัง → เติมยอดเป็นสูตรมีลัง (SOT).
 *
 * ขอบเขตเขียน: **เฉพาะ hstatus='2' (ตั้งราคาแล้ว ยังไม่จ่าย)** — ลูกค้ายังไม่โอน แก้ทัน.
 * จ่ายแล้ว (>=3) = รายงานอย่างเดียว (เงิน frozen · เก็บเพิ่มต้องใช้ flow เก็บเพิ่ม · owner เคาะ).
 *
 * dry-run ก่อนเสมอ · --apply เขียนจริง (backup ก่อน) · re-run = 0.
 * RUN: SUPABASE_DB_PASSWORD='…' node scripts/fix-shop-crate-total-2026-07-27.mjs [--apply]
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }

const roundUp = (v, p = 2) => {
  if (!Number.isFinite(v)) return 0;
  const fig = 10 ** p;
  const scaled = v * fig;
  const eps = 1e-9 * Math.max(1, Math.abs(scaled));
  const r = Math.ceil(scaled - eps) / fig;
  return r === 0 ? 0 : r;
};

async function main() {
  const c = new pg.Client({
    connectionString: `postgresql://postgres.yzljakczhwrpbxflnmco:${encodeURIComponent(PW)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false }, statement_timeout: 60000,
  });
  await c.connect();

  const { rows } = await c.query(`
    SELECT id, hno, userid, hstatus, hrate, htotalpricechn, hshippingchn, hshippingservice,
           pricecrate, htotalpriceuser
      FROM tb_header_order
     WHERE crate = '1' AND coalesce(pricecrate,0) > 0 AND coalesce(hrate,0) > 0
     ORDER BY hno`);

  const n = (v) => Number(v ?? 0);
  const hits = [];
  for (const r of rows) {
    const noCrate = roundUp((n(r.htotalpricechn) + n(r.hshippingchn)) * n(r.hrate) + n(r.hshippingservice));
    const withCrate = roundUp((n(r.htotalpricechn) + n(r.hshippingchn) + n(r.pricecrate)) * n(r.hrate) + n(r.hshippingservice));
    const stored = n(r.htotalpriceuser);
    if (Math.abs(stored - noCrate) <= 0.02 && Math.abs(stored - withCrate) > 0.02) {
      hits.push({
        hno: r.hno, ลูกค้า: r.userid, สถานะ: r.hstatus,
        ยอดที่เก็บ: stored, ยอดที่ถูก: withCrate, ขาด: roundUp(withCrate - stored),
        เขียนได้: r.hstatus === "2" ? "✓ (ยังไม่จ่าย)" : "✗ จ่ายแล้ว/สถานะอื่น — รายงานเท่านั้น",
      });
    }
  }

  console.log(`ออเดอร์ตีลังทั้งหมด ${rows.length} · โดนเก็บขาดค่าลัง ${hits.length}`);
  console.table(hits);
  const fixable = hits.filter((h) => h.สถานะ === "2");
  console.log(`เขียนแก้ได้ (hstatus=2 ยังไม่จ่าย): ${fixable.length} · Σ ที่จะได้คืน = ฿${fixable.reduce((s, h) => s + h.ขาด, 0).toFixed(2)}`);

  if (!APPLY) { console.log("\n(dry-run — pass --apply)"); await c.end(); return; }
  if (fixable.length === 0) { console.log("ไม่มีแถวให้แก้"); await c.end(); return; }

  writeFileSync(`/tmp/backup-shop-crate-total-2026-07-27.json`,
    JSON.stringify(rows.filter((r) => fixable.some((h) => h.hno === r.hno)), null, 2));
  console.log(`📦 backup → /tmp/backup-shop-crate-total-2026-07-27.json`);

  await c.query("BEGIN");
  for (const h of fixable) {
    // TOCTOU: เขียนเฉพาะเมื่อยอด+สถานะยังเป็นตามที่เห็นตอน scan
    const res = await c.query(
      `UPDATE tb_header_order SET htotalpriceuser = $1, adminidupdate = 'sys-crate'
        WHERE hno = $2 AND hstatus = '2' AND abs(htotalpriceuser - $3) <= 0.02`,
      [h.ยอดที่ถูก, h.hno, h.ยอดที่เก็บ],
    );
    console.log(`${h.hno}: ${h.ยอดที่เก็บ} → ${h.ยอดที่ถูก} (${res.rowCount} แถว)`);
  }
  await c.query("COMMIT");
  console.log("✅ applied — รันซ้ำเพื่อยืนยัน 0");
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
