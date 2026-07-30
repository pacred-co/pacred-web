/**
 * fix-momo-truncated-dup-2026-07-30.mjs
 * ══════════════════════════════════════════════════════════════════════════
 * owner 2026-07-30 (จอ /admin/report-cnt/GZE260723-1):
 *   "สองงานนี้ทับกันงานเดียวกันเหมือนกัน คือยังไงเนี่ยครับ มีอีกเยอะไหมครับเนี่ย
 *    งานนี้ในตู้เดียวกันส้ะด้วย แก้ทีครับ"
 *
 * อาการ — MOMO เปิด "2 เรคคอร์ดต่อพัสดุใบเดียว" โดยเลขแทรคกิ้งตัวหลัง **ขาดอักขระท้าย**:
 *     #53062  KY986180550  (23/07 · admin_bam · เรท 4,900 · ฿372.87 · fstatus 5)
 *     #53093  KY98618055   (24/07 · sys-live  · เรท 5,700 · ฿433.75 · fstatus 3)
 * พิสูจน์ว่าใบเดียวกัน: คิว 0.076096 ตรงกัน 6 ตำแหน่ง · น้ำหนัก 3.00 · ทุน 357.65 ·
 * ลูกค้า PR626 · ตู้ GZE260723-1 · momo_container_no = PR20260720-EK01 เดียวกัน
 * (คลาสเดียวกับเคส `733` เมื่อ 2026-07-26 — MOMO ประกาศเลขไม่ครบ)
 *
 * ทำไมอันตราย: ทั้งคู่มีราคา → ถ้าปล่อยไว้ ลูกค้าโดนเก็บ 2 รอบ (฿372.87 + ฿433.75)
 *
 * ขอบเขต — สแกนทั้งระบบด้วยเงื่อนไข prefix-dup (ลูกค้าเดียวกัน · เลขหนึ่งเป็นส่วนหน้าของ
 * อีกเลข · ความยาวต่างกัน · ไม่ใช่แถวแตกกล่อง -N) พบ **คู่เดียว** ไม่ระบาด
 *
 * สิ่งที่สคริปต์ทำ (money-safe · เขียนน้อยที่สุด):
 *   1) ลบแถวผี #53093 — ยืนยันแล้วว่า **ไม่มี** wallet / ใบวางบิล / ใบเสร็จ / คนขับ /
 *      คิวตรวจ / import / บิลใดๆ อ้างถึงเลย (ตรวจครบ 23 ตารางที่มีคอลัมน์ชี้ fid)
 *   2) re-point staging row ของเลขสั้นให้ชี้ #53062 — **จำเป็น** ไม่งั้น cron รอบถัดไป
 *      เห็น committed_forwarder_id ชี้แถวที่หายไป แล้ว commit ใหม่ = ผีกลับมา
 *      (บทเรียน dangling-staging 2026-07-14)
 *   3) ลบ momo_box_detail ของเลขสั้น (นับกล่องซ้ำในรายงาน)
 *
 * สิ่งที่สคริปต์ **ไม่ทำ** (owner เคาะเอง):
 *   • ไม่แตะเรทของ #53062 — ปัจจุบัน 4,900/คิว ขณะเรทกลางวันนี้ 5,700/คิว (tb_rate_g_cbm
 *     รถ·ทั่วไป) และงานนี้ **แจ้งชำระลูกค้าไปแล้ว** → ขึ้นราคา = เก็บเพิ่มจากคนที่ได้รับ
 *     แจ้งยอดไปแล้ว ต้องให้ owner เคาะ (ยังไม่ขาดทุน: ทุน 4,700/คิว → กำไร ฿15.22)
 *
 * รัน: node scripts/fix-momo-truncated-dup-2026-07-30.mjs            (dry-run)
 *      node scripts/fix-momo-truncated-dup-2026-07-30.mjs --apply    (เขียนจริง)
 */
import pg from "pg";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const KEEP = 53062;   // KY986180550 — ตัวจริง (มี import2 + status log + แจ้งชำระแล้ว)
const DROP = 53093;   // KY98618055  — ผีจาก MOMO เลขขาดท้าย

/** ตารางทั้งหมดที่มีคอลัมน์ชี้ fid — ต้องว่างหมดถึงจะลบได้ (กันงานหาย) */
const FID_REFS = [
  ["delivery_feedback", "fid"], ["forwarder_cost_adjustments", "forwarder_id"],
  ["momo_invoice_line", "fid"], ["momo_invoice_settlement_line", "fid"],
  ["tb_bill_item", "fid"], ["tb_cargo_taxdoc_job", "fid"], ["tb_check_forwarder", '"fID"'],
  ["tb_forwarder_driver_item", "fid"], ["tb_forwarder_img", "fid"],
  ["tb_forwarder_import", "fid"], ["tb_forwarder_import2", "fid"],
  ["tb_forwarder_invoice_item", "forwarder_id"], ["tb_forwarder_item", "fid"],
  ["tb_forwarder_prepare", "fid"], ["tb_forwarder_tax_invoice_item", "fid"],
  ["tb_forwarder_tran_th_sub", "fid"], ["tb_log_forwarder_status", "fid"],
  ["tb_promotion", "fid"], ["tb_receipt_item", "fid"], ["tb_sales_report", "fid"],
  ["tb_withdraw_comm_sale_item", "fid"], ["warehouse_intake_log", "fid"],
  ["warehouse_sack_print_log", "fid"],
];

const client = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

const q = (sql, params) => client.query(sql, params).then((r) => r.rows);

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error("ต้องตั้ง SUPABASE_DB_PASSWORD");
  await client.connect();
  console.log(APPLY ? "🔴 APPLY MODE — เขียนจริง\n" : "🔍 DRY-RUN — ยังไม่เขียนอะไร\n");

  // ── 1. อ่านทั้งคู่ + พิสูจน์อีกรอบว่าเป็นใบเดียวกันจริง (TOCTOU: ห้ามเชื่อผลเก่า) ──
  const rows = await q(
    `SELECT id, ftrackingchn, userid, fcabinetnumber, fvolume, fweight, famount,
            frefrate, ftotalprice, fcosttotalprice, fstatus
       FROM tb_forwarder WHERE id IN ($1,$2) ORDER BY id`,
    [KEEP, DROP],
  );
  if (rows.length !== 2) {
    console.log(`⏭  ไม่เจอครบ 2 แถว (เจอ ${rows.length}) — อาจแก้ไปแล้ว · ไม่ทำอะไร`);
    return;
  }
  const keep = rows.find((r) => Number(r.id) === KEEP);
  const drop = rows.find((r) => Number(r.id) === DROP);
  console.log(`เก็บ  #${keep.id} ${keep.ftrackingchn} เรท ${keep.frefrate} ฿${keep.ftotalprice} st${keep.fstatus}`);
  console.log(`ลบ    #${drop.id} ${drop.ftrackingchn} เรท ${drop.frefrate} ฿${drop.ftotalprice} st${drop.fstatus}`);

  const sameParcel =
    keep.userid === drop.userid &&
    keep.fcabinetnumber === drop.fcabinetnumber &&
    Number(keep.fvolume).toFixed(6) === Number(drop.fvolume).toFixed(6) &&
    Number(keep.fweight).toFixed(2) === Number(drop.fweight).toFixed(2) &&
    (String(keep.ftrackingchn).startsWith(String(drop.ftrackingchn)) ||
      String(drop.ftrackingchn).startsWith(String(keep.ftrackingchn)));
  if (!sameParcel) {
    console.log("❌ ข้อมูลไม่ยืนยันว่าเป็นพัสดุใบเดียวกันแล้ว — หยุด (ห้ามเดา)");
    return;
  }
  console.log("✓ ยืนยัน: ลูกค้า/ตู้/คิว/น้ำหนักตรงกัน + เลขเป็น prefix กัน = พัสดุใบเดียวกัน\n");

  // ── 2. ยืนยันว่าแถวที่จะลบ "ไม่มีเอกสาร/เงิน/งานคน" ผูกอยู่เลย ──
  const refs = [];
  for (const [table, col] of FID_REFS) {
    try {
      const r = await q(`SELECT count(*)::int n FROM ${table} WHERE ${col}::text = $1`, [String(DROP)]);
      if (r[0].n > 0) refs.push(`${table}=${r[0].n}`);
    } catch { /* ตารางไม่มี = ข้าม */ }
  }
  const wal = await q(`SELECT id FROM tb_wallet_hs WHERE reforder = $1`, [String(DROP)]);
  if (wal.length) refs.push(`tb_wallet_hs=${wal.length}`);
  if (refs.length) {
    console.log(`❌ แถว #${DROP} ยังมีอ้างอิงอยู่: ${refs.join(" · ")} — หยุด (กันงานหาย)`);
    return;
  }
  console.log(`✓ #${DROP} ไม่มีเอกสาร/เงิน/คนขับ/คิวตรวจ ผูกอยู่เลย — ลบได้\n`);

  // ── 3. staging + box_detail ที่ต้องจัดการ ──
  const staging = await q(
    `SELECT id, momo_tracking_no, committed_forwarder_id
       FROM momo_import_tracks WHERE committed_forwarder_id = $1`,
    [DROP],
  );
  const boxes = await q(
    `SELECT id, box_tracking FROM momo_box_detail WHERE box_tracking = $1`,
    [drop.ftrackingchn],
  );
  console.log(`staging ที่ต้อง re-point → #${KEEP}: ${staging.length} แถว ${staging.map((s) => s.momo_tracking_no).join(", ")}`);
  console.log(`momo_box_detail ที่ต้องลบ: ${boxes.length} แถว\n`);

  if (!APPLY) {
    console.log("── แผนที่จะทำเมื่อ --apply ──");
    console.log(`  1) UPDATE momo_import_tracks SET committed_forwarder_id=${KEEP} WHERE committed_forwarder_id=${DROP}  (${staging.length} แถว)`);
    console.log(`  2) DELETE FROM momo_box_detail WHERE box_tracking='${drop.ftrackingchn}'  (${boxes.length} แถว)`);
    console.log(`  3) DELETE FROM tb_forwarder WHERE id=${DROP}  (1 แถว)`);
    console.log(`\nผลลัพธ์: ตู้ GZE260723-1 เหลือแถวเดียวสำหรับพัสดุนี้ = #${KEEP} ฿${keep.ftotalprice}`);
    console.log("\n🔴 owner เคาะแยกต่างหาก: เรท #53062 = 4,900/คิว แต่เรทกลางวันนี้ = 5,700/คิว");
    console.log("   (ทุน 4,700/คิว → ยังกำไร ฿15.22 · แต่แจ้งชำระลูกค้าไปแล้ว ขึ้นราคา = เก็บเพิ่ม)");
    return;
  }

  // ── 4. backup ก่อนเขียน ──
  const backup = { at: new Date().toISOString(), keep, drop, staging, boxes };
  const bpath = `scripts/_backup-momo-dup-${Date.now()}.json`;
  fs.writeFileSync(bpath, JSON.stringify(backup, null, 2));
  console.log(`💾 backup → ${bpath}\n`);

  await client.query("BEGIN");
  try {
    const up = await client.query(
      `UPDATE momo_import_tracks SET committed_forwarder_id = $1 WHERE committed_forwarder_id = $2`,
      [KEEP, DROP],
    );
    const db = await client.query(`DELETE FROM momo_box_detail WHERE box_tracking = $1`, [drop.ftrackingchn]);
    const df = await client.query(`DELETE FROM tb_forwarder WHERE id = $1`, [DROP]);
    if (df.rowCount !== 1) throw new Error(`คาดว่าลบ 1 แถว แต่ลบ ${df.rowCount} — rollback`);
    await client.query("COMMIT");
    console.log(`✅ staging re-point ${up.rowCount} · box_detail ลบ ${db.rowCount} · tb_forwarder ลบ ${df.rowCount}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ rollback:", e.message);
    throw e;
  }

  // ── 5. verify ──
  const after = await q(
    `SELECT id, ftrackingchn, ftotalprice FROM tb_forwarder
      WHERE fcabinetnumber = 'GZE260723-1' AND userid = 'PR626' ORDER BY id`,
  );
  console.log("\nหลังแก้ — แถวของ PR626 ในตู้ GZE260723-1:");
  after.forEach((r) => console.log(`  #${r.id} ${r.ftrackingchn} ฿${r.ftotalprice}`));
  const dang = await q(
    `SELECT count(*)::int n FROM momo_import_tracks s
      WHERE s.committed_forwarder_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM tb_forwarder f WHERE f.id = s.committed_forwarder_id)`,
  );
  console.log(`staging ที่ชี้แถวที่ไม่มีอยู่ (dangling) ทั้งระบบ: ${dang[0].n}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
