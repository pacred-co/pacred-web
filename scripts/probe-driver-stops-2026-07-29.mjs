// READ-ONLY probe — ขนาดของ bucket งานคนขับที่ค้าง (owner 2026-07-29)
// A: forwarder ส่งสำเร็จแล้ว (fstatus=7) แต่ stop คนขับค้าง ''/'1'/'3'
// B: stop ปิดแล้ว ('2') แต่ forwarder ยังค้าง 6 (ค่าคอม/สถานะไม่เดิน)
// C: stop เปิด (''/'1') ในรอบที่ปิดแล้ว (fdstatus != '1') — '1' = ค้างถาวร
// D: stop '3' + forwarder 6 = วนกลับคิวถูกต้อง (ข้อมูลเฉยๆ)
// E: forwarder 7 ของลูกค้า VIP-coID แต่ไม่มีแถว tb_user_sales = ค่าคอมไม่ออก
import pg from "pg";

const pool = new pg.Pool({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: process.env.PGPW,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const q = async (label, sql, params = []) => {
  const { rows } = await pool.query(sql, params);
  console.log(`\n── ${label} ──`);
  console.table(rows.slice(0, 25));
  return rows;
};

// A — delivered forwarder, stale stop
await q("A: fstatus=7 + stop ค้าง (นับต่อสถานะ stop)", `
  SELECT i.fdistatus AS stop, d.fdstatus AS batch, COUNT(*) AS n
  FROM tb_forwarder_driver_item i
  JOIN tb_forwarder f ON f.id = i.fid
  LEFT JOIN tb_forwarder_driver d ON d.id = i.fdid
  WHERE f.fstatus = '7' AND COALESCE(i.fdistatus,'') <> '2'
  GROUP BY 1, 2 ORDER BY n DESC
`);
await q("A sample (10)", `
  SELECT i.id AS item, i.fid, i.fdistatus AS stop, d.id AS batch, d.fdstatus,
         f.ftrackingchn, f.userid, f.fdatestatus7, f.fphotoend <> '' AS has_photo
  FROM tb_forwarder_driver_item i
  JOIN tb_forwarder f ON f.id = i.fid
  LEFT JOIN tb_forwarder_driver d ON d.id = i.fdid
  WHERE f.fstatus = '7' AND COALESCE(i.fdistatus,'') <> '2'
  ORDER BY i.id DESC LIMIT 10
`);

// B — stop delivered, forwarder stuck
await q("B: stop='2' + forwarder ยังไม่ 7 (นับต่อ fstatus + หลักฐานรูป)", `
  SELECT f.fstatus, f.fphotoend <> '' AS has_photo, COUNT(*) AS n
  FROM tb_forwarder_driver_item i
  JOIN tb_forwarder f ON f.id = i.fid
  WHERE i.fdistatus = '2' AND f.fstatus <> '7'
  GROUP BY 1, 2 ORDER BY n DESC
`);
await q("B sample (15)", `
  SELECT i.id AS item, i.fid, f.fstatus, f.ftrackingchn, f.userid,
         f.fphotoend <> '' AS has_photo, i.fdipictureoff <> '' AS stop_photo,
         i.fdicompletedat, f.paydeposit
  FROM tb_forwarder_driver_item i
  JOIN tb_forwarder f ON f.id = i.fid
  WHERE i.fdistatus = '2' AND f.fstatus <> '7'
  ORDER BY i.id DESC LIMIT 15
`);

// C — open stops in closed batches
await q("C: stop เปิด (''/'1'/null) ในรอบที่ปิดแล้ว", `
  SELECT i.fdistatus AS stop, d.fdstatus AS batch_status, f.fstatus AS fwd, COUNT(*) AS n
  FROM tb_forwarder_driver_item i
  JOIN tb_forwarder_driver d ON d.id = i.fdid
  JOIN tb_forwarder f ON f.id = i.fid
  WHERE COALESCE(i.fdistatus,'') IN ('', '1') AND d.fdstatus <> '1'
  GROUP BY 1, 2, 3 ORDER BY n DESC
`);

// C2 — open stops in OPEN batches past their endtime (cron miss / not yet run)
await q("C2: stop เปิดในรอบเปิดที่เลย endtime แล้ว", `
  SELECT i.fdistatus AS stop, f.fstatus AS fwd, COUNT(*) AS n
  FROM tb_forwarder_driver_item i
  JOIN tb_forwarder_driver d ON d.id = i.fdid
  JOIN tb_forwarder f ON f.id = i.fid
  WHERE COALESCE(i.fdistatus,'') IN ('', '1') AND d.fdstatus = '1' AND d.endtime < NOW()
  GROUP BY 1, 2 ORDER BY n DESC
`);

// D — correctly requeued
await q("D: stop='3' + forwarder 6 (วนกลับคิว — ข้อมูลเฉยๆ)", `
  SELECT f.paydeposit, COUNT(*) AS n
  FROM tb_forwarder_driver_item i
  JOIN tb_forwarder f ON f.id = i.fid
  WHERE i.fdistatus = '3' AND f.fstatus = '6'
  GROUP BY 1
`);

// A2 — ใน 384 นั้น กี่ fid ที่ "ไม่มี stop '2' ที่ไหนเลย" (= ไม่เคยถูกปิดงานสักรอบ)
await q("A2: fstatus=7 + stop ค้าง แยก มี/ไม่มี stop '2' ที่อื่น", `
  SELECT EXISTS (
           SELECT 1 FROM tb_forwarder_driver_item i2
           WHERE i2.fid = i.fid AND i2.fdistatus = '2'
         ) AS has_delivered_stop_elsewhere,
         COUNT(*) AS stale_stops, COUNT(DISTINCT i.fid) AS fids
  FROM tb_forwarder_driver_item i
  JOIN tb_forwarder f ON f.id = i.fid
  WHERE f.fstatus = '7' AND COALESCE(i.fdistatus,'') <> '2'
  GROUP BY 1
`);

// E — commission missing (VIP coID delivered, no tb_user_sales)
await q("E: fstatus=7 ลูกค้า VIP-coID ไม่มีแถว tb_user_sales (ค่าคอมไม่ออก)", `
  SELECT u."coID" AS coid, COUNT(*) AS n
  FROM tb_forwarder f
  JOIN tb_users u ON u."userID" = f.userid
  WHERE f.fstatus = '7'
    AND u."coID" IN ('THADA.VIP','SIN.VIP','OOAEOM.VIP','SWAN')
    AND NOT EXISTS (SELECT 1 FROM tb_user_sales s WHERE s.idf = f.id)
  GROUP BY 1 ORDER BY n DESC
`);
await q("E sample (10)", `
  SELECT f.id, f.userid, u."coID" AS coid, f.ftrackingchn, f.fdatestatus7
  FROM tb_forwarder f
  JOIN tb_users u ON u."userID" = f.userid
  WHERE f.fstatus = '7'
    AND u."coID" IN ('THADA.VIP','SIN.VIP','OOAEOM.VIP','SWAN')
    AND NOT EXISTS (SELECT 1 FROM tb_user_sales s WHERE s.idf = f.id)
  ORDER BY f.id DESC LIMIT 10
`);

// batches stuck in-progress past endtime (report weirdness)
await q("รอบค้าง 'กำลังดำเนินการ' เลย endtime", `
  SELECT d.id, d.fdname, d.fdstatus, d.endtime,
         COUNT(*) FILTER (WHERE i.fdistatus = '2') AS delivered,
         COUNT(*) FILTER (WHERE COALESCE(i.fdistatus,'') IN ('','1')) AS open_stops,
         COUNT(*) FILTER (WHERE i.fdistatus = '3') AS failed
  FROM tb_forwarder_driver d
  LEFT JOIN tb_forwarder_driver_item i ON i.fdid = d.id
  WHERE d.fdstatus = '1' AND d.endtime < NOW()
  GROUP BY d.id, d.fdname, d.fdstatus, d.endtime
  ORDER BY d.id DESC LIMIT 20
`);

await pool.end();
