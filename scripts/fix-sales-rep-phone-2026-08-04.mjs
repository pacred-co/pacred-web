/**
 * ตั้งเบอร์จริงให้เซล ลูกนัท + แบม (owner 2026-08-04 "ปรับข้อมูลให้หน่อย ... เบอร์ตามนี้เลย").
 *
 * ทำไมต้องแตะ DB ไม่ใช่แค่การ์ดบนหน้าเว็บ: `tb_admin.adminTel` คือเบอร์ที่ทั้งระบบอ่าน —
 * โปรไฟล์ลูกค้า · sidebar · ใบแจ้งหนี้ · ใบเสนอราคา · หน้า booking · แอปมือถือ.
 * ตอนนี้ 2 คนนี้ยังเป็นค่าชั่วคราว "na-234"/"na-235" และมีลูกค้าผูกอยู่จริง
 * (ลูกนัท 57 · แบม 64 ราย) = ลูกค้าเห็นเบอร์ที่โทรไม่ได้.
 *
 * เขียนเฉพาะ adminTel ของ 2 แถวนี้ · ไม่แตะสิทธิ์/สถานะ/เงิน · ไม่แตะแถวอื่น.
 * dry-run เป็นค่าเริ่มต้น · ใส่ --apply ถึงจะเขียนจริง (backup ลง scripts/_backup-*.json ก่อน).
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");

/** รูปแบบที่เก็บใน DB = ตัวเลขล้วน 10 หลัก (ตรงกับ admin_pee "0617799299"). */
const TARGETS = [
  { adminID: "admin_looknut", nick: "ลูกนัท", display: "099-234-5196", tel: "0992345196" },
  { adminID: "admin_bam", nick: "แบม", display: "066-131-0253", tel: "0661310253" },
];

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  const { data: before, error } = await db
    .from("tb_admin")
    .select('"adminID","adminName","adminNickname","adminTel"')
    .in("adminID", TARGETS.map((t) => t.adminID));
  if (error) throw new Error(`read failed: ${error.message}`);

  const plan = [];
  for (const t of TARGETS) {
    const row = before?.find((r) => r.adminID === t.adminID);
    if (!row) {
      console.log(`⚠️  ไม่พบ ${t.adminID} — ข้าม`);
      continue;
    }
    if (row.adminTel === t.tel) {
      console.log(`✓ ${t.adminID} (${t.nick}) เบอร์ตรงอยู่แล้ว: ${row.adminTel} — ข้าม`);
      continue;
    }
    plan.push({ ...t, from: row.adminTel, dbNick: row.adminNickname });
  }

  console.log("\n=== แผนการแก้ ===");
  for (const p of plan) {
    console.log(`  ${p.adminID} (${p.dbNick}) : "${p.from}" → "${p.tel}"  [${p.display}]`);
  }
  if (plan.length === 0) {
    console.log("  ไม่มีอะไรต้องแก้");
    return;
  }
  if (!APPLY) {
    console.log("\nDRY-RUN — ใส่ --apply เพื่อเขียนจริง");
    return;
  }

  const backupPath = `scripts/_backup-sales-rep-phone-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(before, null, 2), "utf8");
  console.log(`\nbackup → ${backupPath}`);

  for (const p of plan) {
    // .eq(adminTel, from) = กันเขียนทับถ้ามีคนแก้เบอร์ไปแล้วระหว่างนี้ (TOCTOU)
    const { data, error: upErr } = await db
      .from("tb_admin")
      .update({ adminTel: p.tel })
      .eq("adminID", p.adminID)
      .eq("adminTel", p.from)
      .select('"adminID","adminTel"');
    if (upErr) throw new Error(`update ${p.adminID} failed: ${upErr.message}`);
    if (!data || data.length === 0) {
      console.log(`  ⚠️  ${p.adminID} ไม่ถูกเขียน (เบอร์เปลี่ยนไปแล้ว?) — ตรวจด้วยตัวเอง`);
      continue;
    }
    console.log(`  ✅ ${p.adminID} → ${data[0].adminTel}`);
  }

  const { data: after } = await db
    .from("tb_admin")
    .select('"adminID","adminNickname","adminTel"')
    .in("adminID", TARGETS.map((t) => t.adminID));
  console.log("\n=== ผลลัพธ์ ===");
  console.log(JSON.stringify(after, null, 1));
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
