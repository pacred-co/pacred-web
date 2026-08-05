// 🔴 DATA-FIX (owner 2026-08-05) — ถอดลูกค้าที่ "ย้ายมาจากเซล ปูปู (admin_pupu) / เตย (admin_toey)"
// ซึ่งตอนนี้ ลูกนัท (admin_looknut) ถืออยู่ → ย้ายไปเป็นของ แบม (admin_bam)
//
// ที่มาของลิสต์ (ไม่ได้เดา — อ่านจาก admin_audit_log บน prod):
//   action='tb_users.update_sale_rep' · payload->>'before' IN (admin_pupu, admin_toey)
//   AND payload->>'after'='admin_looknut' AND ตอนนี้ tb_users."adminIDSale" ยัง = admin_looknut
//   → 25 ราย
//   + PR101 (owner เคาะให้รวม) — ต้นทางคือ pupu แต่แวะ admin_bam ก่อน (pupu→bam 15/07 → bam→looknut 17/07)
//   = รวม 26 ราย
//
// ✅ ตรวจก่อนลงมือ (prod · read-only):
//   • ตารางคอมมิชชั่นว่างทั้งหมด (tb_user_sales / _pay / sales_commissions / sales_payouts /
//     tb_sales_report = 0 แถว) ⇒ ย้ายเซลไม่ขยับเงินใคร
//   • ไม่มีตารางอื่นที่เก็บ "เซลรายลูกค้า" (tb_org_tell_ships = admin↔เบอร์องค์กร ไม่ผูกลูกค้า)
//   • vw_sales_by_rep คิด "สด" จาก adminIDSale ⇒ สถิติงานเก่า 236 แถวจะไปนับใต้ชื่อแบมย้อนหลัง
//     (ผลที่ตั้งใจของการโอนลูกค้า · ไม่ใช่การเคลื่อนเงิน)
//
// เขียนอะไรบ้าง (mirror `adminUpdateUserSaleRep` ใน actions/admin/customer-profile.ts เป๊ะ):
//   1) UPDATE tb_users SET "adminIDSale"='admin_bam' WHERE "userID"=$1 AND "adminIDSale"='admin_looknut'
//      ← fold เงื่อนไขเข้า WHERE = TOCTOU-safe · ถ้ามีคนย้ายไปแล้วระหว่างนี้ = ข้าม ไม่ทับ
//   2) INSERT admin_audit_log (action='tb_users.update_sale_rep' · target_type='tb_users'
//      · target_id=<userID> · payload={before,after}) — รูปเดียวกับที่แอปเขียน
//   ไม่แตะ: wallet · order · ราคา · fstatus · CS rep · อย่างอื่นทั้งหมด
//
// idempotent: รันซ้ำ = 0 แถว (ทุกคนไม่ได้เป็นของ looknut แล้ว)
// cache: customer-chrome เป็น unstable_cache TTL 60 วิ → sidebar ลูกค้าอัปเดตเองภายใน 1 นาที
//
// 🔑 รหัส DB prod อ่านจาก env ไม่ฝังในไฟล์ (กติกา: prod pw = chat-only)
//   dry:   SUPABASE_DB_PASSWORD='<pw>' node scripts/move-looknut-pupu-toey-to-bam-2026-08-05.mjs
//   apply: SUPABASE_DB_PASSWORD='<pw>' node scripts/move-looknut-pupu-toey-to-bam-2026-08-05.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const FROM = "admin_looknut";
const TO = "admin_bam";
// actor สำหรับ audit log — admin_audit_log.admin_id เป็น NOT NULL + FK → profiles(id)
const ACTOR = "a2f85883-4c23-4b3e-aaaf-616883c937db"; // admin_dev (Tadsakorn) = คนรันสคริปต์

const TARGETS = [
  "PR009", "PR084", "PR095", "PR099", "PR10012", "PR101", "PR107", "PR10900", "PR117",
  "PR144", "PR145", "PR156", "PR157", "PR179", "PR191", "PR212", "PR215", "PR216",
  "PR217", "PR561", "PR590", "PR593", "PR602", "PR606", "PR607", "PR9217",
];

const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) {
  console.error(`\n❌ ไม่มีรหัส DB — รันแบบนี้:\n   SUPABASE_DB_PASSWORD='<prod pw>' node ${process.argv[1]}${APPLY ? " --apply" : ""}\n`);
  process.exit(1);
}
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();

console.log(`\n════ ย้ายลูกค้า ${FROM} → ${TO} · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);

// ── สถานะปัจจุบันของทุกเป้าหมาย (รวมที่ไม่เข้าเงื่อนไข เพื่อให้เห็นครบ) ──
const rows = (await c.query(
  `SELECT "userID", "userName", "adminIDSale", "userStatus"
     FROM tb_users WHERE "userID" = ANY($1) ORDER BY "userID"`, [TARGETS])).rows;

const eligible = rows.filter((r) => r.adminIDSale === FROM);
const skipped = rows.filter((r) => r.adminIDSale !== FROM);
const missing = TARGETS.filter((id) => !rows.some((r) => r.userID === id));

console.log(`\n  เป้าหมาย ${TARGETS.length} · พร้อมย้าย ${eligible.length} · ข้าม ${skipped.length} · ไม่พบ ${missing.length}`);
console.table(eligible.map((r) => ({
  userid: r.userID, ชื่อ: r.userName,
  สถานะ: r.userStatus === "1" ? "ใช้งาน" : "ปิดบัญชี",
  จาก: r.adminIDSale, ไป: TO,
})));
if (skipped.length) {
  console.log(`  ⏭ ข้าม (ไม่ได้เป็นของ ${FROM} แล้ว — ไม่ทับของใคร):`);
  console.table(skipped.map((r) => ({ userid: r.userID, ชื่อ: r.userName, เป็นของ: r.adminIDSale || "(ว่าง)" })));
}
if (missing.length) console.log(`  ⚠️ ไม่พบใน tb_users: ${missing.join(", ")}`);

// ── ยอดต่อเซล ก่อน ──
const tally = async () => (await c.query(
  `SELECT "adminIDSale" rep, count(*) n FROM tb_users
    WHERE "adminIDSale" = ANY($1) GROUP BY 1 ORDER BY 1`, [[FROM, TO]])).rows;
console.log(`\n  ── ยอดลูกค้าต่อเซล (ก่อน) ──`);
console.table(await tally());

if (!APPLY) {
  console.log(`\n🟡 DRY-RUN — ยังไม่เขียนอะไร. เติม --apply เพื่อย้ายจริง\n`);
  await c.end();
  process.exit(0);
}
if (!eligible.length) {
  console.log(`\n✅ ไม่มีอะไรต้องย้าย (idempotent — เคยรันไปแล้ว)\n`);
  await c.end();
  process.exit(0);
}

// ── backup ก่อนเขียน ──
const backup = `scripts/_backup-move-looknut-to-bam-${Date.now()}.json`;
writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), from: FROM, to: TO, actor: ACTOR, rows: eligible }, null, 2));
console.log(`\n  💾 backup → ${backup}`);

await c.query("begin");
try {
  const moved = [];
  for (const r of eligible) {
    // TOCTOU-safe: เงื่อนไข "ยังเป็นของ looknut" อยู่ใน WHERE ไม่ใช่อ่านมาก่อน
    const upd = await c.query(
      `UPDATE tb_users SET "adminIDSale" = $2
        WHERE "userID" = $1 AND "adminIDSale" = $3
        RETURNING "userID"`, [r.userID, TO, FROM]);
    if (!upd.rowCount) { console.log(`  ⏭ ${r.userID} — มีคนย้ายไปแล้วระหว่างรัน · ข้าม`); continue; }

    await c.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, payload)
       VALUES ($1, 'tb_users.update_sale_rep', 'tb_users', $2, $3::jsonb)`,
      [ACTOR, r.userID, JSON.stringify({ before: FROM, after: TO })]);
    moved.push(r.userID);
  }
  await c.query("commit");

  console.log(`\n✅ APPLIED — ย้าย ${moved.length} ราย → ${TO}`);
  console.log(`   ${moved.join(", ")}`);

  // ── verify หลังเขียน ──
  console.log(`\n  ── ยอดลูกค้าต่อเซล (หลัง) ──`);
  console.table(await tally());
  const left = (await c.query(
    `SELECT count(*) n FROM tb_users WHERE "userID" = ANY($1) AND "adminIDSale" = $2`, [TARGETS, FROM])).rows[0].n;
  console.log(`  re-scan: ยังค้างที่ ${FROM} = ${left} ราย ${Number(left) === 0 ? "✅" : "⚠️"}`);
} catch (e) {
  await c.query("rollback");
  console.error(`\n❌ ROLLED BACK — ไม่มีอะไรถูกเขียน:`, e.message);
  process.exitCode = 1;
}
await c.end();
