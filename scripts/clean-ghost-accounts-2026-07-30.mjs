/**
 * clean-ghost-accounts-2026-07-30.mjs
 * ══════════════════════════════════════════════════════════════════════════
 * owner 2026-07-30: *"บัญชีพวกนี้ ลบคลีนไปเลยก็ได้ครับ เอาที่เป็นผีๆ พิเศษนะครับ
 * ไม่ใช่ลบ user ทั่วไปออกไปด้วย"*
 *
 * นิยาม "ผี" ที่ใช้ (เป็นเกณฑ์ ไม่ใช่ดูจากชื่อ):
 *   1. รหัสไม่ใช่รูปแบบลูกค้าปกติ `PR<ตัวเลข>`  (= "พิเศษ" ตามที่ owner ว่า)
 *   2. **ไม่มีความเคลื่อนไหวเลยสักอย่าง** — 0 ทั้ง ฝากนำเข้า · ฝากสั่งซื้อ · ฝากโอน ·
 *      กระเป๋าเงิน · ตะกร้า · ใบเสร็จ
 *   3. **ไม่ใช่พนักงาน** — ไม่มีแถวใน `tb_admin` และไม่มี role ใน `admins`
 *
 * 🔴 ที่ถูก "กันออก" โดยเจตนา (เข้าเกณฑ์ 1 แต่ตกเกณฑ์ 2/3):
 *   • AD001 = วิสิฐ ศิลปเลิศลักษณ์ (**พี่ป๊อป เจ้าของกิจการ**) — ห้ามแตะ
 *   • AD006 = บัญชีทดสอบ UI ของปอน — มีงานจริง 7 รายการ + กระเป๋า 5 + ใบเสร็จ 2
 *   • AD008 = รหัส AD = ช่องพนักงาน
 *   ⇒ เหลือ 8 บัญชี: AIGA · FCL · JET · PRARNON · PRCARGO · PRFAM · PRTT · PW
 *
 * ทำอะไร (ปลอดภัย · ย้อนกลับได้):
 *   1. **ปิดบัญชี** `tb_users.userStatus='0'` + `profiles.is_active=false`
 *      = หายจากทุกลิสต์/ตัวเลือก/ค้นหา (คอนเวนชัน soft-delete ของระบบเรา ที่ signup
 *        dedup ก็เช็คตัวนี้) — ไม่ใช้ hard DELETE เพราะตารางบ้านเรา**ไม่มี FK** (§0e)
 *        ลบแถวจริงแล้วอาจมีที่อื่นชี้ค้างแบบเงียบๆ และกู้คืนไม่ได้
 *   2. **ลบเรทเฉพาะตัวทิ้ง** (`tb_rate_custom_cbm` / `_kg`) — นี่คือตัวปัญหาจริง:
 *      บัญชีผีพวกนี้ถือเซลที่ **ต่ำกว่าทุน** อยู่ (FCL/PW/JET/PRFAM/PRTT รวม 72 เซล)
 *      ลบทิ้ง = ต่อให้บัญชีถูกเปิดใช้อีก ก็ตกไปใช้เรทกลางซึ่งเหนือทุนทุกช่อง
 *   3. **ไม่แตะที่อยู่** — ไม่มีความเสี่ยงเรื่องเงิน และมองไม่เห็นอยู่แล้วเมื่อปิดบัญชี
 *      (สำรองไว้ในไฟล์ backup ครบ เผื่ออยากกู้)
 *
 * รัน: node scripts/clean-ghost-accounts-2026-07-30.mjs          (dry-run)
 *      node scripts/clean-ghost-accounts-2026-07-30.mjs --apply  (เขียนจริง)
 */
import pg from "pg";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");

/** รายชื่อที่ตรวจแล้วเข้าเกณฑ์ครบ 3 ข้อ (สคริปต์ re-verify ทุกข้อก่อนเขียนเสมอ) */
const GHOSTS = ["AIGA", "FCL", "JET", "PRARNON", "PRCARGO", "PRFAM", "PRTT", "PW"];

/** ห้ามแตะเด็ดขาด — กันพลาดถ้ามีคนแก้ลิสต์ข้างบน */
const NEVER = new Set(["AD001", "AD006", "AD008"]);

const client = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
const q = (sql, params) => client.query(sql, params).then((r) => r.rows);
const n1 = async (sql, params) => Number((await q(sql, params))[0]?.n ?? 0);

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error("ต้องตั้ง SUPABASE_DB_PASSWORD");
  await client.connect();
  console.log(APPLY ? "🔴 APPLY MODE — เขียนจริง\n" : "🔍 DRY-RUN — ยังไม่เขียนอะไร\n");

  const plan = [];
  const skipped = [];

  for (const uid of GHOSTS) {
    if (NEVER.has(uid)) { skipped.push([uid, "อยู่ในลิสต์ห้ามแตะ"]); continue; }
    if (/^PR\d+$/.test(uid)) { skipped.push([uid, "รหัสลูกค้าปกติ PR<ตัวเลข> — ไม่ใช่บัญชีพิเศษ"]); continue; }

    const u = (await q(
      `SELECT "userID" uid, concat_ws(' ',"userName","userLastName") nm, "userCompany" comp, "userStatus" us
         FROM tb_users WHERE "userID"=$1`, [uid]))[0];
    if (!u) { skipped.push([uid, "ไม่พบบัญชี (อาจล้างไปแล้ว)"]); continue; }

    // เกณฑ์ 3 — ไม่ใช่พนักงาน
    const isAdmin = await n1(`SELECT count(*) n FROM tb_admin WHERE "adminID"=$1`, [uid]);
    const pf = (await q(`SELECT id, employee_code FROM profiles WHERE member_code=$1`, [uid]))[0] ?? null;
    const hasRole = pf ? await n1(`SELECT count(*) n FROM admins WHERE profile_id=$1`, [pf.id]) : 0;
    if (isAdmin > 0 || hasRole > 0 || (pf?.employee_code ?? "") !== "") {
      skipped.push([uid, `เป็นพนักงาน (tb_admin=${isAdmin} role=${hasRole} emp=${pf?.employee_code || "—"})`]);
      continue;
    }

    // เกณฑ์ 2 — ไม่มีความเคลื่อนไหวเลย
    const act = {
      forwarder: await n1(`SELECT count(*) n FROM tb_forwarder WHERE userid=$1`, [uid]),
      shopOrder: await n1(`SELECT count(*) n FROM tb_header_order WHERE userid=$1`, [uid]),
      payment: await n1(`SELECT count(*) n FROM tb_payment WHERE userid=$1`, [uid]),
      wallet: await n1(`SELECT count(*) n FROM tb_wallet_hs WHERE userid=$1`, [uid]),
      cart: await n1(`SELECT count(*) n FROM tb_cart WHERE userid=$1`, [uid]),
      receipt: await n1(`SELECT count(*) n FROM tb_receipt WHERE userid=$1`, [uid]),
    };
    const total = Object.values(act).reduce((a, b) => a + b, 0);
    if (total > 0) {
      skipped.push([uid, `มีความเคลื่อนไหว ${JSON.stringify(act)} — ไม่ใช่ผี`]);
      continue;
    }

    const rateCbm = await q(`SELECT * FROM tb_rate_custom_cbm WHERE userid=$1`, [uid]);
    const rateKg = await q(`SELECT * FROM tb_rate_custom_kg WHERE userid=$1`, [uid]);
    const addrs = await q(`SELECT * FROM tb_address WHERE userid=$1`, [uid]);
    plan.push({ uid, u, pf, rateCbm, rateKg, addrs });
  }

  console.log(`จะล้าง ${plan.length} บัญชี:`);
  for (const p of plan) {
    console.log(`  ${p.uid.padEnd(9)} "${(p.u.comp || p.u.nm || "—").slice(0, 24)}" `
      + `· ปิดบัญชี (status ${p.u.us}→0) · ลบเรทคิว ${p.rateCbm.length} + เรทกก. ${p.rateKg.length}`
      + ` · เก็บที่อยู่ไว้ ${p.addrs.length}`);
  }
  if (skipped.length) {
    console.log(`\nกันออก ${skipped.length}:`);
    skipped.forEach(([u, why]) => console.log(`  ⏭  ${u.padEnd(9)} ${why}`));
  }

  if (!APPLY) {
    console.log(`\n── แผนเมื่อ --apply ──`);
    console.log(`  1) UPDATE tb_users SET "userStatus"='0'  (${plan.length} แถว)`);
    console.log(`  2) UPDATE profiles SET is_active=false   (${plan.filter((p) => p.pf).length} แถว)`);
    console.log(`  3) DELETE tb_rate_custom_cbm/_kg         (${plan.reduce((a, p) => a + p.rateCbm.length + p.rateKg.length, 0)} แถว)`);
    console.log(`  ไม่แตะ: ที่อยู่ · ประวัติ · ตารางอื่นทั้งหมด`);
    return;
  }

  const bpath = `scripts/_backup-ghost-accounts-${Date.now()}.json`;
  fs.writeFileSync(bpath, JSON.stringify({ at: new Date().toISOString(), plan }, null, 2));
  console.log(`\n💾 backup → ${bpath}`);

  await client.query("BEGIN");
  try {
    let closed = 0, deact = 0, rates = 0;
    for (const p of plan) {
      const r1 = await client.query(`UPDATE tb_users SET "userStatus"='0' WHERE "userID"=$1`, [p.uid]);
      closed += r1.rowCount;
      if (p.pf) {
        const r2 = await client.query(`UPDATE profiles SET is_active=false WHERE id=$1`, [p.pf.id]);
        deact += r2.rowCount;
      }
      const r3 = await client.query(`DELETE FROM tb_rate_custom_cbm WHERE userid=$1`, [p.uid]);
      const r4 = await client.query(`DELETE FROM tb_rate_custom_kg WHERE userid=$1`, [p.uid]);
      rates += r3.rowCount + r4.rowCount;
    }
    if (closed !== plan.length) throw new Error(`คาดว่าปิด ${plan.length} บัญชี แต่ได้ ${closed} — rollback`);
    await client.query("COMMIT");
    console.log(`✅ ปิดบัญชี ${closed} · ปิด login ${deact} · ลบเรท ${rates} เซล`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ rollback:", e.message);
    throw e;
  }

  // verify
  const left = await n1(
    `SELECT count(*) n FROM tb_users WHERE "userID" !~ '^PR[0-9]+$' AND "userStatus"='1'`);
  console.log(`\nบัญชีรหัสพิเศษที่ยัง active เหลือ: ${left} (ควรเป็น AD001 · AD006 · AD008)`);
  const belowLeft = await q(
    `SELECT r.userid, count(*) n FROM tb_rate_custom_cbm r
      WHERE (r.rtransporttype='1' AND r.sourcewarehouse='1' AND r.rcbm>0 AND r.rcbm<4700)
         OR (r.rtransporttype='2' AND r.sourcewarehouse='1' AND r.rcbm>0 AND r.rcbm<2500)
         OR (r.rtransporttype='1' AND r.sourcewarehouse='2' AND r.rcbm>0 AND r.rcbm<5300)
         OR (r.rtransporttype='2' AND r.sourcewarehouse='2' AND r.rcbm>0 AND r.rcbm<2600)
      GROUP BY 1 ORDER BY 1`);
  console.log(`เซลเรทที่ยังต่ำกว่าทุน: ${belowLeft.reduce((a, r) => a + Number(r.n), 0)} เซล / ${belowLeft.length} ลูกค้า`);
  belowLeft.forEach((r) => console.log(`   ${r.userid}: ${r.n}`));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
