/**
 * AUDIT — "backfill เคลียร์ทั้งระบบ" inventory (owner 2026-07-17 · ข้อ 6)
 *
 * owner (verbatim): "งานที่มีปัญหา รอเก็บเงิน หรือข้อมูลอะไรที่ไม่ถูกต้อง ใส่ backfill
 * เติมใส่ให้ครบ เชื่อมโยงให้ถูกต้อง เคลียร์ให้เป็นปัจจุบัน"
 *
 * 🔴 READ-ONLY. SELECT เท่านั้น. ไม่มี UPDATE/INSERT/DELETE ในไฟล์นี้.
 *    หน้าที่ = **นับให้แม่น + จัดลำดับ** ให้ owner เคาะ — ไม่ใช่แก้.
 *
 * ทำไมต้องนับใหม่ ไม่ลอกเลขเก่า:
 *   เลขใน CLAUDE.md ("16 ตู้/303 แถว ~฿232k" · "207 ชิปเม้น" · "28 ตู้") เป็น snapshot
 *   จาก session ก่อน — ตู้ใหม่เข้ามาเรื่อยๆ + งานที่ทำไปแล้ว (box-basis reconcile 87 แถว
 *   2026-07-17 · split backfill 07-14) ทำให้ยอดขยับ → **ต้อง re-measure ทุกครั้ง**.
 *
 * นิยามที่ใช้ (ยึด source ที่มีอยู่แล้ว):
 *   - ต้นทุน            = tb_forwarder.fcosttotalprice   (0/null = ยังไม่ตั้ง)
 *   - เรทต้นทุน MOMO     = GZS/SEA=เรือ 2,500 · GZE/EK=รถ 4,700  (mig 0260 · cabinet-transport.ts)
 *   - จ่ายค่าตู้แล้ว     = tb_cnt_item."fCabinetNumber" มีตู้นั้น  (actions/admin/cnt-payment.ts)
 *   - คิวตรวจสอบ        = tb_check_forwarder → ใช้ได้เฉพาะ fstatus='4' (report-cnt-add-check-gate.ts)
 *   - ตัวชี้ขาดคิว/นน.  = **dims เท่านั้น** (ห้ามใช้ความหนาแน่น — ของหนักเกิน 1,000 kg/คิว ได้จริง)
 *                        cbm ≈ dims        → MOMO ส่ง "ต่อกล่อง" → คูณ qty ถูกแล้ว
 *                        cbm ≈ dims × qty  → MOMO ส่ง "ยอดรวม"  → **ห้ามคูณ** (ที่เราคูณ = บัค)
 *
 * RUN: node scripts/audit-backfill-inventory-2026-07-17.mjs
 */
import pg from "pg";

const client = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: "DqOzfEZVXfMHIryz",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

// ── helpers ──
const num = (v) => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const baht = (n) => num(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r6 = (n) => Number(num(n).toFixed(6));
const baseOf = (t) => (t ?? "").trim().replace(/-\d+(?:\/\d+)?$/, "");
const isSibling = (t) => /-\d+(?:\/\d+)?$/.test((t ?? "").trim());
const piecesOf = (q) => { const n = Math.round(num(q)); return n > 0 ? n : 1; };
/** เรทต้นทุน MOMO ตามชนิดตู้ (mig 0260) — null = ตู้ที่ decode ชนิดไม่ได้ */
const costRateOf = (cab) => {
  const s = (cab ?? "").trim().toUpperCase();
  if (s.startsWith("GZS") || s.startsWith("SEA")) return 2500;
  if (s.startsWith("GZE") || s.startsWith("EK")) return 4700;
  return null;
};
/** คิวจาก dims (m³) — 0 = ไม่มี dims ให้เทียบ (ตัดสินไม่ได้) */
const dimsCbm = (w, l, h) => r6((num(w) * num(l) * num(h)) / 1_000_000);
/**
 * MOMO "หัวบิล" — mirror ของ `lib/admin/momo-bill-header.ts` (money accessor = ftotalprice).
 * ในกลุ่ม (base + userid): แถว bare ที่มีพี่น้อง -N และ **ไม่มีเงิน** = placeholder → ทิ้ง.
 * ⚠️ ไม่ทิ้ง = นับกล่อง/คิวซ้ำ 2 เท่า (ที่เห็นเป็นอัตราส่วน 2× เป๊ะ) = ธงปลอม.
 * (mirror ไม่ใช่ import เพราะไฟล์ .ts import จาก .mjs ตรงๆ ไม่ได้ — ถ้ากฎเปลี่ยน ต้อง sync)
 */
const countableRows = (rows) => {
  const hasSib = new Set();
  for (const r of rows) {
    if (!isSibling(r.ftrackingchn)) continue;
    hasSib.add(`${baseOf(r.ftrackingchn)}::${r.userid ?? ""}`);
  }
  if (hasSib.size === 0) return [...rows];
  return rows.filter((r) => {
    if (isSibling(r.ftrackingchn)) return true;
    const k = `${baseOf(r.ftrackingchn)}::${r.userid ?? ""}`;
    if (!hasSib.has(k)) return true;
    return num(r.ftotalprice) > 0; // มีเงิน = anchor จริง → เก็บ
  });
};
const relDiff = (a, b) => {
  const d = Math.max(Math.abs(a), Math.abs(b));
  return d < 1e-9 ? 0 : Math.abs(a - b) / d;
};
const TOL = 0.02; // 2% — เท่ากับ money-basis guard ของ split-box-rows-plan.ts

const hr = (t) => console.log(`\n${"═".repeat(78)}\n${t}\n${"═".repeat(78)}`);
const sub = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 72 - t.length))}`);

const FINDINGS = []; // สรุปท้ายไฟล์
const add = (f) => FINDINGS.push(f);

async function main() {
  await client.connect();
  console.log("READ-ONLY · prod yzljakczhwrpbxflnmco · " + new Date().toISOString());

  // ════════════════════════════════════════════════════════════════════
  hr("§0 · ภาพรวม (baseline)");
  // ════════════════════════════════════════════════════════════════════
  const { rows: base } = await client.query(`
    select fstatus, count(*)::int n,
      sum(ftotalprice)::numeric(14,2) sell,
      sum(fcosttotalprice)::numeric(14,2) cost
    from tb_forwarder where fstatus <> '99' group by 1 order by 1`);
  console.table(base.map((r) => ({
    สถานะ: r.fstatus, แถว: r.n, ขาย: baht(r.sell), ต้นทุน: baht(r.cost),
  })));
  const totSell = base.reduce((a, r) => a + num(r.sell), 0);
  const totCost = base.reduce((a, r) => a + num(r.cost), 0);
  console.log(`Σ ขาย ฿${baht(totSell)} · Σ ต้นทุนที่บันทึกไว้ ฿${baht(totCost)}`);

  const { rows: [cabAgg] } = await client.query(`
    select count(distinct fcabinetnumber)::int cabs, count(*)::int rows
    from tb_forwarder where coalesce(fcabinetnumber,'')<>'' and fstatus<>'99'`);
  console.log(`ตู้ทั้งหมด ${cabAgg.cabs} ตู้ · ${cabAgg.rows} แถวมีตู้`);

  // ════════════════════════════════════════════════════════════════════
  hr("§1 · ต้นทุนตู้ — ยังไม่ตั้ง (owner: '16 ตู้/303 แถว ~฿232k')");
  // ════════════════════════════════════════════════════════════════════
  const { rows: cabCost } = await client.query(`
    select f.fcabinetnumber cab,
      count(*)::int rows_total,
      count(*) filter (where coalesce(f.fcosttotalprice,0)=0)::int rows_nocost,
      sum(f.ftotalprice) filter (where coalesce(f.fcosttotalprice,0)=0) sell_nocost,
      sum(f.fvolume)     filter (where coalesce(f.fcosttotalprice,0)=0) cbm_nocost,
      min(f.fstatus) minst, max(f.fstatus) maxst,
      exists (select 1 from tb_cnt_item ci where ci."fCabinetNumber" = f.fcabinetnumber) paid_cab
    from tb_forwarder f
    where coalesce(f.fcabinetnumber,'')<>'' and f.fstatus <> '99'
    group by 1
    having count(*) filter (where coalesce(f.fcosttotalprice,0)=0) > 0
    order by 4 desc nulls last`);

  const withEst = cabCost.map((r) => {
    const rate = costRateOf(r.cab);
    return {
      ...r,
      rate,
      est_cost: rate == null ? null : num(r.cbm_nocost) * rate,
      whole: r.rows_nocost === r.rows_total,
      arrived: r.minst >= "4", // ถึงไทยแล้วทั้งตู้
    };
  });

  sub("รายตู้ (เรียงตามยอดขายที่ยังไม่รู้ต้นทุน)");
  console.table(withEst.map((r) => ({
    ตู้: r.cab,
    ชนิด: r.rate === 2500 ? "เรือ" : r.rate === 4700 ? "รถ" : "?",
    แถว: `${r.rows_nocost}/${r.rows_total}`,
    ทั้งตู้: r.whole ? "✓" : "",
    สถานะ: `${r.minst}-${r.maxst}`,
    ถึงไทย: r.arrived ? "✓" : "",
    คิว: num(r.cbm_nocost).toFixed(4),
    ขาย: baht(r.sell_nocost),
    ต้นทุนประเมิน: r.est_cost == null ? "?" : baht(r.est_cost),
    จ่ายค่าตู้แล้ว: r.paid_cab ? "✓" : "",
  })));

  const all = withEst;
  const whole = withEst.filter((r) => r.whole);
  const arrived = withEst.filter((r) => r.arrived);
  const sumOf = (a, k) => a.reduce((s, r) => s + num(r[k]), 0);

  sub("2 นิยาม — เลข owner ผสมกัน 2 อัน");
  console.table([
    { นิยาม: "ตู้ที่มีแถวต้นทุน=0 (บางส่วนหรือทั้งตู้)", ตู้: all.length, แถว: sumOf(all, "rows_nocost"),
      คิว: sumOf(all, "cbm_nocost").toFixed(4), ขาย: baht(sumOf(all, "sell_nocost")), ต้นทุนประเมิน: baht(sumOf(all, "est_cost")) },
    { นิยาม: "ตู้ที่ไม่มีต้นทุนเลยทั้งตู้", ตู้: whole.length, แถว: sumOf(whole, "rows_nocost"),
      คิว: sumOf(whole, "cbm_nocost").toFixed(4), ขาย: baht(sumOf(whole, "sell_nocost")), ต้นทุนประเมิน: baht(sumOf(whole, "est_cost")) },
    { นิยาม: "🔴 เฉพาะตู้ที่ถึงไทยแล้ว (กำไรผิดจริงตอนนี้)", ตู้: arrived.length, แถว: sumOf(arrived, "rows_nocost"),
      คิว: sumOf(arrived, "cbm_nocost").toFixed(4), ขาย: baht(sumOf(arrived, "sell_nocost")), ต้นทุนประเมิน: baht(sumOf(arrived, "est_cost")) },
  ]);
  add({ id: "A1", topic: "ต้นทุนตู้ยังไม่ตั้ง", n: `${all.length} ตู้ / ${sumOf(all, "rows_nocost")} แถว`,
    money: sumOf(all, "est_cost"), moneyLabel: "ต้นทุนประเมินที่ยังไม่ลง", risk: "🔴 กำไรทั้งระบบผิด", owner: "เคาะ (ต้นทุน = money)" });

  sub("🔴 tb_cnt — การจ่ายค่าตู้ในระบบ");
  const { rows: [cnt] } = await client.query(`
    select (select count(*) from tb_cnt)::int cnt,
           (select count(*) from tb_cnt_item)::int items,
           (select count(*) from tb_cnt_pay_idorco)::int pay_idorco,
           (select count(*) from tb_cnt_pay_trackingchn)::int pay_track`);
  console.table([{ tb_cnt: cnt.cnt, tb_cnt_item: cnt.items, tb_cnt_pay_idorco: cnt.pay_idorco, tb_cnt_pay_trackingchn: cnt.pay_track }]);
  if (cnt.cnt === 0) {
    console.log(`⚠️  ${cabAgg.cabs} ตู้ในระบบ · จ่ายค่าตู้ผ่านระบบ 0 ตู้ → flow /admin/cnt-hs ยังไม่เคยถูกใช้จริงเลย`);
    add({ id: "A2", topic: "ไม่เคยจ่ายค่าตู้ผ่านระบบเลย", n: `${cabAgg.cabs} ตู้ · tb_cnt 0 แถว`,
      money: null, moneyLabel: "—", risk: "🔴 ไม่รู้ว่าจ่าย MOMO ไปเท่าไร", owner: "เคาะ (จ่ายนอกระบบ? หรือยังไม่จ่าย?)" });
  }

  // ════════════════════════════════════════════════════════════════════
  hr("§2 · น้ำหนัก/คิว มั่ว — ตัวชี้ขาด dims (owner: ข้อ 3 GZE260627-1)");
  // ════════════════════════════════════════════════════════════════════
  const { rows: boxes } = await client.query(`
    select base_tracking, box_tracking, container_name, member_code,
           width, length, height, weight_kg, cbm, quantity
    from momo_box_detail`);
  const { rows: fwd } = await client.query(`
    select id, ftrackingchn, userid, fcabinetnumber, fstatus, famount,
           fweight, fvolume, ftotalprice, fcosttotalprice, frefprice, frefrate
    from tb_forwarder where fstatus <> '99'`);
  const fByTrack = new Map();
  for (const f of fwd) fByTrack.set((f.ftrackingchn ?? "").trim(), f);

  // 2 คลาส — ห้ามยุบรวม (ซ่อมคนละแบบ · ความมั่นใจคนละระดับ):
  //  ghosts     = double-count ยืนยันได้: cbm ≈ dims×qty **และ** fweight ≈ weight_kg×qty
  //               → รู้ค่าที่ถูกแน่นอน (หาร qty) → backfill ได้
  //  weirdWeight = นน.ไม่ตรง MOMO แต่ **ไม่ใช่** ทวีคูณของ qty → ไม่รู้ว่าค่าไหนถูก
  //               → ห้ามเดา ต้องให้คนดู (อาจมาจาก packing list/แก้มือ)
  const ghosts = [];
  const weirdWeight = [];
  let comparable = 0;
  for (const b of boxes) {
    const f = fByTrack.get((b.box_tracking ?? "").trim());
    if (!f) continue;
    const d = dimsCbm(b.width, b.length, b.height);
    if (d <= 0) continue; // ไม่มี dims → ตัดสินไม่ได้ (ห้ามเดา)
    const qty = piecesOf(b.quantity);
    if (qty <= 1) continue; // qty=1 → 2 สูตรให้ผลเท่ากัน ไม่มีอะไรให้ตัดสิน
    comparable++;
    const cbm = num(b.cbm);
    const fitsPerBox = relDiff(cbm, d) <= TOL;       // MOMO ส่ง "ต่อกล่อง"
    const fitsTotal = relDiff(cbm, d * qty) <= TOL;  // MOMO ส่ง "ยอดรวม"
    if (!fitsTotal || fitsPerBox) continue;          // ต่อกล่อง (คูณถูกแล้ว) หรือตัดสินไม่ได้ → ข้าม
    // MOMO ส่งยอดรวม → ค่าที่ถูกคือ weight_kg / cbm ตรงๆ (ห้ามคูณ qty)
    const wantKg = num(b.weight_kg), wantCbm = cbm;
    const gotKg = num(f.fweight), gotCbm = num(f.fvolume);
    const kgWrong = relDiff(gotKg, wantKg) > TOL;
    const cbmWrong = relDiff(gotCbm, wantCbm) > TOL;
    if (!kgWrong && !cbmWrong) continue;
    const row = {
      fid: f.id, tracking: b.box_tracking, cab: f.fcabinetnumber, user: f.userid, st: f.fstatus, qty,
      kg_now: gotKg, kg_want: wantKg, cbm_now: gotCbm, cbm_want: wantCbm,
      ghost_kg: gotKg - wantKg, cbmWrong, sell: num(f.ftotalprice), rate: num(f.frefrate),
    };
    // ยืนยัน double-count: นน.ที่เก็บ = นน.MOMO × qty เป๊ะ (นี่คือลายเซ็นของบัค)
    const kgIsQtyMultiple = relDiff(gotKg, wantKg * qty) <= TOL;
    if (kgIsQtyMultiple || !kgWrong) ghosts.push(row);
    else weirdWeight.push(row);
  }
  ghosts.sort((a, b) => b.ghost_kg - a.ghost_kg);
  sub(`B1 · double-count ยืนยันได้ (นน.เก็บ = นน.MOMO × qty เป๊ะ) — เทียบได้ ${comparable} แถว`);
  console.table(ghosts.map((g) => ({
    fid: g.fid, tracking: g.tracking, ตู้: g.cab, ผู้ใช้: g.user, st: g.st, qty: g.qty,
    "นน.เก็บ": g.kg_now.toFixed(2), "นน.ที่ถูก": g.kg_want.toFixed(2),
    "คิวผิดด้วย": g.cbmWrong ? "🔴" : "", ขาย: baht(g.sell),
  })));
  const ghostKg = ghosts.reduce((a, g) => a + g.ghost_kg, 0);
  console.log(`รวม ${ghosts.length} แถว · น้ำหนักผี ${ghostKg.toLocaleString("th-TH", { maximumFractionDigits: 0 })} kg · คิวผิดด้วย ${ghosts.filter((g) => g.cbmWrong).length} แถว`);
  add({ id: "B1", topic: "นน./คิว มั่ว (MOMO ยอดรวม แต่เราคูณซ้ำ)", n: `${ghosts.length} แถว`,
    money: null, moneyLabel: `น้ำหนักผี ${Math.round(ghostKg).toLocaleString()} kg`,
    risk: "🔴 ตั้งต้นทุนไม่ได้ (sanity backstop เด้ง)", owner: "เคาะ (backfill นน./คิว = money-neutral)" });

  sub("B1b · นน.ไม่ตรง MOMO แต่ไม่ใช่ทวีคูณ qty → คนละบัค · ห้าม backfill (ไม่รู้ค่าที่ถูก)");
  console.table(weirdWeight.map((g) => ({
    fid: g.fid, tracking: g.tracking, ตู้: g.cab, ผู้ใช้: g.user, st: g.st, qty: g.qty,
    "นน.เก็บ": g.kg_now.toFixed(2), "นน. MOMO": g.kg_want.toFixed(2),
    "×qty จะได้": (g.kg_want * g.qty).toFixed(2), ขาย: baht(g.sell),
  })));
  if (weirdWeight.length) {
    console.log("→ เก็บ ≠ MOMO และ ≠ MOMO×qty → มาจากทางอื่น (packing list / แก้มือ) → ต้องให้คนตรวจ");
    add({ id: "B1b", topic: "นน.ไม่ตรง MOMO (ไม่ใช่ double-count)", n: `${weirdWeight.length} แถว`,
      money: null, moneyLabel: "ไม่รู้ค่าที่ถูก", risk: "🟠 ต้นทุน/ราคาอาจเพี้ยน",
      owner: "🔴 คนตรวจทีละแถว (ห้าม auto)" });
  }

  // เก็บเงินเกิน — เฉพาะแถวที่ "คิวผิด" AND "ขายคิดจากคิว"
  sub("🔴 เก็บเงินเกินลูกค้า (คิวเพี้ยน × ขายคิดจากคิว)");
  const over = [];
  for (const g of ghosts.filter((x) => x.cbmWrong && x.rate > 0)) {
    const sellAtWrong = g.rate * g.cbm_now;
    const sellAtRight = g.rate * g.cbm_want;
    // ยืนยันว่าราคาขายมาจากคิวจริง (ไม่ใช่คิดตามน้ำหนัก) ก่อนเคลมว่าเก็บเกิน
    if (relDiff(g.sell, sellAtWrong) > 0.02) continue;
    over.push({ ...g, sell_right: sellAtRight, overcharge: g.sell - sellAtRight });
  }
  if (over.length === 0) console.log("(ไม่พบ — นอกจากที่แจงด้านล่าง)");
  console.table(over.map((o) => ({
    fid: o.fid, tracking: o.tracking, ผู้ใช้: o.user, st: o.st,
    เรท: baht(o.rate), "คิวเก็บ": o.cbm_now, "คิวถูก": o.cbm_want,
    เก็บจริง: baht(o.sell), ที่ถูก: baht(o.sell_right), เก็บเกิน: baht(o.overcharge),
    เก็บเงินแล้ว: o.st >= "6" ? "🔴 ใช่" : "ยัง",
  })));
  const overSum = over.reduce((a, o) => a + o.overcharge, 0);
  if (over.length) {
    add({ id: "B2", topic: "เก็บเงินเกินลูกค้า", n: `${over.length} แถว`, money: overSum,
      moneyLabel: "เก็บเกิน", risk: "🔴 ต้องคืนเงิน/เครดิต", owner: "🔴 เคาะเอง (คืน/เครดิต/ปล่อย)" });
  }

  // ════════════════════════════════════════════════════════════════════
  hr("§3 · กล่อง (box count) — owner: '207 ชิปเม้นยังไม่แตกกล่อง' · '28 ตู้กล่องเพี้ยน'");
  // ════════════════════════════════════════════════════════════════════
  const sibByBase = new Map();
  for (const f of fwd) {
    const b = baseOf(f.ftrackingchn);
    if (!sibByBase.has(b)) sibByBase.set(b, []);
    sibByBase.get(b).push(f);
  }
  const boxBases = new Map();
  for (const b of boxes) {
    const k = (b.base_tracking ?? "").trim();
    if (!boxBases.has(k)) boxBases.set(k, []);
    boxBases.get(k).push(b);
  }

  sub("C1 · ยังไม่แตกกล่อง = MOMO มีหลายกล่อง แต่เรามีแถวเดียว");
  const notSplit = [];
  for (const [b, bs] of boxBases) {
    const distinctBoxes = new Set(bs.map((x) => (x.box_tracking ?? "").trim())).size;
    if (distinctBoxes <= 1) continue;
    const rows = sibByBase.get(b) ?? [];
    if (rows.length === 0) continue;
    if (rows.some((r) => isSibling(r.ftrackingchn))) continue; // แตกแล้ว
    notSplit.push({ base: b, momo_boxes: distinctBoxes, our_rows: rows.length,
      st: rows[0]?.fstatus, cab: rows[0]?.fcabinetnumber, sell: num(rows[0]?.ftotalprice) });
  }
  console.table(notSplit);
  console.log(`= ${notSplit.length} ชิปเม้น (owner จำไว้ 207 — งาน box-basis reconcile 2026-07-17 เก็บไปแล้ว)`);

  sub("C2 · แถวก้อนรวม famount>1 ที่ยังไม่เคยแตก (รวมที่ไม่มี box_detail)");
  const agg = [];
  for (const f of fwd) {
    if (isSibling(f.ftrackingchn)) continue;
    if (num(f.famount) <= 1) continue;
    const b = baseOf(f.ftrackingchn);
    if ((sibByBase.get(b) ?? []).some((r) => isSibling(r.ftrackingchn))) continue;
    agg.push({ fid: f.id, base: b, famount: f.famount, st: f.fstatus, cab: f.fcabinetnumber,
      sell: num(f.ftotalprice), has_detail: boxBases.has(b), billed: f.fstatus >= "5" });
  }
  console.table([{
    "แถวก้อนรวม famount>1 ไม่มี sibling": agg.length,
    "มี momo_box_detail (แตกได้)": agg.filter((a) => a.has_detail).length,
    "ไม่มี detail (แตกไม่ได้)": agg.filter((a) => !a.has_detail).length,
    "วางบิลแล้ว (>=5 · ห้ามแตะ)": agg.filter((a) => a.billed).length,
    "ยังไม่วางบิล (แตกได้เลย)": agg.filter((a) => !a.billed && a.has_detail).length,
  }]);
  add({ id: "C2", topic: "แถวก้อนรวมยังไม่แตกกล่อง", n: `${agg.length} แถว (แตกได้เลย ${agg.filter((a) => !a.billed && a.has_detail).length})`,
    money: null, moneyLabel: "money-neutral (Σ คงเดิม)", risk: "🟠 กล่อง/ใบเสร็จไม่ตรงจริง", owner: "แตะได้ (unbilled) · billed ต้องเคาะ" });

  sub("C3 · ตู้ที่กล่องไม่ตรง momo_box_detail (Σ famount vs Σ quantity ต่อ base · ทิ้งหัวบิลแล้ว)");
  const mismatch = new Map();
  for (const [b, bs] of boxBases) {
    const allRows = sibByBase.get(b) ?? [];
    if (allRows.length === 0) continue;
    const rows = countableRows(allRows); // ทิ้งหัวบิล — ไม่งั้นนับกล่องซ้ำ 2 เท่า
    if (rows.length === 0) continue;
    const our = rows.reduce((a, r) => a + num(r.famount), 0);
    const momo = bs.reduce((a, x) => a + piecesOf(x.quantity), 0);
    if (our === momo) continue;
    const cab = rows[0]?.fcabinetnumber || "(ไม่มีตู้)";
    if (!mismatch.has(cab)) mismatch.set(cab, { cab, bases: 0, our: 0, momo: 0, billed: 0 });
    const m = mismatch.get(cab);
    m.bases++; m.our += our; m.momo += momo;
    if (rows.some((r) => r.fstatus >= "5")) m.billed++;
  }
  const mm = [...mismatch.values()].sort((a, b) => b.bases - a.bases);
  console.table(mm.map((m) => ({ ตู้: m.cab, "base ไม่ตรง": m.bases, "กล่องเรา": m.our, "กล่อง MOMO": m.momo,
    ต่าง: m.our - m.momo, "วางบิลแล้ว": m.billed })));
  console.log(`= ${mm.length} ตู้ · ${mm.reduce((a, m) => a + m.bases, 0)} base · วางบิลแล้ว ${mm.reduce((a, m) => a + m.billed, 0)} base (owner จำไว้ 28 ตู้)`);
  add({ id: "C3", topic: "ตู้กล่องไม่ตรง momo_box_detail", n: `${mm.length} ตู้ / ${mm.reduce((a, m) => a + m.bases, 0)} base`,
    money: null, moneyLabel: "display (famount ไม่อยู่ในสูตรบิล)", risk: "🟠 ลูกค้าเห็นกล่องผิด",
    owner: "แตะได้ (famount = display-only)" });

  // ════════════════════════════════════════════════════════════════════
  hr("§4 · คิวตรวจสอบค้าง (owner: ข้อ 4)");
  // ════════════════════════════════════════════════════════════════════
  const { rows: chk } = await client.query(`
    select f.fstatus, count(*)::int n, sum(f.ftotalprice)::numeric(14,2) sell
    from tb_check_forwarder ch join tb_forwarder f on f.id = ch."fID"
    group by 1 order by 1`);
  console.table(chk.map((r) => ({
    สถานะ: r.fstatus, แถว: r.n, ขาย: baht(r.sell),
    ผล: r.fstatus === "4" ? "✅ ใช้ได้ (แจ้งชำระได้)" : "🔴 ค้างถาวร (adminCallPriceUser อ่าน .eq('4'))",
  })));
  const stuck = chk.filter((r) => r.fstatus !== "4").reduce((a, r) => a + r.n, 0);
  const okq = chk.filter((r) => r.fstatus === "4").reduce((a, r) => a + r.n, 0);
  console.log(`คิว ${stuck + okq} แถว · ใช้ได้ ${okq} · ค้างถาวร ${stuck}`);
  add({ id: "D1", topic: "คิวตรวจสอบค้างถาวร", n: `${stuck} แถว (จาก ${stuck + okq})`, money: null,
    moneyLabel: "ไม่มี (แถว ≥5 แจ้งชำระไปแล้ว)", risk: "🟠 badge/คิวมั่ว", owner: "แตะได้ (ลบออกจากคิว = ไม่แตะเงิน)" });

  // ════════════════════════════════════════════════════════════════════
  hr("§5 · เคสที่ owner ระบุชื่อ");
  // ════════════════════════════════════════════════════════════════════
  sub("PR043 · GZS260628-2");
  const { rows: pr043 } = await client.query(`
    select id, ftrackingchn, userid, fstatus, famount, fweight, fvolume, ftotalprice, fcosttotalprice
    from tb_forwarder where fcabinetnumber='GZS260628-2' and fstatus<>'99' order by fstatus, id`);
  const byS = {};
  for (const r of pr043) byS[r.fstatus] = (byS[r.fstatus] ?? 0) + 1;
  console.log(`${pr043.length} แถว · ตามสถานะ: ${JSON.stringify(byS)}`);
  const pr043Stuck = pr043.filter((r) => r.fstatus === "4");
  console.table(pr043Stuck.map((r) => ({ fid: r.id, tracking: r.ftrackingchn, ผู้ใช้: r.userid,
    st: r.fstatus, กล่อง: r.famount, kg: num(r.fweight).toFixed(2), คิว: num(r.fvolume).toFixed(4),
    ขาย: baht(r.ftotalprice), ต้นทุน: baht(r.fcosttotalprice) })));
  console.log(pr043.every((r) => num(r.ftotalprice) > 0 && num(r.fcosttotalprice) > 0)
    ? "→ ทุกแถวมีทั้งราคาขาย+ต้นทุนแล้ว · กล่อง famount=1 ทุกแถว (ไม่เพี้ยนแล้ว)"
    : "→ ยังมีแถวที่ราคา/ต้นทุนขาด");
  if (pr043Stuck.length) {
    console.log(`→ 🟠 เหลือ ${pr043Stuck.length} แถวค้าง fstatus=4 (ถึงไทยแล้ว ยังไม่แจ้งชำระ) ขณะที่พี่น้อง ${pr043.length - pr043Stuck.length} แถวไป 5 แล้ว`);
    add({ id: "E1", topic: "PR043 GZS260628-2 ค้าง fstatus=4", n: `${pr043Stuck.length} แถว`,
      money: pr043Stuck.reduce((a, r) => a + num(r.ftotalprice), 0), moneyLabel: "ยังไม่แจ้งชำระ",
      risk: "🟠 เก็บเงินช้า", owner: "แตะได้ (แจ้งชำระผ่านคิวเดิม)" });
  }

  sub("P22324 (PR075)");
  const { rows: p22324 } = await client.query(`
    select hno, hstatus, userid, hdate, htotalpriceuser from tb_header_order where hno='P22324'`);
  console.table(p22324.map((r) => ({ hno: r.hno, hstatus: r.hstatus, ผู้ใช้: r.userid, ยอด: baht(r.htotalpriceuser) })));
  const { rows: p22324f } = await client.query(`
    select f.id, f.ftrackingchn, f.fstatus, f.fcabinetnumber
    from tb_forwarder f where f.reforder = 'P22324' and f.fstatus<>'99'
    union all
    select f.id, f.ftrackingchn, f.fstatus, f.fcabinetnumber
    from tb_forwarder f join tb_order o on trim(o.ctrackingnumber) = trim(f.ftrackingchn)
    where o.hno = 'P22324' and f.fstatus<>'99'`);
  console.log(`แถวนำเข้าที่ผูก P22324 = ${p22324f.length}`);
  if (p22324f.length) console.table(p22324f.map((r) => ({ fid: r.id, tracking: r.ftrackingchn, st: r.fstatus, ตู้: r.fcabinetnumber })));
  const allHaveCab = p22324f.length > 0 && p22324f.every((r) => (r.fcabinetnumber ?? "") !== "" || r.fstatus >= "4");
  console.log(`กฎ 3 ขั้น (deriveShopStatus): ทุกแทรคได้เลขตู้/≥4 → '5' | ทุกแทรคถึงจีน → '40' | ไม่ครบ → '4'`);
  console.log(`→ ผลตามกฎ = ${p22324f.length === 0 ? "ตัดสินไม่ได้ (ไม่มีแทรคผูก)" : allHaveCab ? "'5'" : "'4' หรือ '40'"} · ที่เก็บจริง = '${p22324[0]?.hstatus}'`);
  add({ id: "E2", topic: "P22324 สถานะขัดกฎ", n: "1 ออเดอร์", money: num(p22324[0]?.htotalpriceuser),
    moneyLabel: "ยอดออเดอร์", risk: "🟠 ลูกค้าเห็นสถานะผิด", owner: "🔴 เคาะเอง (owner เคยสั่งไม่ auto-demote)" });

  // ════════════════════════════════════════════════════════════════════
  hr("§6 · ของค้างที่ยังไม่มีใครรู้ (หาเพิ่ม)");
  // ════════════════════════════════════════════════════════════════════
  sub("F1 · แถวถึงไทยแล้ว (≥4) แต่ราคาขาย = 0 → เก็บเงินไม่ได้");
  const { rows: f1 } = await client.query(`
    select id, ftrackingchn, userid, fcabinetnumber, fstatus, famount, fweight, fvolume, fcosttotalprice
    from tb_forwarder where fstatus in ('4','5','6','7') and coalesce(ftotalprice,0) <= 0 order by fstatus`);
  console.table(f1.map((r) => ({ fid: r.id, tracking: r.ftrackingchn, ผู้ใช้: r.userid, ตู้: r.fcabinetnumber,
    st: r.fstatus, kg: num(r.fweight).toFixed(2), คิว: num(r.fvolume).toFixed(4), ต้นทุน: baht(r.fcosttotalprice) })));
  if (f1.length) add({ id: "F1", topic: "ถึงไทยแล้วแต่ราคาขาย=0", n: `${f1.length} แถว`, money: null,
    moneyLabel: "เก็บเงินไม่ได้", risk: "🔴 รายได้หาย", owner: "เคาะ (ตั้งราคา = money)" });

  sub("F2 · แถวไม่มีเลขตู้ แต่สถานะเดินไปแล้ว (≥3)");
  const { rows: f2 } = await client.query(`
    select id, ftrackingchn, userid, fstatus, ftotalprice, fcosttotalprice, reforder
    from tb_forwarder where coalesce(fcabinetnumber,'')='' and fstatus in ('3','4','5','6','7') order by fstatus, id`);
  console.table(f2.map((r) => ({ fid: r.id, tracking: r.ftrackingchn, ผู้ใช้: r.userid, st: r.fstatus,
    ขาย: baht(r.ftotalprice), ต้นทุน: baht(r.fcosttotalprice) })));
  console.log(`= ${f2.length} แถว → ต้นทุนตู้ผูกกับ 'ตู้' → แถวไม่มีตู้ = ตกสำรวจต้นทุนทั้งหมด`);
  if (f2.length) add({ id: "F2", topic: "ไม่มีเลขตู้ แต่สถานะ ≥3", n: `${f2.length} แถว`,
    money: f2.reduce((a, r) => a + num(r.ftotalprice), 0), moneyLabel: "ขาย (ต้นทุนผูกตู้ไม่ได้)",
    risk: "🟠 ตกสำรวจต้นทุน", owner: "เคาะ (ต้องรู้ว่าอยู่ตู้ไหน)" });

  sub("F3 · เอกสารไม่ sync — บิล issued/paid แต่ forwarder ยัง <5");
  const { rows: f3 } = await client.query(`
    select i.doc_no, i.status, i.userid, i.total_thb, count(*)::int rows,
      min(f.fstatus) minst, max(f.fstatus) maxst
    from tb_forwarder_invoice i
    join tb_forwarder_invoice_item bi on bi.invoice_id = i.id
    join tb_forwarder f on f.id = bi.forwarder_id
    where i.status in ('issued','paid') and f.fstatus <> '99'
    group by 1,2,3,4 having min(f.fstatus) < '5' order by 1`);
  console.table(f3.map((r) => ({ บิล: r.doc_no, สถานะบิล: r.status, ผู้ใช้: r.userid,
    ยอด: baht(r.total_thb), แถว: r.rows, "fstatus": `${r.minst}-${r.maxst}` })));
  console.log(`= ${f3.length} ใบ`);
  if (f3.length) add({ id: "F3", topic: "บิล issued/paid แต่ forwarder ยัง <5", n: `${f3.length} ใบ`,
    money: f3.reduce((a, r) => a + num(r.total_thb), 0), moneyLabel: "ยอดบิล", risk: "🟠 สถานะเพี้ยน", owner: "เคาะ" });

  sub("F4 · บิล paid แต่ forwarder ยังไม่ถึง 6 (เตรียมส่ง)");
  const { rows: f4 } = await client.query(`
    select i.doc_no, i.userid, i.total_thb, i.paid_at, count(*)::int rows, min(f.fstatus) minst
    from tb_forwarder_invoice i
    join tb_forwarder_invoice_item bi on bi.invoice_id = i.id
    join tb_forwarder f on f.id = bi.forwarder_id
    where i.status='paid' and f.fstatus <> '99'
    group by 1,2,3,4 having min(f.fstatus) < '6' order by 1`);
  console.table(f4.map((r) => ({ บิล: r.doc_no, ผู้ใช้: r.userid, ยอด: baht(r.total_thb),
    แถว: r.rows, "fstatus ต่ำสุด": r.minst })));
  console.log(`= ${f4.length} ใบ (markBillingRunPaid ควร sync 5→6)`);
  if (f4.length) add({ id: "F4", topic: "บิล paid แต่ forwarder ยัง <6", n: `${f4.length} ใบ`,
    money: f4.reduce((a, r) => a + num(r.total_thb), 0), moneyLabel: "ยอดบิล (เก็บแล้ว)",
    risk: "🟠 ของค้างไม่เข้าคิวจัดส่ง", owner: "แตะได้ (status-only)" });

  sub("F5 · ใบเสร็จ pending (rstatus='3') / ค้าง");
  const { rows: f5 } = await client.query(`select rstatus, count(*)::int n, sum(ramount)::numeric(14,2) amt from tb_receipt group by 1 order by 1`);
  console.table(f5.map((r) => ({ rstatus: r.rstatus, ใบ: r.n, ยอด: baht(r.amt) })));

  // ── F6 · ฐานคิดราคา (นน./คิว) เพี้ยนเทียบ MOMO — แยกตาม "เงินอยู่ตรงไหน" ──
  //
  // 🔑 ทำไมต้องแยก 2 กลุ่ม (ถ้ายุบรวม = รายงานผิด · ตัดสินใจผิด):
  //   (ก) LANDMINE  — ราคาที่เก็บ = เรท × ฐาน**จริง** (เงินถูก) แต่ฐานที่ **เก็บไว้ในตาราง** เพี้ยน
  //                   → วันนี้ไม่เสียหาย แต่ถ้ามีอะไร re-price แถวนี้ = **เก็บเกินทันที**
  //                   → guard เดิม (zero-basis · live-rate.ts) กันแค่ฐาน=0 · ฐาน 2 เท่า **ไม่ถูกกัน**
  //   (ข) เก็บเกินแล้ว — ราคาที่เก็บ = เรท × ฐาน**เพี้ยน** → ลูกค้าจ่ายเกินไปแล้วจริง
  //
  // ⚠️ frefprice ('1'/'2') อ่านตรงๆ ไม่ได้ (ground truth doc) → **ทดสอบทั้ง 2 ฐาน (นน. และ คิว)**
  //    แล้วดูว่าราคาที่เก็บเข้ากับอันไหน — ให้ข้อมูลตัดสิน ไม่ใช่ flag
  sub("F6 · ฐานคิดราคา (นน./คิว) เพี้ยนเทียบ MOMO — ต่อ base");
  const drift = [];
  for (const [b, bs] of boxBases) {
    const allRows2 = sibByBase.get(b) ?? [];
    if (allRows2.length === 0) continue;
    const rows = countableRows(allRows2);
    if (rows.length === 0) continue;
    // MOMO ยอดจริงต่อ base — ใช้ตัวชี้ขาด dims ต่อกล่อง
    let momoCbm = 0, momoKg = 0;
    for (const x of bs) {
      const d = dimsCbm(x.width, x.length, x.height);
      const qty = piecesOf(x.quantity);
      const cbm = num(x.cbm), kg = num(x.weight_kg);
      const isLineTotal = d > 0 && qty > 1 && relDiff(cbm, d * qty) <= TOL && relDiff(cbm, d) > TOL;
      momoCbm += isLineTotal ? cbm : cbm * qty;
      momoKg += isLineTotal ? kg : kg * qty;
    }
    const ourCbm = rows.reduce((a, r) => a + num(r.fvolume), 0);
    const ourKg = rows.reduce((a, r) => a + num(r.fweight), 0);
    const sell = rows.reduce((a, r) => a + num(r.ftotalprice), 0);
    const cbmOff = relDiff(ourCbm, momoCbm) > TOL;
    const kgOff = relDiff(ourKg, momoKg) > TOL;
    if (!cbmOff && !kgOff) continue;
    const rate = num(rows[0]?.frefrate);
    // ⚠️ ราคาขั้นต่ำ ฿50/แทรค — แถวที่ชนขั้นต่ำ ราคา **ไม่ได้มาจาก** เรท×ฐาน
    //    → เทียบ เรท×ฐาน แล้วบอกว่า "เก็บเกิน" = **ผิด**. ต้องแยกออกก่อน.
    const atFloor = relDiff(sell, 50 * rows.length) <= 0.001;
    // ราคาที่เก็บ เข้ากับ "แกน" ไหน? (frefprice อ่านตรงๆ ไม่ได้ → ทดสอบทั้ง คิว และ นน.)
    const fitAxis = (cbmB, kgB) => {
      if (rate <= 0) return null;
      if (cbmB > 0 && relDiff(sell, rate * cbmB) <= 0.03) return "cbm";
      if (kgB > 0 && relDiff(sell, rate * kgB) <= 0.03) return "kg";
      return null;
    };
    const trueAxis = fitAxis(momoCbm, momoKg);
    const storedAxis = fitAxis(ourCbm, ourKg);
    // เงินที่เกี่ยวข้องจริง — คิดบนแกนที่ราคา "เข้า" เท่านั้น (ไม่สลับแกน)
    const storedBasisOn = (ax) => (ax === "cbm" ? ourCbm : ourKg);
    const trueBasisOn = (ax) => (ax === "cbm" ? momoCbm : momoKg);
    let verdict, exposure = 0, overcharge = 0;
    if (atFloor) {
      // ชนขั้นต่ำ → เงินวันนี้ถูก. เสี่ยงเฉพาะถ้า re-price แล้วฐานเพี้ยนดันทะลุขั้นต่ำ
      const wouldBe = Math.max(rate * ourCbm, 0);
      verdict = "⚪ ชนขั้นต่ำ ฿50 (เงินไม่ขึ้นกับฐาน)";
      exposure = Math.max(0, wouldBe - sell);
    } else if (trueAxis && !storedAxis) {
      verdict = "🧨 LANDMINE (เงินถูก · ฐานเพี้ยน)";
      exposure = Math.max(0, rate * storedBasisOn(trueAxis) - sell);
    } else if (storedAxis && !trueAxis && trueBasisOn(storedAxis) > 0) {
      // ⚠️ ต้องมีฐาน "จริง" ของ MOMO > 0 ถึงจะเคลมว่าเก็บเกินได้
      //    ถ้า MOMO ส่ง 0 มา = MOMO ไม่มีข้อมูล ≠ เราเก็บเกิน → เคลมไม่ได้ (ดู ❔ ด้านล่าง)
      verdict = "🔴 เก็บเกินแล้ว";
      overcharge = Math.max(0, sell - rate * trueBasisOn(storedAxis));
    } else if (momoCbm <= 0 && momoKg <= 0) {
      verdict = "❔ MOMO ส่ง 0 มา (ข้อมูลขาด · เคลมไม่ได้)";
    } else {
      verdict = "❔ ตัดสินไม่ได้";
    }
    drift.push({
      base: b, cab: rows[0]?.fcabinetnumber || "(ไม่มีตู้)", user: rows[0]?.userid,
      st: rows.reduce((m, r) => (r.fstatus < m ? r.fstatus : m), "9"),
      ourCbm, momoCbm, ourKg, momoKg, sell, rate, exposure, overcharge, atFloor,
      ratio: momoCbm > 0 ? ourCbm / momoCbm : null,
      verdict,
      billed: rows.some((r) => r.fstatus >= "5"),
    });
  }
  drift.sort((a, b) => Math.abs(b.ourCbm - b.momoCbm) - Math.abs(a.ourCbm - a.momoCbm));
  console.table(drift.map((d) => ({
    base: d.base, ตู้: d.cab, ผู้ใช้: d.user, st: d.st,
    "คิวเก็บ": d.ourCbm.toFixed(4), "คิว MOMO": d.momoCbm.toFixed(4),
    "เท่า": d.ratio == null ? "?" : d.ratio.toFixed(2),
    เรท: baht(d.rate), ขาย: baht(d.sell), ผล: d.verdict,
    เงิน: d.overcharge > 0 ? `เกิน ฿${baht(d.overcharge)}` : d.exposure > 0 ? `เสี่ยง ฿${baht(d.exposure)}` : "",
    วางบิลแล้ว: d.billed ? "✓" : "",
  })));
  const landmine = drift.filter((d) => d.verdict.startsWith("🧨"));
  const realOver = drift.filter((d) => d.verdict.startsWith("🔴"));
  const floorRows = drift.filter((d) => d.verdict.startsWith("⚪"));
  const unknown = drift.filter((d) => d.verdict.startsWith("❔"));
  console.log(`= ${drift.length} base · 🧨 landmine ${landmine.length} · 🔴 เก็บเกินแล้ว ${realOver.length} · ⚪ ชนขั้นต่ำ ${floorRows.length} · ❔ ตัดสินไม่ได้ ${unknown.length}`);
  const lmSum = landmine.reduce((a, d) => a + d.exposure, 0);
  const floorSum = floorRows.reduce((a, d) => a + d.exposure, 0);
  const ovSum = realOver.reduce((a, d) => a + d.overcharge, 0);
  console.log(`🧨 ถ้ามีอะไร re-price แถว landmine → เก็บเกินทันที ~฿${baht(lmSum)}`);
  console.log(`⚪ แถวชนขั้นต่ำ ถ้า re-price ด้วยฐานเพี้ยน → ทะลุขั้นต่ำ เก็บเกิน ~฿${baht(floorSum)}`);
  console.log(`🔴 เก็บเกินไปแล้ว (ตรวจซ้ำทีละแถวก่อนคืน) ~฿${baht(ovSum)}`);
  if (landmine.length || floorRows.length) add({
    id: "F6", topic: "🧨 ฐานคิดราคาเพี้ยน (re-price = เก็บเกินทันที)",
    n: `${landmine.length + floorRows.length} base (landmine ${landmine.length} · ชนขั้นต่ำ ${floorRows.length})`,
    money: lmSum + floorSum, moneyLabel: "ความเสี่ยงถ้า re-price",
    risk: "🔴 guard ฐาน=0 เดิม กันไม่ได้ (ฐานนี้ 2 เท่า ไม่ใช่ 0)", owner: "เคาะ (ซ่อมฐาน = money-neutral)" });
  if (realOver.length) add({ id: "F6a", topic: "🔴 เก็บเกินแล้ว (จาก F6 · นอกเหนือ B2)",
    n: `${realOver.length} base`, money: ovSum, moneyLabel: "เก็บเกิน (ประมาณ · ต้องตรวจทีละแถว)",
    risk: "🔴 ต้องคืนเงิน/เครดิต", owner: "🔴 เคาะเอง" });
  if (unknown.length) add({ id: "F6b", topic: "ฐานเพี้ยน · ตัดสินไม่ได้ว่าเงินถูกไหม", n: `${unknown.length} base`,
    money: null, moneyLabel: "ต้องดูทีละแถว", risk: "🟠", owner: "🔴 คนตรวจ" });

  sub("F6c · ตู้ที่ Σ คิว เพี้ยน → ตั้งต้นทุนจะผิดตาม (คิว = ฐานคิดต้นทุน)");
  const cabCbm = new Map();
  for (const d of drift) {
    if (!cabCbm.has(d.cab)) cabCbm.set(d.cab, { cab: d.cab, bases: 0, our: 0, momo: 0 });
    const m = cabCbm.get(d.cab); m.bases++; m.our += d.ourCbm; m.momo += d.momoCbm;
  }
  const cc = [...cabCbm.values()].sort((a, b) => Math.abs(b.our - b.momo) - Math.abs(a.our - a.momo));
  console.table(cc.map((m) => ({ ตู้: m.cab, "base เพี้ยน": m.bases, "คิวเรา": m.our.toFixed(4),
    "คิว MOMO": m.momo.toFixed(4), ต่าง: (m.our - m.momo).toFixed(4),
    "ต้นทุนจะผิด": costRateOf(m.cab) == null ? "?" : `฿${baht((m.our - m.momo) * costRateOf(m.cab))}` })));
  const costWrong = cc.reduce((a, m) => a + Math.abs((m.our - m.momo) * (costRateOf(m.cab) ?? 0)), 0);
  console.log(`= ${cc.length} ตู้ · ถ้าตั้งต้นทุนตอนนี้ ต้นทุนจะเพี้ยนรวม ~฿${baht(costWrong)}`);
  add({ id: "F6c", topic: "ตู้ที่ Σ คิว เพี้ยน → ต้นทุนจะผิด", n: `${cc.length} ตู้`, money: costWrong,
    moneyLabel: "ต้นทุนที่จะเพี้ยน", risk: "🔴 ต้องซ่อมคิว **ก่อน** ตั้งต้นทุน", owner: "เคาะ (ลำดับสำคัญ)" });

  // ════════════════════════════════════════════════════════════════════
  hr("§7 · สรุปให้ owner เคาะ");
  // ════════════════════════════════════════════════════════════════════
  console.table(FINDINGS.map((f) => ({
    id: f.id, เรื่อง: f.topic, จำนวน: f.n,
    เงิน: f.money == null ? f.moneyLabel : `฿${baht(f.money)} (${f.moneyLabel})`,
    เสี่ยง: f.risk, ใคร: f.owner,
  })));

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
