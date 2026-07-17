// READ-ONLY probe (ต่อจาก probe-cnt-payment-bridge) — ตรวจ "ยอดที่ควรจ่ายต่อตู้"
// คำถาม: Σ fcosttotalprice ของตู้ (= ที่ modal เดิม pre-fill) ตรงกับใบแจ้งหนี้รอบนี้ไหม?
//   node scripts/probe-cnt-payment-bridge-b-2026-07-17.mjs
import pg from "pg";

// ── ของจริงจาก INV-20260708-0002 (ground-truth doc §4 · แกะจาก PDF จริง) ──
const INVOICE_SUMS = { "GZS260620-2": 10858.25, "GZE260701-1": 10768.64 };

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

  for (const cab of Object.keys(INVOICE_SUMS)) {
    const { rows } = await c.query(
      `SELECT id, ftrackingchn, userid, fstatus,
              round(coalesce(fcosttotalprice,0)::numeric,2) cost,
              round(coalesce(fvolume,0)::numeric,6) cbm
         FROM tb_forwarder WHERE fcabinetnumber = $1
        ORDER BY cost DESC`,
      [cab],
    );
    const total = rows.reduce((a, r) => a + Number(r.cost), 0);
    const inv = INVOICE_SUMS[cab];
    console.log(`\n════════ ${cab} ════════`);
    console.log(`  แถวในระบบเรา            : ${rows.length}`);
    console.log(`  Σ fcosttotalprice (เรา) : ฿${total.toFixed(2)}   ← ที่ modal เดิม pre-fill`);
    console.log(`  ใบแจ้งหนี้รอบนี้บิล      : ฿${inv.toFixed(2)}`);
    const diff = total - inv;
    console.log(
      `  ส่วนต่าง                : ฿${diff.toFixed(2)} ${
        Math.abs(diff) < 0.02 ? "✓ ตรง" : diff > 0 ? "🔴 เรามากกว่าใบ (ถ้า pre-fill = จ่ายเกิน)" : "🔴 เราน้อยกว่าใบ"
      }`,
    );
    console.log(`  รายแถว:`);
    for (const r of rows) {
      console.log(
        `    #${String(r.id).padEnd(6)} ${String(r.ftrackingchn).padEnd(24)} ${String(r.userid ?? "-").padEnd(8)} ` +
          `st=${r.fstatus ?? "-"} · คิว ${String(r.cbm).padStart(10)} · ต้นทุน ฿${String(r.cost).padStart(10)}`,
      );
    }
  }

  // ── ตู้ไหนบ้างที่ "ต้นทุนลงไม่ครบทุกแถว" = จ่ายทั้งตู้ตอนนี้จะขาด ──
  const { rows: partial } = await c.query(`
    SELECT fcabinetnumber cab, count(*)::int n,
           count(*) FILTER (WHERE coalesce(fcosttotalprice,0) > 0)::int n_costed,
           round(sum(coalesce(fcosttotalprice,0))::numeric,2) cost_sum
      FROM tb_forwarder
     WHERE coalesce(fcabinetnumber,'') <> ''
     GROUP BY fcabinetnumber
    HAVING count(*) FILTER (WHERE coalesce(fcosttotalprice,0) > 0) NOT IN (0, count(*))
     ORDER BY cost_sum DESC`);
  console.log(`\n════ ตู้ที่ลงต้นทุนไม่ครบทุกแถว (จ่ายทั้งตู้ตอนนี้ = ยอดขาด): ${partial.length} ตู้ ════`);
  for (const r of partial) {
    console.log(
      `    ${String(r.cab).padEnd(22)} ลงแล้ว ${String(r.n_costed).padStart(3)}/${String(r.n).padEnd(3)} · Σ ฿${r.cost_sum}`,
    );
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
