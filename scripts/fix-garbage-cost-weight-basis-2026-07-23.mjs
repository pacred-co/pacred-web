// ════════════════════════════════════════════════════════════════════════════
// FIX — ต้นทุนที่เก็บเป็น "น้ำหนัก × เรท" แทน "คิว × เรท" (ขยะ · ทำให้กำไรตู้ติดลบหลอก)
//
// owner 2026-07-23 (จากจอ /admin/report-cnt):
//   "ตู้นี้ทำไมไปโชว์ −เป็นแสนบาทเลยครับ แต่พอกดข้างใน +สามหมื่นห้า ทันยังไงกันแน่ครับ ...
//    พวกการแสดงผลพวกนี้สำคัญมากนะครับ ทุกข้อมูลทุกคนเชื่อ และเอาไปทำงานจริงนะครับ"
//
// THE BUG (prod-verified · GZE260720-1):
//   หน้าลิสต์ Σ ต้นทุนที่ "เก็บไว้" = 391,437.34 → กำไร −330,786.05
//   หน้าข้างใน คิดสดจากคิว        =  25,067.78 → กำไร  +35,583.51  ← ตัวนี้ถูก
//   ต่างกันเพราะ 4 แถวเก็บ fcosttotalprice = fweight × rate (ควรเป็น คิว × rate):
//     #52751 225,600 = 48.00kg×4700   (ที่ถูก 0.410874×4700 = 1,931.11)
//     #52746  77,550 = 16.50kg×4700   (ที่ถูก 117.97)
//     #52903  35,250 =  7.50kg×4700   (ที่ถูก 360.51)
//     #52747  30,550 =  6.50kg×4700   (ที่ถูก 70.97)
//   ⇒ ขยะ 368,950 บาท ในตู้เดียว. สแกนทั้งระบบ = มีแค่ 4 แถวนี้ · fstatus=3 ยังไม่บิลทั้งหมด.
//
// หลักฐานว่า "คิว × เรท" คือฐานที่ถูก: ต้นทุน MOMO จ่ายเป็น "คิว" (mig 0260 · รถ 4,700 /
// เรือ 2,500 ต่อคิว) — แถวที่ถูกในตู้เดียวกันทุกแถว cost == round2(cbm × rate) เป๊ะ
// (#52783 5,594.18 = 1.190250×4700 ✓ · #52741 3,096.42 = 0.658812×4700 ✓).
//
// เรทเอาจาก waterfall จริง (ไม่ hardcode): tb_cost_container ของตู้นั้นก่อน → ไม่มีค่อยใช้
// ค่าตั้งต้น tb_settings ตามโหมดขนส่ง (GZE/EK = รถ · GZS/SEA = เรือ).
//
// คิว: เคารพกฎ famountcount — '1' ⇒ fvolume คือยอดรวมทั้งแถว · ไม่ใช่ '1' ⇒ ต่อกล่อง ×famount.
//
// MONEY: ต้นทุนเป็นตัวเลข "ภายใน" (gate canViewCostProfit) — ไม่ใช่ยอดที่เก็บลูกค้า
//   → แก้แล้ว **ลูกค้าไม่กระทบ** · ftotalprice (ราคาขาย) ไม่ถูกแตะ · แตะเฉพาะแถวที่ยังไม่บิล.
//
// RUN:  node scripts/fix-garbage-cost-weight-basis-2026-07-23.mjs           (dry-run)
//       node scripts/fix-garbage-cost-weight-basis-2026-07-23.mjs --apply
// ════════════════════════════════════════════════════════════════════════════
import { writeFileSync } from "node:fs";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const BILLED = ["5", "6", "7", "8"]; // บิล/จ่ายแล้ว = ห้ามแตะ
const EPS = 1; // บาท — ถือว่า "ตรง" เมื่อต่างน้อยกว่า 1 บาท

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});

const n = (v) => Number(v ?? 0) || 0;
const r2 = (v) => Math.round(v * 100) / 100;

/** คิวรวมของแถว ตามกฎ famountcount (mirror lib/forwarder/quantities.ts totalCbmOf) */
const totalCbm = (row) =>
  String(row.famountcount ?? "") === "1"
    ? n(row.fvolume)
    : n(row.fvolume) * Math.max(1, Math.round(n(row.famount)) || 1);

/** โหมดขนส่งจากชื่อตู้ (mirror lib/forwarder/cabinet-transport.ts): GZE/EK = รถ · อื่น = เรือ */
const isRoad = (cab) => /^(GZE|EK)/i.test(String(cab ?? "").trim());

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }
  await c.connect();

  // เรทตั้งต้นจาก tb_settings — MOMO(8)/TTW(9) อ่านคอลัมน์ …defaultmomo ต่อ "ประเภทสินค้า"
  // (mirror lib/forwarder/resolve-cost.ts costColumn · กวางโจว = ไม่มี suffix 2)
  const { rows: st } = await c.query(
    `SELECT fcostcar1defaultmomo, fcostcar2defaultmomo, fcostcar3defaultmomo, fcostcar4defaultmomo,
            fcostship1defaultmomo, fcostship2defaultmomo, fcostship3defaultmomo, fcostship4defaultmomo
       FROM tb_settings LIMIT 1`);
  const settingRate = (typeIdx, road) =>
    n(st[0]?.[`fcost${road ? "car" : "ship"}${typeIdx}defaultmomo`]);
  console.log(`เรทตั้งต้น MOMO (tb_settings · ต่อประเภทสินค้า):`);
  console.log(`  รถ  1-4: ${[1,2,3,4].map((i)=>settingRate(i,true)).join(" · ")}`);
  console.log(`  เรือ 1-4: ${[1,2,3,4].map((i)=>settingRate(i,false)).join(" · ")}\n`);

  // เรทต่อตู้ (ชนะเสมอ · ต่อประเภทสินค้า 1-4 — ตามที่บัญชีตั้งตอนตรวจตู้)
  const { rows: cc } = await c.query(
    `SELECT fcabinetnumber cab, fproductstype1 t1, fproductstype2 t2, fproductstype3 t3, fproductstype4 t4
       FROM tb_cost_container`);
  const rateByCab = new Map(cc.map((x) => [String(x.cab ?? "").trim(),
    { 1: n(x.t1), 2: n(x.t2), 3: n(x.t3), 4: n(x.t4) }]));

  // ทุกแถวที่มีต้นทุน + มีคิว
  const { rows } = await c.query(
    `SELECT id, ftrackingchn, fcabinetnumber, fstatus, famount, famountcount,
            fvolume, fweight, fcosttotalprice, ftotalprice, fwarehousename, fproductstype
       FROM tb_forwarder
      WHERE COALESCE(fcosttotalprice,0) > 0 AND COALESCE(fvolume,0) > 0`);

  const plans = [], skips = [];
  for (const row of rows) {
    const cab = String(row.fcabinetnumber ?? "").trim();
    const wh = String(row.fwarehousename ?? "").trim();

    // 🔴 โกดัง แสง(1) + MX(4) คิดต้นทุนตาม "น้ำหนัก" โดยชอบ (costBasisMode · resolve-cost.ts)
    //    → ห้ามแตะเด็ดขาด ไม่งั้นเราจะไปทำลายข้อมูลที่ถูกอยู่แล้ว
    if (wh === "1" || wh === "4") continue;

    const typeIdx = ["2", "3", "4"].includes(String(row.fproductstype ?? "").trim())
      ? Number(String(row.fproductstype).trim()) : 1;
    const road = isRoad(cab);
    const rate = rateByCab.get(cab)?.[typeIdx] || settingRate(typeIdx, road);
    const cbm = totalCbm(row);
    const stored = n(row.fcosttotalprice);
    const correct = r2(cbm * rate);
    const asWeight = r2(n(row.fweight) * rate);

    // ขยะ = ตรงกับ น้ำหนัก×เรท และไม่ตรงกับ คิว×เรท
    const looksWeightBasis = Math.abs(stored - asWeight) < EPS;
    const alreadyCorrect = Math.abs(stored - correct) < EPS;
    if (!looksWeightBasis || alreadyCorrect) continue;

    if (BILLED.includes(String(row.fstatus))) {
      skips.push({ id: row.id, cab, why: `บิล/จ่ายแล้ว (fstatus ${row.fstatus}) — บัญชีต้องเคาะ` });
      continue;
    }
    if (!(cbm > 0) || !(rate > 0)) {
      skips.push({ id: row.id, cab, why: `คิวหรือเรทเป็น 0 (cbm ${cbm} · rate ${rate})` });
      continue;
    }
    plans.push({ id: row.id, tracking: row.ftrackingchn, cab, fstatus: row.fstatus,
      cbm, rate, weight: n(row.fweight), from: stored, to: correct, sell: n(row.ftotalprice) });
  }

  console.log(`═══ แถวต้นทุนขยะ (น้ำหนัก×เรท) ที่จะแก้: ${plans.length} ═══`);
  let sumFrom = 0, sumTo = 0;
  for (const p of plans) {
    sumFrom += p.from; sumTo += p.to;
    console.log(`  #${p.id} ${String(p.tracking).slice(0, 22).padEnd(22)} ${p.cab} st${p.fstatus}`);
    console.log(`      คิว ${p.cbm.toFixed(6)} × ${p.rate} = ${p.to.toFixed(2)}   (เดิม ${p.from.toFixed(2)} = น้ำหนัก ${p.weight}kg × ${p.rate}) · ขาย ${p.sell.toFixed(2)}`);
  }
  console.log(`\n  Σ ต้นทุน ${sumFrom.toFixed(2)} → ${sumTo.toFixed(2)}  (ขยะออก ${(sumFrom - sumTo).toFixed(2)})`);
  if (skips.length) {
    console.log(`\n═══ ข้าม ${skips.length} แถว ═══`);
    skips.forEach((s) => console.log(`  #${s.id} ${s.cab} — ${s.why}`));
  }

  // ผลกระทบต่อกำไรตู้
  const byCab = new Map();
  plans.forEach((p) => byCab.set(p.cab, (byCab.get(p.cab) ?? 0) + (p.from - p.to)));
  if (byCab.size) {
    console.log(`\n═══ กำไรตู้จะขยับ (ต้นทุนลด = กำไรเพิ่ม) ═══`);
    for (const [cab, delta] of byCab) console.log(`  ${cab}: กำไร +${delta.toFixed(2)}`);
  }

  if (!plans.length) { console.log("\n✅ ไม่มีอะไรต้องแก้"); await c.end(); return; }
  if (!APPLY) { console.log("\n👀 DRY-RUN — ยังไม่เขียน (เติม --apply เพื่อแก้จริง)"); await c.end(); return; }

  const backup = `scripts/_backup-garbage-cost-${Date.now()}.json`;
  writeFileSync(backup, JSON.stringify(plans, null, 2), "utf8");
  console.log(`\n💾 backup → ${backup}`);

  await c.query("BEGIN");
  try {
    let wrote = 0;
    for (const p of plans) {
      // guard ซ้ำในคำสั่งเขียน: เขียนได้เฉพาะเมื่อค่ายังเป็นตัวเดิมและยังไม่บิล (TOCTOU)
      const { rowCount } = await c.query(
        `UPDATE tb_forwarder SET fcosttotalprice = $1
          WHERE id = $2 AND fcosttotalprice = $3 AND fstatus NOT IN ('5','6','7','8')`,
        [p.to, p.id, p.from]);
      wrote += rowCount;
    }
    if (wrote !== plans.length) throw new Error(`เขียนได้ ${wrote}/${plans.length} — มีแถวเปลี่ยนระหว่างทาง ROLLBACK`);
    await c.query("COMMIT");
    console.log(`✅ แก้แล้ว ${wrote} แถว`);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("❌ ROLLBACK:", e.message);
    process.exit(1);
  }

  // ตรวจซ้ำ — สแกนใหม่ด้วยตรรกะเดียวกับ plan (โกดัง 1/4 ถูกยกเว้น)
  console.log("ตรวจซ้ำ: รันสคริปต์นี้ซ้ำอีกครั้ง — ควรได้ 0 แถว");
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
