/**
 * เรท default ใบเสนอราคา — types + constants ที่ share ระหว่าง server loader
 * (quote-default-rates.ts · server-only) และ client (editor · quote-tab).
 * แยกออกจากไฟล์ server-only เพราะ client import "GROUP_PRODUCTS" (value) ไม่ได้
 * จากโมดูล server-only. (owner ปอน 2026-07-17)
 */

import type { ProductId, TransportId, WarehouseId } from "@/lib/admin/customer-rate-tables";

/** กลุ่มประเภทสินค้าในใบเสนอราคา (2 กลุ่ม · mirror QUOTE_RATE_GROUPS ใน quote-tab). */
export type QuoteRateGroup = "general" | "fda";

/** rep product ที่ใช้อ่านเรทของแต่ละกลุ่ม (rgproductstype): ทั่วไป·มอก. → '1' · อย.·พิเศษ → '3'. */
export const GROUP_REP_PRODUCT: Record<QuoteRateGroup, ProductId> = { general: "1", fda: "3" };

/** product ทั้งหมดในกลุ่ม — ตอนบันทึกเขียนทุกตัว (ทั่วไป·มอก.=1,2 · อย.·พิเศษ=3,4). */
export const GROUP_PRODUCTS: Record<QuoteRateGroup, readonly ProductId[]> = {
  general: ["1", "2"],
  fda: ["3", "4"],
};

/** ทางที่ใบเสนอราคาใช้ (รถ '1' + เรือ '2' · ไม่รวมอากาศ '3'). */
export const QUOTE_TRANSPORTS: readonly TransportId[] = ["1", "2"];

export type QuoteDefaultCell = { cbm: number | null; kg: number | null };

/** grid[โกดัง '1'|'2'][ทาง '1'รถ|'2'เรือ][กลุ่ม] = { cbm, kg } (tier1 · null ถ้ายังไม่ตั้ง). */
export type QuoteDefaultGrid = Record<
  WarehouseId,
  Record<TransportId, Record<QuoteRateGroup, QuoteDefaultCell>>
>;

/** rgproductstype → กลุ่ม (rep 1 → general · 3 → fda · อื่นๆ → null). */
export function quoteGroupOf(rgproductstype: string): QuoteRateGroup | null {
  return rgproductstype === "1" ? "general" : rgproductstype === "3" ? "fda" : null;
}
