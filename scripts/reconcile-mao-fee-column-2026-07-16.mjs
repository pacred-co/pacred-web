// ════════════════════════════════════════════════════════════════════════════
// RECONCILE — เหมาๆ ฿100 booked into the WRONG invoice column.
// owner 2026-07-16: "เอกสารมันไม่แจงค่าเหมาๆ · ระวังไปเก็บซ้ำด้วยนะครับเหมาๆ"
//
// WHY THIS MUST RUN WITH THE CODE FIX (not after):
//   The engine used to return maoFee=0 for a MOMO split-at-commit shipment (no bare base
//   row → nothing could anchor). Staff worked around it by hand-typing ฿100 into the
//   free-text "ค่าขนส่งไทย" field → it landed in `delivery_th_thb` while `mao_fee_thb`
//   stayed 0.00. The papers itemise เหมาๆ from mao_fee_thb → the line never rendered
//   (the owner's "ไม่แจงค่าเหมาๆ"), and the fee hid inside "ค่าขนส่งในไทย".
//   Now that the per-shipment anchor makes autoMaoFee = 100, a bill that ALSO carries the
//   manual delivery_th_thb=100 would total subtotal + 100 (mao) + 100 (delivery) = ฿200
//   of เหมาๆ — EXACTLY the double-charge the owner warned about.
//
// WHAT IT DOES: move the ฿100 from delivery_th_thb → mao_fee_thb on invoices where it IS
// the เหมาๆ. total_thb is NOT touched → MONEY-NEUTRAL (the customer owes the same baht);
// only the column changes, so the "ค่าส่งเหมาๆ (PCSF)" line finally renders.
//
// ELIGIBILITY (all must hold — else skip and report):
//   • delivery_th_thb > 0 AND mao_fee_thb = 0
//   • delivery_th_thb == the เหมาๆ flat fee exactly (100 · or 50 for the legacy rate)
//   • EVERY billed row is a เหมาๆ carrier (PCSF/PRF) with ftransportprice = 0
//     → so the ฿100 cannot be a real courier charge. FRI2606-00008 (Flash, rows carry
//       ฿165 of real Thai shipping) is correctly SKIPPED by this rule.
//   • the invoice is not cancelled
//
// RUN:  node scripts/reconcile-mao-fee-column-2026-07-16.mjs           (dry-run)
//       node scripts/reconcile-mao-fee-column-2026-07-16.mjs --apply
// ════════════════════════════════════════════════════════════════════════════
import { writeFileSync } from "node:fs";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const MAO_FEES = [100, 50];           // current flat fee + the legacy ฿50
const MAO_CARRIERS = ["PCSF", "PRF"]; // เหมาๆ own-fleet (PRF = the D1 rebrand of PCSF)

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }
  await c.connect();

  const { rows: cands } = await c.query(`
    SELECT i.id, i.doc_no, i.status, i.subtotal_thb, i.delivery_th_thb, i.mao_fee_thb, i.total_thb,
           count(f.id)                                              AS rows_n,
           count(f.id) FILTER (WHERE f.fshipby = ANY($1)
                                 AND COALESCE(f.ftransportprice,0) = 0) AS mao_rows,
           COALESCE(SUM(f.ftransportprice),0)                       AS th_ship_on_rows,
           string_agg(DISTINCT COALESCE(NULLIF(f.fshipby,''),'(ว่าง)'), ',') AS carriers
      FROM tb_forwarder_invoice i
      JOIN tb_forwarder_invoice_item it ON it.invoice_id = i.id
      JOIN tb_forwarder f               ON f.id = it.forwarder_id
     WHERE COALESCE(i.delivery_th_thb,0) > 0
       AND COALESCE(i.mao_fee_thb,0) = 0
       AND i.status <> 'cancelled'
     GROUP BY i.id, i.doc_no, i.status, i.subtotal_thb, i.delivery_th_thb, i.mao_fee_thb, i.total_thb
     ORDER BY i.id DESC`, [MAO_CARRIERS]);

  const move = [], skip = [];
  for (const r of cands) {
    const dth = Number(r.delivery_th_thb);
    const allMao = Number(r.rows_n) > 0 && Number(r.mao_rows) === Number(r.rows_n);
    const noRealThShip = Number(r.th_ship_on_rows) === 0;
    if (!MAO_FEES.includes(dth)) { skip.push({ ...r, why: `ยอด ${dth} ไม่ใช่ค่าเหมาๆ (${MAO_FEES.join("/")})` }); continue; }
    if (!allMao)      { skip.push({ ...r, why: `ไม่ใช่เหมาๆ ทุกแถว (carriers: ${r.carriers})` }); continue; }
    if (!noRealThShip) { skip.push({ ...r, why: `แถวมีค่าส่งไทยจริง ฿${r.th_ship_on_rows}` }); continue; }
    move.push(r);
  }

  console.log(`📋 ย้ายช่อง delivery_th_thb → mao_fee_thb (money-neutral · total ไม่เปลี่ยน): ${move.length} ใบ`);
  for (const m of move) {
    console.log(`   ${m.doc_no} (id ${m.id} · ${m.status}) — ฿${m.delivery_th_thb} · ${m.rows_n} แถว ${m.carriers} · total ${m.total_thb} (คงเดิม)`);
  }
  if (skip.length) {
    console.log(`\n⏭️  ข้าม (฿100 ไม่ใช่เหมาๆ · ปล่อยไว้ถูกแล้ว): ${skip.length} ใบ`);
    for (const s of skip) console.log(`   ${s.doc_no} — ${s.why}`);
  }
  if (!APPLY) { console.log(`\n(dry-run — ใส่ --apply เพื่อเขียนจริง)`); await c.end(); return; }
  if (move.length === 0) { console.log("\nไม่มีอะไรต้องแก้"); await c.end(); return; }

  const ids = move.map((m) => Number(m.id));
  const { rows: bak } = await c.query(`SELECT * FROM tb_forwarder_invoice WHERE id = ANY($1)`, [ids]);
  writeFileSync("scripts/_backup-mao-fee-column-2026-07-16.json", JSON.stringify(bak, null, 2));
  console.log(`\n💾 backup → scripts/_backup-mao-fee-column-2026-07-16.json (${bak.length} ใบ)`);

  await c.query("BEGIN");
  try {
    // Guard the UPDATE on the exact values we read so a concurrent edit can't be clobbered,
    // and assert total_thb is preserved (money-neutral by construction).
    let n = 0;
    for (const m of move) {
      const res = await c.query(
        `UPDATE tb_forwarder_invoice
            SET mao_fee_thb = delivery_th_thb, delivery_th_thb = 0
          WHERE id = $1 AND delivery_th_thb = $2 AND COALESCE(mao_fee_thb,0) = 0`,
        [Number(m.id), Number(m.delivery_th_thb)]);
      if (res.rowCount === 1) n++;
      else console.log(`   ⚠️ ${m.doc_no} ไม่ถูกเขียน (ข้อมูลเปลี่ยนระหว่างรัน) — ข้าม`);
    }
    const { rows: check } = await c.query(
      `SELECT count(*) bad FROM tb_forwarder_invoice
        WHERE id = ANY($1)
          AND ROUND(subtotal_thb + COALESCE(mao_fee_thb,0) + COALESCE(delivery_chn_thb,0)
                  + COALESCE(delivery_th_thb,0) + COALESCE(other_thb,0) - COALESCE(discount_thb,0), 2)
              <> ROUND(total_thb, 2)`, [ids]);
    if (Number(check[0].bad) > 0) throw new Error(`INVARIANT FAIL: ${check[0].bad} ใบ ยอดไม่ foot หลังย้าย`);
    await c.query("COMMIT");
    console.log(`\n✅ ย้ายแล้ว ${n}/${move.length} ใบ · ยอดรวมทุกใบ foot ตรง (money-neutral ✓)`);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("❌ ROLLBACK:", e.message);
    process.exit(1);
  }
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
