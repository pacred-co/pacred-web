// 🔴 DATA-FIX (owner 2026-08-06) — แนต (admin_nat · วันดี = ฝ่ายเอกสาร ไม่ใช่เซล) ยังติดธง
// tb_admin.adminStatusSale='1' → โผล่ใน round-robin ตอนลูกค้าสมัครเอง (lib/admin/assign-sales-rep.ts
// อ่าน pool = adminStatusA='1' AND adminStatusSale='1') + ถือลูกค้าใน tb_users.adminIDSale อยู่.
//
// owner: "ลูกค้าสมัครเองให้ไล่รันเซล auto เท่าเทียม · อันไหนยังเป็นเซลแนต ไล่แก้เป็นเซลส่วนกลาง
// admin_center (ปักธงรอใส่เซลดูแล)" — เซลจริงมี 4 คน: แบม admin_bam · ลูกนัท admin_looknut ·
// พี admin_pee · เมย์ admin_may.
//
// FIX (data-only · algorithm round-robin เดิมยุติธรรมอยู่แล้ว ไม่แตะโค้ด):
//   1) tb_admin.adminStatusSale='0' เฉพาะ admin_nat (ออกจาก pool เซล · role อื่นคงเดิม —
//      ไม่แตะ adminStatusA / adminStatusCS / admins role rows).
//   2) tb_users.adminIDSale='admin_nat' ทุกแถว → 'admin_center' (เซลส่วนกลาง = ปักธงรอใส่เซล ·
//      UI มี 🎯 ส่วนกลาง chip + แท็บ "ยังไม่มีเซล" รองรับอยู่แล้ว).
// Money-neutral (identity/roster เท่านั้น · ไม่แตะ wallet/order/ราคา). Idempotent (รันซ้ำ = 0 แถว).
// Backup ก่อนเขียนเสมอ (tb_admin row เดิม + ทุก tb_users แถวที่โดน พร้อมค่าเก่า).
//
//   dry:   SUPABASE_DB_PASSWORD='<pw>' node scripts/fix-sales-pool-nat-2026-08-06.mjs
//   apply: SUPABASE_DB_PASSWORD='<pw>' node scripts/fix-sales-pool-nat-2026-08-06.mjs --apply
// ✅ APPLIED PROD 2026-08-06 10:25 UTC (backup = scripts/fix-sales-pool-nat-backup-2026-08-06.json
//    · local-only ไม่ commit) · verified: pool = bam/looknut/may/pee · nat เหลือ 0 · center 9,131.
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const NAT = "admin_nat";
const CENTER = "admin_center";
const EXPECTED_POOL = ["admin_bam", "admin_looknut", "admin_may", "admin_pee"]; // เซลจริง 4 คน (owner เคาะ)

const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) {
  console.error("FATAL: SUPABASE_DB_PASSWORD (or PG_PASSWORD) not set — รหัส prod อยู่ใน chat เท่านั้น ห้ามลงไฟล์");
  process.exit(1);
}
const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log(`\n════ sales-pool fix · แนตออกจาก pool เซล + ลูกค้า → เซลส่วนกลาง · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════\n`);

// ── สถานะปัจจุบัน ──────────────────────────────────────────────────────────
const natRow = (await c.query(
  `SELECT "ID","adminID","adminName","adminLastName","adminNickname","adminStatusA","adminStatusSale","adminStatusCS"
     FROM tb_admin WHERE "adminID"=$1`, [NAT])).rows[0];
if (!natRow) { console.error(`❌ ไม่พบ tb_admin row ของ ${NAT} — หยุด`); await c.end(); process.exit(1); }

const centerRow = (await c.query(
  `SELECT "adminID","adminStatusA" FROM tb_admin WHERE "adminID"=$1`, [CENTER])).rows[0];
if (!centerRow) { console.error(`❌ ไม่พบ tb_admin row ของ ${CENTER} (เซลส่วนกลาง) — reassign ไม่ได้ หยุด`); await c.end(); process.exit(1); }

const poolBefore = (await c.query(
  `SELECT "adminID","adminNickname" FROM tb_admin WHERE "adminStatusA"='1' AND "adminStatusSale"='1' ORDER BY "adminID"`)).rows;

const natCustomers = (await c.query(
  `SELECT "userID","adminIDSale","userName","userLastName","userActive","userStatus"
     FROM tb_users WHERE "adminIDSale"=$1 ORDER BY "userID"`, [NAT])).rows;

console.log(`tb_admin ${NAT}: "${natRow.adminName} ${natRow.adminLastName}" (${natRow.adminNickname || "—"}) · A=${natRow.adminStatusA} · Sale=${natRow.adminStatusSale} · CS=${natRow.adminStatusCS}`);
console.log(`pool เซลปัจจุบัน (${poolBefore.length}): ${poolBefore.map(r => `${r.adminID}(${r.adminNickname || "—"})`).join(" · ") || "—"}`);
console.log(`\nลูกค้าที่ ${NAT} ถืออยู่ (${natCustomers.length} ราย) → จะย้ายไป ${CENTER}:`);
for (const u of natCustomers) {
  console.log(`  ${u.userID} — ${u.userName || ""} ${u.userLastName || ""} (active=${u.userActive}/status=${u.userStatus})`);
}

// ── แผนงาน ────────────────────────────────────────────────────────────────
const step1 = natRow.adminStatusSale === "1" ? `SET adminStatusSale '1'→'0'` : `ข้าม (Sale='${natRow.adminStatusSale}' อยู่แล้ว)`;
console.log(`\nแผน:`);
console.log(`  1) tb_admin ${NAT}: ${step1} (role อื่น/adminStatusA ไม่แตะ)`);
console.log(`  2) tb_users: reassign adminIDSale ${NAT} → ${CENTER} · ${natCustomers.length} แถว`);

if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียนอะไร. รัน --apply เพื่อแก้จริง\n`); await c.end(); process.exit(0); }

// ── backup ก่อนเขียน ──────────────────────────────────────────────────────
const backupPath = "scripts/fix-sales-pool-nat-backup-2026-08-06.json";
writeFileSync(backupPath, JSON.stringify({
  at: new Date().toISOString(),
  tb_admin_before: natRow,
  pool_before: poolBefore,
  tb_users_before: natCustomers.map(u => ({ userID: u.userID, adminIDSale: u.adminIDSale })),
}, null, 2));
console.log(`\n💾 backup → ${backupPath}`);

// ── apply (txn เดียว · rollback ทั้งก้อนถ้าพลาด) ──────────────────────────
await c.query("begin");
try {
  const r1 = await c.query(
    `UPDATE tb_admin SET "adminStatusSale"='0' WHERE "adminID"=$1 AND "adminStatusSale"='1'`, [NAT]);
  const r2 = await c.query(
    `UPDATE tb_users SET "adminIDSale"=$2 WHERE "adminIDSale"=$1`, [NAT, CENTER]);
  console.log(`  ✏️ tb_admin de-flag: ${r1.rowCount} แถว · tb_users reassign: ${r2.rowCount} แถว`);
  await c.query("commit");
} catch (e) {
  await c.query("rollback");
  console.error("❌ ROLLED BACK:", e.message);
  await c.end();
  process.exit(1);
}

// ── verify หลังเขียน ──────────────────────────────────────────────────────
const poolAfter = (await c.query(
  `SELECT "adminID","adminNickname" FROM tb_admin WHERE "adminStatusA"='1' AND "adminStatusSale"='1' ORDER BY "adminID"`)).rows;
const natLeft = (await c.query(`SELECT count(*)::int AS n FROM tb_users WHERE "adminIDSale"=$1`, [NAT])).rows[0].n;
const centerCount = (await c.query(`SELECT count(*)::int AS n FROM tb_users WHERE "adminIDSale"=$1`, [CENTER])).rows[0].n;

const poolIds = poolAfter.map(r => r.adminID).sort();
const poolOk = JSON.stringify(poolIds) === JSON.stringify([...EXPECTED_POOL].sort());
console.log(`\n✅ APPLIED`);
console.log(`  pool เซลตอนนี้ (${poolAfter.length}): ${poolAfter.map(r => `${r.adminID}(${r.adminNickname || "—"})`).join(" · ")} ${poolOk ? "✓ ตรง 4 คนที่ owner เคาะ" : "⚠️ ไม่ตรง [bam/looknut/may/pee] — ตรวจด้วยตา!"}`);
console.log(`  ลูกค้าค้างที่ ${NAT}: ${natLeft} ${natLeft === 0 ? "✓" : "⚠️"}`);
console.log(`  ลูกค้าใต้ ${CENTER} (ส่วนกลาง · ปักธงรอใส่เซล): ${centerCount} ราย\n`);
await c.end();
