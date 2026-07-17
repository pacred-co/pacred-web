/**
 * probe-reportcnt-databugs-2026-07-18.mjs — READ-ONLY prod probe.
 * Owner 2026-07-18: "ไล่แก้ กล่อง · ข้อมูลบัค · รายการตรวจสอบ · ราคา/ต้นทุนติดลบ · fill ครบ".
 * Surfaces the ACTUAL data problems so we fix only what's real (no invented numbers).
 * RUN: SUPABASE_DB_PASSWORD=… node scripts/probe-reportcnt-databugs-2026-07-18.mjs
 */
import pg from "pg";
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }
const c = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(PW)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});

async function q(label, sql) {
  const { rows } = await c.query(sql);
  console.log(`\n━━ ${label} ━━ (${rows.length} rows)`);
  console.table(rows);
  return rows;
}

async function main() {
  await c.connect();

  // 1) NEGATIVE money — cost / price / anything below 0 on non-cancelled rows.
  await q("1a. tb_forwarder NEGATIVE fcosttotalprice (non-99)", `
    SELECT id, userid, fcabinetnumber, ftrackingchn, fstatus,
           fcosttotalprice, ftotalprice, fweight, fvolume, famount
    FROM tb_forwarder
    WHERE fstatus <> '99' AND fcosttotalprice::numeric < 0
    ORDER BY fcosttotalprice::numeric ASC LIMIT 50`);
  await q("1b. tb_forwarder NEGATIVE ftotalprice (ราคาขายติดลบ)", `
    SELECT id, userid, fcabinetnumber, ftrackingchn, fstatus,
           fcosttotalprice, ftotalprice, fweight, fvolume, famount
    FROM tb_forwarder
    WHERE fstatus <> '99' AND ftotalprice::numeric < 0
    ORDER BY ftotalprice::numeric ASC LIMIT 50`);

  // 2) Per-container cost/profit rollup — spot containers whose profit is negative
  //    (ราคาขายรวม < ต้นทุนรวม) → the "กำไรติดลบ" the owner sees on report-cnt.
  await q("2. containers with NEGATIVE profit (Σsell < Σcost · non-99 · has cabinet)", `
    SELECT fcabinetnumber,
           count(*) rows,
           round(sum(ftotalprice::numeric),2)      sum_sell,
           round(sum(fcosttotalprice::numeric),2)  sum_cost,
           round(sum(ftotalprice::numeric) - sum(fcosttotalprice::numeric),2) profit,
           min(fstatus) minf, max(fstatus) maxf
    FROM tb_forwarder
    WHERE fstatus <> '99' AND fcabinetnumber NOT IN ('','0') AND fcabinetnumber IS NOT NULL
    GROUP BY fcabinetnumber
    HAVING sum(ftotalprice::numeric) - sum(fcosttotalprice::numeric) < 0
    ORDER BY profit ASC LIMIT 40`);

  // 3) BOX COUNT mismatch — tb_forwarder famount vs momo_box_detail Σquantity per base,
  //    for UNBILLED rows only (fstatus < '5' — safe to correct display).
  await q("3. box-count mismatch (unbilled base vs momo_box_detail · top 40)", `
    WITH bd AS (
      SELECT split_part(momo_tracking_no,'-',1) base,
             sum(quantity)::int qty, count(*) detail_rows
      FROM momo_box_detail GROUP BY 1
    ), fw AS (
      SELECT split_part(ftrackingchn,'-',1) base,
             sum(famount::int) fw_amount, count(*) fw_rows,
             min(fstatus) minf, max(fstatus) maxf,
             max(fcabinetnumber) cab
      FROM tb_forwarder WHERE fstatus <> '99' AND ftrackingchn <> ''
      GROUP BY 1
    )
    SELECT fw.base, fw.cab, fw.fw_rows, fw.fw_amount AS fw_boxes,
           bd.qty AS momo_boxes, bd.detail_rows, fw.minf, fw.maxf
    FROM fw JOIN bd ON bd.base = fw.base
    WHERE fw.fw_amount <> bd.qty AND fw.maxf < '5'
    ORDER BY abs(fw.fw_amount - bd.qty) DESC LIMIT 40`);

  // 4) INSPECTION QUEUE (tb_check_forwarder) — stale entries: rows in the check
  //    queue whose forwarder is ALREADY paid/settled (fstatus >= '6') = should
  //    have been cleared. (The queue should hold only not-yet-collected work.)
  await q("4a. tb_check_forwarder — total + status histogram of its forwarders", `
    SELECT f.fstatus, count(*) n
    FROM tb_check_forwarder ck
    JOIN tb_forwarder f ON f.id = ck.fid
    GROUP BY f.fstatus ORDER BY f.fstatus`);
  await q("4b. tb_check_forwarder — STALE (forwarder already fstatus>=6)", `
    SELECT ck.id ck_id, ck.fid, f.userid, f.fcabinetnumber, f.fstatus, f.ftrackingchn
    FROM tb_check_forwarder ck
    JOIN tb_forwarder f ON f.id = ck.fid
    WHERE f.fstatus >= '6' AND f.fstatus <> '99'
    ORDER BY f.fstatus DESC LIMIT 50`);
  await q("4c. tb_check_forwarder — orphan (fid points to a deleted/cancelled forwarder)", `
    SELECT ck.id ck_id, ck.fid
    FROM tb_check_forwarder ck
    LEFT JOIN tb_forwarder f ON f.id = ck.fid
    WHERE f.id IS NULL OR f.fstatus = '99' LIMIT 50`);

  // 5) tb_cnt cost rollup vs report-cnt cost — how many arrived containers still
  //    have Σcost=0 (the "ต้นทุนตู้ 0.00" the owner sees) — INFORMATIONAL (needs MOMO invoice).
  await q("5. arrived containers (max fstatus>=4) with Σcost = 0", `
    SELECT count(*) n_containers
    FROM (
      SELECT fcabinetnumber, sum(fcosttotalprice::numeric) sc, max(fstatus) mx
      FROM tb_forwarder
      WHERE fstatus <> '99' AND fcabinetnumber NOT IN ('','0') AND fcabinetnumber IS NOT NULL
      GROUP BY fcabinetnumber
      HAVING max(fstatus) >= '4' AND sum(fcosttotalprice::numeric) = 0
    ) t`);

  await c.end();
  console.log("\n✅ probe done (read-only)");
}
main().catch((e) => { console.error(e); process.exit(1); });
