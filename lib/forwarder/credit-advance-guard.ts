/**
 * Credit-limit lock on status advance — UNIT E (2026-06-19 · owner directive).
 *
 * Owner:
 *   "ลูกค้าเครดิต ถ้าเครดิตเต็ม/เกินวงเงิน ยังไม่จ่ายของเก่า → ห้ามเลื่อนเป็น
 *    เตรียมส่ง(fstatus 6) เด็ดขาด · ลอคไว้ รอจ่ายเครดิตให้พอ → แล้วจึงไหลไป 6 ·
 *    ส่งแจ้งชำระให้ลูกค้า"
 *   — a credit customer whose credit line is full/over-limit (with old debt
 *     unpaid) must NEVER be advanced to fstatus '6' (เตรียมส่ง). Lock the row,
 *     wait for them to pay down the credit enough, THEN it may flow to 6. Send
 *     them a payment-due notification.
 *
 * ─── The credit model (read from source · actions/credit.ts + ADR-0023) ──────
 * The credit line is the LEGACY pair, both keyed by the customer's PR member-code:
 *   limit       = tb_users.userCreditValue   (camelCase · per userID · missing ⇒ 0)
 *   outstanding = tb_credit.creditvalue      (lowercase  · per userid · missing ⇒ 0)
 *   available   = limit − outstanding        (computed; never stored)
 *
 * A forwarder ROW is a credit row when `fcredit` is set (not '' and not '0' —
 * legacy writes '1' on the credit grant; calcForwarderOutstanding / the settle
 * path both treat fcredit ∈ {'', '0', null} as "not on credit").
 *
 * ─── The lock rule ───────────────────────────────────────────────────────────
 * Block the advance to fstatus '6' when ALL of:
 *   (a) the row is a credit row (fcredit set), AND
 *   (b) the customer is at/over their credit limit (outstanding ≥ limit), AND
 *   (c) there is real unpaid debt (outstanding > 0).
 *
 * Rationale for each clause:
 *   - (a) only credit rows: a cash/paid row never burdens the credit line, so it
 *     flows freely (the owner scoped this to "ลูกค้าเครดิต").
 *   - (b) at/over the limit: while the customer still has headroom
 *     (outstanding < limit) the new order fits within the line — legacy lets
 *     credit-before-arrival flow (juristic+credit save-point). Only a FULL line
 *     locks. Edge: limit = 0 (no credit line granted) → any outstanding > 0 is
 *     "over" (0 ≥ 0 is also true) so it locks — a row marked fcredit on a
 *     customer with no line is anomalous and correctly held for review.
 *   - (c) outstanding > 0: never block on a zero balance even if limit is 0
 *     (0 ≥ 0 but nothing is owed → nothing to pay → don't lock).
 *
 * Money-safety: this predicate is READ-ONLY signal evaluation. It NEVER mutates
 * wallet / credit / status. The caller (advanceForwarderStep · the bulk action)
 * refuses the status write when blocked === true.
 *
 * Kept PURE (no DB, no I/O) so the money logic is unit-testable: the caller
 * reads the four inputs and passes them in.
 */

export interface CreditAdvanceInputs {
  /** tb_forwarder.fcredit — '1' = on credit; '' / '0' / null = not on credit. */
  fcredit: string | null | undefined;
  /** tb_credit.creditvalue — current outstanding credit used (missing ⇒ 0). */
  outstanding: number | string | null | undefined;
  /** tb_users.userCreditValue — the customer's credit limit (missing ⇒ 0). */
  limit: number | string | null | undefined;
}

export interface CreditAdvanceVerdict {
  /** true ⇒ the caller MUST refuse the advance to fstatus '6'. */
  blocked: boolean;
  /** Thai-facing reason (also used as the error message + audit detail). */
  reason: string;
}

function toNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** A row is "on credit" when fcredit is set to anything other than '' / '0'. */
export function isCreditRow(fcredit: string | null | undefined): boolean {
  const v = String(fcredit ?? "").trim();
  return v !== "" && v !== "0";
}

/**
 * Decide whether a credit customer may be advanced to fstatus '6' (เตรียมส่ง).
 *
 * Returns { blocked, reason }. When blocked === true the caller refuses the
 * status write and (best-effort) fires a payment-due notification.
 */
export function canAdvanceCreditCustomer(
  inputs: CreditAdvanceInputs,
): CreditAdvanceVerdict {
  // (a) Not a credit row → the credit line is irrelevant → always allow.
  if (!isCreditRow(inputs.fcredit)) {
    return { blocked: false, reason: "" };
  }

  const outstanding = toNum(inputs.outstanding);
  const limit = toNum(inputs.limit);

  // (c) No real debt → nothing to pay → allow (even if limit is 0).
  if (outstanding <= 0) {
    return { blocked: false, reason: "" };
  }

  // (b) Headroom remains (outstanding < limit) → the order fits the line → allow.
  if (outstanding < limit) {
    return { blocked: false, reason: "" };
  }

  // At/over the limit WITH unpaid debt → LOCK.
  const fmt = (n: number) =>
    n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    blocked: true,
    reason:
      `เครดิตเต็ม/เกินวงเงิน — ต้องชำระเครดิตก่อนจึงจะเลื่อนเป็นเตรียมส่ง ` +
      `(ค้างชำระ ฿${fmt(outstanding)} / วงเงิน ฿${fmt(limit)})`,
  };
}
