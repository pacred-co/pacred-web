/**
 * WHT 1% (หัก ณ ที่จ่าย) shape-adapter for the ใบวางบิล (billing-run) surfaces.
 *
 * The WHT RULE is NOT defined here — it lives in ONE place, lib/tax/wht.ts
 * `legacyReceiptAmount()` (owner 2026-07-22: juristic buyer → withhold 1% on ANY
 * positive amount · the old ≥ ฿1,000 minimum was abolished), which is also what
 * auto-issue-receipt.ts uses to mint the ใบเสร็จ. This wrapper just delegates to
 * it (adding only the forward-only freeze for bills settled before the change)
 * and reshapes the
 * result into the `{ wht_rate, wht_amount, net_payable }` triple the billing-run
 * pages render — so the ใบวางบิล and the ใบเสร็จ are computed by the SAME code
 * and reconcile to the satang. No duplicated rule, no VAT (that's the separate
 * ใบกำกับภาษี store).
 *
 * Plain module (NOT "use server") so it can be imported by the Server Action,
 * the admin + customer billing-run Server Components, and the print route alike.
 */

import {
  legacyReceiptAmount,
  LEGACY_RECEIPT_WHT_PCT,
  LEGACY_RECEIPT_WHT_MIN,
} from "@/lib/tax/wht";

export type BillWht = {
  /** 0.01 when WHT applies, else 0. */
  wht_rate: number;
  /** หัก ณ ที่จ่าย amount (rounded to satang), else 0. */
  wht_amount: number;
  /** ยอดชำระสุทธิ = total − wht_amount (what the customer remits). */
  net_payable: number;
};

/**
 * owner 2026-07-22 — the date the ฿1,000 WHT minimum was abolished. A bill that
 * was ALREADY PAID before this instant keeps the old ≥ ฿1,000 gate so its
 * displayed net still equals what the customer actually remitted (forward-only:
 * "อันไหนที่เลย รอชำระไปแล้ว ปล่อยไปเลย"). Unpaid bills + anything settled on/after
 * this instant use the new no-minimum rule. Bump this to the real deploy time if
 * needed — every affected paid bill on prod settled by 2026-07-14.
 */
export const WHT_NO_MIN_SINCE_ISO = "2026-07-22T00:00:00+07:00";
const WHT_NO_MIN_SINCE_MS = new Date(WHT_NO_MIN_SINCE_ISO).getTime();

/**
 * @param opts.paidAt  the bill's paid_at (timestamptz ISO), or null/undefined for
 *                     an UNPAID bill. A bill paid BEFORE WHT_NO_MIN_SINCE_ISO is
 *                     frozen to the legacy ≥ ฿1,000 gate; everything else uses the
 *                     new no-minimum rule. Omit → new rule (live/forward callers).
 */
export function computeBillWht(
  isJuristic: boolean,
  totalThb: number,
  opts?: { paidAt?: string | null },
): BillWht {
  const paidMs = opts?.paidAt ? new Date(opts.paidAt).getTime() : NaN;
  const settledUnderLegacy = Number.isFinite(paidMs) && paidMs < WHT_NO_MIN_SINCE_MS;
  const minThreshold = settledUnderLegacy ? LEGACY_RECEIPT_WHT_MIN : 0;
  const { totalBeforeWithholding, rAmount, applied } = legacyReceiptAmount(
    totalThb,
    isJuristic,
    minThreshold,
  );
  return {
    wht_rate:    applied ? LEGACY_RECEIPT_WHT_PCT / 100 : 0,
    wht_amount:  Math.round((totalBeforeWithholding - rAmount) * 100) / 100,
    net_payable: rAmount,
  };
}
