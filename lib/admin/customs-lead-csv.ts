/**
 * CSV ของ "ลูกค้าที่ใช้ใบขน — คิวโทรตาม" (`/admin/customs-leads`) — คอลัมน์ +
 * ตัวแปลงแถว อยู่ที่นี่ที่เดียว.
 *
 * ใช้ร่วมกัน 2 ทาง:
 *   • หน้าเว็บ  → ปุ่ม "⬇ CSV" (แถวที่เห็นบนจอตาม filter ปัจจุบัน)
 *   • server action `exportCustomsLeadsAll` → ปุ่ม "⬇ CSV ทั้งหมด" (ยิง query ซ้ำ
 *     ไม่จำกัดหน้า + เขียน admin_export_log)
 * ถ้าแยกกันเขียน 2 ที่ วันหนึ่งไฟล์จาก 2 ปุ่มจะมีคอลัมน์ไม่เท่ากัน — จึงรวมไว้ตรงนี้.
 *
 * ตัวเลขเงิน (CIF / ภาษี) ส่งออกเป็น "ตัวเลขล้วน" ไม่ใส่ ฿ ไม่ใส่ comma เพื่อให้
 * Excel รวม/เรียงได้ทันที · วันที่ตัดเหลือ YYYY-MM-DD.
 *
 * ⚠️ PII: ไฟล์นี้มีชื่อบริษัท · เลขนิติ · เบอร์โทร → ทางปุ่ม "ทั้งหมด" ต้องผ่าน
 * `logAdminExport` เสมอ (owner directive เรื่อง trail การดึงข้อมูลลูกค้าออก).
 */

import type { CsvCol, CsvRow } from "@/components/admin/csv-button";
import {
  CUSTOMS_LEAD_MATCH_LABEL,
  CUSTOMS_LEAD_TRANSPORT_TEXT,
  customsLeadStatusLabel,
} from "@/lib/admin/customs-lead-labels";

/** เฉพาะฟิลด์ที่ CSV ใช้ — รับได้ทั้ง row ของหน้าเว็บและของ export action. */
export type CustomsLeadCsvInput = {
  tax_id: string;
  name_th: string | null;
  name_en: string | null;
  address: string | null;
  province: string | null;
  transports: string[] | null;
  decl_count: number;
  total_cif: number | string | null;
  total_tax: number | string | null;
  first_decl_date: string | null;
  last_decl_date: string | null;
  hs_codes: string[] | null;
  suppliers: string[] | null;
  matched_userid: string | null;
  matched_phone: string | null;
  matched_name: string | null;
  matched_sale: string | null;
  is_existing: boolean;
  lead_status: string;
  assigned_sale: string | null;
  call_note: string | null;
  called_at: string | null;
  match_source: string | null;
  matched_lead_source: string | null;
};

/** เรียงตามลำดับที่เซลใช้งานจริง: ใครต้องโทร → โทรที่ไหน → ตัวเลขประกอบการตัดสินใจ. */
export const CUSTOMS_LEAD_CSV_COLS: CsvCol[] = [
  { key: "status",        label: "สถานะโทร" },
  { key: "customerType",  label: "ลูกค้าเดิม/ใหม่" },
  { key: "phone",         label: "เบอร์โทร" },
  { key: "nameTh",        label: "ชื่อบริษัท (ไทย)" },
  { key: "nameEn",        label: "ชื่อบริษัท (อังกฤษ)" },
  { key: "taxId",         label: "เลขนิติบุคคล" },
  { key: "contact",       label: "ชื่อผู้ติดต่อในระบบ" },
  { key: "customerCode",  label: "รหัสลูกค้า (PR)" },
  { key: "matchedSale",   label: "เซลลูกค้าเดิม" },
  { key: "assignedSale",  label: "เซลที่มอบหมาย" },
  { key: "province",      label: "จังหวัด" },
  { key: "address",       label: "ที่อยู่" },
  { key: "transports",    label: "ทางขนส่ง" },
  { key: "declCount",     label: "จำนวนใบขน" },
  { key: "totalCif",      label: "CIF รวม (บาท)" },
  { key: "totalTax",      label: "ภาษีรวม (บาท)" },
  { key: "firstDecl",     label: "ใบขนแรก" },
  { key: "lastDecl",      label: "ใบขนล่าสุด" },
  { key: "hsCount",       label: "จำนวนพิกัด HS" },
  { key: "hsCodes",       label: "พิกัด HS" },
  { key: "suppliers",     label: "ซัพพลายเออร์" },
  { key: "matchSource",   label: "ที่มาการจับคู่" },
  { key: "callNote",      label: "โน้ตการโทร" },
  { key: "calledAt",      label: "โทรเมื่อ" },
];

/** ตัดเวลาออกเหลือ YYYY-MM-DD (ค่าว่าง → ""). */
const dateOnly = (v: string | null | undefined): string =>
  v ? String(v).slice(0, 10) : "";

/** ตัวเลขล้วน 2 ตำแหน่ง — ให้ Excel รวมได้ (ค่าว่าง/อ่านไม่ออก → ""). */
const money = (v: number | string | null | undefined): string => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "";
};

/** แปลง 1 lead → 1 แถว CSV (คีย์ต้องตรงกับ CUSTOMS_LEAD_CSV_COLS). */
export function customsLeadCsvRow(l: CustomsLeadCsvInput): CsvRow {
  const hs = l.hs_codes ?? [];
  const transports = (l.transports ?? [])
    .map((t) => CUSTOMS_LEAD_TRANSPORT_TEXT[t] ?? t)
    .join(" · ");
  const matchText = l.match_source
    ? (CUSTOMS_LEAD_MATCH_LABEL[l.match_source]?.text ?? l.match_source) +
      (l.matched_lead_source ? ` (${l.matched_lead_source})` : "")
    : "";

  return {
    status:       customsLeadStatusLabel(l.lead_status),
    customerType: l.is_existing ? "ลูกค้าเดิม" : "ลูกค้าใหม่",
    phone:        l.matched_phone ?? "",
    nameTh:       l.name_th ?? "",
    nameEn:       l.name_en ?? "",
    taxId:        l.tax_id,
    contact:      l.matched_name ?? "",
    customerCode: l.matched_userid ?? "",
    matchedSale:  l.matched_sale ?? "",
    assignedSale: l.assigned_sale ?? "",
    province:     l.province ?? "",
    address:      l.address ?? "",
    transports,
    declCount:    l.decl_count ?? 0,
    totalCif:     money(l.total_cif),
    totalTax:     money(l.total_tax),
    firstDecl:    dateOnly(l.first_decl_date),
    lastDecl:     dateOnly(l.last_decl_date),
    hsCount:      hs.length,
    hsCodes:      hs.join(" "),
    suppliers:    (l.suppliers ?? []).join(" | "),
    matchSource:  matchText,
    callNote:     l.call_note ?? "",
    calledAt:     dateOnly(l.called_at),
  };
}
