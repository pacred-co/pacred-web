/**
 * Billing-eligibility predicate — which `tb_forwarder` rows may be put on a
 * วางบิล / ใบเสร็จ (billing-run invoice / receipt).
 *
 * ── Why this module exists ───────────────────────────────────────────────
 * BUG B (2026-06-14 money fix): the billing-run + manual-receipt paths gated
 * eligibility on `fstatus='5'` ONLY. A juristic + credit order ships at
 * `fstatus` 5 or 6 with `fcredit='1'` and is then INVISIBLE to those surfaces
 * — so a credit customer never gets a วางบิล and the receivable is never
 * documented. The AR-aging cockpit (`actions/admin/reports-ar.ts`) already
 * recognised the credit cohort with this exact predicate:
 *
 *     fstatus IN ('5','6') AND fcredit='1' AND paydeposit<>'1' AND fstatus<>'99'
 *
 * This module is the single, tested source of truth for that rule so the
 * billing-run eligibility queries, the create-invoice guard, and the
 * manual-receipt issue path all agree.
 *
 * ── The two cohorts ──────────────────────────────────────────────────────
 *   (A) AWAITING-PAYMENT  · fstatus='5' (รอชำระเงิน) — the canonical
 *       cash-waiting pool (lib/legacy-status-map.ts + sidebar-counts.ts).
 *   (B) CREDIT, UNSETTLED · fcredit='1' AND paydeposit<>'1' AND fstatus<>'99'
 *       AND fstatus IN ('5','6') — shipped-on-credit, not yet paid in full
 *       (identical to reports-ar.ts Set B, narrowed to the billable stages
 *       5/6 so we never bill an in-warehouse or in-transit credit order).
 *
 * Pure · no IO · used both for the in-memory guard and as the documented
 * contract behind the two Supabase eligibility queries.
 */

/** The forwarder-status values a credit order may sit at and still be billable. */
export const BILLABLE_FSTATUS = ["5", "6"] as const;

/** Subset of `tb_forwarder` columns the eligibility rule reads. */
export interface ForwarderBillingEligibilityFields {
  fstatus: string | null;
  fcredit: string | null;
  paydeposit: string | null;
}

function norm(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/**
 * Cohort A — รอชำระเงิน. The plain awaiting-payment row (fstatus='5').
 */
export function isAwaitingPaymentEligible(
  row: ForwarderBillingEligibilityFields,
): boolean {
  return norm(row.fstatus) === "5";
}

/**
 * Cohort B — credit, unsettled. Mirrors reports-ar.ts Set B, narrowed to the
 * billable stages 5/6 (a credit order in an earlier stage isn't billable yet).
 *
 *   fcredit='1' AND paydeposit<>'1' AND fstatus<>'99' AND fstatus IN ('5','6')
 */
export function isCreditUnsettledEligible(
  row: ForwarderBillingEligibilityFields,
): boolean {
  const fstatus = norm(row.fstatus);
  if (fstatus === "99") return false;
  if (!(BILLABLE_FSTATUS as readonly string[]).includes(fstatus)) return false;
  if (norm(row.fcredit) !== "1") return false;
  if (norm(row.paydeposit) === "1") return false;
  return true;
}

/**
 * A forwarder row is billable when it is in EITHER cohort. This is the gate the
 * billing-run create-invoice + the manual-receipt issue path enforce in memory
 * after re-reading the candidate rows.
 */
export function isBillableForwarder(
  row: ForwarderBillingEligibilityFields,
): boolean {
  return isAwaitingPaymentEligible(row) || isCreditUnsettledEligible(row);
}
