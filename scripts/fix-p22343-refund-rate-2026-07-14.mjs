// 🔴 MONEY FIX (owner 2026-07-14) — P22343 / PR075: the 12 item-refunds (2026-07-10 02:50,
// BEFORE the ¥×hrate fix 45842dee @18:02) credited the YUAN amount as THB 1:1.
//   ของที่ลบ = ¥29,940  ·  คืนไป ฿29,940 (¥ 1:1)  ·  ที่ถูก = ¥29,940 × hrate 5.10 = ฿152,694
//   → ลูกค้าถูกคืนขาด ฿122,754 (ต้อง top-up · ลูกค้าจะเอาไปใช้ฝากสั่ง + ตัดค่าใบขน)
// ALSO: the header was never recomputed → htotalpricechn ยังค้าง ¥37,160 (ของจริงเหลือ ¥7,220).
//   canonical (service-orders-refund.ts): htotalpricechn = Σ roundUp(cprice×camount) live lines
//                                          htotalpriceuser = roundUp((sumChn + shipChn) × hrate + svc)
//
//   dry:   node scripts/fix-p22343-refund-rate-2026-07-14.mjs
//   apply: node scripts/fix-p22343-refund-rate-2026-07-14.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
const roundUp2 = (v) => Math.ceil((v + Number.EPSILON) * 100) / 100;

const h = (await c.query(`SELECT hno,hrate,htotalpricechn,hshippingchn,hshippingservice,htotalpriceuser FROM tb_header_order WHERE hno='P22343'`)).rows[0];
const items = (await c.query(`SELECT id,cprice,camount,crewallet FROM tb_order WHERE hno='P22343'`)).rows;
const live = items.filter(r => String(r.crewallet ?? "") !== "1");
const hrate = Number(h.hrate);
// canonical recompute
let sumChn = 0;
for (const ln of live) { const amt = Number(ln.camount ?? 0), prc = Number(ln.cprice ?? 0); if (amt > 0) sumChn = roundUp2(sumChn + roundUp2(prc * amt)); }
const shipChn = Number(h.hshippingchn ?? 0), svc = Number(h.hshippingservice ?? 0);
const newTotalUser = roundUp2((sumChn + shipChn) * hrate + svc);

const refs = (await c.query(`SELECT id,amount FROM tb_wallet_hs WHERE reforder='P22343' AND type='5'`)).rows;
const refundedThb = refs.reduce((a, r) => a + Number(r.amount || 0), 0);   // ฿29,940 (= the ¥ amount, 1:1 bug)
const removedYuan = Number(h.htotalpricechn) - sumChn;                      // ¥29,940
const correctThb = roundUp2(removedYuan * hrate);                           // ฿152,694
const shortfall = roundUp2(correctThb - refundedThb);                       // ฿122,754
const wal = (await c.query(`SELECT wallettotal FROM tb_wallet WHERE userid='PR075'`)).rows[0];
const curWallet = Number(wal.wallettotal);

console.log(`\n════ P22343 / PR075 · refund-rate fix · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);
console.log(`hrate (เรทที่ลูกค้าจ่าย)      = ${hrate}`);
console.log(`header ¥ ปัจจุบัน (stale)     = ¥${Number(h.htotalpricechn).toFixed(2)}   → ควรเป็น ¥${sumChn.toFixed(2)} (Σ ${live.length} รายการที่เหลือ)`);
console.log(`header ฿ ปัจจุบัน (stale)     = ฿${Number(h.htotalpriceuser).toFixed(2)}  → ควรเป็น ฿${newTotalUser.toFixed(2)}`);
console.log(`\nของที่ลบ                      = ¥${removedYuan.toFixed(2)}`);
console.log(`คืนไปแล้ว (¥-as-THB 1:1 · bug) = ฿${refundedThb.toFixed(2)}   (${refs.length} รายการ)`);
console.log(`ที่ถูก (¥ × ${hrate})            = ฿${correctThb.toFixed(2)}`);
console.log(`🔴 ต้อง top-up                 = ฿${shortfall.toFixed(2)}`);
console.log(`\nwallet ปัจจุบัน ฿${curWallet.toFixed(2)} → หลัง fix ฿${(curWallet + shortfall).toFixed(2)}`);

if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อแก้จริง\n`); await c.end(); process.exit(0); }
if (shortfall <= 0) { console.log("shortfall ≤ 0 — ไม่ต้องแก้"); await c.end(); process.exit(0); }

writeFileSync("scripts/fix-p22343-backup-2026-07-14.json", JSON.stringify({ header: h, wallet: wal, refunds: refs, computed: { sumChn, newTotalUser, removedYuan, correctThb, shortfall } }, null, 2));
console.log("backup: scripts/fix-p22343-backup-2026-07-14.json");

await c.query("begin");
try {
  // 1. header recompute (canonical)
  await c.query(`UPDATE tb_header_order SET htotalpricechn=$1, htotalpriceuser=$2, adminidupdate='admin_web' WHERE hno='P22343'`, [sumChn, newTotalUser]);
  // 2. wallet top-up — audit row (type=5 refund · mirrors the existing refund rows' shape)
  const note = `ปรับเพิ่มคืนเงิน — คืนเดิมใช้ ¥ เป็นบาท 1:1 (บั๊ก) ต้องคืนตามเรทที่ลูกค้าจ่าย ${hrate} · ของที่ลบ ¥${removedYuan.toFixed(2)} × ${hrate} = ฿${correctThb.toFixed(2)} · คืนไปแล้ว ฿${refundedThb.toFixed(2)} · ส่วนต่าง ฿${shortfall.toFixed(2)}`;
  await c.query(
    `INSERT INTO tb_wallet_hs (date,amount,status,type,typenew,typeservice,paydeposit,note,adminid,adminidupdate,lockdate,session,reforder,wusercredit,userid,adminidcrate,whno,imagesslip,depositnamebank,nameuserbank,nouserbank)
     VALUES (now(),$1,'2','5','2','1','0',$2,'admin_web','admin_web',now(),'admin-refund-rate-fix','P22343','0','PR075','admin_web','','','','','')`,
    [shortfall, note]);
  await c.query(`UPDATE tb_wallet SET wallettotal = wallettotal + $1 WHERE userid='PR075'`, [shortfall]);
  await c.query("commit");
  const after = (await c.query(`SELECT wallettotal FROM tb_wallet WHERE userid='PR075'`)).rows[0];
  const hAfter = (await c.query(`SELECT htotalpricechn,htotalpriceuser FROM tb_header_order WHERE hno='P22343'`)).rows[0];
  console.log(`\n✅ APPLIED`);
  console.log(`  header  → ¥${Number(hAfter.htotalpricechn).toFixed(2)} · ฿${Number(hAfter.htotalpriceuser).toFixed(2)}`);
  console.log(`  wallet  → ฿${Number(after.wallettotal).toFixed(2)}  (คืนรวม ฿${correctThb.toFixed(2)} = ¥${removedYuan.toFixed(2)} × ${hrate}) ✓`);
} catch (e) { await c.query("rollback"); console.error("❌ ROLLED BACK:", e.message); }
await c.end();
