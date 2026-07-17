/**
 * READ-ONLY probe — วัดผล guard "ฐานเพี้ยน ห้าม re-price" บน prod จริง
 * ใช้ evaluateBasisDrift ตัวจริง + query แบบเดียวกับ live-rate.ts เป๊ะ (ไม่จำลอง)
 *   pnpm tsx scripts/probe-basis-drift-guard-2026-07-17.ts
 * ไม่มี write · รันซ้ำได้ทุกเมื่อ
 */
import pg from "pg";
import { evaluateBasisDrift, type MomoBoxRow } from "../lib/forwarder/basis-drift-guard";
import { baseOf } from "../lib/integrations/momo-web/box-detail-reconcile-plan";

const num = (v: unknown) => { if (v == null) return 0; const n = typeof v === "number" ? v : parseFloat(String(v)); return Number.isFinite(n) ? n : 0; };

async function main() {
  const c = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
    user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz",
    database: "postgres", ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const { rows: fwd } = await c.query(
    `SELECT id, userid, fstatus, ftrackingchn, fcabinetnumber, fweight, fvolume, ftotalprice
       FROM tb_forwarder ORDER BY id`);
  const { rows: box } = await c.query(
    `SELECT base_tracking, box_tracking, width, length, height, weight_kg, cbm, quantity
       FROM momo_box_detail`);

  const byBase = new Map<string, MomoBoxRow[]>();
  for (const b of box) {
    const arr = byBase.get(b.base_tracking) ?? [];
    arr.push({ boxTracking: b.box_tracking, width: b.width, length: b.length, height: b.height,
               weightKg: b.weight_kg, cbm: b.cbm, quantity: b.quantity });
    byBase.set(b.base_tracking, arr);
  }

  const tally: Record<string, number> = {};
  const blocked: any[] = [];
  let zeroBasis = 0;

  for (const r of fwd) {
    const fw = num(r.fweight), fv = num(r.fvolume);
    // guard เดิม (zero-basis) จับก่อน → ไม่ถึง guard ใหม่
    if (!(fw > 0) && !(fv > 0)) { zeroBasis++; continue; }
    const tracking = String(r.ftrackingchn ?? "").trim();
    const v = evaluateBasisDrift({
      storedWeightKg: fw, storedCbm: fv,
      ownBoxTracking: tracking,
      baseBoxes: byBase.get(baseOf(tracking)) ?? [],
    });
    if (v.blocked) {
      blocked.push({ id: r.id, tr: tracking, cab: r.fcabinetnumber, st: String(r.fstatus),
        user: r.userid, price: num(r.ftotalprice), d: v.detail });
    } else {
      tally[v.skipReason ?? "?"] = (tally[v.skipReason ?? "?"] ?? 0) + 1;
    }
  }

  console.log(`\n════ tb_forwarder ${fwd.length} แถว · guard ตัวจริง (evaluateBasisDrift) ════`);
  console.log(`ฐาน=0 ทั้งคู่ (guard เดิม zero-basis จับก่อน)  = ${zeroBasis}`);
  for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`ผ่าน · ${k.padEnd(24)} = ${n}`);
  }
  console.log(`🔴 BLOCK                                = ${blocked.length}`);

  const billed = blocked.filter(b => ["5", "6", "7"].includes(b.st));
  const unbilled = blocked.filter(b => !["5", "6", "7"].includes(b.st));
  console.log(`\n   ↳ วางบิล/เก็บเงินแล้ว (st 5/6/7) = ${billed.length}`);
  console.log(`   ↳ ยังไม่วางบิล (งานที่เดินอยู่)    = ${unbilled.length}  ← ตัวชี้วัดว่า guard ไปขวางงานปกติไหม`);

  console.log(`\n──── แถวที่ block (เรียงตามเงิน) ────`);
  blocked.sort((a, b) => b.price - a.price);
  for (const b of blocked) {
    console.log(`#${b.id} ${String(b.tr).padEnd(20)} [${b.cab ?? "-"}] st=${b.st} ${b.user} ฿${b.price.toFixed(2)}
     นน. ${b.d.storedWeightKg} vs ${b.d.ownBoxWeightKg} (${b.d.ownWeightRatio}x) · คิว ${b.d.storedCbm} vs ${b.d.ownBoxCbm} (${b.d.ownCbmRatio}x) · Σ base ${b.d.baseSumWeightKg}/${b.d.baseSumCbm} (${b.d.baseBoxCount} กล่อง)`);
  }
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
