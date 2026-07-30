// reconcile-driver-stops-2026-07-29.mjs
//
// owner: "งานที่ไม่สำเร็จของเก่าที่คาอยู่ตอนนี้ มันคืองานที่เสร็จไปหมดแล้วไหม
//         ต้องทำตรงนี้ให้ตรงหมด ไม่งั้นรายงานมันแปลกมาก พนักงานท้อ ค่าคอมไม่ออก"
//
// ผล probe prod (probe-driver-stops-2026-07-29.mjs):
//   • 384 stops "ไม่สำเร็จ/ค้าง" บนงานที่ fstatus='7' (ส่งสำเร็จแล้ว) —
//     372 ตัว (208 fid) มี stop '2' ของรอบอื่นอยู่แล้ว = ประวัติจริง (ล้มรอบแรก
//     แล้วมอบใหม่สำเร็จ) → ไม่แตะ.
//   • 12 stops / 11 fid ไม่มี stop '2' ที่ไหนเลย = ส่งจริงแต่ไม่เคยปิดงานในระบบ
//     (ส่วนใหญ่ staff bulk-flip ส่งสำเร็จจากหลังบ้าน ไม่ผ่านแอปคนขับ) →
//     คนขับไม่ได้เครดิตในรายงาน → FIX: ปิด stop "ตัวล่าสุดต่อ fid" เป็น '2'
//     (fdicompletedat = fdatestatus7 ของงาน) · ตัวเก่ากว่าคงเป็น '3' (ประวัติล้มจริง).
//   • 2 stops fdistatus='1' (ขึ้นรถ) ค้างในรอบที่ปิดไปแล้ว (fdstatus 2/3) บนงาน
//     fstatus='6' → ตีเป็น '3' (= เกณฑ์ cron หมดเวลา) → กลับเข้าคิวมอบใหม่.
//
// GUARDS: dry-run default · --apply เขียน · backup JSON · txn เดียว ·
//         UPDATE ทุกตัว re-check เงื่อนไขใน WHERE (กัน race) · idempotent.
//
// RUN:
//   PGPW='<prod-pw>' node scripts/reconcile-driver-stops-2026-07-29.mjs
//   PGPW='<prod-pw>' node scripts/reconcile-driver-stops-2026-07-29.mjs --apply
import { writeFileSync } from "node:fs";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
if (!process.env.PGPW) { console.error("ต้องส่ง PGPW"); process.exit(1); }

const pool = new pg.Pool({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: process.env.PGPW,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const NOTE_CLOSE = " [ปิดตามสถานะงานส่งสำเร็จ (fstatus=7) — reconcile 2026-07-29]";
const NOTE_FAIL = " [รอบปิดแล้วแต่ stop ค้างสถานะขึ้นรถ → ตีเป็นไม่สำเร็จ กลับเข้าคิวมอบใหม่ — reconcile 2026-07-29]";

async function main() {
  // ── เป้า 1: stops ที่ต้องปิด '2' — งาน fstatus=7 · ไม่มี stop '2' ที่ไหนเลย ·
  //    เลือกตัวล่าสุด (id มากสุด) ต่อ fid ──
  const { rows: closeTargets } = await pool.query(`
    SELECT DISTINCT ON (i.fid)
           i.id AS item_id, i.fid, i.fdistatus, i.fdid, i.fdinote,
           f.ftrackingchn, f.userid, f.fdatestatus7
    FROM tb_forwarder_driver_item i
    JOIN tb_forwarder f ON f.id = i.fid
    WHERE f.fstatus = '7'
      AND COALESCE(i.fdistatus,'') <> '2'
      AND NOT EXISTS (
        SELECT 1 FROM tb_forwarder_driver_item i2
        WHERE i2.fid = i.fid AND i2.fdistatus = '2'
      )
    ORDER BY i.fid, i.id DESC
  `);

  // ── เป้า 2: stops '1' ค้างในรอบที่ปิดแล้ว → '3' ──
  const { rows: failTargets } = await pool.query(`
    SELECT i.id AS item_id, i.fid, i.fdistatus, i.fdid, i.fdinote,
           d.fdstatus AS batch_status, f.fstatus AS fwd_status, f.ftrackingchn, f.userid
    FROM tb_forwarder_driver_item i
    JOIN tb_forwarder_driver d ON d.id = i.fdid
    JOIN tb_forwarder f ON f.id = i.fid
    WHERE COALESCE(i.fdistatus,'') IN ('', '1')
      AND d.fdstatus <> '1'
      AND f.fstatus <> '7'
    ORDER BY i.id
  `);

  console.log(`เป้า 1 — ปิดเป็น '2' (ส่งจริงแต่ไม่เคยปิดงาน): ${closeTargets.length} stops`);
  console.table(closeTargets.map((r) => ({
    item: r.item_id, fid: r.fid, from: r.fdistatus, tracking: r.ftrackingchn,
    userid: r.userid, delivered_at: r.fdatestatus7,
  })));
  console.log(`เป้า 2 — ตีเป็น '3' (ค้างขึ้นรถในรอบที่ปิดแล้ว): ${failTargets.length} stops`);
  console.table(failTargets.map((r) => ({
    item: r.item_id, fid: r.fid, from: r.fdistatus, batch: r.fdid,
    batch_status: r.batch_status, fwd: r.fwd_status, tracking: r.ftrackingchn,
  })));

  if (!APPLY) { console.log("\n(dry-run — ใส่ --apply เพื่อเขียนจริง)"); return; }
  if (closeTargets.length === 0 && failTargets.length === 0) { console.log("ไม่มีอะไรต้องแก้ ✓"); return; }

  const backupPath = `/tmp/backup-driver-stops-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify({ closeTargets, failTargets }, null, 2));
  console.log(`\nbackup → ${backupPath}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let closed = 0;
    for (const t of closeTargets) {
      // re-check เงื่อนไขทั้งหมดใน WHERE — งานต้องยัง 7 · stop ต้องยังไม่ '2' ·
      // และยังต้องไม่มี stop '2' ของ fid นี้เกิดขึ้นระหว่างรัน
      const res = await client.query(
        `UPDATE tb_forwarder_driver_item i
         SET fdistatus = '2',
             fdicompletedat = COALESCE(f.fdatestatus7, NOW()),
             fdinote = COALESCE(i.fdinote,'') || $2
         FROM tb_forwarder f
         WHERE i.id = $1 AND f.id = i.fid
           AND f.fstatus = '7'
           AND COALESCE(i.fdistatus,'') <> '2'
           AND NOT EXISTS (
             SELECT 1 FROM tb_forwarder_driver_item i2
             WHERE i2.fid = i.fid AND i2.fdistatus = '2' AND i2.id <> i.id
           )`,
        [t.item_id, NOTE_CLOSE],
      );
      closed += res.rowCount ?? 0;
    }
    let failed = 0;
    for (const t of failTargets) {
      const res = await client.query(
        `UPDATE tb_forwarder_driver_item i
         SET fdistatus = '3',
             fdinote = COALESCE(i.fdinote,'') || $2
         FROM tb_forwarder_driver d
         WHERE i.id = $1 AND d.id = i.fdid
           AND COALESCE(i.fdistatus,'') IN ('', '1')
           AND d.fdstatus <> '1'`,
        [t.item_id, NOTE_FAIL],
      );
      failed += res.rowCount ?? 0;
    }
    await client.query("COMMIT");
    console.log(`✅ ปิดเป็น '2': ${closed}/${closeTargets.length} · ตีเป็น '3': ${failed}/${failTargets.length}`);
    console.log(`   (ตัวที่ไม่ตรง guard = มีคนแตะระหว่างรัน → ข้ามไว้ปลอดภัย)`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
