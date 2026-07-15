// 🔴 MONEY (owner 2026-07-15) — balance ยอด order/บิล/ใบเสร็จ ให้ตรงกับสลิปที่ลูกค้าโอนจริง
// (owner "ลูกค้าจ่ายมาแล้วไม่เป็นไร · ปรับให้ตรง · จะได้กดยืนยันออกบิล/ใบเสร็จ").
//
// PR211 f52312 (105604 pending · slip ฿239.20): PCSF order คิด mao virtual ฿100 → collect 289.20
//   ≠ slip 239.20 (ลูกค้าจ่าย เหมาๆ ฿50). FIX: ftransportprice=50 (PCSF-nonzero → virtual mao ไม่ fire)
//   → collect = 189.20 + 50 = 239.20 = slip. (not juristic · no WHT.)
//
// PR143 (สลิปรวมใบเดียว a437ee26 · 2 order แต่ตรวจแยก · admin_aom เผลอแก้ 105603 → 177.00 ผิด):
//   52118 freight 82.20 · 52119 freight 94.69 · เหมาๆ ฿50 ครั้งเดียว (per-bill · ลอบเดียว GZS260626-1).
//   ถูกต้อง: 105602=82.20 (52118 freight) · 105603=144.69 (52119 freight 94.69 + เหมาๆ 50) · รวม 226.89.
//   FIX: wallet_hs 105603 amount 177.00→144.69 · fwd 52119 ftransportprice=50 (เหมาๆ anchor).
//   ⚠️ 2 order นี้ควรออกใบเสร็จ*ด้วยกัน* (เหมาๆ ฿50 ครั้งเดียว) — ถ้าออกแยก virtual mao อาจซ้ำ.
//
//   dry:   node scripts/fix-pr211-pr143-slip-balance-2026-07-15.mjs
//   apply: node scripts/fix-pr211-pr143-slip-balance-2026-07-15.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// snapshot before
const before = {
  f52312: (await c.query(`SELECT ftransportprice FROM tb_forwarder WHERE id=52312`)).rows[0],
  f52119: (await c.query(`SELECT ftransportprice FROM tb_forwarder WHERE id=52119`)).rows[0],
  hs105603: (await c.query(`SELECT amount FROM tb_wallet_hs WHERE id=105603`)).rows[0],
};

console.log(`\n════ PR211 + PR143 · balance ยอด=สลิป · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);
console.log(`\n── PR211 f52312 ──`);
console.log(`  ftransportprice ฿${Number(before.f52312.ftransportprice).toFixed(2)} → ฿50.00 (เหมาๆ ฿50)`);
console.log(`  collect = freight 189.20 + 50 = ฿239.20 = slip(105604 pending ฿239.20) ✓`);
console.log(`\n── PR143 ──`);
console.log(`  52118: freight 82.20 (105602 = 82.20 · คงเดิม)`);
console.log(`  52119 ftransportprice ฿${Number(before.f52119.ftransportprice).toFixed(2)} → ฿50.00 (เหมาๆ anchor)`);
console.log(`  105603 amount ฿${Number(before.hs105603.amount).toFixed(2)} → ฿144.69 (freight 94.69 + เหมาๆ 50)`);
console.log(`  รวม 82.20 + 144.69 = ฿226.89 (freight 176.89 + เหมาๆ ฿50 ครั้งเดียว)`);
console.log(`  ⚠️ ออกใบเสร็จ 2 order นี้ด้วยกัน (เหมาๆ ฿50 ครั้งเดียว · owner verify vs สลิปรวม)`);

if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อแก้จริง\n`); await c.end(); process.exit(0); }

writeFileSync("scripts/fix-pr211-pr143-backup-2026-07-15.json", JSON.stringify({ before }, null, 2));
await c.query("begin");
try {
  // PR211
  await c.query(`UPDATE tb_forwarder SET ftransportprice=50 WHERE id=52312 AND ftransportprice=0`);
  // PR143
  await c.query(`UPDATE tb_forwarder SET ftransportprice=50 WHERE id=52119 AND ftransportprice=0`);
  await c.query(`UPDATE tb_wallet_hs SET amount=144.69, adminidupdate='admin_web', note='แก้ยอดจากสลิปรวม PR143 · freight 94.69 + เหมาๆ 50 = 144.69 (เดิม 177.00 แก้ผิด)' WHERE id=105603`);
  await c.query("commit");
  console.log(`\n✅ APPLIED · PR211 order=239.20=slip · PR143 105603→144.69 · 52119 mao 50`);
} catch (e) { await c.query("rollback"); console.error("❌ ROLLED BACK:", e.message); }
await c.end();
