/**
 * 📄 Items-per-page for the money documents (owner 2026-07-07: "แก้ให้ครบทุกใบ ·
 * แพทเทินเดียวกัน · เรียบร้อยสวยงามเป็นระเบียบเหมือนกันทุกใบ").
 *
 * ALL money docs (ใบวางบิล + ใบเสร็จ + ใบแจ้งหนี้) now target ONE-PAGE-FILL at 24
 * rows/page → a normal doc = 1 ต้นฉบับ + 1 สำเนา (no ugly 13+N split). The owner
 * explicitly accepts that a very long doc may overflow the bottom edge ("ถ้าล้น
 * ตกขอบค่อยว่ากัน") — a filled single page beats a messy multi-page split.
 */

/**
 * RECEIPT (ใบเสร็จ / ใบแจ้งหนี้) rows/page = 24 (was 13 · owner 2026-07-07 wanted
 * every doc consistent). The receipt footer is taller (summary + WHT sub-rows), so
 * a ≥~20-row receipt can overflow the bottom edge — accepted per the owner's
 * "ค่อยว่ากัน" (fill one page, refine overflow later). Consumed by
 * lib/receipt/load-receipt-document.ts.
 */
export const DOC_ROWS_PER_PAGE = 24;

/**
 * BILL (ใบวางบิล) rows/page = 24 — same as the receipt so EVERY money doc paginates
 * consistently. Consumed by BOTH bill surfaces: the admin print page + the public
 * /b/[token] page (they MUST use the same value or the same bill would paginate
 * differently on each).
 */
export const BILL_ROWS_PER_PAGE = 24;
