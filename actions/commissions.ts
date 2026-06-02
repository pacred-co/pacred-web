"use server";

/**
 * ⚠️⚠️⚠️ TOMBSTONED 2026-06-02 per ADR-0026 D-3 — DO NOT CALL ⚠️⚠️⚠️
 *
 * Every export below USED TO read/write the DEAD rebuilt
 * `sales_commissions` / `sales_payouts` / `team_leaders` stack (0 rows on
 * prod). ADR-0020 locked canonical customer commission SOT onto the legacy
 * `tb_user_sales*` family (Path A), implemented in `actions/commissions-tb.ts`.
 *
 * 2026-06-02 dead-write fix (per `docs/audit/home-claude-258-commits-audit-2026-06-02.md`
 * Surprise Findings): `requestCommissionWithdraw` was the customer-side
 * silent-fail — the modal toast'd success while the row vanished into the
 * empty `sales_payouts` table. Functions now early-return a clear
 * tombstone error so any stale call fails loudly.
 *
 * The canonical customer-facing surface is `/sales/report` +
 * `/sales/report/add` calling `submitSalesWithdrawal` from
 * `actions/commissions-tb.ts`. The 4 dead exports below remain only as
 * tombstone stubs so a stale dynamic import (none expected) compiles.
 *
 * Historical surface (do not restore):
 *   - listMyAffiliateCommissions · getMyCommissionTotals · listMyAffiliatePayouts
 *   - requestCommissionWithdraw  ← THE silent-fail
 */

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const TOMBSTONE_ERROR =
  "tombstoned: หน้านี้อยู่ระหว่างย้ายไปใช้ระบบใหม่ (tb_user_sales) — " +
  "กรุณาใช้ /sales/report (faithful ของลูกค้า) แทน. ADR-0026 ref.";

function tombstone<T>(): ActionResult<T> {
  return { ok: false, error: TOMBSTONE_ERROR };
}

// ────────────────────────────────────────────────────────────
// Public TYPE re-exports — kept so any lingering `import type` still resolves.
// Values: all 4 functions tombstoned.
// ────────────────────────────────────────────────────────────

export type AffiliateCommissionRow = {
  id:                  string;
  reference_type:      "forwarder" | "service_order";
  reference_id:        string;
  customer_profile_id: string;
  base_amount:         number;
  commission_pct:      number;
  commission_amount:   number;
  status:              "unpaid" | "paid" | "cancelled";
  earned_at:           string;
  paid_at:             string | null;
  payout_id:           string | null;
  team_code:           string;
};

export type CommissionTotals = {
  earned_total:           number;
  pending_total:          number;
  withdrawn_total:        number;
  available_for_withdraw: number;
  earned_count:           number;
};

export type AffiliatePayoutRow = {
  id:               string;
  team_leader_id:   string;
  amount_total:     number;
  bank_name:        string;
  account_name:     string;
  account_number:   string;
  status:           "pending" | "approved" | "paid" | "rejected";
  slip_url:         string | null;
  rejection_reason: string | null;
  requested_at:     string;
  approved_at:      string | null;
  paid_at:          string | null;
  note:             string | null;
};

export async function listMyAffiliateCommissions(
  _filters?: unknown,
): Promise<ActionResult<{ rows: AffiliateCommissionRow[]; total: number; pages: number }>> {
  void _filters;
  return tombstone();
}

export async function getMyCommissionTotals(): Promise<ActionResult<CommissionTotals>> {
  return tombstone();
}

export async function listMyAffiliatePayouts(
  _limit = 10,
): Promise<ActionResult<AffiliatePayoutRow[]>> {
  void _limit;
  return tombstone();
}

export async function requestCommissionWithdraw(
  _input: unknown,
): Promise<ActionResult<{ payout_id: string; amount_total: number }>> {
  void _input;
  return tombstone();
}
