/**
 * Zod schemas + helpers for V-E8/H1/H2 commission flows.
 *
 * Per port-spec [docs/port-specs/commission-withdrawal.md] +
 * ADR-0015 Q3 + Phase I2 RBAC ack 2026-05-17.
 *
 * Workflow:
 *   accrual (system mints per closed order)
 *     → request (staff bundles N accruals into a withdrawal)
 *     → approve (super/accounting)
 *     → paid (super/accounting + slip upload)
 *     reject branch: pending → rejected (with reason)
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Enums + display labels
// ────────────────────────────────────────────────────────────

export const ROLE_KINDS = ["interpreter", "sales_rep"] as const;
export type RoleKind = (typeof ROLE_KINDS)[number];

export const ROLE_KIND_LABEL: Record<RoleKind, string> = {
  interpreter: "ล่ามจีน (Interpreter)",
  sales_rep:   "Sales rep",
};

export const SOURCE_KINDS = ["service_order", "forwarder", "freight_quote"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  service_order: "ฝากสั่ง (Service order)",
  forwarder:     "ฝากนำเข้า (Forwarder)",
  freight_quote: "Freight quote",
};

export const WITHDRAWAL_STATUSES = ["pending", "approved", "rejected", "paid"] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

export const WITHDRAWAL_STATUS_LABEL: Record<WithdrawalStatus, string> = {
  pending:  "รอตรวจ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
  paid:     "จ่ายแล้ว",
};

// ────────────────────────────────────────────────────────────
// Constants — Thai law thresholds (Revenue Code §50(1))
// ────────────────────────────────────────────────────────────

/** Default Thai WHT rate on service payments (per Revenue Code §50(1)). */
export const DEFAULT_WHT_RATE_PCT = 15;

/** Threshold above which WHT applies. */
export const WHT_THRESHOLD_THB = 5000;

/** Minimum balance staff must accrue before they can request a withdrawal. */
export const MIN_WITHDRAWAL_THB = 100;

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Round half-up to 2dp (THB cents) — matches numeric(12,2) storage. */
export function roundThb(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute the WHT amount + net for a withdrawal.
 *
 * Per Thai Revenue Code §50(1): when gross > 5,000 THB AND wht_rate > 0,
 * withhold gross × rate / 100. Otherwise withhold 0.
 *
 * (Staff can override wht_rate_pct = 0 for taxable-elsewhere cases.)
 */
export function computeWithdrawalNumbers(args: {
  gross_thb:    number;
  wht_rate_pct: number;
}): { wht_amount_thb: number; net_thb: number } {
  const wht_amount_thb =
    args.gross_thb > WHT_THRESHOLD_THB && args.wht_rate_pct > 0
      ? roundThb(args.gross_thb * (args.wht_rate_pct / 100))
      : 0;
  const net_thb = roundThb(args.gross_thb - wht_amount_thb);
  return { wht_amount_thb, net_thb };
}

/**
 * Apply a tier's rate (or flat) to a base amount.
 * Returns the accrual amount, rounded to 2dp.
 */
export function computeAccrualAmount(args: {
  base_thb:   number;
  rate_pct:   number | null;
  flat_thb:   number | null;
}): number {
  if (args.flat_thb !== null && args.flat_thb !== undefined) {
    return roundThb(args.flat_thb);
  }
  if (args.rate_pct !== null && args.rate_pct !== undefined) {
    return roundThb(args.base_thb * (args.rate_pct / 100));
  }
  return 0;
}

// ────────────────────────────────────────────────────────────
// Server action schemas
// ────────────────────────────────────────────────────────────

/**
 * Accrue commission for one closed order — admin/cron-triggered.
 *
 * V1: admin manually picks the source order + earner + tier, posts the
 * accrual. V1.1 = cron auto-mints from terminal-state orders.
 */
export const accrueCommissionSchema = z.object({
  source_kind:      z.enum(SOURCE_KINDS),
  /** h_no | f_no | quote_no — text matches the DB column. */
  source_ref:       z.string().trim().min(1).max(100),
  /** profile_id of the staff earning the commission. */
  earner_admin_id:  z.string().uuid(),
  role_kind:        z.enum(ROLE_KINDS),
  /** Which tier to apply. Snapshotted into commission_accruals.tier_id. */
  tier_id:          z.string().uuid(),
  /** The base amount the rate applies to (e.g. order total). */
  base_thb:         z.number().positive("base_thb ต้อง > 0").max(99_999_999.99),
  notes:            z.string().trim().max(500).optional(),
});
export type AccrueCommissionInput = z.infer<typeof accrueCommissionSchema>;

/**
 * Staff requests a withdrawal — bundles N accruals + payee bank.
 *
 * App-layer enforces:
 *   - all accruals belong to the caller (earner_admin_id = auth.uid())
 *   - all are still unpaid (withdrawal_item_id is null)
 *   - sum(included_amount_thb) ≥ MIN_WITHDRAWAL_THB
 */
export const requestWithdrawalSchema = z.object({
  accrual_ids:           z.array(z.string().uuid()).min(1).max(500),
  title:                 z.string().trim().min(1).max(200),
  /** Payee bank account snapshot — frozen at request time. */
  payee_bank_name:       z.string().trim().min(1).max(100),
  payee_account_name:    z.string().trim().min(1).max(200),
  payee_account_no:      z.string().trim().min(1).max(50),
  /**
   * Optional WHT rate override. Default = DEFAULT_WHT_RATE_PCT.
   * Set to 0 for taxable-elsewhere cases (audited).
   */
  wht_rate_pct:          z.number().min(0).max(50).optional(),
  notes:                 z.string().trim().max(500).optional(),
});
export type RequestWithdrawalInput = z.infer<typeof requestWithdrawalSchema>;

/** Admin approves a pending withdrawal. */
export const approveWithdrawalSchema = z.object({
  id: z.string().uuid(),
});
export type ApproveWithdrawalInput = z.infer<typeof approveWithdrawalSchema>;

/** Admin rejects a pending withdrawal — reason required. */
export const rejectWithdrawalSchema = z.object({
  id:              z.string().uuid(),
  rejected_reason: z.string().trim().min(3, "เหตุผล ≥3 ตัวอักษร").max(500),
});
export type RejectWithdrawalInput = z.infer<typeof rejectWithdrawalSchema>;

/**
 * Admin marks an approved withdrawal as paid + records the slip path.
 * The slip itself is uploaded via a separate file-upload action.
 */
export const markWithdrawalPaidSchema = z.object({
  id:                z.string().uuid(),
  /**
   * Storage path inside bucket 'commission-slips' after admin upload.
   * Format: "{earner_admin_id}/{withdrawal_no}.{ext}".
   * Set by the upload action — clients shouldn't pass an arbitrary path.
   */
  slip_storage_path: z.string().trim().min(1).max(500),
});
export type MarkWithdrawalPaidInput = z.infer<typeof markWithdrawalPaidSchema>;

// ────────────────────────────────────────────────────────────
// Tier upsert (admin)
// ────────────────────────────────────────────────────────────

/** Upsert a commission tier — exactly one of rate_pct / flat_thb. */
export const upsertCommissionTierSchema = z
  .object({
    id:               z.string().uuid().optional(),                    // present = update
    role_kind:        z.enum(ROLE_KINDS),
    service_kind:     z.enum(SOURCE_KINDS),
    tier_name:        z.string().trim().min(1).max(200),
    rate_pct:         z.number().min(0).max(100).nullable().optional(),
    flat_thb:         z.number().min(0).max(99_999_999).nullable().optional(),
    min_base_thb:     z.number().min(0).max(99_999_999).nullable().optional(),
    effective_from:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    effective_to:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    is_active:        z.boolean().optional().default(true),
    notes:            z.string().trim().max(500).optional(),
  })
  .refine(
    (d) => {
      const hasRate = d.rate_pct !== null && d.rate_pct !== undefined;
      const hasFlat = d.flat_thb !== null && d.flat_thb !== undefined;
      // XOR — exactly one
      return (hasRate && !hasFlat) || (!hasRate && hasFlat);
    },
    {
      message: "ต้องระบุ rate_pct หรือ flat_thb อย่างใดอย่างหนึ่ง (ไม่ใช่ทั้งคู่)",
      path:    ["rate_pct"],
    },
  );
export type UpsertCommissionTierInput = z.infer<typeof upsertCommissionTierSchema>;
