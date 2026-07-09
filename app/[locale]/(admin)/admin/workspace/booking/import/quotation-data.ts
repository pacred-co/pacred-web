/**
 * ใบเสนอราคา (Quotation) — เงื่อนไข + line-item templates + ตัวช่วยคำนวณ.
 *
 * 2026-07-09 (ปอน · owner brief) — FIRST CUT. รายการราคาในใบเสนอราคาเปลี่ยนตามเงื่อนไข
 *   SERVICE / TERM / PORT / CONTAINER / ENTER (อ้างอิงจากไฟล์ "แบบฟรอมออกราคา IMPORT" CSV).
 *   ราคาที่เก็บที่นี่ = SELL (ราคาขายที่โชว์ลูกค้า) · COST/PROFIT เป็นข้อมูลภายใน ไม่โชว์บนใบลูกค้า.
 *   ตอนนี้ seed ไว้ 2 template (CIF/EXW SEA LCL) เพื่อโชว์ว่า "term เปลี่ยน → รายการเปลี่ยน";
 *   ตัวอื่น (FOB · FCL 20'/40' · AIR · TRUCK) จะใส่เรทจริงใน step ถัดไป (matrix CSV เต็ม).
 */

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

// (member lookup ย้ายไป server action จริง: actions/admin/booking-member-lookup.ts
//  อ่าน tb_users + tb_corporate · 2026-07-09 · เลิกใช้ mock)

const CIF_LCL_LINES: QuoteLine[] = [
  { id: "cif-1", group: "Customs", desc: "Customs Registration Service (ค่าบริการลงทะเบียนกรมศุลกากร)", qty: 1, unitPrice: 1500, vat: true, wht: 0 },
  { id: "cif-2", group: "Customs", desc: "Customs Clearance (ค่าบริการด้านพิธีการศุลกากร)", qty: 1, unitPrice: 3500, vat: true, wht: 0 },
  { id: "cif-3", group: "Document", desc: "Import Declaration Paperless (บริการนำเข้าแบบอิเล็กทรอนิกส์)", qty: 1, unitPrice: 350, vat: true, wht: 0 },
  { id: "cif-4", group: "D/O", desc: "Delivery Order (D/O) Receiving Fee (ค่าบริการรับใบตราส่งสินค้านำเข้า)", qty: 1, unitPrice: 421, vat: true, wht: 0 },
  { id: "cif-5", group: "Transport", desc: "Transport (ค่ารถขนส่ง)", qty: 1, unitPrice: 0, vat: true, wht: 0, note: "เช็คตามระยะทางจริง" },
  { id: "cif-6", group: "Port", desc: "Gate Charge (ค่าผ่านท่า)", qty: 1, unitPrice: 190, vat: true, wht: 0 },
  { id: "cif-7", group: "Special", desc: "Labor Loading Service (ค่าบริการแรงงานขึ้นของ)", qty: 1, unitPrice: 450, vat: true, wht: 0 },
  { id: "cif-8", group: "Customs", desc: "Additional Customs Services (บริการอื่นๆ ด้านศุลกากร) — ปิดตรวจ", qty: 1, unitPrice: 1000, vat: true, wht: 0 },
  { id: "cif-r1", group: "Receipt", desc: "Customs Paperless (ค่าธรรมเนียมศุลกากรอิเล็กทรอนิกส์)", qty: 1, unitPrice: 200, vat: false, wht: 0, receipt: true },
  { id: "cif-r2", group: "Receipt", desc: "Customs Overtime (ค่าล่วงเวลาศุลกากร)", qty: 1, unitPrice: 400, vat: false, wht: 0, receipt: true },
  { id: "cif-r3", group: "Receipt", desc: "Rent (ค่าเช่าโกดัง) 3 วัน", qty: 1, unitPrice: 150, vat: false, wht: 0, receipt: true },
];

const EXW_LCL_LINES: QuoteLine[] = [
  { id: "exw-f1", group: "Freight", desc: "Ocean Freight Charge (ค่าบริการขนส่งสินค้าทางทะเล)", qty: 1, unitPrice: 0, vat: true, wht: 0, note: "คิดตาม CBM (ใส่เรท step ถัดไป)" },
  { id: "exw-o1", group: "Origin", desc: "Origin Customs Clearance (พิธีการศุลกากรต้นทาง)", qty: 1, unitPrice: 0, vat: true, wht: 0, note: "ตามจริงต้นทาง" },
  { id: "exw-d1", group: "D/O", desc: "D/O (Delivery Order)", qty: 1, unitPrice: 1350, vat: true, wht: 0 },
  { id: "exw-d2", group: "D/O", desc: "THC (Terminal Handling Charge)", qty: 1, unitPrice: 700, vat: true, wht: 0 },
  { id: "exw-d3", group: "D/O", desc: "CFS Charge", qty: 1, unitPrice: 700, vat: true, wht: 0 },
  { id: "exw-d4", group: "D/O", desc: "Status Charge", qty: 1, unitPrice: 500, vat: true, wht: 0 },
  { id: "exw-doc", group: "Document", desc: "Document Handling Charge (ค่าบริการจองเรือสินค้าขาเข้า)", qty: 1, unitPrice: 3500, vat: true, wht: 0 },
  { id: "exw-1", group: "Customs", desc: "Customs Registration Service (ค่าบริการลงทะเบียนกรมศุลกากร)", qty: 1, unitPrice: 1500, vat: true, wht: 0 },
  { id: "exw-2", group: "Customs", desc: "Customs Clearance (ค่าบริการด้านพิธีการศุลกากร)", qty: 1, unitPrice: 3500, vat: true, wht: 0 },
  { id: "exw-3", group: "Document", desc: "Import Declaration Paperless (บริการนำเข้าแบบอิเล็กทรอนิกส์)", qty: 1, unitPrice: 350, vat: true, wht: 0 },
  { id: "exw-4", group: "D/O", desc: "Delivery Order (D/O) Receiving Fee (ค่าบริการรับใบตราส่งสินค้านำเข้า)", qty: 1, unitPrice: 421, vat: true, wht: 0 },
  { id: "exw-5", group: "Transport", desc: "Transport (ค่ารถขนส่ง)", qty: 1, unitPrice: 0, vat: true, wht: 0, note: "เช็คตามระยะทางจริง" },
  { id: "exw-6", group: "Port", desc: "Gate Charge (ค่าผ่านท่า)", qty: 1, unitPrice: 480, vat: true, wht: 0 },
  { id: "exw-7", group: "Special", desc: "Labor Loading Service (ค่าบริการแรงงานขึ้นของ)", qty: 1, unitPrice: 450, vat: true, wht: 0 },
  { id: "exw-8", group: "Customs", desc: "Additional Customs Services (บริการอื่นๆ ด้านศุลกากร) — ปิดตรวจ", qty: 1, unitPrice: 1000, vat: true, wht: 0 },
  { id: "exw-r1", group: "Receipt", desc: "Customs Paperless (ค่าธรรมเนียมศุลกากรอิเล็กทรอนิกส์)", qty: 1, unitPrice: 200, vat: false, wht: 0, receipt: true },
  { id: "exw-r2", group: "Receipt", desc: "Customs Overtime (ค่าล่วงเวลาศุลกากร)", qty: 1, unitPrice: 400, vat: false, wht: 0, receipt: true },
  { id: "exw-r3", group: "Receipt", desc: "Rent (ค่าเช่าโกดัง) 3 วัน", qty: 1, unitPrice: 2000, vat: false, wht: 0, receipt: true },
];

/**
 * key = `${term}_${LCL|FCL}` → ชุด line-item เริ่มต้น (SELL).
 * First cut: seed แค่ CIF/EXW SEA LCL. term/container อื่นที่ยังไม่ seed → คืน [] (empty-state).
 */
export const IMPORT_QUOTE_TEMPLATES: Record<string, QuoteLine[]> = {
  CIF_LCL: CIF_LCL_LINES,
  EXW_LCL: EXW_LCL_LINES,
};

/** LCL/FCL มีเฉพาะทางเรือ (SEA) · AIR/TRUCK = รวม (LCL) เสมอ. */
export function usesLoadType(service: string): boolean {
  return /SEA/i.test(service);
}

/** ขนาดตู้เกี่ยวเฉพาะ FCL (เหมาตู้). */
export function usesContainer(loadType: string): boolean {
  return /FCL/i.test(loadType);
}

export function templateKeyOf(c: QuoteConditions): string {
  return `${c.term}_${c.loadType}`;
}

/** โหลด line-item เริ่มต้นตามเงื่อนไข (clone เพื่อแก้ได้อิสระ). */
export function linesForConditions(c: QuoteConditions): QuoteLine[] {
  const tpl = IMPORT_QUOTE_TEMPLATES[templateKeyOf(c)] ?? [];
  return tpl.map((l) => ({ ...l }));
}

export type QuoteTotals = {
  vatBase: number; // ฐานที่คิด VAT (บริการที่มี VAT)
  vat: number; // VAT 7%
  nonVat: number; // บริการที่ไม่คิด VAT (ที่ไม่ใช่ receipt)
  receiptTotal: number; // เงินทดลองจ่าย / เก็บตามใบเสร็จจริง
  grand: number; // ยอดเสนอราคารวม
};

export function computeQuoteTotals(lines: QuoteLine[]): QuoteTotals {
  let vatBase = 0;
  let nonVat = 0;
  let receiptTotal = 0;
  for (const l of lines) {
    const amt = (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
    if (l.receipt) receiptTotal += amt;
    else if (l.vat) vatBase += amt;
    else nonVat += amt;
  }
  const vat = Math.round(vatBase * 0.07 * 100) / 100;
  const grand = Math.round((vatBase + vat + nonVat + receiptTotal) * 100) / 100;
  return { vatBase, vat, nonVat, receiptTotal, grand };
}

export const bahtFmt = (n: number): string =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
