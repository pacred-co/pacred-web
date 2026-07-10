/**
 * ใบเสนอราคา (Quotation) — เงื่อนไข + ตัวช่วย. line-item templates ย้ายไป DB catalog
 * (Supabase booking_pricing_catalog · mig 0248) ให้ Pricing ตั้งเรทเองในหน้า "ตั้งค่า".
 *
 * 2026-07-10 (ปอน) — เดิม seed เรทไว้ในโค้ด (IMPORT_QUOTE_TEMPLATES). ตอนนี้ดึงจาก catalog
 *   (DB) ที่ page.tsx โหลดมาแล้วส่งเป็น prop → linesForConditions(cond, catalog).
 *   key ของ combo = `${term}_${service}_${loadType}` (catalogKeyOf · AIR/TRUCK → LCL).
 *   ราคาที่โชว์ = SELL · cost/profit ติดมากับ line (canView เท่านั้น · strip ที่ server).
 */

import {
  catalogKeyOf, computeCatalogTotals, bahtFmt as bahtFmtBase,
  usesLoadType as usesLoadTypeBase, usesContainer as usesContainerBase,
  type CatalogTemplate,
} from "@/lib/booking/catalog";

export type QuoteConditions = {
  direction: string; // IMPORT / EXPORT (ตอนนี้เปิดเฉพาะ IMPORT · EXPORT เร็วๆนี้)
  service: string; // SEA / AIR / TRUCK (ขนส่ง · เลือกก่อน)
  loadType: string; // LCL / FCL (เฉพาะทางเรือ SEA · โหมดอื่นบังคับ LCL)
  term: string; // EXW / FOB / CIF / DDP
  port: string; // PAT / LCB / BKK / SUV
  container: string; // ขนาดตู้ (เฉพาะ SEA FCL): 1×20' / 1×40'HC / 2×40' / Mixed
  enter: string; // Normal / Change Status / Document Amend / Direct / Indirect
  special: string[]; // License / Manpower / Local Transport / Overtime
};

export type QuoteLine = {
  id: string;
  group: string; // Freight / Origin / Customs / Document / D/O / Transport / Port / Receipt / Special
  desc: string; // คำอธิบาย (ไทย)
  qty: number;
  unitPrice: number; // SELL (THB)
  vat: boolean; // คิด VAT 7%
  wht: number; // หัก ณ ที่จ่าย % (ปกติ 0 ในชุดนี้)
  receipt?: boolean; // เงินทดลองจ่าย / เก็บตามใบเสร็จจริง (ไม่มี VAT · ไม่รวมฐาน VAT)
  note?: string;
  unit?: string; // หน่วย (THB/SET, THB/CBM, …) — จาก catalog
  cost?: number; // ต้นทุน/หน่วย — canViewCost เท่านั้น (undefined ถ้าถูก strip)
  profit?: number; // กำไร/หน่วย — canViewProfit เท่านั้น (undefined ถ้าถูก strip)
};

export const DIRECTION_OPTIONS = ["IMPORT", "EXPORT"]; // EXPORT ปิดไว้ (เร็วๆนี้)
export const SERVICE_OPTIONS = ["SEA", "AIR", "TRUCK"]; // ขนส่ง (mode · เลือกก่อน)
export const LOAD_TYPE_OPTIONS = ["LCL", "FCL"]; // ประเภท (เฉพาะทางเรือ SEA)
export const TERM_OPTIONS = ["EXW", "FOB", "CIF", "DDP"];
export const PORT_OPTIONS = ["PAT", "LCB", "BKK", "SUV"];
export const CONTAINER_OPTIONS = ["1×20'", "1×40'HC", "2×40'", "Mixed"]; // ขนาดตู้ (เฉพาะ SEA FCL)
export const ENTER_OPTIONS = ["Normal", "Change Status", "Document Amend", "Direct", "Indirect"];
export const SPECIAL_OPTIONS = ["License", "Manpower", "Local Transport", "Overtime"];

/** ผู้ออกเอกสาร (หัวใบเสนอราคา) — จาก CSV/mockup. */
export const PACRED_ISSUER = {
  name: "บริษัท แพคเรด (ประเทศไทย) จำกัด",
  address:
    "เลขที่ 28/40 หมู่บ้าน สิริ อเวนิว ถ.เพชรเกษม 81 แขวงหนองค้างพลู เขตหนองแขม กรุงเทพมหานคร 10160",
  taxId: "0105564077716",
  tel: "063-210-2537",
  web: "https://pacred.co.th/",
};

export const usesLoadType = usesLoadTypeBase;
export const usesContainer = usesContainerBase;
export const bahtFmt = bahtFmtBase;

/** key ของ combo (term × ขนส่ง × LCL/FCL). */
export function templateKeyOf(c: QuoteConditions): string {
  return catalogKeyOf(c);
}

/** โหลด line-item เริ่มต้นตามเงื่อนไข จาก catalog (DB · ส่งเป็น prop). clone เพื่อแก้อิสระ. */
export function linesForConditions(
  c: QuoteConditions,
  catalog: Record<string, CatalogTemplate>,
): QuoteLine[] {
  const tpl = catalog[catalogKeyOf(c)];
  if (!tpl) return [];
  return tpl.lines.map((l) => ({
    id: l.id, group: l.group, desc: l.desc, qty: 1, unitPrice: l.sale,
    vat: l.vat, wht: l.wht, receipt: l.receipt, note: l.note,
    unit: l.unit, cost: l.cost, profit: l.profit,
  }));
}

/** หมายเหตุตั้งต้นของ combo (แสดงในใบเสนอราคา). */
export function noteForConditions(c: QuoteConditions, catalog: Record<string, CatalogTemplate>): string {
  return catalog[catalogKeyOf(c)]?.note ?? "";
}

export type QuoteTotals = ReturnType<typeof computeQuoteTotals>;

/** ยอด SELL + ต้นทุน/กำไรรวม (cost/profit = 0 ถ้าถูก strip). */
export function computeQuoteTotals(lines: QuoteLine[]) {
  return computeCatalogTotals(lines);
}
