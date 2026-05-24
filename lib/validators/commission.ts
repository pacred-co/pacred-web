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
// G6 — Customer-side affiliate (team-leader) commission withdraw
// ────────────────────────────────────────────────────────────
//
// Pacred's customer-side affiliate model = `sales_commissions` +
// `sales_payouts` from migration 0013_sales_referral.sql. This is
// DIFFERENT from the staff `commission_accruals` model above:
//
//   - staff model (`commission_accruals` / `commission_withdrawals`)
//     = per-order accruals + WHT + tiered rates, used by interpreters
//     + sales_rep admins. Tested in (e)/(f)/(g) above.
//
//   - affiliate model (`sales_commissions` / `sales_payouts`)
//     = simple percent-of-forwarder-total earned by `team_leaders`
//     when their team's forwarders reach `delivered`. The legacy
//     `report-user-sales.php` uses this model (verified vs
//     `tb_user_sales` and PR888/PR2000/PR352/PR2678/PR4155
//     whitelist in app/[locale]/(protected)/sales/team-map.ts).
//
// The two coexist and never share rows. The schema below is for the
// customer-facing /commissions page only.

/** Minimum amount an affiliate team_leader must withdraw at once. */
export const MIN_AFFILIATE_WITHDRAW_THB = 1000;

/** Maximum amount per affiliate withdraw request (safety cap). */
export const MAX_AFFILIATE_WITHDRAW_THB = 5_000_000;

/**
 * Customer-side affiliate withdraw request — team leader picks N
 * unpaid `sales_commissions` rows (server resolves by `commission_ids`
 * OR by `amount` first-fit) and gives a payee bank.
 *
 * App-layer enforces:
 *   - caller must own a row in `team_leaders` (RLS already filters,
 *     but the action re-checks for a friendly error)
 *   - selected `sales_commissions` belong to one of caller's teams
 *     and are still `unpaid` + `payout_id is null`
 *   - sum(selected.commission_amount) >= MIN_AFFILIATE_WITHDRAW_THB
 *   - sum(selected.commission_amount) >= `amount` (the requested top)
 *   - account_number matches a forgiving Thai bank-no pattern.
 *
 * NOTE: kept narrow on purpose — the G6 foundation only needs the
 * shape used by the customer-facing modal; admin approval/payout
 * fields (status, slip, admin_id) are written by the existing
 * actions/admin/sales-payouts.ts adminUpdateSalesPayout flow.
 */
export const affiliateWithdrawRequestSchema = z.object({
  /** Requested gross amount in THB. Must be ≥ MIN_AFFILIATE_WITHDRAW_THB. */
  amount:         z
    .number()
    .min(MIN_AFFILIATE_WITHDRAW_THB, `ยอดขั้นต่ำ ${MIN_AFFILIATE_WITHDRAW_THB.toLocaleString()} บาท`)
    .max(MAX_AFFILIATE_WITHDRAW_THB),
  /** Payee bank name (e.g. "กสิกรไทย"). */
  bank_name:      z.string().trim().min(1, "กรุณาเลือกธนาคาร").max(100),
  /** Payee account-holder name. */
  account_name:   z.string().trim().min(1, "กรุณากรอกชื่อบัญชี").max(200),
  /** Payee account number — digits, dashes, or spaces (8..20 chars). */
  account_number: z
    .string()
    .trim()
    .regex(/^[\d\- ]{8,20}$/, "เลขบัญชีไม่ถูกต้อง")
    .transform((v) => v.replace(/[\s-]/g, "")),
  /**
   * Optional note shown to admin reviewing the request.
   * An empty string ("") from a never-touched form input is folded to
   * `undefined` so the row insert stays `null` rather than empty-string.
   */
  note:           z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().min(1).max(500).optional(),
  ),
});
export type AffiliateWithdrawRequestInput = z.infer<typeof affiliateWithdrawRequestSchema>;

/**
 * Filters for the affiliate-commissions list query.
 *
 * `from`/`to` are inclusive YYYY-MM-DD date bounds (interpreted as
 * `earned_at` calendar date in server TZ). `status` filters by the
 * `sales_commissions.status` enum (`unpaid`/`paid`/`cancelled`) or
 * the special `"all"` literal (no filter).
 */
export const affiliateCommissionFiltersSchema = z.object({
  from:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["all", "unpaid", "paid", "cancelled"]).optional(),
});
export type AffiliateCommissionFilters = z.infer<typeof affiliateCommissionFiltersSchema>;

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
