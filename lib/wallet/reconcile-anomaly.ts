/**
 * Pure wallet-anomaly predicate for the READ-ONLY reconcile cron
 * (app/api/cron/wallet-reconcile/route.ts).
 *
 * ── Why this file exists ────────────────────────────────────────────────
 *
 * The cron decides whether a wallet is in an impossible/inconsistent state
 * from exactly two UNAMBIGUOUS invariants (see the route docblock):
 *
 *   1. stored_negative   — `tb_wallet.wallettotal` rounded to 2dp is below
 *                          zero (a wallet balance can never legitimately be
 *                          negative; every customer debit is gated on
 *                          `walletTotal >= payTHB`).
 *   2. pending_overdraft  — spendable (= stored − Σ open pending-debits,
 *                          derived by the reused `sumAvailableBalance`) is
 *                          below zero: the pending overhang exceeds the
 *                          settled balance.
 *
 * Both comparisons use a 1-satang EPSILON so float noise on numeric(10,2)
 * sums is NOT mistaken for a real anomaly. Getting this threshold or the
 * sign of the comparison wrong is a money-safety bug (false-clean hides a
 * real overdraft; false-alarm spams an incident per clean wallet), so the
 * predicate is extracted here as a pure, unit-tested function rather than
 * living inline in the request handler where it can't be exercised.
 *
 * This module imports ONLY the pure `sumAvailableBalance` reducer (no
 * server-only deps) so it is importable by the plain-tsx unit test.
 */

import { sumAvailableBalance } from "./balance";

/** |drift| at or below this (THB) is float noise, not a real anomaly. */
export const RECONCILE_EPSILON = 0.01;

/** One pending `tb_wallet_hs` row as fed to the spendable reducer. */
export type PendingHsRow = { amount: number | string; status: string | null; type: string | null };

export type WalletAnomaly = {
  /** stored balance, coerced + rounded to 2dp. */
  stored: number;
  /** spendable = stored − Σ open pending-debits (reused sumAvailableBalance). */
  spendable: number;
  /** Which invariant(s) the wallet violated (empty = clean). */
  reasons: string[];
};

/**
 * Evaluate the two wallet invariants for a single wallet.
 *
 * Behavior-preserving extract of app/api/cron/wallet-reconcile/route.ts
 * L183-196 — same rounding, same EPSILON, same reason strings, same
 * `sumAvailableBalance` derivation. A wallet is an offender iff
 * `reasons.length > 0`.
 *
 * @param walletTotal raw `tb_wallet.wallettotal` (numeric or PG string or null)
 * @param pendingRows the user's OPEN `tb_wallet_hs` rows (status='1'); the
 *   reducer owns the debit-type logic, so over-fetched non-debit rows are fine.
 */
export function detectWalletAnomaly(
  walletTotal: number | string | null,
  pendingRows: PendingHsRow[],
): WalletAnomaly {
  const raw = Number(walletTotal ?? 0);
  const stored = Math.round((Number.isFinite(raw) ? raw : 0) * 100) / 100;
  const spendable = sumAvailableBalance(stored, pendingRows);

  const reasons: string[] = [];
  if (stored < -RECONCILE_EPSILON) reasons.push("stored_negative");
  if (spendable < -RECONCILE_EPSILON) reasons.push("pending_overdraft");

  return { stored, spendable, reasons };
}

/** An offender row as the cron collects + ranks it. */
export type Offender = {
  userid: string;
  stored: number;
  spendable: number;
  reasons: string[];
};

/**
 * Worst-first comparator for the offender list — most-negative wallet first
 * (by the smaller of stored / spendable, so the deepest hole surfaces top).
 * Behavior-preserving extract of route.ts L202-206. Pure: returns the sort
 * key delta; use as `offenders.sort(compareOffendersWorstFirst)`.
 */
export function compareOffendersWorstFirst(a: Offender, b: Offender): number {
  const aw = Math.min(a.stored, a.spendable);
  const bw = Math.min(b.stored, b.spendable);
  return aw - bw;
}
