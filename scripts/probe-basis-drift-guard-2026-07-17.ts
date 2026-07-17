// READ-ONLY probe — เลน B: จะ block กี่แถวจริงบน prod ที่ threshold ต่างๆ
// ใช้ decider ตัวจริง (resolveMomoBoxBasis) ไม่ re-implement (กัน drift)
//   pnpm tsx scripts/probe-basis-drift-guard-2026-07-17.ts
import pg from "pg";
import { resolveMomoBoxBasis } from "../lib/integrations/momo-web/box-detail-basis";

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
function relDiff(a: number, b: number): number {
  const d = Math.max(Math.abs(a), Math.abs(b));
  if (d < 1e-9) return 0;
  return Math.abs(a - b) / d;
}

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

  // ทุกแถว tb_forwarder + box ของมัน (exact box_tracking) — per-row ไม่ใช่ Σ
  const { rows } = await c.query(`
    SELECT f.id, f.userid, f.fstatus, f.ftrackingchn, f.fcabinetnumber,
           f.fweight, f.fvolume, f.famount, f.famountcount, f.ftotalprice,
           d.width, d.length, d.height, d.weight_kg, d.cbm, d.quantity
      FROM tb_forwarder f
      LEFT JOIN momo_box_detail d ON d.box_tracking = f.ftrackingchn
     ORDER BY f.id`);

  const TOLS = [0.02, 0.05, 0.10];
  const stats: Record<string, { block: number; money: number; ids: number[] }> = {};
  for (const t of TOLS) stats[String(t)] = { block: 0, money: 0, ids: [] };

  let noBox = 0, zeroBasis = 0, undecided = 0, oneSideZero = 0, ok = 0;
  const blockRows: any[] = [];

  for (const r of rows) {
    const fw = num(r.fweight), fv = num(r.fvolume);
    // zero-basis guard เดิมจับก่อน (ทั้งคู่ = 0) → ไม่ถึง guard เรา
    if (!(fw > 0) && !(fv > 0)) { zeroBasis++; continue; }
    if (r.weight_kg == null && r.cbm == null && r.quantity == null) { noBox++; continue; }

    const basis = resolveMomoBoxBasis({
      width: r.width, length: r.length, height: r.height,
      weightKg: r.weight_kg, cbm: r.cbm, quantity: r.quantity,
    });
    if (!basis.decided) { undecided++; continue; }

    const ew = basis.totalWeightKg, ev = basis.totalCbm;
    // เทียบเฉพาะช่องที่ทั้ง 2 ฝั่ง > 0 (0 = ข้อมูลขาด ไม่ใช่ drift)
    const cmpW = fw > 0 && ew > 0, cmpV = fv > 0 && ev > 0;
    if (!cmpW && !cmpV) { oneSideZero++; continue; }

    const dw = cmpW ? relDiff(fw, ew) : 0;
    const dv = cmpV ? relDiff(fv, ev) : 0;
    const worst = Math.max(dw, dv);

    let blockedAtAny = false;
    for (const t of TOLS) {
      if (worst > t) {
        stats[String(t)].block++;
        if (num(r.ftotalprice) > 0) stats[String(t)].money++;
        stats[String(t)].ids.push(r.id);
        blockedAtAny = true;
      }
    }
    if (blockedAtAny) {
      blockRows.push({ id: r.id, tr: r.ftrackingchn, cab: r.fcabinetnumber, st: r.fstatus,
        user: r.userid, fw, ew, fv, ev, dw, dv, worst, price: num(r.ftotalprice),
        conv: basis.convention, qty: basis.pieces });
    } else ok++;
  }

  console.log(`\n════════ tb_forwarder ${rows.length} แถว (join box_tracking) ════════`);
  console.log(`ไม่มี box_detail (ข้าม · ปล่อยผ่าน)      = ${noBox}`);
  console.log(`ฐาน=0 ทั้งคู่ (guard เดิมจับก่อน)          = ${zeroBasis}`);
  console.log(`basis undecidable (ข้าม · ปล่อยผ่าน)     = ${undecided}`);
  console.log(`ฝั่งใดฝั่งหนึ่ง=0 (ข้าม · ปล่อยผ่าน)        = ${oneSideZero}`);
  console.log(`เทียบได้ + ผ่าน                           = ${ok}`);
  for (const t of TOLS) {
    const s = stats[String(t)];
    console.log(`🔴 BLOCK ที่ tol ${(t * 100).toFixed(0)}%  = ${s.block} แถว (มีราคาแล้ว ${s.money})`);
  }

  blockRows.sort((a, b) => b.price - a.price);
  console.log(`\n════════ แถวที่จะโดน block (tol 2%) — เรียงตามเงิน ════════`);
  for (const b of blockRows.slice(0, 40)) {
    console.log(
      `#${b.id} ${b.tr} [${b.cab ?? "-"}] st=${b.st} ${b.user} ฿${b.price.toFixed(2)} ` +
      `| นน. ${b.fw} vs ${b.ew} (${(b.dw * 100).toFixed(1)}%) ` +
      `| คิว ${b.fv} vs ${b.ev} (${(b.dv * 100).toFixed(1)}%) ` +
      `| ${b.conv} qty=${b.qty} | ratio นน.=${b.ew > 0 ? (b.fw / b.ew).toFixed(2) : "-"}x คิว=${b.ev > 0 ? (b.fv / b.ev).toFixed(2) : "-"}x`);
  }
  console.log(`\nรวม block (2%) = ${blockRows.length} แถว`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
