// 🔴 MONEY (owner 2026-07-15) — PR217 upgraded บุคคล → นิติ AFTER paying 3 pay-on-behalf
// orders at the FULL gross (no 1% WHT). As a นิติบุคคล the buyer withholds 1% → the 1% they
// over-paid is credited BACK to their wallet (owner "หักคืนเข้า wallet ลูกค้าไปเลย · อย่าผิดเหมือน PR075").
//
// The 3 settled pays (tb_wallet_hs type='4'): 52456 ฿6,422.92 · 52473 ฿10,386.30 · 52481 ฿10,511.44
// — each == the order composite (freight only · verified · NO WHT was deducted). Per-order 1%
// (each ≥ ฿1,000 → juristic 1% applies): the refund is the SUM of the per-order rounded 1%.
//
//   dry:   node scripts/fix-pr217-wht-refund-2026-07-15.mjs
//   apply: node scripts/fix-pr217-wht-refund-2026-07-15.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const USERID = "PR217";

// verify juristic
const u = (await c.query(`SELECT "userCompany" FROM tb_users WHERE "userID"=$1`, [USERID])).rows[0];
const corp = (await c.query(`SELECT corporatenumber,corporatename FROM tb_corporate WHERE userid=$1`, [USERID])).rows[0];
if (u?.userCompany !== "1" || !/^\d{13}$/.test(corp?.corporatenumber || "")) { console.error("❌ PR217 ยังไม่ใช่นิติสมบูรณ์ — หยุด"); await c.end(); process.exit(1); }

// the 3 settled pay rows (type='4' status='2') + their order composite
const pays = (await c.query(`SELECT id,amount,reforder FROM tb_wallet_hs WHERE userid=$1 AND type='4' AND status='2' AND reforder<>'' ORDER BY id`, [USERID])).rows;
const rows = [];
let totalWht = 0;
for (const p of pays) {
  const f = (await c.query(`SELECT ftotalprice,ftransportprice,pricecrate,fpriceupdate,fshippingservice,ftransportpricechnthb,priceother,fdiscount FROM tb_forwarder WHERE id=$1`, [p.reforder])).rows[0];
  const composite = round2(Number(f.ftotalprice||0)+Number(f.ftransportprice||0)+Number(f.pricecrate||0)+Number(f.fpriceupdate||0)+Number(f.fshippingservice||0)+Number(f.ftransportpricechnthb||0)+Number(f.priceother||0)-Number(f.fdiscount||0));
  const paid = Number(p.amount);
  const wht = composite >= 1000 ? round2(composite * 0.01) : 0;
  totalWht = round2(totalWht + wht);
  rows.push({ fid: p.reforder, hsId: p.id, composite, paid, wht, paidGross: Math.abs(paid - composite) < 0.01 });
}
const wal = (await c.query(`SELECT wallettotal FROM tb_wallet WHERE userid=$1`, [USERID])).rows[0];
const curWallet = Number(wal?.wallettotal ?? 0);

console.log(`\n════ PR217 · คืน 1% (นิติ) เข้า wallet · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);
console.log(`ลูกค้า: ${USERID} · ${corp.corporatename} (${corp.corporatenumber})`);
for (const r of rows) {
  const tag = r.paidGross ? "(จ่ายเต็ม gross ไม่หัก WHT)" : "(ไม่ตรง composite)";
  console.log(`  #${r.fid}: composite ฿${r.composite.toFixed(2)} · จ่ายมา ฿${r.paid.toFixed(2)} ${tag} -> 1% = ฿${r.wht.toFixed(2)}`);
}
console.log(`\n🔴 รวมคืน 1% = ฿${totalWht.toFixed(2)}`);
console.log(`wallet ปัจจุบัน ฿${curWallet.toFixed(2)} → หลังคืน ฿${round2(curWallet + totalWht).toFixed(2)}`);

// guard: every pay must be gross (no WHT already applied) — else we'd double-refund
if (rows.some(r => !r.paidGross)) { console.error("\n⚠️ มีบางรายการที่จ่ายไม่ตรง composite — อาจหัก WHT ไปแล้ว · ต้องตรวจมือ · หยุด"); await c.end(); process.exit(1); }
// idempotency guard: already refunded?
const already = (await c.query(`SELECT count(*)::int n FROM tb_wallet_hs WHERE userid=$1 AND type='5' AND session='juristic-wht-refund'`, [USERID])).rows[0].n;
if (already > 0) { console.log(`\n⚠️ เคยคืนไปแล้ว (${already} รายการ) — idempotent skip`); await c.end(); process.exit(0); }

if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อคืนจริง\n`); await c.end(); process.exit(0); }

writeFileSync(`scripts/fix-pr217-wht-refund-backup-2026-07-15.json`, JSON.stringify({ rows, totalWht, curWallet }, null, 2));
await c.query("begin");
try {
  const note = `คืนภาษีหัก ณ ที่จ่าย 1% (นิติบุคคล) — จ่าย 3 ออเดอร์เต็ม gross ก่อนอัพเกรดนิติ (${rows.map(r=>`#${r.fid} ฿${r.wht.toFixed(2)}`).join(" · ")}) รวม ฿${totalWht.toFixed(2)}`;
  await c.query(
    `INSERT INTO tb_wallet_hs (date,amount,status,type,typenew,typeservice,paydeposit,note,adminid,adminidupdate,lockdate,session,reforder,wusercredit,userid,adminidcrate,whno,imagesslip,depositnamebank,nameuserbank,nouserbank)
     VALUES (now(),$1,'2','5','2','1','0',$2,'admin_web','admin_web',now(),'juristic-wht-refund','','0',$3,'admin_web','','','','','')`,
    [totalWht, note, USERID]);
  await c.query(`UPDATE tb_wallet SET wallettotal = wallettotal + $1 WHERE userid=$2`, [totalWht, USERID]);
  await c.query("commit");
  const after = (await c.query(`SELECT wallettotal FROM tb_wallet WHERE userid=$1`, [USERID])).rows[0];
  console.log(`\n✅ APPLIED · คืน ฿${totalWht.toFixed(2)} → wallet PR217 = ฿${Number(after.wallettotal).toFixed(2)}`);
} catch (e) { await c.query("rollback"); console.error("❌ ROLLED BACK:", e.message); }
await c.end();
