/**
 * container-cost-rollup.ts — ต้นทุนตู้แบบ "ยกเข่ง" สำหรับหน้า รายการตู้ (LIST).
 *
 * owner 2026-07-23: "ตู้นี้ทำไมไปโชว์ −เป็นแสนบาทเลยครับ แต่พอกดข้างใน +สามหมื่นห้า
 * ทันยังไงกันแน่ครับ ... ทุกข้อมูลทุกคนเชื่อ และเอาไปทำงานจริงนะครับ"
 *
 * ก่อนหน้านี้ LIST กับ DETAIL คิดต้นทุนคนละเครื่อง:
 *   LIST   = Σ `fcosttotalprice` ที่เก็บใน DB (ผ่าน RPC get_container_summary.sum_cost)
 *   DETAIL = คิดสด เรทต้นทุน × คิว ทุกครั้งที่เปิดหน้า
 * ⇒ ค่าที่เก็บผิดเมื่อไหร่ สองจอพูดคนละเรื่องทันที (GZE260720-1: 391,437 vs 25,068).
 *
 * ไฟล์นี้ทำให้ LIST ใช้ **เครื่องเดียวกับ DETAIL** (lib/forwarder/container-cost-engine)
 * → ต่อให้ค่าที่เก็บไว้เพี้ยน สองจอก็ยังตรงกัน เพราะมันมาจากกฎเดียวกัน.
 *
 * ══ ราคาที่ต้องจ่าย (perf) ══
 * 3 query ต่อการโหลด LIST หนึ่งครั้ง แต่ scope แค่ "ตู้ที่มองเห็นบนจอ" เท่านั้น
 * (prod 2026-07-23: waiting 11 ตู้/282 แถว · succeed 90 วัน 40 ตู้/568 แถว) —
 * เล็กกว่า fallback เดิมที่ดึง 50,000 แถวมาก. แพทเทินเดียวกับ
 * getContainerCompletenessBatch ที่หน้านี้เรียกอยู่แล้ว.
 *
 * READ-ONLY ล้วน — ไม่เขียน DB. fail-soft ทุก query (พังแล้วคืน {} → LIST ตกกลับไป
 * ใช้ค่าที่เก็บไว้แบบเดิม ไม่ทำให้หน้าพัง).
 */

import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { costColumn, type WarehouseDigit, type CostTransport } from "@/lib/forwarder/resolve-cost";
import {
  resolveContainerWarehouse,
  rollupContainerCost,
  type ContainerRates,
  type CostEngineRow,
} from "@/lib/forwarder/container-cost-engine";
import { baseTracking, filterCountableForwarderRows } from "@/lib/admin/momo-bill-header";
import { totalCbmOf } from "@/lib/forwarder/quantities";
import { bangkokClockParts } from "@/lib/utils/thai-datetime";

type AdminClient = ReturnType<typeof createAdminClient>;

type FwCostRow = CostEngineRow & {
  fcabinetnumber: string;
  fwarehousename: string | null;
  fwarehousechina: string | null;
  ftransporttype: string | null;
};

export type ContainerCostSummary = {
  /** Σ ต้นทุนของตู้ — ตัวเลขเดียวกับที่หน้า DETAIL โชว์ */
  costSum: number;
  /** จำนวนแถวที่คิดสด (ตู้ยังไม่จ่ายค่าตู้ + มีเรท) */
  liveRows: number;
  /** จำนวนแถวที่ใช้ค่าที่เก็บไว้ (จ่ายค่าตู้แล้ว / ไม่มีเรท) */
  storedRows: number;
};

const SETTINGS_ID = 1;

/**
 * ต้นทุนของหลายตู้ในทีเดียว.
 *
 * @param cabinets       เลขตู้ที่กำลังแสดงบนจอ
 * @param paidCabinets   ตู้ที่จ่ายค่าตู้แล้ว (มีแถวใน tb_cnt_item) → ล็อกค่าที่เก็บไว้
 *                       ตรงกับกติกาของ DETAIL (cabinetIsPaid)
 * @returns Record keyed by เลขตู้ — ตู้ที่ไม่มีข้อมูลจะไม่มี key (ให้ caller fallback เอง)
 */
export async function getContainerCostRollupBatch(
  admin: AdminClient,
  cabinets: string[],
  paidCabinets: Set<string>,
): Promise<Record<string, ContainerCostSummary>> {
  const uniqCabs = Array.from(new Set(cabinets.filter(Boolean)));
  if (uniqCabs.length === 0) return {};

  // ── 1) แถวสินค้าของตู้ที่มองเห็น ──
  const { data: fwRaw, error: fwErr } = await admin
    .from("tb_forwarder")
    .select(
      "fcabinetnumber, fwarehousename, fwarehousechina, ftransporttype, fproductstype, fvolume, famount, famountcount, fweight, fcosttotalprice",
    )
    .in("fcabinetnumber", uniqCabs)
    .neq("fstatus", "99") // ตู้/แถวที่ยกเลิก — ตรงกับ RPC (mig 0190)
    .limit(100_000);
  if (fwErr) {
    console.error(`[getContainerCostRollupBatch tb_forwarder] failed`, {
      code: fwErr.code, message: fwErr.message, cabinetCount: uniqCabs.length,
    });
    return {};
  }
  const rows = (fwRaw ?? []) as FwCostRow[];
  if (rows.length === 0) return {};

  const byCabinet = new Map<string, FwCostRow[]>();
  for (const r of rows) {
    const key = r.fcabinetnumber;
    if (!key) continue;
    const arr = byCabinet.get(key);
    if (arr) arr.push(r);
    else byCabinet.set(key, [r]);
  }

  // ── 2) เรทที่บัญชีตั้งไว้ต่อตู้ (tb_cost_container ชนะเสมอ) ──
  const rateByCab = new Map<string, ContainerRates>();
  {
    const { data: crRaw, error: crErr } = await admin
      .from("tb_cost_container")
      .select("fcabinetnumber, fproductstype1, fproductstype2, fproductstype3, fproductstype4")
      .in("fcabinetnumber", uniqCabs);
    if (crErr) {
      console.error(`[getContainerCostRollupBatch tb_cost_container] failed`, {
        code: crErr.code, message: crErr.message,
      });
    }
    for (const c of (crRaw ?? []) as Array<{
      fcabinetnumber: string;
      fproductstype1: number | string | null;
      fproductstype2: number | string | null;
      fproductstype3: number | string | null;
      fproductstype4: number | string | null;
    }>) {
      rateByCab.set(c.fcabinetnumber, {
        p1: Number(c.fproductstype1 ?? 0) || 0,
        p2: Number(c.fproductstype2 ?? 0) || 0,
        p3: Number(c.fproductstype3 ?? 0) || 0,
        p4: Number(c.fproductstype4 ?? 0) || 0,
      });
    }
  }

  // ── 3) tb_settings (fallback เมื่อบัญชียังไม่ตั้งเรทให้ตู้นั้น) — ดึงครั้งเดียว ──
  let settingsRow: Record<string, number | string | null> | null = null;
  const needsSettings = Array.from(byCabinet.keys()).some((cab) => !rateByCab.has(cab));
  if (needsSettings) {
    const { data: sRaw, error: sErr } = await admin
      .from("tb_settings")
      .select("*")
      .eq("id", SETTINGS_ID)
      .maybeSingle<Record<string, number | string | null>>();
    if (sErr) {
      console.error(`[getContainerCostRollupBatch tb_settings] failed`, { code: sErr.code, message: sErr.message });
    }
    settingsRow = sRaw ?? null;
  }

  // ── 4) คิดต่อตู้ ด้วยเครื่องเดียวกับ DETAIL ──
  const result: Record<string, ContainerCostSummary> = {};
  for (const [cab, cabRows] of byCabinet) {
    const containerWarehouse = resolveContainerWarehouse(cabRows);
    const rates =
      rateByCab.get(cab) ?? defaultRatesForCabinet(cab, cabRows, containerWarehouse, settingsRow);
    result[cab] = rollupContainerCost(cabRows, {
      rates,
      containerWarehouse,
      cabinetIsPaid: paidCabinets.has(cab),
    });
  }
  return result;
}

/**
 * เรทมาตรฐานเมื่อบัญชียังไม่ตั้ง tb_cost_container ให้ตู้นั้น:
 * โกดัง × โหมดขนส่ง × ประเภทสินค้า × เมืองต้นทาง.
 * โหมดขนส่ง ยึด "ชื่อตู้" เป็นหลัก (GZS=เรือ · GZE/EK=รถ) เหมือน DETAIL —
 * ftransporttype ที่เก็บไว้เชื่อไม่ได้เสมอ (owner 2026-06-19).
 * แชร์สมองเดียวกันระหว่าง LIST rollup + กำไรตู้รายเดือน (ห้ามก๊อปสูตร — drift).
 */
function defaultRatesForCabinet(
  cab: string,
  cabRows: FwCostRow[],
  containerWarehouse: string,
  settingsRow: Record<string, number | string | null> | null,
): ContainerRates {
  const firstChina = cabRows.find((r) => String(r.fwarehousechina ?? "").trim())?.fwarehousechina ?? "";
  const storedTransport = cabRows.find((r) => String(r.ftransporttype ?? "").trim())?.ftransporttype ?? null;
  const mode = resolveTransportMode(cab, storedTransport);
  const transport: CostTransport = mode === "2" ? "2" : "1";
  const cols = ([1, 2, 3, 4] as const).map((i) =>
    containerWarehouse ? costColumn(containerWarehouse as WarehouseDigit, i, transport, String(firstChina)) : null,
  );
  const pick = (col: string | null): number => {
    if (!col || !settingsRow) return 0;
    return Number(settingsRow[col] ?? 0) || 0;
  };
  return { p1: pick(cols[0]), p2: pick(cols[1]), p3: pick(cols[2]), p4: pick(cols[3]) };
}

// ═══════════════════════════════════════════════════════════════════════
// กำไรตู้รายเดือน (owner 2026-07-29 · ต่อยอดงานปอน system-reports)
//
// "เช็คต้นทุนตู้ และกำไรต้นทุนของแต่ละตู้ทั้งหมด · ดูกำไรรายตู้ และรายเดือนได้
//  ตรงเลขตู้เลย · ทั้งกวางโจว-อี้อู · เอาแค่งานที่มี PR ในระบบ"
//
// - เดือน = อ่านจาก "เลขตู้" ตรงๆ (GZS260723-1 → 2026-07) — ตรงกับที่ owner สั่ง
//   "รายเดือนได้ตรงเลขตู้"; ชื่อที่ไม่มีวันที่ (SEA0625-8211YW ฯลฯ) fallback เป็น
//   เดือนปิดตู้ → เดือนถึงไทย (เวลาไทย) → "ไม่ระบุเดือน".
// - scope: แถวที่ userid เป็น PR จริง (^PR\d+$) เท่านั้น (ตัด NO CODE / placeholder /
//   staff-code) — ต่างจาก report-cnt ที่รวมทุกแถว (ตั้งใจ · owner สั่ง).
// - ทุน = เครื่องเดียวกับ report-cnt LIST/DETAIL (rollupContainerCost — live เมื่อ
//   ยังไม่จ่ายค่าตู้ · stored เมื่อจ่ายแล้ว/ไม่มีเรท) → เลขตรงกันข้ามหน้า.
// - ขาย = Σ ftotalprice (ค่านำเข้าจีน-ไทย ต่อแถว — SOT เดียวกับ report-cnt).
// - กล่อง/คิว นับเฉพาะแถว countable (ตัดหัวบิล MOMO placeholder — กันนับเบิ้ล).
// READ-ONLY ล้วน · fail-soft.
// ═══════════════════════════════════════════════════════════════════════

type ProfitFwRow = FwCostRow & {
  userid: string | null;
  ftotalprice: number | string | null;
  ftrackingchn: string | null;
  fdatecontainerclose: string | null;
  fdatetothai: string | null;
};

export type ContainerProfitEntry = {
  cabinet: string;
  /** "8"=MOMO(กวางโจว) · "9"=TTW(อี้อู) · อื่นๆ ตาม digit */
  warehouse: string;
  /** เมืองต้นทาง: "1"=กวางโจว · "2"=อี้อู · "" ไม่ระบุ */
  originChina: string;
  shipments: number;
  boxes: number;
  cbm: number;
  weightKg: number;
  cost: number;
  sell: number;
  profit: number;
  /** แถวที่ทุนคิดสด vs ล็อกค่าที่เก็บ (จ่ายค่าตู้แล้ว) */
  liveRows: number;
  storedRows: number;
  /** แถวจริงที่ยังไม่ตั้งราคาขาย (sell=0 ทั้งที่มีน้ำหนัก/คิว) — ธงให้ pricing */
  unpricedRows: number;
};

export type ContainerProfitMonth = {
  /** "2026-07" · "ไม่ระบุเดือน" ท้ายสุด */
  month: string;
  containers: ContainerProfitEntry[];
  cost: number;
  sell: number;
  profit: number;
};

export type ContainerProfitByMonth = {
  months: ContainerProfitMonth[];
  grand: { containers: number; cost: number; sell: number; profit: number };
};

/** เดือนจากเลขตู้: GZS/GZE/GZA/YWS/YWE/YWA + YYMMDD → "20YY-MM". ไม่เข้าแพทเทิน → null. */
export function monthFromCabinetName(cab: string): string | null {
  const m = /^(?:GZ|YW)[A-Z](\d{6})/.exec(cab.trim());
  if (!m) return null;
  const yy = m[1].slice(0, 2);
  const mm = m[1].slice(2, 4);
  const mmNum = Number(mm);
  if (mmNum < 1 || mmNum > 12) return null;
  return `20${yy}-${mm}`;
}

const UNKNOWN_MONTH = "ไม่ระบุเดือน";

function monthFromDbDate(v: string | null): string | null {
  const parts = bangkokClockParts(v);
  if (!parts) return null;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export async function getContainerProfitByMonth(
  admin: AdminClient,
): Promise<ContainerProfitByMonth> {
  const empty: ContainerProfitByMonth = {
    months: [],
    grand: { containers: 0, cost: 0, sell: 0, profit: 0 },
  };

  // ── 1) ทุกแถวที่อยู่ตู้จริง + เป็นงาน PR ──
  const { data: fwRaw, error: fwErr } = await admin
    .from("tb_forwarder")
    .select(
      "fcabinetnumber, fwarehousename, fwarehousechina, ftransporttype, fproductstype, fvolume, famount, famountcount, fweight, fcosttotalprice, userid, ftotalprice, ftrackingchn, fdatecontainerclose, fdatetothai",
    )
    .neq("fstatus", "99")
    .neq("fcabinetnumber", "")
    .neq("fcabinetnumber", "0")
    .like("userid", "PR%")
    .limit(100_000);
  if (fwErr) {
    console.error(`[getContainerProfitByMonth tb_forwarder] failed`, {
      code: fwErr.code, message: fwErr.message,
    });
    return empty;
  }
  // PR จริงเท่านั้น (like 'PR%' ยังปล่อย 'PRF...' สมมุติหลุดมาได้ — กรองซ้ำด้วย regex)
  const rows = ((fwRaw ?? []) as ProfitFwRow[]).filter((r) =>
    /^PR\d+$/.test(String(r.userid ?? "").trim()),
  );
  if (rows.length === 0) return empty;

  const byCabinet = new Map<string, ProfitFwRow[]>();
  for (const r of rows) {
    const key = String(r.fcabinetnumber ?? "").trim();
    if (!key) continue;
    const arr = byCabinet.get(key);
    if (arr) arr.push(r);
    else byCabinet.set(key, [r]);
  }
  const cabs = Array.from(byCabinet.keys());

  // ── 2) ตู้ที่จ่ายค่าตู้แล้ว (tb_cnt_item → ล็อกทุนที่เก็บไว้ เหมือน DETAIL) ──
  const paidCabinets = new Set<string>();
  {
    const { data: paidRaw, error: paidErr } = await admin
      .from("tb_cnt_item")
      .select("fCabinetNumber")
      .in("fCabinetNumber", cabs);
    if (paidErr) {
      console.error(`[getContainerProfitByMonth tb_cnt_item] failed`, {
        code: paidErr.code, message: paidErr.message,
      });
    }
    for (const p of (paidRaw ?? []) as Array<{ fCabinetNumber: string | null }>) {
      if (p.fCabinetNumber) paidCabinets.add(p.fCabinetNumber);
    }
  }

  // ── 3) เรทต่อตู้ (tb_cost_container ชนะ · fallback tb_settings) — สมองเดียวกับ LIST ──
  const rateByCab = new Map<string, ContainerRates>();
  {
    const { data: crRaw, error: crErr } = await admin
      .from("tb_cost_container")
      .select("fcabinetnumber, fproductstype1, fproductstype2, fproductstype3, fproductstype4")
      .in("fcabinetnumber", cabs);
    if (crErr) {
      console.error(`[getContainerProfitByMonth tb_cost_container] failed`, {
        code: crErr.code, message: crErr.message,
      });
    }
    for (const c of (crRaw ?? []) as Array<{
      fcabinetnumber: string;
      fproductstype1: number | string | null;
      fproductstype2: number | string | null;
      fproductstype3: number | string | null;
      fproductstype4: number | string | null;
    }>) {
      rateByCab.set(c.fcabinetnumber, {
        p1: Number(c.fproductstype1 ?? 0) || 0,
        p2: Number(c.fproductstype2 ?? 0) || 0,
        p3: Number(c.fproductstype3 ?? 0) || 0,
        p4: Number(c.fproductstype4 ?? 0) || 0,
      });
    }
  }
  let settingsRow: Record<string, number | string | null> | null = null;
  if (cabs.some((cab) => !rateByCab.has(cab))) {
    const { data: sRaw, error: sErr } = await admin
      .from("tb_settings")
      .select("*")
      .eq("id", SETTINGS_ID)
      .maybeSingle<Record<string, number | string | null>>();
    if (sErr) {
      console.error(`[getContainerProfitByMonth tb_settings] failed`, { code: sErr.code, message: sErr.message });
    }
    settingsRow = sRaw ?? null;
  }

  // ── 4) คิดต่อตู้ + จัดกลุ่มเดือน ──
  const num = (v: number | string | null | undefined) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const monthMap = new Map<string, ContainerProfitEntry[]>();

  for (const [cab, cabRows] of byCabinet) {
    const containerWarehouse = resolveContainerWarehouse(cabRows);
    const rates =
      rateByCab.get(cab) ?? defaultRatesForCabinet(cab, cabRows, containerWarehouse, settingsRow);
    const costRoll = rollupContainerCost(cabRows, {
      rates,
      containerWarehouse,
      cabinetIsPaid: paidCabinets.has(cab),
    });

    // ขาย = Σ ftotalprice ทุกแถว PR (หัวบิล placeholder เงิน 0 → บวก 0 = ไม่เบิ้ล)
    const sell = round2(cabRows.reduce((s, r) => s + num(r.ftotalprice), 0));

    // กล่อง/คิว/น้ำหนัก = เฉพาะแถว countable (ตัดหัวบิล MOMO — กันนับเบิ้ล ตาม SOT)
    const countable = filterCountableForwarderRows(cabRows, {
      tracking: (r) => r.ftrackingchn,
      weight: (r) => num(r.fweight),
      userid: (r) => String(r.userid ?? ""),
      money: (r) => num(r.ftotalprice),
    });
    const boxes = countable.reduce((s, r) => s + num(r.famount), 0);
    const cbm = round2(countable.reduce((s, r) => s + totalCbmOf(r), 0));
    const weightKg = round2(countable.reduce((s, r) => s + num(r.fweight), 0));
    const shipments = new Set(
      countable.map((r) => baseTracking(r.ftrackingchn) ?? `#${String(r.ftrackingchn ?? "")}`),
    ).size;
    const unpricedRows = countable.filter(
      (r) => num(r.ftotalprice) === 0 && (num(r.fweight) > 0 || totalCbmOf(r) > 0),
    ).length;

    const origin = cabRows.find((r) => String(r.fwarehousechina ?? "").trim())?.fwarehousechina ?? "";
    const month =
      monthFromCabinetName(cab)
      ?? monthFromDbDate(cabRows.find((r) => r.fdatecontainerclose)?.fdatecontainerclose ?? null)
      ?? monthFromDbDate(cabRows.find((r) => r.fdatetothai)?.fdatetothai ?? null)
      ?? UNKNOWN_MONTH;

    const entry: ContainerProfitEntry = {
      cabinet: cab,
      warehouse: containerWarehouse,
      originChina: String(origin ?? "").trim(),
      shipments,
      boxes,
      cbm,
      weightKg,
      cost: costRoll.costSum,
      sell,
      profit: round2(sell - costRoll.costSum),
      liveRows: costRoll.liveRows,
      storedRows: costRoll.storedRows,
      unpricedRows,
    };
    const arr = monthMap.get(month);
    if (arr) arr.push(entry);
    else monthMap.set(month, [entry]);
  }

  // เรียง: เดือนล่าสุดก่อน · "ไม่ระบุเดือน" ท้ายสุด · ในเดือนเรียงเลขตู้
  const months: ContainerProfitMonth[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => {
      if (a === UNKNOWN_MONTH) return 1;
      if (b === UNKNOWN_MONTH) return -1;
      return b.localeCompare(a);
    })
    .map(([month, containers]) => {
      containers.sort((a, b) => a.cabinet.localeCompare(b.cabinet));
      const cost = round2(containers.reduce((s, c) => s + c.cost, 0));
      const sell = round2(containers.reduce((s, c) => s + c.sell, 0));
      return { month, containers, cost, sell, profit: round2(sell - cost) };
    });

  const grand = {
    containers: cabs.length,
    cost: round2(months.reduce((s, m) => s + m.cost, 0)),
    sell: round2(months.reduce((s, m) => s + m.sell, 0)),
    profit: 0,
  };
  grand.profit = round2(grand.sell - grand.cost);

  return { months, grand };
}
