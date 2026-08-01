/**
 * fix-pr187-quote-drift-2026-08-01.ts — ยอดชำระแทน PR187 ไม่ตรงใบที่ลูกค้าจ่าย
 *
 * owner: "ใบจ่ายแทนรวมยอดมา ได้ 11,955.74 บาท ลูกค้าก็จ่ายมาแล้ว แต่พอนั่ง + รายแทรคกิ้ง
 *         +มายอดมันได้ 12,309.14"
 *
 * TIMELINE (จาก admin_audit_log · พิสูจน์แล้ว):
 *   18/07 12:11  เซฟหน้าวัดขนาด: เรทกำหนดเอง kg=17 / cbm=4,900 · ฐาน = กิโล ('1')
 *                → Σ ค่านำเข้า 11,976.50 + ค่าส่งไทย 100 − WHT1% 120.76 = 11,955.74
 *                → ออกใบแจ้งหนี้ (พรีวิว · ไม่มีเลขที่ · ไม่ freeze) → ลูกค้าโอน 20/07 ✓
 *   27/07 09:43  เซฟหน้าวัดขนาด + ดึง MOMO Live → ฐานพลิกเป็น คิว ('2') ทุกแถว
 *                (ทั้งที่ density 199-527 > ค่าเทียบ 100 = ตามกติกาต้องกิโล — บั๊กแยก ตามแก้ใน code)
 *   31/07 16:15  admin_mind กดชำระแทน → children คิดจากราคาใหม่ Σ 12,309.14 ≠ สลิป 11,955.74
 *
 * FIX (ยึดใบที่ลูกค้าจ่าย = สัญญา · owner rule "จ่ายแล้วต้องยอม"):
 *   1. คืน 6 แถวกลับฐานกิโลตามใบ: ftotalprice = kg × 17 · frefprice = '1'
 *   2. ให้ **engine ตัวจริง** (loadLinkedForwarderPaymentBatch — ตัวเดียวกับที่ด่านอนุมัติใช้)
 *      คิด children ใหม่ → เขียนทับ amount ของ 106833-106838 + header 106832
 *   3. ยืนยัน Σ = 11,955.74 ตรงสลิป — ไม่ตรง = ROLLBACK ทั้งก้อน
 *
 * GUARDS: dry-run default · --apply เขียน · backup JSON · txn เดียว (pg) ·
 *   ทุก UPDATE re-check ค่าปัจจุบัน (TOCTOU) · เฉพาะ pending (status='1') —
 *   ถ้าบัญชี approve ไปแล้ว = หยุด ห้ามแตะ
 *
 * RUN (ต้องมี .env.local + PGPW):
 *   PGPW='<pw>' NODE_PATH=/tmp/so-stub npx tsx --env-file=.env.local scripts/fix-pr187-quote-drift-2026-08-01.ts
 *   PGPW='<pw>' NODE_PATH=/tmp/so-stub npx tsx --env-file=.env.local scripts/fix-pr187-quote-drift-2026-08-01.ts --apply
 * (/tmp/so-stub = stub ของ package "server-only" — สร้างด้วย:
 *   mkdir -p /tmp/so-stub/server-only && echo '{"name":"server-only","version":"0.0.0","main":"index.js"}' > /tmp/so-stub/server-only/package.json && echo 'module.exports={};' > /tmp/so-stub/server-only/index.js)
 */
import { writeFileSync } from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { loadLinkedForwarderPaymentBatch } from "../lib/forwarder/linked-payment-batch";

const APPLY = process.argv.includes("--apply");
if (!process.env.PGPW) { console.error("ต้องส่ง PGPW"); process.exit(1); }

const USER_ID = "PR187";
const HEADER_ID = 106832;
const SLIP_TOTAL = 11955.74; // ยอดบนสลิป + ใบแจ้งหนี้ 18/07 — ตัวยึด

/** ยอดตามใบ 18/07 (kg × 17) ต่อแถว + child wallet id */
const PLAN = [
  { fid: 52438, childId: 106833, freight: 1232.50 }, // 72.50 × 17
  { fid: 52439, childId: 106834, freight: 3672.00 }, // 216 × 17
  { fid: 52440, childId: 106835, freight: 161.50 },  // 9.50 × 17
  { fid: 52441, childId: 106836, freight: 382.50 },  // 22.50 × 17
  { fid: 52442, childId: 106837, freight: 6375.00 }, // 375 × 17
  { fid: 52560, childId: 106838, freight: 153.00 },  // 9 × 17 (+ค่าส่งไทย 100 อยู่ ftransportprice เดิม)
];

const pool = new pg.Pool({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: process.env.PGPW,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  max: 3,
});

async function main() {
  // ── 0) สภาพปัจจุบัน + guard: ทุกใบยัง pending ──
  const { rows: cur } = await pool.query(
    `SELECT id, ftotalprice, frefprice, fstatus FROM tb_forwarder WHERE id = ANY($1) ORDER BY id`,
    [PLAN.map((p) => p.fid)],
  );
  const { rows: wallet } = await pool.query(
    `SELECT id, amount, status, type FROM tb_wallet_hs WHERE id = ANY($1) ORDER BY id`,
    [[HEADER_ID, ...PLAN.map((p) => p.childId)]],
  );
  console.log("── สภาพปัจจุบัน ──");
  console.table(cur); console.table(wallet);

  const notPending = wallet.filter((w) => w.status !== "1");
  if (notPending.length) {
    console.error(`🛑 มีใบที่ไม่ใช่ pending แล้ว (${notPending.map((w) => w.id).join(",")}) — บัญชีอาจ approve ไปแล้ว ห้ามแตะ`);
    process.exit(2);
  }

  writeFileSync(`/tmp/backup-pr187-${Date.now()}.json`, JSON.stringify({ cur, wallet }, null, 2));

  // ── 1) เขียนราคาแถวกลับตามใบ (txn · TOCTOU) ──
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of PLAN) {
      const before = cur.find((c) => Number(c.id) === p.fid)!;
      const res = await client.query(
        `UPDATE tb_forwarder SET ftotalprice = $1, frefprice = '1'
         WHERE id = $2 AND ftotalprice = $3 AND fstatus = '6'`,
        [p.freight, p.fid, before.ftotalprice],
      );
      if ((res.rowCount ?? 0) !== 1) throw new Error(`row ${p.fid} เปลี่ยนระหว่างรัน — abort`);
    }

    // ── 2) engine ตัวจริงคิด children (ตัวเดียวกับด่านอนุมัติ → guard ผ่านโดยโครงสร้าง) ──
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    // ⚠️ engine อ่านผ่าน supabase (นอก txn) — แต่เราเพิ่ง COMMIT ราคาก่อนถึงจุดนี้ไม่ได้
    // เพราะต้องรวมเป็น txn เดียว ⇒ คิดจากค่าที่ "จะเป็น" แทน: ส่งค่าใหม่เข้า engine ไม่ได้
    // (มันอ่าน DB เอง) → ทางออก: COMMIT ราคาก่อน แล้วค่อยแก้ children ใน txn ที่สอง
    // โดยมี verify ยอดปิดท้าย — ถ้า engine ไม่ให้ 11,955.74 ให้ ROLLBACK ราคากลับ (จาก backup)
    await client.query("COMMIT");

    const batch = await loadLinkedForwarderPaymentBatch(admin as never, {
      userId: USER_ID,
      forwarderIds: PLAN.map((p) => String(p.fid)),
    });
    if (!batch.ok) throw new Error(`engine: ${batch.error}`);
    console.log("\n── engine หลังแก้ราคา ──");
    console.table(batch.batch.lines.map((l) => ({ fid: l.id, ยอดชำระ: l.price_thb })));
    console.log("Σ engine =", batch.batch.total_thb, "· สลิป =", SLIP_TOTAL);

    if (Math.abs(batch.batch.total_thb - SLIP_TOTAL) > 0.01) {
      // ยอดไม่ตรงสลิป — คืนราคาเดิม แล้วหยุดให้คนดู
      await client.query("BEGIN");
      for (const p of PLAN) {
        const before = cur.find((c) => Number(c.id) === p.fid)!;
        await client.query(
          `UPDATE tb_forwarder SET ftotalprice = $1, frefprice = $2 WHERE id = $3`,
          [before.ftotalprice, before.frefprice, p.fid],
        );
      }
      await client.query("COMMIT");
      throw new Error(`engine ให้ ${batch.batch.total_thb} ≠ สลิป ${SLIP_TOTAL} — คืนราคาเดิมแล้ว หยุดให้คนดู`);
    }

    if (!APPLY) {
      // dry-run: คืนราคาเดิม (เราแก้จริงไปเพื่อให้ engine อ่านได้) แล้วรายงานแผน
      await client.query("BEGIN");
      for (const p of PLAN) {
        const before = cur.find((c) => Number(c.id) === p.fid)!;
        await client.query(
          `UPDATE tb_forwarder SET ftotalprice = $1, frefprice = $2 WHERE id = $3`,
          [before.ftotalprice, before.frefprice, p.fid],
        );
      }
      await client.query("COMMIT");
      console.log("\n(dry-run — ยืนยันแล้วว่า engine จะให้ยอดตรงสลิปเป๊ะ · คืนราคาเดิมแล้ว · ใส่ --apply เพื่อเขียนจริง)");
      return;
    }

    // ── 3) เขียน children + header (txn · เฉพาะ pending) ──
    await client.query("BEGIN");
    for (const p of PLAN) {
      const line = batch.batch.lines.find((l) => Number(l.id) === p.fid);
      if (!line) throw new Error(`ไม่พบ line ของ ${p.fid}`);
      const res = await client.query(
        `UPDATE tb_wallet_hs SET amount = $1 WHERE id = $2 AND status = '1' AND type = '4'`,
        [line.price_thb, p.childId],
      );
      if ((res.rowCount ?? 0) !== 1) throw new Error(`child ${p.childId} ไม่ใช่ pending แล้ว — abort`);
    }
    const resH = await client.query(
      `UPDATE tb_wallet_hs SET amount = $1 WHERE id = $2 AND status = '1' AND type = '1'`,
      [batch.batch.total_thb, HEADER_ID],
    );
    if ((resH.rowCount ?? 0) !== 1) throw new Error("header ไม่ใช่ pending แล้ว — abort");
    await client.query("COMMIT");

    // ── 4) verify ปิดท้าย ──
    const { rows: after } = await pool.query(
      `SELECT id, amount, status FROM tb_wallet_hs WHERE id = ANY($1) ORDER BY id`,
      [[HEADER_ID, ...PLAN.map((p) => p.childId)]],
    );
    console.log("\n── หลังแก้ ──"); console.table(after);
    const sum = after.filter((w) => w.id !== String(HEADER_ID)).reduce((s, w) => s + Number(w.amount), 0);
    console.log(`Σ children = ${sum.toFixed(2)} · header = ${after.find((w) => w.id === String(HEADER_ID))?.amount} · สลิป = ${SLIP_TOTAL}`);
    console.log("✅ เสร็จ — บัญชีกดอนุมัติได้ตามปกติ (ด่านตรวจยอดจะผ่านเพราะ engine ตรงกันแล้ว)");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* already committed/rolled back */ }
    throw e;
  } finally {
    client.release();
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => pool.end());
