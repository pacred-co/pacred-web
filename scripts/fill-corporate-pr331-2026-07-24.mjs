/**
 * เติมข้อมูลนิติบุคคลให้ PR331 — ข้อมูล "มีอยู่แล้ว แต่อยู่ผิดช่อง".
 *
 * ── ที่มาของทุกค่า (ไม่มีอะไรกุขึ้นเอง) ──────────────────────────────────
 * ชื่อนิติ  : owner ยืนยันเอง 2026-07-24 ("ชื่อถูกแล้วครับ") — ตรงกับ tb_users."userName"
 *            (ที่นั่นมี \n คั่นกลาง) และตรงกับ tb_address #4316 addressname
 * เลขภาษี  : ฝังอยู่ใน tb_users."userNote" → "เลขนิติ/บัตร/passport:0105552054864"
 *            (13 หลัก · ขึ้นต้น 0-10-5 = นิติบุคคล จดทะเบียน กทม.)
 * ที่อยู่   : tb_address #4316 (addressstatus='1') — ยืนยันซ้ำใน userNote บรรทัดเดียวกัน
 *            "ที่อยู่:17/99 หมู่3 ต.บ้านใหม่ อ.เมือง ปทุมธานี 12000" → 2 แหล่งอิสระตรงกัน
 *
 * ── ทำไม corporatestatus = '2' (ไม่ใช่ '1') ────────────────────────────
 * 🔴 `lib/payment/yuan-eligibility.ts` บล็อกการฝากโอนหยวนเมื่อเจอแถว
 *    corporatestatus='1' (รอตรวจ). วันนี้ PR331 "ไม่มีแถวเลย" = ไม่ถูกบล็อก —
 *    ถ้าเติมเป็น '1' จะกลายเป็นทำให้ลูกค้าแย่ลงกว่าเดิม. PR331 เป็นนิติจริง
 *    (userCompany='1' · ถูกหัก 1% อยู่แล้ว · มีงาน freight เสร็จแล้ว) → '2' อนุมัติแล้ว
 *    คือสถานะที่ตรงความจริง.
 *
 * ── ผลที่ได้ ──────────────────────────────────────────────────────────
 * ปลดบล็อก `classifyCorporateProfile` (ชื่อ+เลขภาษี = ช่องที่บล็อก) →
 * บัญชียืนยันสลิป + ออกใบเสร็จนามนิติให้งานค้าง ฿3,465 ได้.
 * ⚠️ ไม่แตะยอดเงินใดๆ — การหัก 1% ยึด userCompany='1' อยู่แล้ว ไม่เปลี่ยน.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=… node scripts/fill-corporate-pr331-2026-07-24.mjs          # dry-run
 *   SUPABASE_DB_PASSWORD=… node scripts/fill-corporate-pr331-2026-07-24.mjs --apply
 */
import { writeFileSync } from "node:fs";
import pg from "pg";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD || process.env.PGPW;
if (!PW) {
  console.error("ต้องมี SUPABASE_DB_PASSWORD");
  process.exit(1);
}

const TARGET = {
  userid: "PR331",
  corporatename: "บริษัท รัตนาลามิเนท แอนด์ ฟอยล์แสตมป์ปิ้ง จำกัด",
  corporatenumber: "0105552054864",
  corporateaddress: "17/99 หมู่ 3 ต.บ้านใหม่ อ.เมือง จ.ปทุมธานี 12000",
  corporatestatus: "2",
};

const client = new Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: "postgres.yzljakczhwrpbxflnmco",
  password: PW,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

async function main() {
  await client.connect();

  // guard 1 — ต้องเป็นลูกค้านิติจริง
  const u = await client.query(
    `select "userID", "userCompany", "userName" from tb_users where "userID" = $1`,
    [TARGET.userid],
  );
  if (u.rowCount === 0) throw new Error(`ไม่พบลูกค้า ${TARGET.userid}`);
  if (String(u.rows[0].userCompany).trim() !== "1")
    throw new Error(`${TARGET.userid} ไม่ได้ถูก flag เป็นนิติ (userCompany='${u.rows[0].userCompany}') — หยุด`);

  // guard 2 — ห้ามเขียนทับของเดิม
  const exist = await client.query(`select * from tb_corporate where userid = $1`, [TARGET.userid]);
  if (exist.rowCount && exist.rowCount > 0) {
    console.log(`⚪ ${TARGET.userid} มีแถว tb_corporate อยู่แล้ว — ไม่เขียนทับ`);
    console.table(exist.rows);
    await client.end();
    return;
  }

  // guard 3 — เลขภาษี 13 หลักล้วน
  if (!/^\d{13}$/.test(TARGET.corporatenumber))
    throw new Error(`เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก — ได้ "${TARGET.corporatenumber}"`);

  console.log("จะเพิ่มแถวนิติบุคคล:");
  console.table([
    {
      รหัสลูกค้า: TARGET.userid,
      ชื่อนิติ: TARGET.corporatename,
      เลขภาษี: TARGET.corporatenumber,
      ที่อยู่: TARGET.corporateaddress,
      สถานะ: `${TARGET.corporatestatus} (อนุมัติแล้ว)`,
    },
  ]);
  console.log(`\nชื่อในช่องผู้ติดต่อเดิม (ไม่แตะ): ${JSON.stringify(u.rows[0].userName)}`);

  if (!APPLY) {
    console.log("\n🟡 DRY-RUN — ยังไม่เขียน. ใส่ --apply เพื่อบันทึกจริง");
    await client.end();
    return;
  }

  const stamp = Date.now();
  const backupPath = `scripts/_backup-corporate-${TARGET.userid}-${stamp}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify({ at: new Date(stamp).toISOString(), before: exist.rows, insert: TARGET }, null, 2),
  );
  console.log(`\n💾 backup → ${backupPath}`);

  await client.query("BEGIN");
  try {
    // corporatefile / corporatefile20 = NOT NULL แต่รับสตริงว่าง — prod มี 73 แถวที่เป็น ''
    // (ลูกค้าที่ยังไม่ได้แนบ ภพ.20 / หนังสือรับรอง) → ใช้คอนเวนชันเดิม ไม่ใส่ NULL
    const res = await client.query(
      `insert into tb_corporate
         (userid, corporatename, corporatenumber, corporateaddress, corporatestatus,
          corporatefile, corporatefile20, cpdatecreate)
       values ($1, $2, $3, $4, $5, '', '', now())
       on conflict do nothing
       returning id`,
      [
        TARGET.userid,
        TARGET.corporatename,
        TARGET.corporatenumber,
        TARGET.corporateaddress,
        TARGET.corporatestatus,
      ],
    );
    if (res.rowCount !== 1) throw new Error("insert ไม่สำเร็จ — rollback");
    await client.query("COMMIT");
    console.log(`✅ APPLIED — เพิ่มแถว tb_corporate id=${res.rows[0].id} ให้ ${TARGET.userid}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ ROLLBACK:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
  await client.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
