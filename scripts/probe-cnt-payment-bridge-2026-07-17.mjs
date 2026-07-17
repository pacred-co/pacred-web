// READ-ONLY probe — เลน A "ตัดจ่ายค่าตู้"
// ตรวจสมมติฐานของ task ก่อนสร้างอะไร (§0b — อย่าเชื่อ brief · ดู prod จริง)
//   node scripts/probe-cnt-payment-bridge-2026-07-17.mjs
import pg from "pg";

async function main() {
  const c = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com",
    port: 5432,
    user: "postgres.yzljakczhwrpbxflnmco",
    password: "DqOzfEZVXfMHIryz",
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // ── 1. tb_cnt family ว่างจริงไหม (brief: "ไม่เคยจ่ายค่าตู้ผ่านระบบเลยสักตู้") ──
  const { rows: counts } = await c.query(`
    SELECT 'tb_cnt' t, count(*)::int n FROM tb_cnt
    UNION ALL SELECT 'tb_cnt_item', count(*)::int FROM tb_cnt_item
    UNION ALL SELECT 'tb_cnt_pay_idorco', count(*)::int FROM tb_cnt_pay_idorco
    UNION ALL SELECT 'tb_cnt_pay_trackingchn', count(*)::int FROM tb_cnt_pay_trackingchn`);
  console.log("\n════ 1. ตาราง จ่ายค่าตู้ (tb_cnt family) ════");
  for (const r of counts) console.log(`  ${r.t.padEnd(24)} = ${r.n} แถว`);

  // ── 2. ตู้ทั้งหมด + ต้นทุนที่ลงไว้ + จ่ายหรือยัง ──
  const { rows: cabs } = await c.query(`
    SELECT f.fcabinetnumber                                  AS cab,
           count(*)::int                                     AS n_rows,
           round(sum(coalesce(f.fcosttotalprice,0))::numeric,2) AS cost_sum,
           count(*) FILTER (WHERE coalesce(f.fcosttotalprice,0) > 0)::int AS n_costed,
           (ci."fCabinetNumber" IS NOT NULL)                 AS is_paid
      FROM tb_forwarder f
      LEFT JOIN tb_cnt_item ci ON ci."fCabinetNumber" = f.fcabinetnumber
     WHERE coalesce(f.fcabinetnumber,'') <> ''
     GROUP BY f.fcabinetnumber, ci."fCabinetNumber"
     ORDER BY cost_sum DESC`);
  console.log(`\n════ 2. ตู้ทั้งหมด: ${cabs.length} ตู้ ════`);
  const paid = cabs.filter((r) => r.is_paid).length;
  const costed = cabs.filter((r) => Number(r.cost_sum) > 0).length;
  console.log(`  จ่ายค่าตู้แล้ว (มีใน tb_cnt_item) = ${paid} ตู้`);
  console.log(`  มีต้นทุนลงแล้วบางส่วน            = ${costed} ตู้`);
  console.log(`  ต้นทุนลงครบทุกแถว               = ${cabs.filter((r) => r.n_costed === r.n_rows).length} ตู้`);
  console.log("\n  10 ตู้ที่ต้นทุนสูงสุด:");
  for (const r of cabs.slice(0, 10)) {
    console.log(
      `    ${String(r.cab).padEnd(22)} ${String(r.n_rows).padStart(3)} แถว · ` +
        `ลงต้นทุนแล้ว ${String(r.n_costed).padStart(3)}/${String(r.n_rows).padEnd(3)} · ` +
        `Σ ฿${String(r.cost_sum).padStart(12)} · ${r.is_paid ? "จ่ายแล้ว" : "ยังไม่จ่าย"}`,
    );
  }

  // ── 3. 2 ตู้ของใบ INV-20260708-0002 (ground-truth doc §4) ──
  console.log("\n════ 3. ตู้ของใบ INV-20260708-0002 (ตรวจ pre-fill ที่จะทำ) ════");
  for (const cab of ["GZS260620-2", "GZE260701-1"]) {
    const { rows } = await c.query(
      `SELECT count(*)::int n,
              round(sum(coalesce(fcosttotalprice,0))::numeric,2) cost_sum,
              count(*) FILTER (WHERE coalesce(fcosttotalprice,0) > 0)::int n_costed
         FROM tb_forwarder WHERE fcabinetnumber = $1`,
      [cab],
    );
    const { rows: pay } = await c.query(
      `SELECT "cntID" FROM tb_cnt_item WHERE "fCabinetNumber" = $1`,
      [cab],
    );
    const r = rows[0];
    console.log(
      `  ${cab.padEnd(14)} เรามี ${r.n} แถว · ลงต้นทุนแล้ว ${r.n_costed}/${r.n} · ` +
        `Σ ต้นทุน ฿${r.cost_sum} · ${pay.length ? `จ่ายแล้ว (cnt #${pay[0].cntID})` : "ยังไม่จ่าย"}`,
    );
  }

  // ── 4. เลขตู้แปลกๆ ที่อาจพัง pre-fill (มี comma อยู่ในชื่อตู้เอง?) ──
  const { rows: weird } = await c.query(`
    SELECT DISTINCT fcabinetnumber cab FROM tb_forwarder
     WHERE fcabinetnumber LIKE '%,%' OR fcabinetnumber LIKE '% %'`);
  console.log(`\n════ 4. เลขตู้ที่มี comma/space (จะพัง CSV pre-fill): ${weird.length} ════`);
  for (const r of weird.slice(0, 10)) console.log(`    "${r.cab}"`);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
