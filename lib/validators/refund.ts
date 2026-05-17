/**
 * Zod schemas for U1-6 refund money path.
 *
 * Per [docs/UPGRADE_PLAN.md] §1 U1-6 + [docs/research/gap-revenue-flow.md] H-3.
 *
 * V1 surface area:
 *   - createRefundRequestSchema  — customer-side; source must be one of
 *     forwarder/service_order/yuan_payment + source_ref required + reason ≥10 chars
 *   - adminCreateRefundSchema    — admin-side; same + source='manual' allowed
 *   - approveRefundSchema        — id only (pending → approved decision)
 *   - rejectRefundSchema         — id + rejected_reason ≥5 chars (pending → rejected)
 *   - markRefundPaidSchema       — id only (the wallet credit is created server-side
 *                                  from refund_requests.amount_thb, not from input)
 */

import { z } from "zod";

export const REFUND_SOURCES = [
  "forwarder", "service_order", "yuan_payment", "manual",
] as const;
export type RefundSource = (typeof REFUND_SOURCES)[number];

export const REFUND_SOURCE_LABEL: Record<RefundSource, string> = {
  forwarder:     "ฝากนำเข้า (Forwarder)",
  service_order: "ฝากสั่ง (China Shop)",
  yuan_payment:  "ฝากโอนหยวน (Yuan transfer)",
  manual:        "อื่นๆ (Manual)",
};

export const REFUND_STATUSES = [
  "pending", "approved", "rejected", "paid",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  pending:  "รอตรวจสอบ",
  approved: "อนุมัติแล้ว (รอจ่าย)",
  rejected: "ปฏิเสธ",
  paid:     "คืนเงินแล้ว",
};

// Customer-facing sources that the customer themselves can link to.
// Excludes 'manual' (admin-only — RLS enforces this too).
export const CUSTOMER_REFUND_SOURCES = [
  "forwarder", "service_order", "yuan_payment",
] as const;
export type CustomerRefundSource = (typeof CUSTOMER_REFUND_SOURCES)[number];

// ────────────────────────────────────────────────────────────
// Create refund request — customer side
// ────────────────────────────────────────────────────────────

export const createRefundRequestSchema = z.object({
  /** forwarder | service_order | yuan_payment (manual is admin-only) */
  source:     z.enum(CUSTOMER_REFUND_SOURCES),
  /** f_no | h_no | yuan_payments.id (uuid). Required for all customer sources. */
  source_ref: z.string().trim().min(1, "กรุณาเลือกรายการอ้างอิง").max(100),
  /** Refund amount in THB (positive). */
  amount_thb: z.number().positive("ยอดต้องมากกว่า 0").max(9_999_999.99, "ยอดสูงเกินไป"),
  /** Customer's reason — must be substantive (≥10 chars). */
  reason:     z.string().trim().min(10, "กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร").max(2000),
});
export type CreateRefundRequestInput = z.infer<typeof createRefundRequestSchema>;

// ────────────────────────────────────────────────────────────
// Create refund — admin side (allows source='manual')
// ────────────────────────────────────────────────────────────

export const adminCreateRefundSchema = z
  .object({
    /** Which customer receives the refund. */
    profile_id: z.string().uuid("invalid profile_id"),
    source:     z.enum(REFUND_SOURCES),
    /** Required for non-manual sources; nullable when source=manual. */
    source_ref: z.string().trim().max(100).optional().or(z.literal("").transform(() => undefined)),
    amount_thb: z.number().positive("ยอดต้องมากกว่า 0").max(9_999_999.99, "ยอดสูงเกินไป"),
    reason:     z.string().trim().min(5, "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร").max(2000),
  })
  .refine(
    (d) => d.source === "manual" || (d.source_ref !== undefined && d.source_ref.length >= 1),
    { message: "กรุณาระบุรายการอ้างอิงสำหรับ source ที่ไม่ใช่ manual", path: ["source_ref"] },
  );
export type AdminCreateRefundInput = z.infer<typeof adminCreateRefundSchema>;

// ────────────────────────────────────────────────────────────
// Approve / reject / mark-paid — id-keyed
// ────────────────────────────────────────────────────────────

export const approveRefundSchema = z.object({
  id: z.string().uuid(),
});
export type ApproveRefundInput = z.infer<typeof approveRefundSchema>;

export const rejectRefundSchema = z.object({
  id:              z.string().uuid(),
  rejected_reason: z.string().trim().min(5, "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร").max(500),
});
export type RejectRefundInput = z.infer<typeof rejectRefundSchema>;

export const markRefundPaidSchema = z.object({
  id: z.string().uuid(),
});
export type MarkRefundPaidInput = z.infer<typeof markRefundPaidSchema>;

// ────────────────────────────────────────────────────────────
// P0-1 — refund money-safety guards (cross-table; live in the
// action layer, but the decision math + status sets are pure
// and unit-testable so they sit here next to the schemas).
// Per [docs/research/review-u1-u2-2026-05-18.md] P0-1.
// ────────────────────────────────────────────────────────────

/**
 * Parent statuses that mean "the customer never paid a baht against
 * this parent". A refund created against a parent in one of these
 * statuses has nothing to refund — creation is rejected.
 *
 *  - forwarder      : 'pending_payment' (all later statuses follow a
 *                     wallet import_payment debit; 'cancelled' is terminal)
 *  - service_order  : 'pending' / 'awaiting_payment' (paid begins at 'ordered')
 *  - yuan_payment   : 'pending' (the THB is collected once it moves to
 *                     'processing'; 'failed'/'refunded' are terminal)
 *
 * 'manual' has no parent and is not represented here.
 */
export const NEVER_PAID_PARENT_STATUSES: Record<CustomerRefundSource, readonly string[]> = {
  forwarder:     ["pending_payment"],
  service_order: ["pending", "awaiting_payment"],
  yuan_payment:  ["pending"],
};

/**
 * True when a parent in `parentStatus` has never collected money — so a
 * refund must not be created against it. Unknown sources / statuses are
 * treated as paid (return false) — the caller's own existence + amount
 * guards still apply; this helper only blocks the clear never-paid case.
 */
export function isNeverPaidParentStatus(
  source:       string,
  parentStatus: string,
): boolean {
  const set = NEVER_PAID_PARENT_STATUSES[source as CustomerRefundSource];
  return set ? set.includes(parentStatus) : false;
}

/** Outcome of the mark-paid amount-ceiling check. */
export type RefundCeilingCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * P0-1 ceiling guard — pure arithmetic, no IO. The action layer resolves
 * the three inputs from the DB; this decides whether the refund may be paid.
 *
 *   collected           — THB the customer actually paid against the parent
 *   priorPaidRefunds    — sum of already-`paid` refund_requests for the same parent
 *   thisRefundAmount    — the amount this mark-paid would credit
 *
 * Reject when `priorPaidRefunds + thisRefundAmount` exceeds `collected`.
 * Defensive against NaN / negative inputs (treats them as a violation).
 */
export function checkRefundCeiling(
  collected:        number,
  priorPaidRefunds: number,
  thisRefundAmount: number,
): RefundCeilingCheck {
  if (
    !Number.isFinite(collected) ||
    !Number.isFinite(priorPaidRefunds) ||
    !Number.isFinite(thisRefundAmount)
  ) {
    return { ok: false, reason: "refund_ceiling_check_bad_input" };
  }
  if (collected < 0 || priorPaidRefunds < 0 || thisRefundAmount <= 0) {
    return { ok: false, reason: "refund_ceiling_check_bad_input" };
  }
  // Round to 2dp before comparing — THB money columns are numeric(12,2);
  // float sums (e.g. 0.1 + 0.2) must not trip the guard by an epsilon.
  const used  = Math.round((priorPaidRefunds + thisRefundAmount) * 100) / 100;
  const limit = Math.round(collected * 100) / 100;
  if (used > limit) {
    return {
      ok: false,
      reason:
        `refund_exceeds_collected — ขอคืน ฿${thisRefundAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}` +
        (priorPaidRefunds > 0
          ? ` + คืนไปแล้ว ฿${priorPaidRefunds.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`
          : "") +
        ` เกินยอดที่ลูกค้าชำระจริง ฿${collected.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
    };
  }
  return { ok: true };
}
