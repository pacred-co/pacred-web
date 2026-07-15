// 🔴 DATA-FIX (owner 2026-07-15) — PR002 upgraded to นิติบุคคล AFTER documents were
// issued, so every ใบวางบิล + ใบเสร็จ is frozen with the old บุคคลธรรมดา snapshot.
// Re-stamp the buyer identity (ชื่อบริษัท/เลขภาษี/ที่อยู่จดทะเบียน/ประเภท=นิติ) onto every
// non-cancelled forwarder invoice + linked receipt from tb_corporate — same fields the
// new adminSetBillingRunBuyerIdentity action writes.
//
// 💰 MONEY-SAFETY: identity is DISPLAY-only. total_thb (gross) / ramount / collected
//   wallet+payment records = UNTOUCHED. The invoice recomputes WHT live from is_juristic
//   (a PAID bill will then show a WHT 1% line — surfaced below · collected baht frozen);
//   the receipt PINS to its frozen totals so a settled receipt whose pre-WHT == net shows
//   WHT ฿0 and the SAME paid amount even after flipping to นิติ.
//
//   dry:   node scripts/fix-pr002-juristic-docs-2026-07-15.mjs
//   apply: node scripts/fix-pr002-juristic-docs-2026-07-15.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const USERID = "PR002";
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();

// 1. Resolve the customer's CURRENT registered identity.
const u = (await c.query(`SELECT "userCompany","userName","userLastName" FROM tb_users WHERE "userID"=$1`, [USERID])).rows[0];
const corp = (await c.query(`SELECT corporatename,corporatenumber,corporateaddress,corporatestatus FROM tb_corporate WHERE userid=$1`, [USERID])).rows[0];
const isJuristic = u?.userCompany === "1" || !!(corp?.corporatenumber || "").trim();
const name = (corp?.corporatename || `${u?.userName ?? ""} ${u?.userLastName ?? ""}`).trim();
const taxId = (corp?.corporatenumber || "").trim();
const address = (corp?.corporateaddress || "").trim();

console.log(`\n════ PR002 juristic doc re-stamp · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);
console.log(`ประเภท     : ${isJuristic ? "นิติบุคคล" : "บุคคลธรรมดา"} (userCompany=${u?.userCompany} · corp status=${corp?.corporatestatus})`);
console.log(`ชื่อบริษัท  : ${name}`);
console.log(`เลขภาษี    : ${taxId}`);
console.log(`ที่อยู่     : ${address}`);
if (!isJuristic || !/^\d{13}$/.test(taxId)) { console.error("\n❌ ยังไม่ใช่นิติที่สมบูรณ์ (userCompany≠1 หรือเลขภาษีไม่ครบ 13 หลัก) — หยุด."); await c.end(); process.exit(1); }

// 2. Invoices (all non-cancelled).
const invs = (await c.query(
  `SELECT id,doc_no,status,is_juristic,buyer_name,buyer_tax_id,buyer_address,total_thb
     FROM tb_forwarder_invoice WHERE userid=$1 AND status<>'cancelled' ORDER BY date_issued`, [USERID])).rows;
console.log(`\n── ใบวางบิล (${invs.length} ใบ · ข้ามที่ยกเลิก) ──`);
for (const iv of invs) {
  const total = Number(iv.total_thb);
  const wht = (total >= 1000) ? Math.round(total * 0.01 * 100) / 100 : 0;   // computeBillWht: juristic AND ≥1000 → 1%
  const whtNote = iv.status === "paid" && wht > 0
    ? `  ⚠️ paid → ใบวางบิลจะแสดง WHT 1% ฿${wht.toFixed(2)} (เก็บจริง ฿${total.toFixed(2)} ไม่เปลี่ยน)`
    : (wht > 0 ? `  (WHT 1% ฿${wht.toFixed(2)} เก็บตอนชำระ)` : "");
  console.log(`  ${iv.doc_no} [${iv.status}] juristic ${iv.is_juristic}→true · "${iv.buyer_name}"→"${name}"${whtNote}`);
}

// 3. Receipts linked to those invoices' forwarder rows (invoice_item.forwarder_id → receipt_item.fid → receipt.rid).
const invIds = invs.map(iv => iv.id);
let rids = [];
if (invIds.length) {
  const fids = (await c.query(`SELECT DISTINCT forwarder_id FROM tb_forwarder_invoice_item WHERE invoice_id = ANY($1::bigint[])`, [invIds])).rows.map(r => r.forwarder_id);
  if (fids.length) rids = (await c.query(`SELECT DISTINCT rid FROM tb_receipt_item WHERE fid = ANY($1::bigint[]) AND rid IS NOT NULL`, [fids])).rows.map(r => r.rid);
}
// also catch receipts directly by userid (auto-issued · FRG…) in case the item-join misses.
const directRcpts = (await c.query(`SELECT rid FROM tb_receipt WHERE userid=$1 AND rstatus<>'2'`, [USERID])).rows.map(r => r.rid);
rids = Array.from(new Set([...rids, ...directRcpts]));
const rcpts = rids.length ? (await c.query(
  `SELECT rid,rstatus,corporatetype,recompname,recompnumber,ramount,totalbeforewithholding
     FROM tb_receipt WHERE rid = ANY($1::text[]) AND rstatus<>'2'`, [rids])).rows : [];
console.log(`\n── ใบเสร็จ (${rcpts.length} ใบ) ──`);
for (const r of rcpts) {
  const before = Number(r.totalbeforewithholding), net = Number(r.ramount);
  const frozenWht = Math.max(0, before - net);
  console.log(`  ${r.rid} corporatetype ${r.corporatetype}→1 · "${r.recompname}"→"${name}" · WHT(frozen) ฿${frozenWht.toFixed(2)} · ยอด ฿${net.toFixed(2)} (ไม่เปลี่ยน)`);
}

if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อแก้จริง\n`); await c.end(); process.exit(0); }

writeFileSync(`scripts/fix-pr002-juristic-backup-2026-07-15.json`, JSON.stringify({ at: "2026-07-15", invoices: invs, receipts: rcpts, newIdentity: { name, taxId, address } }, null, 2));
console.log(`\nbackup: scripts/fix-pr002-juristic-backup-2026-07-15.json`);

await c.query("begin");
try {
  let ni = 0, nr = 0;
  for (const iv of invs) {
    const { rowCount } = await c.query(
      `UPDATE tb_forwarder_invoice SET is_juristic=true, buyer_name=$2, buyer_tax_id=$3, buyer_address=$4 WHERE id=$1 AND status<>'cancelled'`,
      [iv.id, name, taxId, address]);
    ni += rowCount;
  }
  for (const r of rcpts) {
    const { rowCount } = await c.query(
      `UPDATE tb_receipt SET corporatetype='1', recompname=$2, recompnumber=$3, recompaddress=$4 WHERE rid=$1 AND rstatus<>'2'`,
      [r.rid, name, taxId, address]);
    nr += rowCount;
  }
  await c.query("commit");
  console.log(`\n✅ APPLIED · ใบวางบิล ${ni} ใบ · ใบเสร็จ ${nr} ใบ → นิติบุคคล "${name}" (เลขภาษี ${taxId})`);
} catch (e) { await c.query("rollback"); console.error("❌ ROLLED BACK:", e.message); }
await c.end();
