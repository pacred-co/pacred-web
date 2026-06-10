/**
 * WHT 1% (หัก ณ ที่จ่าย) shape-adapter for the ใบวางบิล (billing-run) surfaces.
 *
 * The WHT RULE is NOT defined here — it lives in ONE place, lib/tax/wht.ts
 * `legacyReceiptAmount()` (the legacy `grenrateReceiptF` gate: juristic buyer
 * AND total ≥ 1,000 → withhold 1%), which is also what auto-issue-receipt.ts
 * uses to mint the ใบเสร็จ. This wrapper just delegates to it and reshapes the
 * result into the `{ wht_rate, wht_amount, net_payable }` triple the billing-run
 * pages render — so the ใบวางบิล and the ใบเสร็จ are computed by the SAME code
 * and reconcile to the satang. No duplicated rule, no VAT (that's the separate
 * ใบกำกับภาษี store).
 *
 * Plain module (NOT "use server") so it can be imported by the Server Action,
 * the admin + customer billing-run Server Components, and the print route alike.
 */

import { legacyReceiptAmount, LEGACY_RECEIPT_WHT_PCT } from "@/lib/tax/wht";

export type BillWht = {
  /** 0.01 when WHT applies, else 0. */
  wht_rate: number;
  /** หัก ณ ที่จ่าย amount (rounded to satang), else 0. */
  wht_amount: number;
  /** ยอดชำระสุทธิ = total − wht_amount (what the customer remits). */
  net_payable: number;
};

export function computeBillWht(isJuristic: boolean, totalThb: number): BillWht {
  const { totalBeforeWithholding, rAmount, applied } = legacyReceiptAmount(
    totalThb,
    isJuristic,
  );
  return {
    wht_rate:    applied ? LEGACY_RECEIPT_WHT_PCT / 100 : 0,
    wht_amount:  Math.round((totalBeforeWithholding - rAmount) * 100) / 100,
    net_payable: rAmount,
  };
}
