/**
 * Booking pricing catalog — types + helpers (pure module · server+client safe).
 *
 * 2026-07-10 (ปอน · owner brief) — the "ตั้งค่า" ของหน้า Booking นำเข้า = ให้ Pricing
 * ตั้ง/แก้ "เรทตั้งต้น" ต่อเงื่อนไข (Term × ขนส่ง × LCL/FCL) เอง แล้วเก็บเป็น DATA
 * (Supabase `booking_pricing_catalog` · mig 0248) → หน้าใบเสนอราคา (Condition Builder)
 * ดึงชุด line-item + ราคาไปใช้. อ้างอิงจากไฟล์ "แบบฟรอมออกราคา IMPORT" (CSV ต่อ combo).
 *
 * MONEY MODEL (สำคัญ · lib/admin/money-visibility.ts):
 *   • sale   = ราคาขาย (SELL) — โชว์ทุก role (รวมลูกค้า)
 *   • cost   = ต้นทุน — เฉพาะ canViewCost (ultra/accounting/pricing)
 *   • profit = กำไร — เฉพาะ canViewProfit (+super)
 *   cost/profit ถูก "ตัดออกที่ชั้น data" (server action) ก่อนส่งให้ client ที่ไม่มีสิทธิ์
 *   → super เห็นกำไร แต่ back-out ต้นทุนไม่ได้ (จึงเก็บ profit แยกจาก cost ไม่ใช่ sale−cost).
 */

export type CatalogLine = {
  id: string;
  group: string; // Freight / Origin / Customs / Document / D/O / Transport / Port / Receipt / Special
  desc: string; // คำอธิบาย (ไทย + อังกฤษ)
  unit: string; // "THB/SET" | "THB/CBM" | "THB/CONT" | "THB/RT" | "ใบเสร็จจริง" ...
  sale: number; // ราคาขาย (SELL · THB) — default ที่ดึงไปใส่ในใบเสนอราคา
  cost?: number; // ต้นทุน (THB) — canViewCost เท่านั้น (ถูก strip ออกถ้าไม่มีสิทธิ์)
  profit?: number; // กำไร (THB) — canViewProfit เท่านั้น (เก็บแยก · ไม่ derive จาก cost)
  vat: boolean; // คิด VAT 7%
  wht: number; // หัก ณ ที่จ่าย % (ปกติ 0)
  receipt?: boolean; // เก็บตามใบเสร็จจริง (ไม่คิด VAT · pass-through · ไม่คิดกำไร)
  note?: string;
};

export type CatalogTemplate = {
  key: string; // `${term}_${service}_${loadType}` เช่น CIF_SEA_FCL / CIF_AIR_LCL
  label: string; // "IM CIF · SEA FCL"
  service: string; // SEA / AIR / TRUCK
  loadType: string; // LCL / FCL
  term: string; // EXW / FOB / CIF / DDP
  note: string; // หมายเหตุตั้งต้น (แสดงในใบเสนอราคา)
  lines: CatalogLine[];
  updatedAt?: string;
  updatedBy?: string;
};

/** LCL/FCL มีเฉพาะทางเรือ (SEA) · AIR/TRUCK = รวม (LCL) เสมอ. */
export function usesLoadType(service: string): boolean {
  return /SEA/i.test(service);
}

/** ขนาดตู้เกี่ยวเฉพาะ FCL (เหมาตู้). */
export function usesContainer(loadType: string): boolean {
  return /FCL/i.test(loadType);
}

/** key ของ catalog = term + ขนส่ง + LCL/FCL (AIR/TRUCK → LCL เสมอ). */
export function catalogKeyOf(c: { term: string; service: string; loadType: string }): string {
  const load = usesLoadType(c.service) ? c.loadType : "LCL";
  return `${c.term}_${c.service}_${load}`.toUpperCase();
}

/** ป้ายอ่านง่ายของ combo (สำหรับ dropdown/หัวการ์ด). */
export function templateLabel(t: { term: string; service: string; loadType: string }): string {
  const svc = usesLoadType(t.service) ? `${t.service} ${t.loadType}` : t.service;
  return `IM ${t.term} · ${svc}`;
}

export type CatalogTotals = {
  vatBase: number; // ฐานที่คิด VAT (บริการที่มี VAT · ไม่รวม receipt)
  vat: number; // VAT 7%
  nonVat: number; // บริการไม่คิด VAT (ไม่ใช่ receipt)
  receiptTotal: number; // เงินทดลองจ่าย / เก็บตามใบเสร็จจริง
  grand: number; // ยอดเสนอราคารวม
  costTotal: number; // Σ ต้นทุน (canViewCost) — 0 ถ้าถูก strip
  profitTotal: number; // Σ กำไร (canViewProfit) — 0 ถ้าถูก strip
};

/** คำนวณยอด (SELL) + ต้นทุน/กำไรรวม (ถ้ามีค่า). qty อยู่ที่ line ระดับใบเสนอราคา. */
export function computeCatalogTotals(
  lines: { sale?: number; unitPrice?: number; qty: number; vat: boolean; receipt?: boolean; cost?: number; profit?: number }[],
): CatalogTotals {
  let vatBase = 0, nonVat = 0, receiptTotal = 0, costTotal = 0, profitTotal = 0;
  for (const l of lines) {
    const qty = Number(l.qty) || 0;
    const price = Number(l.unitPrice ?? l.sale ?? 0) || 0;
    const amt = qty * price;
    if (l.receipt) receiptTotal += amt;
    else if (l.vat) vatBase += amt;
    else nonVat += amt;
    if (!l.receipt) {
      if (typeof l.cost === "number") costTotal += qty * l.cost;
      if (typeof l.profit === "number") profitTotal += qty * l.profit;
    }
  }
  const vat = Math.round(vatBase * 0.07 * 100) / 100;
  const grand = Math.round((vatBase + vat + nonVat + receiptTotal) * 100) / 100;
  return {
    vatBase, vat, nonVat, receiptTotal,
    grand,
    costTotal: Math.round(costTotal * 100) / 100,
    profitTotal: Math.round(profitTotal * 100) / 100,
  };
}

export const bahtFmt = (n: number): string =>
  (Number(n) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** strip cost/profit ตามสิทธิ์ (server ใช้ก่อนส่งให้ client). */
export function stripTemplateMoney(
  t: CatalogTemplate,
  opts: { showCost: boolean; showProfit: boolean },
): CatalogTemplate {
  if (opts.showCost && opts.showProfit) return t;
  return {
    ...t,
    lines: t.lines.map((l) => ({
      ...l,
      cost: opts.showCost ? l.cost : undefined,
      profit: opts.showProfit ? l.profit : undefined,
    })),
  };
}
