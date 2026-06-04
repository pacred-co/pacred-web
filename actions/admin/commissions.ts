"use server";

/**
 * ⚠️⚠️⚠️ TOMBSTONED 2026-06-02 per ADR-0026 D-3 — DO NOT CALL ⚠️⚠️⚠️
 *
 * Every export below USED TO write the DEAD rebuilt `commission_*` stack
 * (`commission_withdrawals` · `commission_accruals` · `commission_tiers`)
 * which is 0-rows on prod. ADR-0020 locked canonical commission SOT onto
 * `tb_user_sales*` (Path A). ADR-0026 closes the loop:
 *   - customer earn→withdraw  → `actions/commissions-tb.ts` (Path A canonical)
 *   - admin pay-out workflow  → `actions/admin/sales-payouts-tb.ts` (Path A canonical)
 *   - admin queue UI          → `/admin/sales-payouts` + `/admin/commissions` (repointed)
 *
 * 2026-06-02 dead-write fix (per `docs/audit/home-claude-258-commits-audit-2026-06-02.md`
 * Surprise Findings): the file previously left the WRITE BODIES intact, so a
 * still-mounted UI button silently inserted rows into the dead tables → toast
 * "success" → request vanished into the void. The 8 functions below now
 * EARLY-RETURN with a clear tombstone error. Any UI still importing them
 * fails loudly instead of silently → users actually notice + bug gets fixed
 * → AGENTS.md §0e silent-dead-write pattern eliminated.
 *
 * Remaining call sites as of 2026-06-02 (all admin-only · all banner-flagged):
 *   - `/admin/commissions/tiers/*` — commission_tiers (0 rows) · banner shows
 *     tombstone notice; the form submit returns the guard error from below.
 *   - `/admin/commissions/[id]/withdrawal-actions-client.tsx` — UNREACHABLE
 *     because [id]/page.tsx is now a redirect to /admin/sales-payouts/[id].
 *     Component stays compiled to keep typecheck green; never mounts.
 *
 * Schedule full delete + `commission_*` table drop in a follow-up cleanup ADR
 * once `/admin/commissions/tiers/*` is removed too.
 *
 * Original V-E8/H1/H2 surface (HISTORIC · do not restore):
 *   - adminAccrueCommissionForOrder
 *   - adminApproveWithdrawal · adminRejectWithdrawal · adminMarkWithdrawalPaid
 *   - uploadCommissionSlip
 *   - staffRequestWithdrawal
 *   - adminUpsertCommissionTier
 */

import type { AdminActionResult } from "./common";
import type {
  AccrueCommissionInput,
  ApproveWithdrawalInput,
  RejectWithdrawalInput,
  MarkWithdrawalPaidInput,
  RequestWithdrawalInput,
  UpsertCommissionTierInput,
} from "@/lib/validators/commission";

// ────────────────────────────────────────────────────────────
// Tombstone guard — every export returns this on call.
// ────────────────────────────────────────────────────────────
const TOMBSTONE_ERROR =
  "tombstoned: หน้านี้อยู่ระหว่างย้ายไปใช้ระบบใหม่ (tb_user_sales) — " +
  "กรุณาใช้ /sales/report (ลูกค้า) หรือ /admin/sales-payouts (แอดมิน) แทน. " +
  "ADR-0026 ref.";

function tombstone<T>(): AdminActionResult<T> {
  return { ok: false, error: TOMBSTONE_ERROR };
}

// ────────────────────────────────────────────────────────────
// 1) adminAccrueCommissionForOrder — DEAD (replaced by earn-trigger-tb-user-sales)
// ────────────────────────────────────────────────────────────
export async function adminAccrueCommissionForOrder(
  _input: AccrueCommissionInput,
): Promise<AdminActionResult<{ id: string; accrued_amount_thb: number; already_existed: boolean }>> {
  void _input;
  return tombstone();
}

// ────────────────────────────────────────────────────────────
// 2-4) Admin approve/reject/mark-paid — DEAD (replaced by adminMarkSalesPayoutPaidTb)
// ────────────────────────────────────────────────────────────
export async function adminApproveWithdrawal(
  _input: ApproveWithdrawalInput,
): Promise<AdminActionResult<{ approved_at: string }>> {
  void _input;
  return tombstone();
}

export async function adminRejectWithdrawal(
  _input: RejectWithdrawalInput,
): Promise<AdminActionResult<{ rejected_at: string }>> {
  void _input;
  return tombstone();
}

export async function adminMarkWithdrawalPaid(
  _input: MarkWithdrawalPaidInput,
): Promise<AdminActionResult<{ paid_at: string }>> {
  void _input;
  return tombstone();
}

// ────────────────────────────────────────────────────────────
// 5) uploadCommissionSlip — DEAD (replaced by adminMarkSalesPayoutPaidTb's
//    slip upload via uploadToBucket('slips', 'admin/sales-payout-slip/...')).
// ────────────────────────────────────────────────────────────
export async function uploadCommissionSlip(
  _withdrawalId: string,
  _file: File,
): Promise<AdminActionResult<{ storage_path: string }>> {
  void _withdrawalId;
  void _file;
  return tombstone();
}

// ────────────────────────────────────────────────────────────
// 6) staffRequestWithdrawal — DEAD (replaced by submitSalesWithdrawal in
//    actions/commissions-tb.ts · the customer-side WAS the SILENT-FAIL BUG).
// ────────────────────────────────────────────────────────────
export async function staffRequestWithdrawal(
  _input: RequestWithdrawalInput,
): Promise<AdminActionResult<{ id: string; withdrawal_no: string; net_thb: number }>> {
  void _input;
  return tombstone();
}

// ────────────────────────────────────────────────────────────
// 7) adminUpsertCommissionTier — DEAD (no faithful equivalent yet · legacy
//    rate is hardcoded at 1% in lib/sales-commission/calc.ts per ADR-0020).
// ────────────────────────────────────────────────────────────
export async function adminUpsertCommissionTier(
  _input: UpsertCommissionTierInput,
): Promise<AdminActionResult<{ id: string }>> {
  void _input;
  return tombstone();
}
