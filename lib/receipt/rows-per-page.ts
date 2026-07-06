/**
 * 📄 Shared items-per-page for the money documents — THE single source so the
 * ใบวางบิล (billing-run) and the ใบเสร็จ (receipt) paginate an order IDENTICALLY.
 *
 * Before this was two divergent literals (bill = 24, receipt = 13) → the SAME
 * order broke onto a different number of pages depending on which doc you printed.
 *
 * 13 is chosen deliberately: it is the largest value that fits BOTH papers.
 *   - The receipt footer is TALLER (it carries a summary block + the
 *     "จำนวนเงินรวม / ภาษีหัก ณ ที่จ่าย" payment sub-rows), and its print CSS is
 *     tuned to 285mm/@page 3mm so a full receipt never spills to a 2nd sheet.
 *   - The bill footer is smaller, so 13 rows/page fits it too (it already fit 24).
 * Raising the receipt to 24 would risk overflowing its taller footer to an extra
 * sheet — the exact bug the receipt CSS was tuned to avoid. So both papers use 13.
 */
export const DOC_ROWS_PER_PAGE = 13;
