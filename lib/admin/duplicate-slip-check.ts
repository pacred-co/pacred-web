/**
 * Duplicate-slip detector — the legacy 2-step verify "ชั้น 1" (w-s-deposit-detail.php
 * L464/487-501) that Pacred dropped to an ADVISORY red banner. Owner 2026-06-19:
 * make it BLOCK the approve (a one-click approve must not sail past a same-day
 * same-amount slip = a likely double-submitted/double-paid slip).
 *
 * Legacy rule: same DATE(dateSlip) + same amount + type≠5 + exclude self. We add
 * status ∈ {pending '1', approved '2'} (a rejected '3' twin is not a risk) so the
 * dangerous case — an ALREADY-APPROVED slip with the same date+amount (the real
 * double-pay) — is caught alongside a second pending submission.
 *
 * Pure-ish (takes the admin client) so the 3 approve paths (single deposit, the
 * HS approve, the bulk approve) share ONE rule — no per-caller drift.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface DuplicateSlipMatch {
  id: number;
  status: string | null;
  amount: number | string | null;
}

/**
 * Returns the OTHER tb_wallet_hs rows that look like the same slip as `row`
 * (same calendar day of dateslip + same amount + type≠5 + status ∈ {1,2}).
 * Empty array = no duplicate → safe to approve. dateslip null → [] (the date
 * gate "ชั้น 1a" already forces a date before approve, so this can't be skipped).
 */
export async function findDuplicateSlips(
  admin: SupabaseClient,
  row: { id: number; userid?: string | null; amount: number | string | null; dateslip: string | null },
): Promise<DuplicateSlipMatch[]> {
  if (!row.dateslip) return [];
  const slipDate = new Date(row.dateslip);
  if (Number.isNaN(slipDate.getTime())) return [];
  const dayStart = new Date(slipDate); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(slipDate); dayEnd.setHours(23, 59, 59, 999);

  // Scope to the SAME customer. The legacy detector matched amount+day only —
  // affordable because it was an ADVISORY banner. Now that the gate BLOCKS the
  // settle, a cross-customer coincidence (two people paying ฿500 the same day)
  // must NOT block a legit approve. Same-customer + same-day + same-amount is
  // the precise "double-submitted slip" signal. dateslip-null rows (auto-debits
  // with no incoming slip) already short-circuit above, so this only ever runs
  // against rows that carry a real slip.
  let q = admin
    .from("tb_wallet_hs")
    .select("id, status, amount")
    .eq("amount", row.amount)
    .neq("id", row.id)
    .neq("type", "5")
    .in("status", ["1", "2"])
    .gte("dateslip", dayStart.toISOString())
    .lte("dateslip", dayEnd.toISOString());
  if (row.userid) q = q.eq("userid", row.userid);
  const { data, error } = await q;
  if (error) {
    // Fail CLOSED: a money guard we can't complete must hold (surface as "duplicate
    // suspected" so the admin re-checks) rather than silently allow the approve.
    console.error("[findDuplicateSlips] failed", { code: error.code, message: error.message, id: row.id });
    return [{ id: -1, status: "?", amount: row.amount }];
  }
  return (data ?? []) as DuplicateSlipMatch[];
}
