// 🔴 MONEY (owner 2026-07-15) — PR215 order 52328: staff ลืมเก็บค่าตีลังไม้ ฿1,900. Customer
// then transferred the top-up in 2 more slips. Add the crate + record the 2 slips + reconcile
// to what the customer actually paid.
//
// OWNER's breakdown:
//   ค่านำเข้า        7,293.44  (forwarder.ftotalprice · unchanged)
//   ค่าตีลังไม้       1,900.00  (forwarder.pricecrate 0 → 1,900 · ADD)
//   ค่าส่งเหมาๆ         100.00  (forwarder.ftransportprice · unchanged)
//   ─────────────────────────
//   gross           9,293.44
//   − หัก ณ ที่จ่าย 1%  −92.94
//   net (ต้องจ่าย)    9,200.50
//   จ่ายมาแล้ว        7,319.51  (wallet_hs 105614 · first payment)
//   โอนเพิ่ม 2 สลิป    1,880.99  = 1,808.79 (016196163359ATF07185 · 16:33)
//                                + 72.20    (016196164053ATF09502 · 16:40)
//   รวมจ่าย          9,200.50 ✓
//
// Records: pricecrate=1,900 + 2 top-up (type='1') + 1 pay (type='4' reforder=52328) for the
// extra 1,880.99, so the wallet stays balanced AND the 2 slips live in the customer's history.
//
//   dry:   node scripts/fix-pr215-crate-slips-2026-07-15.mjs
//   apply: node scripts/fix-pr215-crate-slips-2026-07-15.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const FID = 52328, USERID = "PR215", CRATE = 1900;
const SLIPS = [
  { amount: 1808.79, ref: "016196163359ATF07185", time: "16:33" },
  { amount: 72.20,   ref: "016196164053ATF09502", time: "16:40" },
];

const f = (await c.query(`SELECT id,userid,ftotalprice,ftransportprice,pricecrate,paymethod FROM tb_forwarder WHERE id=$1`, [FID])).rows[0];
if (!f || f.userid !== USERID) { console.error("❌ forwarder ไม่ตรง PR215 — หยุด"); await c.end(); process.exit(1); }
const freight = Number(f.ftotalprice), transport = Number(f.ftransportprice), curCrate = Number(f.pricecrate);
const grossBefore = round2(freight + transport + curCrate);
const grossAfter = round2(freight + transport + CRATE);
const whtAfter = grossAfter >= 1000 ? round2(grossAfter * 0.01) : 0;
const netAfter = round2(grossAfter - whtAfter);
const extra = round2(SLIPS.reduce((s, x) => s + x.amount, 0));

// what's already paid (settled type='4' against this order)
const paidRows = (await c.query(`SELECT id,amount FROM tb_wallet_hs WHERE userid=$1 AND type='4' AND status='2' AND reforder=$2`, [USERID, String(FID)])).rows;
const paidBefore = round2(paidRows.reduce((s, r) => s + Number(r.amount), 0));
const paidAfter = round2(paidBefore + extra);

console.log(`\n════ PR215 · เพิ่มค่าตีลังไม้ + 2 สลิป · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);
console.log(`forwarder #${FID} ${f.userid}`);
console.log(`  ค่านำเข้า       ฿${freight.toFixed(2)}`);
console.log(`  ค่าตีลังไม้      ฿${curCrate.toFixed(2)} → ฿${CRATE.toFixed(2)}`);
console.log(`  ค่าส่งเหมาๆ      ฿${transport.toFixed(2)}`);
console.log(`  gross          ฿${grossBefore.toFixed(2)} → ฿${grossAfter.toFixed(2)}`);
console.log(`  หัก 1%         −฿${whtAfter.toFixed(2)}  → net ฿${netAfter.toFixed(2)}`);
console.log(`\nจ่ายมาแล้ว       ฿${paidBefore.toFixed(2)} (${paidRows.length} รายการ)`);
SLIPS.forEach(s => console.log(`  + สลิป ฿${s.amount.toFixed(2)} (${s.ref} · ${s.time})`));
console.log(`โอนเพิ่มรวม      ฿${extra.toFixed(2)}`);
console.log(`รวมจ่าย         ฿${paidAfter.toFixed(2)}  ${Math.abs(paidAfter - netAfter) < 0.02 ? "✓ = net" : "⚠️ ≠ net " + netAfter.toFixed(2)}`);

// idempotency
const already = (await c.query(`SELECT count(*)::int n FROM tb_wallet_hs WHERE userid=$1 AND session='pr215-crate-topup'`, [USERID])).rows[0].n;
if (already > 0) { console.log(`\n⚠️ เคยบันทึกสลิปแล้ว (${already}) — idempotent skip`); await c.end(); process.exit(0); }
if (Math.abs(paidAfter - netAfter) > 0.02) { console.error("\n⚠️ รวมจ่าย ≠ net — ตรวจตัวเลขก่อน · หยุด"); await c.end(); process.exit(1); }
if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อแก้จริง\n`); await c.end(); process.exit(0); }

writeFileSync(`scripts/fix-pr215-crate-slips-backup-2026-07-15.json`, JSON.stringify({ forwarder: f, grossAfter, whtAfter, netAfter, SLIPS, paidBefore, paidAfter }, null, 2));
await c.query("begin");
try {
  // 1. add the crate fee to the order
  await c.query(`UPDATE tb_forwarder SET pricecrate=$2 WHERE id=$1 AND pricecrate=$3`, [FID, CRATE, curCrate]);
  // 2. record the 2 slips as top-ups (type='1' · settled) — keeps them in the customer history
  for (const s of SLIPS) {
    await c.query(
      `INSERT INTO tb_wallet_hs (date,amount,status,type,typenew,typeservice,paydeposit,note,adminid,adminidupdate,lockdate,session,reforder,wusercredit,userid,adminidcrate,whno,imagesslip,depositnamebank,nameuserbank,nouserbank)
       VALUES (now(),$1,'2','1','6','2','1',$2,'admin_web','admin_web',now(),'pr215-crate-topup','','0',$3,'admin_web','','','กสิกรไทย','กรกฤต น',$4)`,
      [s.amount, `โอนเพิ่มค่าตีลังไม้ #${FID} · ref ${s.ref} · ${s.time}`, USERID, s.ref]);
  }
  // 3. apply the extra to the order (type='4' pay · reforder=52328) so total collected == net
  await c.query(
    `INSERT INTO tb_wallet_hs (date,amount,status,type,typenew,typeservice,paydeposit,note,adminid,adminidupdate,lockdate,session,reforder,wusercredit,userid,adminidcrate,whno,imagesslip,depositnamebank,nameuserbank,nouserbank)
     VALUES (now(),$1,'2','4','6','2','1',$2,'admin_web','admin_web',now(),'pr215-crate-topup',$3,'0',$4,'admin_web','','','','','')`,
    [extra, `เก็บเพิ่มค่าตีลังไม้ ฿${CRATE} (2 สลิป รวม ฿${extra.toFixed(2)}) — net ฿${netAfter.toFixed(2)}`, String(FID), USERID]);
  await c.query("commit");
  console.log(`\n✅ APPLIED · crate → ฿${CRATE} · บันทึก 2 สลิป + pay ฿${extra.toFixed(2)} → รวมจ่าย ฿${paidAfter.toFixed(2)} = net ฿${netAfter.toFixed(2)}`);
} catch (e) { await c.query("rollback"); console.error("❌ ROLLED BACK:", e.message); }
await c.end();
