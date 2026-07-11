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

/** ต้นทาง/ปลายทาง = ประเทศ + พอร์ท (จิ้มเลือก · ไม่พิมพ์ · owner 2026-07-10). */
export type PortSel = { country: string; port: string };

export type QuoteConditions = {
  service: string; // SEA / AIR / TRUCK (ขนส่ง · หัว · รถ/เรือ/แอร์)
  pol: PortSel; // ต้นทาง (Port of Loading)
  pod: PortSel; // ปลายทาง (Port of Discharge)
  loadType: string; // LCL / FCL (เฉพาะทางเรือ SEA · โหมดอื่นบังคับ LCL)
  container: string; // ขนาดตู้ (เฉพาะ FCL): 1×20' / 1×40'HC / 2×40' / Mixed
  carrier: string; // สายเรือ / สายการบิน / สายรถ (เปลี่ยนตามขนส่ง)
  weight: string; // น้ำหนัก (กก.) — บอกว่าใช้รถอะไรไปรับ/ลากตู้
  agent: string; // เอเจนต์
  term: string; // EXW / FOB / CIF / DDP
  enter: string; // Normal / Change Status / Document Amend / Direct / Indirect
  special: string[]; // License / Manpower / Local Transport / Overtime
  productType: string; // ประเภทสินค้า: ทั่วไป / มอก. / อย. / ลิขสิทธิ์ ("ลิขสิทธิ์" → เรท licensed ในโปร)
  docMode: string; // เอกสารที่ออกให้ลูกค้า (owner พี่ป๊อป 2026-07-10) · ตัวเลือกขึ้นกับ TERM (docModeOptions)
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
export const SPECIAL_OPTIONS = ["License", "Manpower", "Local Transport", "Overtime", "เปิดใบขน", "ใบขนพ่วง"]; // "เปิดใบขน"/"ใบขนพ่วง" = บริการแยกเปิดใบขน (owner พี่ป๊อป 2026-07-10)
export const PRODUCT_TYPE_OPTIONS = ["ทั่วไป", "มอก.", "อย.", "ลิขสิทธิ์"]; // ประเภทสินค้า (fproductstype) · "ลิขสิทธิ์" = เรทพิเศษในโปร

/**
 * เอกสารที่ออกให้ลูกค้า — ตัวเลือกขึ้นกับ TERM (owner พี่ป๊อป 2026-07-10):
 *   DDP = เหมาภาษี (นำเข้าในชื่อชิปปิ้ง) → ไม่มีใบกำกับเต็ม · เลือกได้แค่ "ไม่รับเอกสาร" หรือ "ใบขนชื่อลูกค้า"
 *   EXW/FOB/CIF = นำเข้าในชื่อลูกค้า → ออกได้ครบ (ไม่รับเอกสาร / ใบขน / ใบกำกับเต็ม)
 * (ฝากโอน/ฝากสั่ง เป็นบริการแยก · ชุดเดียวกับ freight = ครบ 3)
 */
export function docModeOptions(term: string): string[] {
  return term === "DDP"
    ? ["ไม่รับเอกสาร", "ใบขนชื่อลูกค้า"]
    : ["ไม่รับเอกสาร", "ใบขน", "ใบกำกับเต็ม"];
}

/** ขนส่ง = หัวข้อหลัก (Trip-style tab) · id ตรงกับ service เดิม (SEA/AIR/TRUCK). */
export const TRANSPORT_TABS: { id: string; label: string; icon: string }[] = [
  { id: "TRUCK", label: "รถ", icon: "🚚" },
  { id: "SEA", label: "เรือ", icon: "🚢" },
  { id: "AIR", label: "แอร์", icon: "✈️" },
];

/** ประเทศที่เลือก POL/POD ได้ (จิ้มเลือก · เพิ่มภายหลัง). */
export const PORT_COUNTRIES = ["จีน", "ไทย"];

/** พอร์ทต่อประเทศ × ขนส่ง (starter dataset · owner ปรับเพิ่มภายหลัง). */
export const PORT_CATALOG: Record<string, Record<string, string[]>> = {
  จีน: {
    SEA: ["กวางโจว", "อี้อู", "หนิงโบ", "หนานซา", "เซินเจิ้น", "เซี่ยงไฮ้", "ชิงเต่า"],
    TRUCK: ["กวางโจว", "คุนหมิง", "หนานหนิง"],
    AIR: ["กวางโจว (CAN)", "เซินเจิ้น (SZX)", "เซี่ยงไฮ้ (PVG)", "ปักกิ่ง (PEK)"],
  },
  ไทย: {
    SEA: ["แหลมฉบัง", "กรุงเทพ (คลองเตย)"],
    TRUCK: ["กรุงเทพฯ", "เชียงของ", "นครพนม", "มุกดาหาร"],
    AIR: ["สุวรรณภูมิ (BKK)", "ดอนเมือง (DMK)"],
  },
};

/** พอร์ทตัวแรกของ ประเทศ × ขนส่ง (ใช้ default + revalidate ตอนสลับขนส่ง). */
export function firstPort(country: string, service: string): string {
  return PORT_CATALOG[country]?.[service]?.[0] ?? "";
}

/** ป้ายชื่อ carrier ต่อขนส่ง (เปลี่ยนตาม รถ/เรือ/แอร์). */
export const CARRIER_LABEL: Record<string, string> = { SEA: "สายเรือ", AIR: "สายการบิน", TRUCK: "สายรถ" };

/** ตัวเลือก carrier ต่อขนส่ง (starter · owner เพิ่มเองภายหลัง). */
export const CARRIER_CATALOG: Record<string, string[]> = {
  SEA: ["Maersk", "MSC", "ONE", "Evergreen", "Wan Hai", "COSCO", "Yang Ming", "OOCL", "Hapag-Lloyd", "SITC", "อื่นๆ"],
  AIR: ["Thai Airways (TG)", "Cathay Pacific (CX)", "China Airlines (CI)", "EVA Air (BR)", "Emirates (EK)", "Singapore (SQ)", "อื่นๆ"],
  TRUCK: ["รถบริษัท (Pacred)", "รถร่วม", "Kerry", "อื่นๆ"],
};

/** เอเจนต์ (starter · owner เพิ่มเองภายหลัง). */
export const AGENT_OPTIONS = ["Pacred", "TTP", "AXELRA", "HUAHAI", "FEISHENG", "อื่นๆ"];

/** carrier ในลิสต์ของขนส่งนั้นหรือไม่ (ใช้ revalidate ตอนสลับขนส่ง). */
export function carrierValidFor(carrier: string, service: string): boolean {
  return !carrier || (CARRIER_CATALOG[service] ?? []).includes(carrier);
}

/** ทิศทาง = อนุมานจาก POL/POD (POD ไทย = นำเข้า · POL ไทย = ส่งออก). */
export function directionOf(c: QuoteConditions): { code: string; label: string } {
  const polTH = c.pol.country === "ไทย";
  const podTH = c.pod.country === "ไทย";
  if (podTH && !polTH) return { code: "IMPORT", label: "นำเข้า" };
  if (polTH && !podTH) return { code: "EXPORT", label: "ส่งออก" };
  return { code: "", label: "—" };
}

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
