/**
 * ถอยสถานะ (rollback) ฝากนำเข้า — PURE decisions (no DB · no "server-only").
 * Unit-tested in forwarder-rollback-plan.test.ts.
 *
 * WHY THIS EXISTS (owner 2026-07-17)
 * ──────────────────────────────────
 * Owner, verbatim: "ทำให้สามารถถอยสถานะได้ตั้งแต่ตรงนี้เลย · ทำได้เฉพาะ ultra เท่านั้น ·
 * ที่เหลือตามเดิม · พอถอย สถานะเอกสาร สถานะงานก็ต้องถอยตามกลับมาหมด · ถ้าถอยสถานะที่ออก
 * เอกสารไปแล้ว ก็ยกเลิกไปให้ด้วยเลย เพราะจะต้องทำใหม่ เพราะมีแก้ไขข้อมูล · ถอยสถานะแล้ว
 * จะเดินสถานะไปต่อ ต่อจากนี้ก็ต้องทำแค่ตาม process เท่านั้น".
 *
 * The สถานะใหม่ dropdown on /admin/forwarders/[fNo] only ever moved FORWARD
 * (`adminBulkUpdateForwarderTbStatus` + its G5 matrix + `assertNotRefunded`,
 * which by design REFUSES demoting a paid row back into a collectible state).
 * `revertForwarderStep` (forwarder-step.ts) gives a one-step-back but is
 * STATUS-ONLY and deliberately REFUSES a paid row — because a bare status flip
 * would desync the docs/AR from the status.
 *
 * This module is the DECISION half of the ultra-only rollback that CAN move a
 * paid row back — because it unwinds the money/docs FIRST instead of ignoring
 * them. It answers exactly one question, with no I/O:
 *
 *      given (from → to) + what the row actually carries,
 *      → REFUSE with a reason, or → the ordered list of artefacts to unwind.
 *
 * The writer (`actions/admin/forwarder-rollback.ts`) gathers the facts, runs
 * this, and executes each step through the EXISTING audited reverse actions
 * (adminReverseForwarderPayment · adminReverseBillingRunPaid ·
 * cancelBillingRunInvoice · removeOpenDriverStops) — this module re-implements
 * none of that money math.
 *
 * 💰 MONEY-SAFETY — the design rules encoded here:
 *   - FACT-DRIVEN, never rank-driven. "4→3 has no docs" is NOT assumed: an
 *     advance-billed row (advance_bill_confirmed · billable at fstatus 2/3/4)
 *     legitimately carries a bill at fstatus 4, so the steps come from what the
 *     row CARRIES, not from the numbers.
 *   - REFUSE, never guess. A shared bill/receipt (covering OTHER orders) or a
 *     combined เติม-แล้วจ่าย slip is refused and routed to the surface that owns
 *     the multi-order unwind — cancelling a shared bill from a single-order
 *     dropdown would silently revert other customers' orders ("งานหาย").
 *     This mirrors the rule the existing reverse actions already enforce
 *     (pay-user.ts:2014 · billing-run.ts:2748 "ครอบหลายออเดอร์ — ไม่ void อัตโนมัติ").
 *   - A driver already EN ROUTE (fdistatus='1') and a delivered row (fstatus 7)
 *     are physically irreversible → refuse (a real truck is moving / the goods
 *     are with the customer). Both reverse actions refuse ≥7 too.
 *   - This module NEVER decides a price. It touches no ftotalprice/frefrate
 *     concept at all — only which artefacts must be unwound.
 *
 * @see actions/admin/forwarder-rollback.ts        — the writer that executes this plan
 * @see actions/admin/pay-user.ts                  — adminReverseForwarderPayment (un-settle + refund)
 * @see actions/admin/billing-run.ts               — adminReverseBillingRunPaid + cancelBillingRunInvoice
 * @see lib/admin/revert-driver-cleanup.ts         — assertNoDriverEnRoute + removeOpenDriverStops
 * @see actions/admin/forwarder-step.ts            — revertForwarderStep (the NON-ultra one-step-back · unchanged)
 */

/** The `fdatestatusN` column per status — '1' and '99' have none (mirrors
 *  TB_STATUS_DATE_COL in actions/admin/forwarders.ts + STATUS_DATE_COL in
 *  actions/admin/forwarder-step.ts). */
const STATUS_DATE_COL: Record<string, string | null> = {
  "1": null,
  "2": "fdatestatus2",
  "3": "fdatestatus3",
  "4": "fdatestatus4",
  "5": "fdatestatus5",
  "6": "fdatestatus6",
  "7": "fdatestatus7",
};

/** The physical/money statuses this rollback path handles. '99' (สถานะพิเศษ ·
 *  ยกเลิก) and 'credit' are NOT rollbacks — they keep their existing paths. */
export const ROLLBACKABLE_STATUSES = ["1", "2", "3", "4", "5", "6", "7"] as const;

/** Everything the row CARRIES that a rollback must deal with. Gathered by the
 *  writer from the DB; this module never reads anything itself. */
export type RollbackFacts = {
  /** the row's current fstatus (string, e.g. "6") */
  from: string;
  /** the desired fstatus (string, e.g. "3") */
  to: string;
  /** fcredit === '1' — an OUTSTANDING credit hold on the customer's line */
  isCredit: boolean;
  /** a SETTLED pay row exists (tb_wallet_hs typenew∈{5,6} status='2' reforder=fid) */
  hasSettledPayment: boolean;
  /** that settled pay is a combined "เติม-แล้วจ่าย" (reforder2 set OR a
   *  tb_wallet_paydeposit link) → a single-order partial reverse would mis-refund */
  hasCombinedSlip: boolean;
  /** a tb_forwarder_invoice with status='paid' covers this fid */
  hasPaidBill: boolean;
  /** a tb_forwarder_invoice with status='issued' covers this fid */
  hasIssuedBill: boolean;
  /** any covering bill also carries OTHER orders' items → not ours to cancel */
  isBillShared: boolean;
  /** an ACTIVE ใบเสร็จ (tb_receipt rstatus ≠ '2') covers this fid */
  hasActiveReceipt: boolean;
  /** that receipt also covers OTHER orders (issued ด้วยกัน) → not ours to void */
  isReceiptShared: boolean;
  /** a not-yet-dispatched driver stop ('' / null) exists → remove it */
  hasOpenDriverStop: boolean;
  /** a driver is actively delivering this order (fdistatus='1') → refuse */
  hasDriverEnRoute: boolean;
};

/** Why a rollback is refused. The writer maps each to a Thai message. */
export type RollbackRefusal =
  | "not_a_change"            // from === to
  | "out_of_scope_status"     // '99' / unknown / 'credit' — not this path
  | "not_a_rollback"          // to is FORWARD of from → the existing forward path owns it
  | "shipped_irreversible"    // from '7' ส่งแล้ว — the goods are with the customer
  | "driver_en_route"         // a truck is moving
  | "combined_slip"           // เติม-แล้วจ่าย group — accounting reverses the whole set
  | "bill_shared"             // the bill carries other orders
  | "receipt_shared";         // the receipt carries other orders

/** One artefact to unwind, in execution order. */
export type RollbackStep =
  | "driver_cleanup"   // removeOpenDriverStops (en-route already refused)
  | "reverse_payment"  // adminReverseForwarderPayment — un-settle + refund WALLET only
  | "reverse_bill_paid"// adminReverseBillingRunPaid — paid → issued + restore credit
  | "cancel_bill"      // cancelBillingRunInvoice — "จะต้องทำใหม่"
  | "void_receipt"     // mop-up for a receipt neither reverse touched
  | "release_credit"   // fcredit '1' → '' + decrement tb_credit (idempotent · see below)
  | "flip_status";     // the final atomic-claim fstatus write

export type RollbackPlan =
  | { ok: false; refusal: RollbackRefusal }
  | {
      ok: true;
      from: string;
      to: string;
      /** ordered — the writer executes exactly this sequence */
      steps: RollbackStep[];
      /** fdatestatusN columns to NULL — every stage the row no longer occupies.
       *  `to`'s own stamp is KEPT (the row really did reach `to`). */
      clearDateCols: string[];
    };

/** Rank a status for ordering. '99' is not ordered here (refused upstream). */
function rank(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isInteger(n) ? n : NaN;
}

function isRollbackable(s: string): boolean {
  return (ROLLBACKABLE_STATUSES as readonly string[]).includes(s);
}

/**
 * Decide the rollback for one order.
 *
 * Refusal order matters — the cheapest/most-final checks first, so the ultra
 * gets the most decisive reason (a delivered row is refused as "shipped", not
 * as "bill shared").
 *
 * Step order matters — it is the settle's mirror image, unwound outermost-first:
 *   1. driver_cleanup    the dispatch built LAST on top of the payment
 *   2. reverse_payment   un-settle + refund (also lands the row at 5 + voids its
 *                        own fully-covered receipt · pay-user.ts step 7)
 *   3. reverse_bill_paid paid → issued + restore fcredit/tb_credit (billing-run.ts step 2)
 *   4. cancel_bill       owner: "ออกเอกสารไปแล้ว ก็ยกเลิกไปให้ด้วยเลย เพราะจะต้องทำใหม่"
 *   5. void_receipt      mop-up (idempotent — steps 2/3 may already have voided it)
 *   6. release_credit    AFTER 3, because 3 can RESTORE fcredit='1'
 *   7. flip_status       last — the row lands at `to` with nothing dangling
 *
 * `release_credit` is included when `to` is below the credit-grant state (6) AND
 * the row either holds a credit now OR may get one back from step 3. The writer's
 * release is an atomic `.eq('fcredit','1')` claim, so an already-released /
 * never-credited row is a 0-row no-op (never a double-decrement) — hence the
 * plan says "may need", not "must".
 */
export function planForwarderRollback(f: RollbackFacts): RollbackPlan {
  const from = (f.from ?? "").trim();
  const to = (f.to ?? "").trim();

  // ── Refusals ──────────────────────────────────────────────────────────
  if (!isRollbackable(from) || !isRollbackable(to)) {
    // '99' สถานะพิเศษ · 'credit' · anything unknown → the existing paths own it.
    return { ok: false, refusal: "out_of_scope_status" };
  }
  if (from === to) return { ok: false, refusal: "not_a_change" };

  const fromRank = rank(from);
  const toRank = rank(to);
  if (toRank > fromRank) return { ok: false, refusal: "not_a_rollback" };

  // ส่งแล้ว(7) — the goods are physically with the customer. Both existing
  // reverse actions refuse fstatus ≥ 7; a dropdown must not be the one exception.
  if (from === "7") return { ok: false, refusal: "shipped_irreversible" };

  if (f.hasDriverEnRoute) return { ok: false, refusal: "driver_en_route" };
  if (f.hasSettledPayment && f.hasCombinedSlip) {
    return { ok: false, refusal: "combined_slip" };
  }
  if ((f.hasPaidBill || f.hasIssuedBill) && f.isBillShared) {
    return { ok: false, refusal: "bill_shared" };
  }
  if (f.hasActiveReceipt && f.isReceiptShared) {
    return { ok: false, refusal: "receipt_shared" };
  }

  // ── Steps ─────────────────────────────────────────────────────────────
  const steps: RollbackStep[] = [];
  if (f.hasOpenDriverStop) steps.push("driver_cleanup");
  if (f.hasSettledPayment) steps.push("reverse_payment");
  if (f.hasPaidBill) steps.push("reverse_bill_paid");
  if (f.hasPaidBill || f.hasIssuedBill) steps.push("cancel_bill");
  if (f.hasActiveReceipt) steps.push("void_receipt");
  if (toRank < 6 && (f.isCredit || f.hasPaidBill)) steps.push("release_credit");
  steps.push("flip_status");

  // Every stage ABOVE `to` and up to `from` is no longer occupied → its stamp
  // must go, so the date-driven customer timeline (actions/track.ts hasRealStamp)
  // stops claiming a step that was undone.
  const clearDateCols: string[] = [];
  for (let n = toRank + 1; n <= fromRank; n++) {
    const col = STATUS_DATE_COL[String(n)];
    if (col) clearDateCols.push(col);
  }

  return { ok: true, from, to, steps, clearDateCols };
}

/** Convenience for the writer/UI: does this (from → to) even take the rollback
 *  path? (false → the existing forward/99/credit paths handle it). */
export function isRollbackTransition(from: string, to: string): boolean {
  const f = (from ?? "").trim();
  const t = (to ?? "").trim();
  if (!isRollbackable(f) || !isRollbackable(t)) return false;
  return rank(t) < rank(f);
}
