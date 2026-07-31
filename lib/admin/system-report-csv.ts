/**
 * CSV column definitions + row-mappers for /admin/system-reports export
 * (owner 2026-07-31 "ทำให้ออกรายงานเป็น csv ได้").
 *
 * Shared between the client <CsvButton> (renders the current page's rows) and
 * the "use server" export action (returns every filtered row) so the two never
 * drift — one column set + one mapper per report type. Plain module (no
 * "use server" / "use client") so both sides can import it.
 */
import type { CommissionRow } from "./sales-commission-report";
import type { CsvRow, CsvCol } from "@/components/admin/csv-button";

/** YYYY-MM-DD HH:MM:SS for CSV (drop the ISO "T", keep to seconds). */
function csvDate(s: string | null): string {
  return s ? s.replace("T", " ").slice(0, 19) : "";
}

// ── ค่าคอมมิชชั่น เซลล์/Cs (ฝากนำเข้า · getSalesCommissionReport) ──
export const COMMISSION_CSV_COLS: CsvCol[] = [
  { key: "paidDate", label: "วันที่ชำระเงิน" },
  { key: "createdDate", label: "วันที่สร้าง" },
  { key: "orderId", label: "เลขที่ออเดอร์" },
  { key: "tracking", label: "แทรกกิ้ง" },
  { key: "cabinet", label: "เลขตู้" },
  { key: "warehouseLabel", label: "โกดังจีน" },
  { key: "transportLabel", label: "ขนส่งทาง" },
  { key: "productLabel", label: "ประเภทสินค้า" },
  { key: "weight", label: "น้ำหนัก" },
  { key: "cbm", label: "ปริมาตร" },
  { key: "price", label: "ราคานำเข้าจีน-ไทย" },
  { key: "discount", label: "ส่วนลด" },
  { key: "memberCode", label: "รหัสสมาชิก" },
  { key: "customerName", label: "ชื่อลูกค้า" },
];

export function commissionRowToCsv(r: CommissionRow): CsvRow {
  return {
    paidDate: csvDate(r.paidDate),
    createdDate: csvDate(r.createdDate),
    orderId: r.orderId,
    tracking: r.tracking,
    cabinet: r.cabinet,
    warehouseLabel: r.warehouseLabel,
    transportLabel: r.transportLabel,
    productLabel: r.productLabel,
    weight: r.weight,
    cbm: r.cbm,
    price: r.price,
    discount: r.discount,
    memberCode: r.memberCode,
    customerName: r.customerName,
  };
}
