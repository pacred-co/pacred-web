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

/**
 * ADVANCE billing (owner 2026-06-23 · B "วางบิลล่วงหน้าตอน MOMO ยิงของ"): the physical
 * stages BEFORE Thailand arrival at which a confirmed parcel may be billed early —
 * ถึงโกดังจีน(2) / กำลังส่งมาไทย(3) / ถึงไทย(4). ONLY when a staff has เฟิม'd it.
 */
export const ADVANCE_BILLABLE_FSTATUS = ["2", "3", "4"] as const;

/** Subset of `tb_forwarder` columns the eligibility rule reads. */
export interface ForwarderBillingEligibilityFields {
  fstatus: string | null;
  fcredit: string | null;
  paydeposit: string | null;
  /** เฟิม flag (mig 0207) — '1' once a staff confirmed the cbm/weight for an advance bill. */
  advance_bill_confirmed?: string | boolean | null;
  /** The freight total — must be > 0 (priced/measured) before an advance bill. */
  ftotalprice?: number | string | null;
}

function norm(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/** '1' / true / 'true' → confirmed. */
function isConfirmed(v: string | boolean | null | undefined): boolean {
  if (v === true) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true";
}

function toNum(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
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
 * Cohort C — ADVANCE bill (owner 2026-06-23). Bill BEFORE Thailand arrival, at the
 * MOMO-scanned stages (fstatus 2/3/4), but ONLY when:
 *   • a staff has เฟิม'd it (advance_bill_confirmed) — the MOMO scan confirmed the
 *     parcel exists + a human checked the firmed cbm/weight (กันเก็บตังมั่ว), AND
 *   • the freight is priced (ftotalprice > 0 = measured · MOMO/แต้ม cbm/weight applied), AND
 *   • not already settled (paydeposit<>'1') and not cancelled (fstatus<>'99').
 *
 * SAFE-BY-DEFAULT: advance_bill_confirmed defaults '0' (mig 0207) → this cohort never
 * matches until a staff explicitly confirms, so shipping it changes nothing.
 */
export function isAdvanceBillEligible(
  row: ForwarderBillingEligibilityFields,
): boolean {
  if (!isConfirmed(row.advance_bill_confirmed)) return false;
  const fstatus = norm(row.fstatus);
  if (fstatus === "99") return false;
  if (!(ADVANCE_BILLABLE_FSTATUS as readonly string[]).includes(fstatus)) return false;
  if (norm(row.paydeposit) === "1") return false;
  if (!(toNum(row.ftotalprice) > 0)) return false; // never advance-bill an unmeasured ฿0 row
  return true;
}

/**
 * A forwarder row is billable when it is in ANY cohort. This is the gate the
 * billing-run create-invoice + the manual-receipt issue path enforce in memory
 * after re-reading the candidate rows.
 */
export function isBillableForwarder(
  row: ForwarderBillingEligibilityFields,
): boolean {
  return (
    isAwaitingPaymentEligible(row) ||
    isCreditUnsettledEligible(row) ||
    isAdvanceBillEligible(row)
  );
}

/**
 * BILLING-RUN eligibility (owner 2026-07-07) — a ใบวางบิล is issued ONLY for
 * CREDIT (fcredit='1') or นิติบุคคล (juristic) customers. A cash customer's
 * ฝากนำเข้า is collected by the customer paying on the portal (total+QR+slip at
 * fstatus='5'), the staff verifying the slip at /admin/wallet, and the auto-receipt
 * — NEVER by a billing-run. So the two eligibility PICKERS drop the pure cash
 * cohort (a plain fstatus='5' row on a personal, non-credit customer).
 *
 *   juristic customer → every billable row (isBillableForwarder)
 *   else (cash/personal) → credit-unsettled OR advance-bill only (drops cash rows)
 *
 * NOTE: this is per-CUSTOMER — juristic is a `tb_users.userCompany`/`tb_corporate`
 * fact, not a `tb_forwarder` column (fusercompany is stamped only at pay-time and
 * is empty for essentially all unpaid rows) — so it cannot be a pure SQL WHERE
 * clause. The candidate rows are fetched by the same union queries (the cash query
 * stays as the pool that surfaces juristic-cash rows); this predicate then drops
 * the non-juristic cash rows in memory. Does NOT change createBillingRunInvoice's
 * guard (isBillableForwarder), only WHO the pickers surface. Reversible (this fn).
 */
export function isBillingRunEligible(
  row: ForwarderBillingEligibilityFields,
  customerIsJuristic: boolean,
): boolean {
  if (!isBillableForwarder(row)) return false;
  if (customerIsJuristic) return true; // นิติ → all billable stages
  return isCreditUnsettledEligible(row) || isAdvanceBillEligible(row); // else credit/advance only
}

/**
 * G4 (2026-07-08) — a ตรวจตู้-done arrival row (fstatus='4' · ถึงไทยแล้ว) that has
 * NOT yet been lifted to รอชำระเงิน (fstatus='5'). Legacy lifts 4→5 in a separate
 * step (adminCallPriceUser · which also SMSes + empties the check-queue), so today
 * a bill can't be raised until that hop runs. This predicate lets the billing-run
 * picker + the container shortcut surface a fresh-4 row so createBillingRunInvoice
 * can lift its OWN rows 4→5 (with the same guarded flip) at issue time.
 *
 * DELIBERATELY NARROW — a plain fstatus='4' is NOT billable on its own. The caller
 * MUST additionally require (a) the row is on tb_check_forwarder (the ตรวจตู้-done
 * signal · preserves the QA gate) AND (b) the customer is juristic/credit. This fn
 * is only the fstatus arm; it does NOT widen isBillableForwarder (which the
 * manual-receipt issue path shares — that must never admit a plain 4).
 */
export function isCheckedArrivedForwarder(
  row: ForwarderBillingEligibilityFields,
): boolean {
  return norm(row.fstatus) === "4";
}
