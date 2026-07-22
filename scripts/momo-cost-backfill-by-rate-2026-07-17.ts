/**
 * ════════════════════════════════════════════════════════════════════════════
 * BACKFILL — ตั้งต้นทุน (fcosttotalprice) ให้แถวที่ยังไม่เคยตั้ง · เรท × ฐาน
 * (owner 2026-07-17 · WORK ORDER ข้อ 6 · "303 แถวไม่มีต้นทุน · 24 ตู้")
 * ════════════════════════════════════════════════════════════════════════════
 *
 * owner: "งานที่มีปัญหา รอเก็บเงิน หรือข้อมูลอะไรที่ไม่ถูกต้อง ใส่ backfill เติมใส่ให้ครบ
 *         เชื่อมโยงให้ถูกต้อง เคลียร์ให้เป็นปัจจุบัน"
 *
 * ต้นทุนที่ยังไม่ตั้ง = **กำไรทั้งระบบผิด**. ตู้ที่ถึงไทยแล้ว = กำไรผิด**จริงตอนนี้** → ทำก่อน.
 *
 * ┌─ 🔑 ใช้ ENGINE เดิม — ไม่เขียนสูตรเอง (owner: "ของเดิมต้องต่อยอด อย่าสร้างใหม่") ─┐
 * │  `resolveRowCost`        (lib/forwarder/resolve-cost.ts)                        │
 * │      = waterfall เดียวกับที่ report-cnt ใช้เขียนจริง:                              │
 * │        1. tb_cost_container[ตู้].fproductstype{1..4}  ← บัญชีตั้งเอง · ชนะเสมอ      │
 * │        2. tb_settings[costColumn(wh, type, รถ/เรือ, เมือง)]  ← default (mig 0260)  │
 * │        3. ไม่มี → rate 0 → **ไม่เดา** → ข้าม                                       │
 * │      และ **ฐาน = ตาม CARRIER ไม่ใช่ตามชนิดตู้**: Sang(1)/MX(4) = น้ำหนัก ·          │
 * │      ที่เหลือ (รวม MOMO=8) = คิว   ← ตรงนี้คือหัวใจ ดูหัวข้อ "Sang" ล่าง             │
 * │  `resolveTransportMode`  (lib/forwarder/cabinet-transport.ts) = ชื่อตู้ชนะ stored   │
 * │  `resolveMomoBoxBasis`   (lib/integrations/momo-web/box-detail-basis.ts)         │
 * │      = ตัวชี้ขาด dims (per-piece vs line-total) · fail-safe `decided:false`        │
 * └────────────────────────────────────────────────────────────────────────────────┘
 *   เขียนเป็น .ts (ไม่ใช่ .mjs) เพื่อ **import engine ตรงๆ** — mirror = drift.
 *   (บทเรียนจริง: `audit-backfill-inventory-2026-07-17.mjs` mirror `costRateOf` ด้วย
 *    startsWith → decode `PR20260701-EK01`/`PCS20260704-EK01` ไม่ได้ ทั้งที่ SOT ใช้
 *    includes แล้ว decode ได้ → ประเมินต้นทุน 2 ตู้นั้นตกไปเงียบๆ)
 *
 * ┌─ 🔴 ลำดับที่ห้ามสลับ ─────────────────────────────────────────────────────────┐
 * │  ❌ ตั้งต้นทุนก่อน → ตู้ที่ฐานยังเพี้ยน = ต้นทุนผิดแล้ว **ล็อกความผิดลง DB**        │
 * │  ✅ ซ่อมฐาน (คิว/นน.) ให้ตรง momo_box_detail ก่อน → ค่อยตั้งต้นทุน                │
 * │  → script นี้จึง **ข้ามแถวที่ฐานยังเพี้ยน** แทนที่จะตั้งทับ                        │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * 💰 MONEY-SAFETY
 *   - เขียน **`fcosttotalprice` คอลัมน์เดียว** เท่านั้น.
 *     · **ไม่แตะ `ftotalprice`** (ราคาขาย) / `fstatus` / `fweight` / `fvolume` / wallet / commission
 *     · **ไม่แตะ `frefprice`** — ถึงแม้ `adminReportCntCustomRate` จะเขียนมันคู่กับต้นทุน แต่
 *       `frefprice` เป็น **คอลัมน์ฝั่งขาย**: `computeAndFillForwarderImportRate`
 *       (lib/forwarder/live-rate.ts) persist `frefrate`/`frefprice`/`ftotalprice` = 3
 *       คอลัมน์เรทขาย · และ price-breakdown/ใบวางบิล/ใบเสร็จ อ่านมันเพื่อโชว์ "คิดตาม
 *       น้ำหนัก/ปริมาตร" ให้ลูกค้า → เขียน = แตะเอกสารเงิน. (นี่คือ overload ที่
 *       ground-truth doc เตือนว่า "frefprice=1 ที่นี่ ไม่ได้แปลว่าคิดตามน้ำหนัก")
 *     · **ไม่เขียน `fprofittotal`** — path เดิม (momo-invoice-cost-backfill-2026-06-26)
 *       เขียน `fprofittotal=0` ด้วย แต่ probe แล้ว: **303/303 แถวเป้าหมาย = 0 อยู่แล้ว**
 *       → เขียน = no-op → ตัดออกให้ write surface เล็กที่สุด (verify ซ้ำตอนรัน · §PRECHECK)
 *   - DRY-RUN เป็น default · `--apply` เท่านั้นถึงเขียน · backup JSON ก่อน · txn เดียว
 *   - IDEMPOTENT: `where fcosttotalprice = 0` ทั้งใน SELECT และใน UPDATE → รันซ้ำ = 0 แถว
 *   - ข้ามตู้ที่ **จ่ายค่าตู้แล้ว** (tb_cnt_item."fCabinetNumber") — ห้ามแตะต้นทุนที่ปิดงบแล้ว
 *   - **sanity backstop เดียวกับ production** (report-cnt-detail.ts CONTAINER_COST_SANITY_MAX
 *     = ฿5,000,000/ตู้): Σ ต่อตู้เกิน → ข้ามทั้งตู้ (ไม่ใช่เขียนขยะแล้วให้กำไรติดลบมหาศาล)
 *
 * RUN:
 *   dry:   SUPABASE_DB_PASSWORD=… npx tsx scripts/momo-cost-backfill-by-rate-2026-07-17.ts
 *   apply: SUPABASE_DB_PASSWORD=… npx tsx scripts/momo-cost-backfill-by-rate-2026-07-17.ts --apply
 *   opts:  --arrived-only   ทำเฉพาะกลุ่ม (ก) ตู้ถึงไทยแล้ว (กำไรผิดจริงตอนนี้)
 *
 * @see docs/research/backfill-inventory-2026-07-17.md              — ที่มาของ 303/24
 * @see docs/research/momo-invoice-reconcile-ground-truth-2026-07-17.md — เรท 2,500/4,700
 * ════════════════════════════════════════════════════════════════════════════
 */
import pg from "pg";
import { writeFileSync } from "node:fs";
import { resolveTransportMode, type TransportMode } from "../lib/forwarder/cabinet-transport";
import {
  resolveRowCost,
  costBasisMode,
  type ContainerRateRow,
  type WarehouseDigit,
  type RowCost,
} from "../lib/forwarder/resolve-cost";
import {
  resolveMomoBoxBasis,
  type MomoBoxBasisInput,
} from "../lib/integrations/momo-web/box-detail-basis";

/** แถว tb_cost_container เท่าที่สคริปต์ใช้ — เรทต่อประเภทสินค้า (ป้อน resolveRowCost) + คีย์เลขตู้ */
type CostContainerRow = ContainerRateRow & { fcabinetnumber: string };

/** แถว momo_box_detail ตามคอลัมน์ที่ select มา (ค่าจาก pg เป็น string ได้ → ตรงกับ MomoBoxBasisInput) */
type BoxDetailRow = {
  box_tracking: string | null;
  width: MomoBoxBasisInput["width"];
  length: MomoBoxBasisInput["length"];
  height: MomoBoxBasisInput["height"];
  weight_kg: MomoBoxBasisInput["weightKg"];
  cbm: MomoBoxBasisInput["cbm"];
  quantity: MomoBoxBasisInput["quantity"];
};

const APPLY = process.argv.includes("--apply");
const ARRIVED_ONLY = process.argv.includes("--arrived-only");
const PROJECT_REF = "yzljakczhwrpbxflnmco"; // PROD
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) {
  console.error("FATAL: SUPABASE_DB_PASSWORD not set — aborting.");
  process.exit(1);
}

/** production's own backstop — verbatim from actions/admin/report-cnt-detail.ts */
const CONTAINER_COST_SANITY_MAX = 5_000_000;
/** ฐาน (คิว/นน.) ต่างจาก momo_box_detail เกินเท่านี้ = เพี้ยน → ข้าม. 2% = ค่าเดียวกับ
 *  BOX_BASIS_TOLERANCE / planBoxRowSplit / planBoxDetailReconcile. */
const BASIS_TOL = 0.02;
/**
 * เรทต่อหน่วย ≥ เท่านี้ บนฐาน **น้ำหนัก(กก.)** = หน่วยผิดแน่นอน.
 * ไม่มีเฟรทจีน-ไทย เจ้าไหนคิด ฿1,000+/กก. — เลขระดับพันคือเรท **ต่อคิว** เสมอ
 * (prod: sang 5,000/3,000 · momo 4,700/2,500 · ทุกเซลล์ในเมทริกซ์ = magnitude ต่อคิว).
 * เหตุผลเดียวกับ CONTAINER_COST_SANITY_MAX แค่จับที่ระดับแถว + บอกสาเหตุได้ตรงกว่า.
 */
const PER_KG_RATE_ABSURD_MIN = 1_000;

const VALID_WH = ["1", "2", "3", "4", "5", "6", "7", "8"];

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
const baht = (n: number) => num(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const relDiff = (a: number, b: number) => {
  const d = Math.max(Math.abs(a), Math.abs(b));
  return d < 1e-9 ? 0 : Math.abs(a - b) / d;
};
const modeLabel = (m: TransportMode) => (m === "1" ? "รถ" : m === "2" ? "เรือ" : "อากาศ");

type SkipReason =
  | "paid_cabinet"           // ตู้จ่ายค่าตู้แล้ว → ห้ามแตะ
  | "air_no_cost_column"     // ตู้ทางอากาศ — เมทริกซ์ต้นทุนมีแค่ รถ/เรือ → ไม่เดา
  | "no_rate"                // waterfall ไม่ให้เรท (source=none) → ไม่เดา
  | "zero_basis"             // ฐาน = 0 → คำนวณไม่ได้
  | "weight_basis_cbm_rate"  // 🔴 carrier=น้ำหนัก แต่เรทเป็นเลขต่อคิว = หน่วยผิด
  | "basis_corrupt"          // ฐานต่าง momo_box_detail > 2% → ซ่อมฐานก่อน
  | "basis_unverifiable"     // ไม่มี momo_box_detail → ตรวจฐานไม่ได้ → ให้ owner เคาะ
  | "container_over_sanity"; // Σ ต่อตู้ > ฿5M → ข้ามทั้งตู้ (guard เดียวกับ production)

const SKIP_TH: Record<SkipReason, string> = {
  paid_cabinet:          "⏸ ตู้จ่ายค่าตู้แล้ว (tb_cnt_item)",
  air_no_cost_column:    "⏭ ตู้ทางอากาศ — ไม่มีเรทในเมทริกซ์ (รถ/เรือ เท่านั้น)",
  no_rate:               "⏭ ไม่มีเรท (ทั้ง tb_cost_container และ tb_settings) — ไม่เดา",
  zero_basis:            "⏭ ฐาน = 0 (คิว/นน. ว่าง) — คำนวณไม่ได้",
  weight_basis_cbm_rate: "🔴 carrier คิดตามน้ำหนัก แต่เรทเป็นเลขต่อคิว = หน่วยผิด",
  basis_corrupt:         "🔴 ฐานเพี้ยนเทียบ momo_box_detail (>2%) — ซ่อมฐานก่อน",
  basis_unverifiable:    "❔ ไม่มี momo_box_detail — ตรวจฐานไม่ได้",
  container_over_sanity: "🔴 Σ ต่อตู้ > ฿5M (sanity backstop) — ข้ามทั้งตู้",
};

type Row = {
  id: number; ftrackingchn: string; fcabinetnumber: string; userid: string; fstatus: string;
  fwarehousename: string | null; fwarehousechina: string | null; ftransporttype: string | null;
  fproductstype: string | null; fweight: unknown; fvolume: unknown; ftotalprice: unknown;
  fcosttotalprice: unknown; fprofittotal: unknown;
};

type Plan = {
  row: Row; cab: string; mode: TransportMode; rc: RowCost | null;
  newCost: number; arrived: boolean;
  skip: SkipReason | null;
  /** ฐานที่ engine จะคูณ — เทียบกับ MOMO */
  basisLabel: "คิว" | "นน." | "-";
  got: number; want: number | null;
};

async function main() {
  const client = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com",
    port: 5432,
    user: `postgres.${PROJECT_REF}`,
    password: PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();

  console.log("═".repeat(96));
  console.log(`ตั้งต้นทุนตู้ (fcosttotalprice) — ${APPLY ? "🔴 APPLY" : "DRY-RUN"}${ARRIVED_ONLY ? " · เฉพาะตู้ถึงไทยแล้ว" : ""}`);
  console.log(`prod ${PROJECT_REF} · ${new Date().toISOString()}`);
  console.log("═".repeat(96));

  // ── load ──────────────────────────────────────────────────────────────────
  const { rows } = await client.query<Row>(`
    select id, ftrackingchn, fcabinetnumber, userid, fstatus,
           fwarehousename, fwarehousechina, ftransporttype, fproductstype,
           fweight, fvolume, ftotalprice, fcosttotalprice, fprofittotal
    from tb_forwarder
    where coalesce(fcabinetnumber,'') <> ''
      and fstatus <> '99'
      and coalesce(fcosttotalprice,0) = 0
    order by fcabinetnumber, id`);

  const { rows: stRows } = await client.query(`select * from tb_settings limit 1`);
  const settings = (stRows[0] ?? {}) as Record<string, number | string | null>;
  const { rows: ccRows } = await client.query<CostContainerRow>(`select * from tb_cost_container`);
  const ccByCab = new Map<string, CostContainerRow>(ccRows.map((c) => [c.fcabinetnumber, c]));

  const cabs = [...new Set(rows.map((r) => r.fcabinetnumber))];
  const { rows: paidRows } = await client.query<{ cab: string | null }>(
    `select distinct "fCabinetNumber" as cab from tb_cnt_item where "fCabinetNumber" = any($1::text[])`,
    [cabs]);
  const paidCabs = new Set<string>(paidRows.map((p) => p.cab).filter(Boolean) as string[]);

  const { rows: boxes } = await client.query<BoxDetailRow>(`
    select box_tracking, width, length, height, weight_kg, cbm, quantity from momo_box_detail`);
  const boxByTrack = new Map<string, BoxDetailRow>();
  for (const b of boxes) boxByTrack.set(String(b.box_tracking ?? "").trim(), b);

  console.log(`\nแถวที่ยังไม่ตั้งต้นทุน (มีเลขตู้) = ${rows.length} แถว · ${cabs.length} ตู้`);
  console.log(`tb_cost_container ครอบคลุม ${cabs.filter((c) => ccByCab.has(c)).length}/${cabs.length} ตู้ (ที่เหลือ fallback → tb_settings)`);
  console.log(`ตู้ที่จ่ายค่าตู้แล้ว = ${paidCabs.size}`);

  // ── §PRECHECK — ยืนยันสมมติฐานที่ทำให้ตัดคอลัมน์ออกจาก write ──────────────────
  const nonZeroProfit = rows.filter((r) => num(r.fprofittotal) !== 0);
  console.log(`\n§PRECHECK · fprofittotal != 0 บนแถวเป้าหมาย = ${nonZeroProfit.length}` +
    (nonZeroProfit.length === 0
      ? "  → 0 ⇒ เขียน fprofittotal=0 เป็น no-op → ตัดออกจาก UPDATE ถูกต้อง ✓"
      : "  → 🔴 ไม่เป็น 0! สมมติฐานพัง — ทบทวนก่อน apply"));

  // ── plan ──────────────────────────────────────────────────────────────────
  const plans: Plan[] = [];
  for (const r of rows) {
    const cab = r.fcabinetnumber;
    // ชื่อตู้ชนะ stored ftransporttype (SOT · stored เชื่อไม่ได้ — prod มี 8 แถวใน
    // GZE260716-1 เก็บ '2'=เรือ ทั้งที่ตู้เป็นรถ → ถ้าเชื่อ stored = ได้เรทเรือ = ต้นทุนขาด)
    const mode = resolveTransportMode(cab, r.ftransporttype);
    const wh = String(r.fwarehousename ?? "");
    const basis = VALID_WH.includes(wh) ? costBasisMode(wh as WarehouseDigit) : null;
    const basisLabel: Plan["basisLabel"] = basis === "weight" ? "นน." : basis === "cbm" ? "คิว" : "-";

    const mk = (skip: SkipReason | null, rc: RowCost | null, got = 0, want: number | null = null): Plan => ({
      row: r, cab, mode, rc, newCost: rc?.cost ?? 0,
      arrived: r.fstatus >= "4", skip, basisLabel, got, want,
    });

    if (paidCabs.has(cab)) { plans.push(mk("paid_cabinet", null)); continue; }
    if (mode === "3") { plans.push(mk("air_no_cost_column", null)); continue; }

    const rc = resolveRowCost(
      {
        fwarehousename: r.fwarehousename,
        fwarehousechina: r.fwarehousechina,
        ftransporttype: mode, // "1" | "2" — air already excluded above
        fproductstype: r.fproductstype,
        fweight: num(r.fweight),
        fvolume: num(r.fvolume),
      },
      settings,
      ccByCab.get(cab) ?? null,
    );

    if (rc.rate <= 0 || rc.source === "none") { plans.push(mk("no_rate", rc)); continue; }
    if (rc.dimension <= 0) { plans.push(mk("zero_basis", rc)); continue; }

    // 🔴 หน่วยผิด — carrier บอกคิดตามน้ำหนัก แต่เรทที่ได้เป็นเลขระดับ "ต่อคิว"
    //    prod: 26 แถว tag Sang(1) อยู่ในตู้ MOMO (GZE260627-1/GZS260528-1) → engine
    //    จะเอา 4,700 (เรทต่อคิวที่บัญชีตั้ง) ไปคูณ **กิโล** = ฿7.5M/ตู้ → เด้ง sanity
    //    (= อาการ "ตั้งเรท 4,700 แล้ว apply ไม่ผ่าน" ที่ owner เจอ). ซ่อมไม่ได้ด้วยการเดา
    //    (ต้องเคาะว่า re-tag carrier → MOMO(8) หรือคิดฐานคิว) → ข้าม + รายงาน.
    if (rc.basis === "weight" && rc.rate >= PER_KG_RATE_ABSURD_MIN) {
      plans.push(mk("weight_basis_cbm_rate", rc, rc.dimension));
      continue;
    }

    // ── ตรวจฐานที่ engine จะคูณ กับ momo_box_detail (ตัวชี้ขาด dims) ──
    const b = boxByTrack.get(String(r.ftrackingchn ?? "").trim());
    if (!b) { plans.push(mk("basis_unverifiable", rc, rc.dimension)); continue; }
    const truth = resolveMomoBoxBasis({
      width: b.width, length: b.length, height: b.height,
      weightKg: b.weight_kg, cbm: b.cbm, quantity: b.quantity,
    });
    if (!truth.decided) { plans.push(mk("basis_unverifiable", rc, rc.dimension)); continue; }
    const want = rc.basis === "weight" ? truth.totalWeightKg : truth.totalCbm;
    if (relDiff(rc.dimension, want) > BASIS_TOL) {
      plans.push(mk("basis_corrupt", rc, rc.dimension, want));
      continue;
    }
    plans.push(mk(null, rc, rc.dimension, want));
  }

  // ── sanity backstop ต่อตู้ (mirror production) ─────────────────────────────
  const cabTotal = new Map<string, number>();
  for (const p of plans) if (!p.skip) cabTotal.set(p.cab, (cabTotal.get(p.cab) ?? 0) + p.newCost);
  const overCabs = new Set([...cabTotal.entries()].filter(([, t]) => t > CONTAINER_COST_SANITY_MAX).map(([c]) => c));
  for (const p of plans) if (!p.skip && overCabs.has(p.cab)) p.skip = "container_over_sanity";

  // ── report ────────────────────────────────────────────────────────────────
  const groups: Array<{ title: string; sel: (p: Plan) => boolean }> = ARRIVED_ONLY
    ? [{ title: "🔴 (ก) ตู้ถึงไทยแล้ว (fstatus ≥ 4) — กำไรผิดจริงตอนนี้ → ทำก่อน", sel: (p) => p.arrived }]
    : [
        { title: "🔴 (ก) ตู้ถึงไทยแล้ว (fstatus ≥ 4) — กำไรผิดจริงตอนนี้ → ทำก่อน", sel: (p) => p.arrived },
        { title: "⚪ (ข) ยังไม่ถึงไทย (fstatus < 4) — ยังไม่กระทบกำไรที่รายงาน", sel: (p) => !p.arrived },
      ];

  for (const g of groups) {
    const gp = plans.filter(g.sel);
    console.log(`\n${"═".repeat(96)}\n${g.title}\n${"═".repeat(96)}`);
    if (gp.length === 0) { console.log("(ไม่มี)"); continue; }

    const byCab = new Map<string, Plan[]>();
    for (const p of gp) { if (!byCab.has(p.cab)) byCab.set(p.cab, []); byCab.get(p.cab)!.push(p); }

    console.table([...byCab.entries()]
      .sort((a, b) => b[1].filter((p) => !p.skip).reduce((s, p) => s + p.newCost, 0)
                    - a[1].filter((p) => !p.skip).reduce((s, p) => s + p.newCost, 0))
      .map(([cab, ps]) => {
        const ok = ps.filter((p) => !p.skip);
        const rc0 = ps.find((p) => p.rc)?.rc;
        const rates = [...new Set(ps.filter((p) => p.rc && p.rc.rate > 0).map((p) => p.rc!.rate))];
        const srcs = [...new Set(ps.filter((p) => p.rc && p.rc.rate > 0).map((p) => p.rc!.source))];
        const sell = ps.reduce((s, p) => s + num(p.row.ftotalprice), 0);
        const cost = ok.reduce((s, p) => s + p.newCost, 0);
        const skipCounts = new Map<string, number>();
        for (const p of ps) if (p.skip) skipCounts.set(p.skip, (skipCounts.get(p.skip) ?? 0) + 1);
        return {
          ตู้: cab,
          ชนิด: modeLabel(ps[0].mode),
          เรท: rates.length ? rates.map((x) => baht(x)).join("/") : "—",
          เรทจาก: srcs.includes("container") ? "บัญชีตั้ง(ตู้)" : srcs.includes("settings") ? "default" : "—",
          ฐาน: [...new Set(ps.map((p) => p.basisLabel))].join("/"),
          "แถว แตะ/ทั้งหมด": `${ok.length}/${ps.length}`,
          "Σ ฐานที่คูณ": ok.reduce((s, p) => s + (p.rc?.dimension ?? 0), 0).toFixed(4),
          "Σ ต้นทุนที่จะลง": "฿" + baht(cost),
          "Σ ขาย": "฿" + baht(sell),
          "กำไรหลังลง": ok.length === ps.length ? "฿" + baht(sell - cost) : "(ยังไม่ครบตู้)",
          ข้าม: [...skipCounts.entries()].map(([k, n]) => `${n}×${k}`).join(" · "),
        };
      }));

    const ok = gp.filter((p) => !p.skip);
    const sell = gp.reduce((s, p) => s + num(p.row.ftotalprice), 0);
    const cost = ok.reduce((s, p) => s + p.newCost, 0);
    console.log(`→ ${g.title.slice(0, 24)}… : แตะ ${ok.length}/${gp.length} แถว · Σ ต้นทุนที่จะลง ฿${baht(cost)} · Σ ขาย ฿${baht(sell)}`);
  }

  // ── ข้ามเพราะอะไร ─────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(96)}\nข้ามเพราะอะไร (รวมทั้ง 2 กลุ่ม)\n${"═".repeat(96)}`);
  const skipAgg = new Map<SkipReason, { n: number; cabs: Set<string>; sell: number }>();
  for (const p of plans) {
    if (!p.skip) continue;
    if (!skipAgg.has(p.skip)) skipAgg.set(p.skip, { n: 0, cabs: new Set(), sell: 0 });
    const m = skipAgg.get(p.skip)!;
    m.n++; m.cabs.add(p.cab); m.sell += num(p.row.ftotalprice);
  }
  console.table([...skipAgg.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([k, m]) => ({ เหตุผล: SKIP_TH[k], แถว: m.n, ตู้: m.cabs.size, "Σ ขายที่ค้าง": "฿" + baht(m.sell) })));

  // รายละเอียดกลุ่มที่ owner ต้องเคาะ
  for (const k of ["weight_basis_cbm_rate", "basis_corrupt", "container_over_sanity"] as SkipReason[]) {
    const list = plans.filter((p) => p.skip === k);
    if (!list.length) continue;
    console.log(`\n── ${SKIP_TH[k]} · ${list.length} แถว ──`);
    console.table(list.slice(0, 30).map((p) => ({
      fid: p.row.id, tracking: p.row.ftrackingchn, ตู้: p.cab, ผู้ใช้: p.row.userid, st: p.row.fstatus,
      wh: p.row.fwarehousename, ฐาน: p.basisLabel,
      เรท: p.rc ? baht(p.rc.rate) : "—",
      "ฐานที่เก็บ": p.got.toFixed(4),
      "ฐานจริง MOMO": p.want == null ? "—" : p.want.toFixed(4),
      "ต้นทุนที่จะได้(ผิด)": p.rc ? "฿" + baht(p.rc.cost) : "—",
      ขาย: "฿" + baht(p.row.ftotalprice),
    })));
    if (list.length > 30) console.log(`  … อีก ${list.length - 30} แถว`);
  }

  // ── สรุป ──────────────────────────────────────────────────────────────────
  const willApply = plans.filter((p) => !p.skip && (!ARRIVED_ONLY || p.arrived));
  const totalCost = willApply.reduce((s, p) => s + p.newCost, 0);
  console.log(`\n${"═".repeat(96)}\nสรุป\n${"═".repeat(96)}`);
  console.table([{
    "แถวทั้งหมด": plans.length,
    "จะเขียน": willApply.length,
    "ข้าม": plans.length - willApply.length,
    "Σ ต้นทุนที่จะลง": "฿" + baht(totalCost),
    "ตู้ที่แตะ": new Set(willApply.map((p) => p.cab)).size,
  }]);

  if (!APPLY) {
    // dry-run = อ่านอย่างเดียวจริงๆ · ไม่เขียนแม้แต่ไฟล์ (แผนพิมพ์ครบด้านบนแล้ว)
    console.log(`\n(dry-run — ไม่ได้เขียนอะไรเลย · re-run พร้อม --apply เพื่อเขียน ${willApply.length} แถว)`);
    await client.end();
    return;
  }

  // ── backup ก่อนเขียน (restore ได้ทีละแถว) ──────────────────────────────────
  if (willApply.length) {
    const backupPath = `scripts/_backup-cost-backfill-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(backupPath, JSON.stringify({
      note: "restore: update tb_forwarder set fcosttotalprice = before where id = <fid>",
      generatedAt: new Date().toISOString(),
      rows: willApply.map((p) => ({
        fid: p.row.id, tracking: p.row.ftrackingchn, cab: p.cab,
        before: num(p.row.fcosttotalprice), after: p.newCost,
        rate: p.rc?.rate, source: p.rc?.source, basis: p.rc?.basis, dimension: p.rc?.dimension,
      })),
    }, null, 2));
    console.log(`\nbackup (ค่าก่อนเขียน) → ${backupPath}`);
  }

  // 🔴 เขียนจริง — txn เดียว · คอลัมน์เดียว · idempotent guard ใน WHERE
  let applied = 0;
  try {
    await client.query("begin");
    for (const p of willApply) {
      const res = await client.query(
        `update tb_forwarder set fcosttotalprice = $1
         where id = $2 and coalesce(fcosttotalprice,0) = 0`,
        [p.newCost, p.row.id]);
      applied += res.rowCount ?? 0;
    }
    await client.query("commit");
    console.log(`\n✅ APPLIED ${applied}/${willApply.length} แถว (fcosttotalprice เท่านั้น · Σ ฿${baht(totalCost)})`);
    if (applied !== willApply.length) {
      console.log(`   ⚠️ ${willApply.length - applied} แถวไม่ถูกเขียน — มีคนตั้งต้นทุนไประหว่างนั้น (idempotent guard ทำงาน)`);
    }
  } catch (e) {
    await client.query("rollback");
    console.error("\n🔴 ROLLBACK — ไม่มีอะไรถูกเขียน:", e);
    process.exitCode = 1;
  }
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
