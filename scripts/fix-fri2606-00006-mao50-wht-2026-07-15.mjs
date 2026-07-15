// 🔴 MONEY RECONCILE (owner 2026-07-15 · "รันเลย ผมเช็คสลิปเอง") — FRI2606-00006 / PR7429
// (บริษัท แรพพิด มอเตอร์ส จำกัด · นิติ). The customer self-paid เหมาๆ ฿50 (legacy split, pre-fix)
// but the invoice recorded ฿100 in delivery_th_thb (mao_fee_thb=0) → total 2157 · receipt net
// 2135.43. What the customer ACTUALLY transferred (wallet_hs 105491) = ฿2,085.93.
//
// This is the standing "FRI2606-00006 ฿21.57 WHT re-issue" flag. Reconcile DOWN to the ฿50 the
// customer paid — NOT a re-charge, NOT a guess: the target IS the collected amount.
//   invoice : delivery_th_thb 100→50 · total_thb 2157→2107 (gross = 2057 + 50).
//             is_juristic=true (unchanged) → computeBillWht(2107) → WHT 21.07 · net 2085.93 ✓
//   receipt FRC2606-00002 : mao_fee_thb 100→50 · totalbeforewithholding 2157→2107 ·
//             ramount 2135.43→2085.93 (= 2107 × 0.99).
// Bill == receipt == wallet ฿2,085.93. NEVER chases the ฿50 gap (owner "อย่าไล่เก็บเพิ่ม").
//
//   dry:   node scripts/fix-fri2606-00006-mao50-wht-2026-07-15.mjs
//   apply: node scripts/fix-fri2606-00006-mao50-wht-2026-07-15.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

const inv = (await c.query(`SELECT id,doc_no,userid,is_juristic,subtotal_thb,delivery_th_thb,mao_fee_thb,total_thb,status FROM tb_forwarder_invoice WHERE doc_no='FRI2606-00006'`)).rows[0];
const paid = Number((await c.query(`SELECT amount FROM tb_wallet_hs WHERE id=105491`)).rows[0]?.amount);
const rids = (await c.query(`SELECT DISTINCT ri.rid FROM tb_receipt_item ri WHERE ri.fid IN (SELECT forwarder_id FROM tb_forwarder_invoice_item WHERE invoice_id=$1) AND ri.rid IS NOT NULL`, [inv.id])).rows.map(r => r.rid);
const rcpts = rids.length ? (await c.query(`SELECT rid,corporatetype,recompnumber,ramount,totalbeforewithholding,mao_fee_thb,rstatus FROM tb_receipt WHERE rid=ANY($1) AND rstatus<>'2'`, [rids])).rows : [];

// targets (gross-with-mao-50 → net via juristic 1%)
const newDeliveryTh = 50;
const newTotalGross = round2(Number(inv.subtotal_thb) + newDeliveryTh);          // 2107
const whtRate = inv.is_juristic && newTotalGross >= 1000 ? 0.01 : 0;
const newNet = round2(newTotalGross * (1 - whtRate));                            // 2085.93

console.log(`\n════ FRI2606-00006 · เหมาๆ ฿100→฿50 + WHT reconcile · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);
console.log(`ลูกค้า                : ${inv.userid} (นิติ=${inv.is_juristic})`);
console.log(`ลูกค้าจ่ายจริง (wallet) : ฿${paid.toFixed(2)}`);
console.log(`\nInvoice:`);
console.log(`  subtotal            ฿${Number(inv.subtotal_thb).toFixed(2)} (คงเดิม)`);
console.log(`  delivery_th (เหมาๆ)  ฿${Number(inv.delivery_th_thb).toFixed(2)} → ฿${newDeliveryTh.toFixed(2)}`);
console.log(`  total_thb (gross)   ฿${Number(inv.total_thb).toFixed(2)} → ฿${newTotalGross.toFixed(2)}`);
console.log(`  แสดง WHT 1%          ฿${round2(newTotalGross*whtRate).toFixed(2)} → net ฿${newNet.toFixed(2)} ${Math.abs(newNet-paid)<0.01?"✓ = ที่ลูกค้าจ่าย":"⚠️ ≠ paid"}`);
for (const r of rcpts) {
  const rGross = round2(Number(r.totalbeforewithholding) - 50);
  const rNet = round2(rGross * (1 - whtRate));
  console.log(`\nReceipt ${r.rid}:`);
  console.log(`  mao_fee              ฿${Number(r.mao_fee_thb).toFixed(2)} → ฿50.00`);
  console.log(`  totalbeforewithhold  ฿${Number(r.totalbeforewithholding).toFixed(2)} → ฿${rGross.toFixed(2)}`);
  console.log(`  ramount (net)        ฿${Number(r.ramount).toFixed(2)} → ฿${rNet.toFixed(2)} ${Math.abs(rNet-paid)<0.01?"✓":"⚠️"}`);
}

if (Math.abs(newNet - paid) > 0.01) { console.error(`\n❌ net ≠ ที่ลูกค้าจ่าย — หยุด (ตรวจตัวเลขก่อน)`); await c.end(); process.exit(1); }
if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อแก้จริง\n`); await c.end(); process.exit(0); }

writeFileSync(`scripts/fix-fri2606-00006-backup-2026-07-15.json`, JSON.stringify({ invoice: inv, receipts: rcpts, paid, target: { newDeliveryTh, newTotalGross, newNet } }, null, 2));
await c.query("begin");
try {
  const iRes = await c.query(
    `UPDATE tb_forwarder_invoice SET delivery_th_thb=$1, total_thb=$2 WHERE id=$3 AND status='paid' AND delivery_th_thb=100`,
    [newDeliveryTh, newTotalGross, inv.id]);
  let nr = 0;
  for (const r of rcpts) {
    const rGross = round2(Number(r.totalbeforewithholding) - 50);
    const rNet = round2(rGross * (1 - whtRate));
    const rRes = await c.query(
      `UPDATE tb_receipt SET mao_fee_thb=50, totalbeforewithholding=$1, ramount=$2 WHERE rid=$3 AND rstatus<>'2' AND mao_fee_thb=100`,
      [rGross, rNet, r.rid]);
    nr += rRes.rowCount;
  }
  await c.query("commit");
  console.log(`\n✅ APPLIED · invoice ${iRes.rowCount} · receipt ${nr} → ทุกใบ = ฿${newNet.toFixed(2)} (= ที่ลูกค้าจ่าย)`);
} catch (e) { await c.query("rollback"); console.error("❌ ROLLED BACK:", e.message); }
await c.end();
