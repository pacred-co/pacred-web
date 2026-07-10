/**
 * Booking pricing catalog — SEED ตั้งต้น (แกะจากไฟล์ "แบบฟรอมออกราคา IMPORT" · ปอน 2026-07-10).
 *
 * ใช้ bootstrap ตอน DB ว่าง (loadBookingCatalog) + ปุ่ม "รีเซ็ตเป็นค่าตั้งต้น" ในหน้าตั้งค่า.
 * ตัวเลข sale/cost/profit เอาจาก CSV (คอลัมน์ SALE (THB) / COST / PROFIT). FCL ใช้เรท 20'
 * เป็น default + note เรท 40'. Pricing แก้/เพิ่มได้เองในหน้าตั้งค่า (นี่แค่จุดเริ่ม).
 *
 * receipt=true = "เก็บตามใบเสร็จจริง / เงินทดลองจ่าย" (ไม่คิด VAT · pass-through · ไม่คิดกำไร).
 */

import type { CatalogLine, CatalogTemplate } from "./catalog";

// helper: line ที่มี VAT (ปกติ)
function L(
  id: string, group: string, desc: string, unit: string, sale: number,
  cost: number, profit: number, note?: string,
): CatalogLine {
  return { id, group, desc, unit, sale, cost, profit, vat: true, wht: 0, ...(note ? { note } : {}) };
}
// helper: line เก็บตามใบเสร็จจริง (ไม่คิด VAT · ไม่คิดกำไร)
function R(id: string, desc: string, sale: number, note?: string): CatalogLine {
  return { id, group: "Receipt", desc, unit: "ใบเสร็จจริง", sale, vat: false, wht: 0, receipt: true, ...(note ? { note } : {}) };
}

// ── IM CIF · SEA LCL (เรทตั้งต้นเดิม hand-made + เติมต้นทุน/กำไร) ──
const CIF_SEA_LCL: CatalogLine[] = [
  L("cif-1", "Customs", "Customs Registration Service (ค่าบริการลงทะเบียนกรมศุลกากร)", "THB/SET", 1500, 800, 700),
  L("cif-2", "Customs", "Customs Clearance (ค่าบริการด้านพิธีการศุลกากร)", "THB/SET", 3500, 500, 3000),
  L("cif-3", "Document", "Import Declaration Paperless (บริการนำเข้าแบบอิเล็กทรอนิกส์)", "THB/SET", 350, 200, 150),
  L("cif-4", "D/O", "Delivery Order (D/O) Receiving Fee (ค่าบริการรับใบตราส่งสินค้านำเข้า)", "THB/SET", 421, 0, 421),
  L("cif-5", "Transport", "Transport (ค่ารถขนส่ง)", "THB/SET", 0, 0, 0, "เช็คตามระยะทางจริง"),
  L("cif-6", "Port", "Gate Charge (ค่าผ่านท่า)", "THB/SET", 190, 0, 190),
  L("cif-7", "Special", "Labor Loading Service (ค่าบริการแรงงานขึ้นของ)", "THB/SET", 450, 0, 250),
  L("cif-8", "Customs", "Additional Customs Services (บริการอื่นๆ ด้านศุลกากร) — ปิดตรวจ", "THB/SET", 1000, 500, 500),
  R("cif-r1", "Customs Paperless (ค่าธรรมเนียมศุลกากรอิเล็กทรอนิกส์)", 200),
  R("cif-r2", "Customs Overtime (ค่าล่วงเวลาศุลกากร)", 400),
  R("cif-r3", "Rent (ค่าเช่าโกดัง) 3 วัน", 2000),
];

// ── IM CIF · SEA FCL (IM CIF SEA FCL.csv · ใช้เรท 20' · note 40') ──
const CIF_SEA_FCL: CatalogLine[] = [
  L("cifF-1", "Customs", "Customs Registration Service (ค่าบริการลงทะเบียนกรมศุลกากร)", "THB/SET", 1500, 800, 700),
  L("cifF-2", "Customs", "Customs Clearance (ค่าบริการด้านพิธีการศุลกากร)", "THB/SET", 4000, 500, 3500, "20' 4,000 / 40' 4,500"),
  L("cifF-3", "Document", "Import Declaration Paperless (บริการนำเข้าแบบอิเล็กทรอนิกส์)", "THB/SET", 350, 200, 150),
  L("cifF-4", "D/O", "Delivery Order (D/O) Receiving Fee (ค่าบริการรับใบตราส่งสินค้านำเข้า)", "THB/SET", 421, 0, 421),
  L("cifF-5", "Transport", "Transport (ค่ารถขนส่ง 20') กทม.ปริมณฑล", "THB/CONT", 6000, 5500, 500, "20' 6,000 / 40' 8,500 · แหลมฉบัง 11,000 · เช็คตามระยะทาง"),
  L("cifF-6", "Port", "Gate Charge (ค่าผ่านท่า) เหมาจ่าย", "THB/CONT", 1250, 0, 1250, "20' 1,250 / 40' 2,500"),
  L("cifF-7", "Customs", "Additional Customs Services (บริการอื่นๆ ด้านศุลกากร) — ปิดตรวจ", "THB/SET", 1000, 0, 1000),
  L("cifF-8", "Special", "Labor Unloading Service Transport แรงงานลงตู้ (20')", "THB/CONT", 3500, 0, 3200, "20' 3,500 / 40' 4,000"),
  R("cifF-r1", "Customs Paperless (ค่าธรรมเนียมศุลกากรอิเล็กทรอนิกส์)", 200),
  R("cifF-r2", "Customs Overtime (ค่าล่วงเวลาศุลกากร)", 400),
  R("cifF-r3", "Delivery Order (D/O) Services (ใบตราส่งสินค้านำเข้า)", 8000, "20' 8,000 / 40' 13,000 · 5,000–15,000 ตามสายเรือ"),
  R("cifF-r4", "Rent (ค่าเช่าโกดัง) 3 วัน (การท่าเรือ PAT)", 1765.5, "20' 1,765.50 / 40' 3,049.50 · LCB 20' 670 / 40' 1,070"),
];

// ── IM CIF · AIR (IM CIF AIR.csv) ──
const CIF_AIR_LCL: CatalogLine[] = [
  L("cifA-1", "Customs", "Customs Registration Service (ค่าบริการลงทะเบียนกรมศุลกากร)", "THB/SET", 1500, 800, 700),
  L("cifA-2", "Customs", "Customs Clearance (ค่าบริการด้านพิธีการศุลกากร)", "THB/SET", 3500, 500, 3000),
  L("cifA-3", "Document", "Import Declaration Paperless (บริการนำเข้าแบบอิเล็กทรอนิกส์) — ยิงใบขน", "THB/SET", 350, 200, 150),
  L("cifA-4", "D/O", "Delivery Order (D/O) Receiving Fee (ค่าบริการรับใบตราส่งสินค้านำเข้า)", "THB/SET", 421, 0, 421),
  L("cifA-5", "Transport", "Transport (ค่ารถขนส่ง)", "THB/SET", 1200, 0, 0, "4 ล้อ 1,200 / 6 ล้อ 4,000 · เช็คตามระยะทางจริง"),
  L("cifA-6", "Port", "Gate Charge (ค่าผ่านท่า)", "THB/SET", 190, 0, 0, "4 ล้อ 190 / 6 ล้อ 480"),
  L("cifA-7", "Special", "Labor Loading Service (Airport) (ค่าบริการแรงงานขึ้นของท่าอากาศ)", "THB/SET", 500, 0, 0),
  L("cifA-8", "Special", "Employee Overtime Fee (ค่าล่วงเวลาพนักงาน)", "THB/SET", 500, 0, 0),
  L("cifA-9", "Customs", "Additional Customs Services (บริการอื่นๆ ด้านศุลกากร)", "THB/SET", 1000, 500, 500),
  R("cifA-r1", "Customs Paperless (ค่าธรรมเนียมศุลกากรอิเล็กทรอนิกส์)", 200),
  R("cifA-r2", "Delivery Order (D/O) (ใบตราส่งสินค้านำเข้า)", 550, "ประมาณการ เก็บตามใบเสร็จจริง"),
  R("cifA-r3", "Customs Overtime (ค่าล่วงเวลาศุลกากร)", 500),
];

// ── IM FOB · SEA LCL (IM FOB SEA LCL.csv) ──
const FOB_SEA_LCL: CatalogLine[] = [
  L("fob-1", "D/O", "D/O (Delivery Order)", "THB/SET", 1350, 0, 0),
  L("fob-2", "D/O", "THC (Terminal Handling Charge)", "THB/RT", 350, 0, 0),
  L("fob-3", "D/O", "CFS Charge", "THB/RT", 350, 0, 0),
  L("fob-4", "D/O", "STATUS Charge", "THB/RT", 250, 0, 0),
  L("fob-5", "Document", "Document Handling Charge (ค่าบริการจองเรือสินค้าขาเข้า)", "THB/SET", 3500, 0, 3500),
  L("fob-6", "Customs", "Customs Registration Service (ค่าบริการลงทะเบียนกรมศุลกากร)", "THB/SET", 1500, 800, 700),
  L("fob-7", "Customs", "Customs Clearance (ค่าบริการด้านพิธีการศุลกากร)", "THB/SET", 3500, 500, 3000),
  L("fob-8", "Document", "Import Declaration Paperless (บริการนำเข้าแบบอิเล็กทรอนิกส์)", "THB/SET", 350, 200, 150),
  L("fob-9", "D/O", "Delivery Order (D/O) Receiving Fee (ค่าบริการรับใบตราส่งสินค้านำเข้า)", "THB/SET", 421, 0, 421),
  L("fob-10", "Transport", "Transport (ค่ารถขนส่ง)", "THB/SET", 0, 0, 0, "เช็คตามระยะทางจริง · +3,000 เกิน 4 ชม."),
  L("fob-11", "Port", "Gate Charge (ค่าผ่านท่า)", "THB/SET", 190, 0, 480),
  L("fob-12", "Special", "Labor Loading Service (ค่าบริการแรงงานขึ้นของ)", "THB/SET", 450, 0, 250),
  L("fob-13", "Customs", "Additional Customs Services (บริการอื่นๆ ด้านศุลกากร) — ปิดตรวจ", "THB/SET", 1000, 500, 500),
  R("fob-r1", "Customs Paperless (ค่าธรรมเนียมศุลกากรอิเล็กทรอนิกส์)", 200),
  R("fob-r2", "Customs Overtime (ค่าล่วงเวลาศุลกากร)", 400),
  R("fob-r3", "Rent (ค่าเช่าโกดัง) 3 วัน", 2000),
];

// ── IM FOB · SEA FCL (IM FOB SEA FCL.csv · เรท 20' · note 40') ──
const FOB_SEA_FCL: CatalogLine[] = [
  L("fobF-1", "Freight", "Ocean Freight Charge (ค่าบริการขนส่งสินค้าทางทะเล) FOB", "THB/CONT", 1100, 500, 100, "20' 1,100 (~USD 550) / 40' 2,100 (~USD 1,050) · เช็คเรทจริง"),
  L("fobF-2", "Document", "ค่าบริการจองเฟรท DOC", "THB/SET", 3500, 0, 3500),
  L("fobF-3", "Customs", "Customs Registration Service (ค่าบริการลงทะเบียนกรมศุลกากร)", "THB/SET", 1500, 800, 700),
  L("fobF-4", "Customs", "Customs Clearance (ค่าบริการด้านพิธีการศุลกากร)", "THB/SET", 4000, 500, 3500, "20' 4,000 / 40' 4,500"),
  L("fobF-5", "Document", "Import Declaration Paperless (บริการนำเข้าแบบอิเล็กทรอนิกส์)", "THB/SET", 350, 200, 150),
  L("fobF-6", "D/O", "Delivery Order (D/O) Receiving Fee (ค่าบริการรับใบตราส่งสินค้านำเข้า)", "THB/SET", 421, 0, 421),
  L("fobF-7", "Transport", "Transport (ค่ารถขนส่ง)", "THB/CONT", 6000, 5500, 500, "20' 6,000 / 40' 8,500 · เช็คตามระยะทาง"),
  L("fobF-8", "Port", "Gate Charge (ค่าผ่านท่า) เหมาจ่าย", "THB/CONT", 1250, 0, 1250, "20' 1,250 / 40' 2,500"),
  L("fobF-9", "Customs", "Additional Customs Services (บริการอื่นๆ ด้านศุลกากร)", "THB/SET", 1000, 1000, 0),
  R("fobF-r1", "Customs Paperless (ค่าธรรมเนียมศุลกากรอิเล็กทรอนิกส์)", 200),
  R("fobF-r2", "Customs Overtime (ค่าล่วงเวลาศุลกากร)", 400),
  R("fobF-r3", "Delivery Order (D/O) Services (ใบตราส่งสินค้านำเข้า)", 8000, "20' 8,000 / 40' 13,000 · 5,000–15,000 ตามสายเรือ"),
  R("fobF-r4", "Rent (ค่าเช่าโกดัง) 3 วัน", 1765.5, "20' 1,765.50 / 40' 3,049.50"),
];

// ── IM EXW · SEA LCL (IM EXW SEA LCL.csv) ──
const EXW_SEA_LCL: CatalogLine[] = [
  L("exw-f1", "Freight", "Ocean Freight Charge (ค่าบริการขนส่งสินค้าทางทะเล)", "THB/CBM", 0, 0, 0, "คิดตาม CBM · เช็คเรทจริง"),
  L("exw-o1", "Origin", "Origin Customs Clearance (พิธีการศุลกากรต้นทาง)", "THB/BILL", 0, 0, 0, "ตามจริงต้นทาง"),
  L("exw-d1", "D/O", "D/O (Delivery Order)", "THB/SET", 1350, 0, 0),
  L("exw-d2", "D/O", "THC (Terminal Handling Charge)", "THB/CBM", 700, 0, 0),
  L("exw-d3", "D/O", "CFS Charge", "THB/CBM", 700, 0, 0),
  L("exw-d4", "D/O", "STATUS Charge", "THB/CBM", 500, 0, 0),
  L("exw-doc", "Document", "Document Handling Charge (ค่าบริการจองเรือสินค้าขาเข้า)", "THB/SET", 3500, 0, 3500),
  L("exw-1", "Customs", "Customs Registration Service (ค่าบริการลงทะเบียนกรมศุลกากร)", "THB/SET", 1500, 800, 700),
  L("exw-2", "Customs", "Customs Clearance (ค่าบริการด้านพิธีการศุลกากร)", "THB/SET", 3500, 500, 3000),
  L("exw-3", "Document", "Import Declaration Paperless (บริการนำเข้าแบบอิเล็กทรอนิกส์)", "THB/SET", 350, 200, 150),
  L("exw-4", "D/O", "Delivery Order (D/O) Receiving Fee (ค่าบริการรับใบตราส่งสินค้านำเข้า)", "THB/SET", 421, 0, 421),
  L("exw-5", "Transport", "Transport (ค่ารถขนส่ง)", "THB/SET", 0, 0, 0, "เช็คตามระยะทางจริง · +3,000 เกิน 4 ชม."),
  L("exw-6", "Port", "Gate Charge (ค่าผ่านท่า)", "THB/SET", 480, 0, 480),
  L("exw-7", "Special", "Labor Loading Service (ค่าบริการแรงงานขึ้นของ)", "THB/SET", 450, 0, 250),
  L("exw-8", "Customs", "Additional Customs Services (บริการอื่นๆ ด้านศุลกากร) — ปิดตรวจ", "THB/SET", 1000, 500, 500),
  R("exw-r1", "Customs Paperless (ค่าธรรมเนียมศุลกากรอิเล็กทรอนิกส์)", 200),
  R("exw-r2", "Customs Overtime (ค่าล่วงเวลาศุลกากร)", 400),
  R("exw-r3", "Rent (ค่าเช่าโกดัง) 3 วัน", 2000),
];

// ── IM EXW · SEA FCL (IM EXW SEA FCL.csv · เรท 20' · note 40') ──
const EXW_SEA_FCL: CatalogLine[] = [
  L("exwF-f1", "Freight", "Ocean Freight Charge (ค่าบริการขนส่งสินค้าทางทะเล)", "THB/CONT", 0, 0, 0, "คิดตามเรทจริง (USD/CONT)"),
  L("exwF-doc", "Document", "ค่าบริการจองเฟรท DOC", "THB/SET", 3500, 0, 3500),
  L("exwF-1", "Customs", "Customs Registration Service (ค่าบริการลงทะเบียนกรมศุลกากร)", "THB/SET", 1500, 800, 700),
  L("exwF-2", "Customs", "Customs Clearance (ค่าบริการด้านพิธีการศุลกากร)", "THB/CONT", 4000, 500, 3500, "20' 4,000 / 40' 4,500"),
  L("exwF-3", "Document", "Import Declaration Paperless (บริการนำเข้าแบบอิเล็กทรอนิกส์) — ยิงใบขน", "THB/SET", 350, 200, 150),
  L("exwF-4", "D/O", "Delivery Order (D/O) Receiving Fee (ค่าบริการรับใบตราส่งสินค้านำเข้า)", "THB/SET", 421, 0, 421),
  L("exwF-5", "Transport", "Transport (ค่ารถขนส่ง)", "THB/CONT", 6000, 0, 6000, "20' 6,000 / 40' 8,500 · เช็คตามระยะทาง"),
  L("exwF-6", "Port", "Gate Charge (ค่าผ่านท่า) เหมาจ่าย", "THB/CONT", 1250, 0, 1250, "20' 1,250 / 40' 2,500"),
  L("exwF-7", "Customs", "Additional Customs Services (บริการอื่นๆ ด้านศุลกากร)", "THB/CONT", 1000, 1000, 0),
  R("exwF-r1", "Customs Paperless (ค่าธรรมเนียมศุลกากรอิเล็กทรอนิกส์)", 200),
  R("exwF-r2", "Customs Overtime (ค่าล่วงเวลาศุลกากร)", 400),
  R("exwF-r3", "Delivery Order (D/O) Services (ใบตราส่งสินค้านำเข้า)", 8000, "20' 8,000 / 40' 13,000"),
  R("exwF-r4", "Rent (ค่าเช่าโกดัง) 3 วัน", 1765.5, "20' 1,765.50 / 40' 3,049.50"),
];

const CIF_NOTE =
  "ยังไม่รวมภาษีนำเข้า/VAT ตามมูลค่าสินค้าจริง · ปิดตรวจจ่ายนอกระบบ (ถ้าจ่ายค่าปิดตรวจแล้วไม่เก็บ Additional Customs Services ซ้ำ) · ราคายืนยัน 7 วัน";
const FCL_NOTE =
  "FCL 20' 30–40 CBM 15–20 ตัน · 40' 60–70 CBM 25–28 ตัน · ค่าเช่าโกดัง/D/O เก็บตามใบเสร็จจริง · VAT 7% ตามมูลค่าสินค้า · ราคายืนยัน 7 วัน";
const CHINA_NOTE =
  "ค่าใช้จ่ายฝั่งจีน (เฟรท/DOC/FORM E) คิดตามจริง · โหลดที่ท่าเรือ ไม่ผ่านโกดังอี้อู/กว่างโจว · ชื่อนำเข้าเอกสาร = ชื่อลูกค้า (ยกเว้น D/O + เฟรท) · ราคายืนยัน 7 วัน";

/** เรทตั้งต้นทั้งชุด (7 combo). ปอน/Pricing แก้ต่อในหน้าตั้งค่าได้. */
export function buildCatalogSeed(): CatalogTemplate[] {
  return [
    { key: "CIF_SEA_LCL", label: "IM CIF · SEA LCL", service: "SEA", loadType: "LCL", term: "CIF", note: CIF_NOTE, lines: CIF_SEA_LCL },
    { key: "CIF_SEA_FCL", label: "IM CIF · SEA FCL", service: "SEA", loadType: "FCL", term: "CIF", note: FCL_NOTE, lines: CIF_SEA_FCL },
    { key: "CIF_AIR_LCL", label: "IM CIF · AIR", service: "AIR", loadType: "LCL", term: "CIF", note: CIF_NOTE, lines: CIF_AIR_LCL },
    { key: "FOB_SEA_LCL", label: "IM FOB · SEA LCL", service: "SEA", loadType: "LCL", term: "FOB", note: CIF_NOTE, lines: FOB_SEA_LCL },
    { key: "FOB_SEA_FCL", label: "IM FOB · SEA FCL", service: "SEA", loadType: "FCL", term: "FOB", note: FCL_NOTE, lines: FOB_SEA_FCL },
    { key: "EXW_SEA_LCL", label: "IM EXW · SEA LCL", service: "SEA", loadType: "LCL", term: "EXW", note: CHINA_NOTE, lines: EXW_SEA_LCL },
    { key: "EXW_SEA_FCL", label: "IM EXW · SEA FCL", service: "SEA", loadType: "FCL", term: "EXW", note: CHINA_NOTE, lines: EXW_SEA_FCL },
  ];
}
