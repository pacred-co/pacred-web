/**
 * paid-work-report-core.ts — ส่วน PURE ของรายงาน "งานที่ลูกค้าจ่ายแล้ว" (owner 2026-07-30).
 *
 * แยกจาก paid-work-report.ts (server shell) เพื่อ test ได้โดยไม่ลาก server-only เข้ามา
 * (แพทเทินเดียวกับ container-cost-rollup → container-cost-engine). ตัวจำแนกกลุ่ม +
 * การรวมรายเดือน + invariant reconcile อยู่ที่นี่. ไม่มี DB/server import.
 *
 * เนื้อหา + นิยามเงิน + วิธี paid-detection = ดู header ของ paid-work-report.ts.
 */

export type ServiceBucket = "shop" | "import";
export type TransportBucket = "road" | "sea" | "air";
export type OriginBucket = "guangzhou" | "yiwu" | "unknown";

/** 1 ออเดอร์ที่จ่ายแล้ว (normalized) — input ของ aggregatePaidWork. */
export type PaidOrderRecord = {
  service: ServiceBucket;
  /** "YYYY-MM" ของเดือนที่จ่าย */
  month: string;
  sell: number;
  cost: number;
  /** คิว (นำเข้า) · 0 สำหรับสั่งซื้อ */
  cbm: number;
  /** ขนส่ง (นำเข้าเท่านั้น) · null = สั่งซื้อ */
  transport: TransportBucket | null;
  /** ต้นทาง (นำเข้าเท่านั้น) · null = สั่งซื้อ */
  origin: OriginBucket | null;
  /** ขาย>0 แต่ ทุน=0 (ยังไม่ตั้ง/ยังไม่ลงต้นทุน) */
  unpriced: boolean;
};

export type PaidMetric = {
  orders: number;
  cbm: number;
  sell: number;
  cost: number;
  profit: number;
};

export type PaidWorkMonth = {
  /** "YYYY-MM" */
  month: string;
  total: PaidMetric;
  byService: { shop: PaidMetric; import: PaidMetric };
  /** เฉพาะนำเข้า (สั่งซื้อไม่มีขนส่ง) */
  byTransport: { road: PaidMetric; sea: PaidMetric; air: PaidMetric };
  /** เฉพาะนำเข้า (สั่งซื้อไม่มีต้นทาง) */
  byOrigin: { guangzhou: PaidMetric; yiwu: PaidMetric; unknown: PaidMetric };
  unpricedOrders: number;
};

export type PaidWorkReport = {
  months: PaidWorkMonth[];
  grand: PaidMetric & { unpricedOrders: number };
  /** ช่วงที่กรอง (display · ว่าง = ทั้งหมด) */
  rangeStart: string;
  rangeEnd: string;
};

/** ขนส่งจากโหมด (resolveTransportMode: "1"=รถ · "2"=เรือ · "3"=อากาศ). */
export function transportBucketOf(mode: "1" | "2" | "3"): TransportBucket {
  return mode === "2" ? "sea" : mode === "3" ? "air" : "road";
}

/** ต้นทางจาก fwarehousechina ("1"=กวางโจว · "2"=อี้อู · อื่น=ไม่ระบุ). */
export function originBucketOf(fwarehousechina: string | null | undefined): OriginBucket {
  const v = String(fwarehousechina ?? "").trim();
  return v === "1" ? "guangzhou" : v === "2" ? "yiwu" : "unknown";
}

// ── pure aggregation ──────────────────────────────────────────────────
type Acc = { orders: number; cbm: number; sell: number; cost: number };
const emptyAcc = (): Acc => ({ orders: 0, cbm: 0, sell: 0, cost: 0 });
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;

function addTo(a: Acc, r: PaidOrderRecord): void {
  a.orders += 1;
  a.cbm += r.cbm;
  a.sell += r.sell;
  a.cost += r.cost;
}
function finalize(a: Acc): PaidMetric {
  return { orders: a.orders, cbm: round6(a.cbm), sell: round2(a.sell), cost: round2(a.cost), profit: round2(a.sell - a.cost) };
}

type MonthAcc = {
  total: Acc; shop: Acc; imp: Acc;
  road: Acc; sea: Acc; air: Acc;
  guangzhou: Acc; yiwu: Acc; unknown: Acc;
  unpriced: number;
};
const emptyMonthAcc = (): MonthAcc => ({
  total: emptyAcc(), shop: emptyAcc(), imp: emptyAcc(),
  road: emptyAcc(), sea: emptyAcc(), air: emptyAcc(),
  guangzhou: emptyAcc(), yiwu: emptyAcc(), unknown: emptyAcc(),
  unpriced: 0,
});

/**
 * รวม records → รายเดือน (เดือนล่าสุดก่อน) + grand total.
 * invariant (reconcile): ต่อเดือน Σ byService = total · Σ byTransport = import ·
 * Σ byOrigin = import (ทุกแถวนำเข้าเข้ากลุ่มเดียว · สั่งซื้อไม่เข้า transport/origin).
 */
export function aggregatePaidWork(
  records: PaidOrderRecord[],
  rangeStart = "",
  rangeEnd = "",
): PaidWorkReport {
  const byMonth = new Map<string, MonthAcc>();
  const grand = emptyAcc();
  let grandUnpriced = 0;

  for (const r of records) {
    let m = byMonth.get(r.month);
    if (!m) { m = emptyMonthAcc(); byMonth.set(r.month, m); }
    addTo(m.total, r);
    addTo(grand, r);
    if (r.unpriced) { m.unpriced += 1; grandUnpriced += 1; }
    if (r.service === "shop") {
      addTo(m.shop, r);
    } else {
      addTo(m.imp, r);
      if (r.transport === "sea") addTo(m.sea, r);
      else if (r.transport === "air") addTo(m.air, r);
      else addTo(m.road, r);
      if (r.origin === "guangzhou") addTo(m.guangzhou, r);
      else if (r.origin === "yiwu") addTo(m.yiwu, r);
      else addTo(m.unknown, r);
    }
  }

  const months: PaidWorkMonth[] = Array.from(byMonth.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // เดือนล่าสุดก่อน
    .map(([month, m]) => ({
      month,
      total: finalize(m.total),
      byService: { shop: finalize(m.shop), import: finalize(m.imp) },
      byTransport: { road: finalize(m.road), sea: finalize(m.sea), air: finalize(m.air) },
      byOrigin: { guangzhou: finalize(m.guangzhou), yiwu: finalize(m.yiwu), unknown: finalize(m.unknown) },
      unpricedOrders: m.unpriced,
    }));

  return {
    months,
    grand: { ...finalize(grand), unpricedOrders: grandUnpriced },
    rangeStart,
    rangeEnd,
  };
}
