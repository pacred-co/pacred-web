/**
 * Pure credit-AR drift predicate for the READ-ONLY credit-reconcile cron
 * (app/api/cron/credit-reconcile/route.ts).
 *
 * ── Why this file exists ────────────────────────────────────────────────
 *
 * Port of the legacy `reset-credit-forwarder.php`
 * (pcs-admin/automation/php/reset-credit-forwarder.php). The legacy job
 * recomputes, per userID with any open credit order:
 *
 *   creditValue = Σ over fCredit='1' of
 *     (fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService +
 *      priceCrate + fTransportPriceCHNTHB + priceOther) − fDiscount
 *
 * and (in mode=update) writes it back into `tb_credit.creditValue`.
 *
 * ── The 1% definitional difference vs legacy ────────────────────────────
 *
 * Legacy's SUM does NOT apply the juristic-person (นิติบุคคล) 1% allowance.
 * Pacred's canonical per-row outstanding (`calcForwarderOutstanding` in
 * lib/forwarder/outstanding.ts) DOES — it is the formula the forwarders
 * list, the customer credit panel, and the wallet→credit paydown
 * (actions/credit.ts) all use. To keep this check consistent with the rest
 * of Pacred we sum the CANONICAL per-row outstanding (incl. the 1% + the
 * never-negative clamp), NOT the raw legacy SUM. So `expected` here may sit
 * ~1% BELOW what legacy's reset-credit-forwarder.php would compute for a
 * juristic customer — that is intentional and documented, not a bug.
 *
 * ── Read-only ───────────────────────────────────────────────────────────
 * This module + its cron NEVER write tb_credit. They only REPORT drift
 * (expected vs actual vs delta), mirroring the wallet-reconcile cron's
 * read-only anomaly scan. An auto-write "reset" (legacy mode=update) is
 * owner-gated and deliberately not implemented here.
 *
 * This module imports ONLY the pure `calcForwarderOutstanding` reducer (no
 * server-only deps) so it is importable by the plain-tsx unit test.
 */

import {
  calcForwarderOutstanding,
  type ForwarderPriceFields,
} from "@/lib/forwarder/outstanding";

/** |drift| at or below this (THB) is float noise, not a real drift. */
export const CREDIT_RECONCILE_EPSILON = 0.01;

/** One fCredit='1' forwarder row as fed to the canonical outstanding reducer. */
export type CreditOrderRow = ForwarderPriceFields;

export type CreditDrift = {
  /** Σ canonical per-row outstanding over the user's fCredit='1' rows (2dp). */
  expected: number;
  /** stored tb_credit.creditvalue, coerced + rounded to 2dp. */
  actual: number;
  /** expected − actual (2dp). Positive = stored is too LOW (under-recorded AR). */
  delta: number;
  /** How many fCredit='1' rows fed the expected sum. */
  orderCount: number;
  /** True iff |delta| exceeds the epsilon (a real drift worth surfacing). */
  drifted: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compute the credit-AR drift for a single customer.
 *
 * @param creditOrders the user's fCredit='1' forwarder rows (already filtered)
 * @param storedCreditValue raw tb_credit.creditvalue (numeric / PG string / null;
 *   a missing tb_credit row is treated as 0, matching the legacy LEFT JOIN +
 *   the customer-side `Number(creditRes.data?.creditvalue ?? 0)`).
 */
export function computeCreditDrift(
  creditOrders: CreditOrderRow[],
  storedCreditValue: number | string | null,
): CreditDrift {
  const expected = round2(
    creditOrders.reduce((sum, row) => sum + calcForwarderOutstanding(row), 0),
  );
  const actual = round2(toNumber(storedCreditValue));
  const delta = round2(expected - actual);
  return {
    expected,
    actual,
    delta,
    orderCount: creditOrders.length,
    drifted: Math.abs(delta) > CREDIT_RECONCILE_EPSILON,
  };
}

/** A drifted customer as the cron collects + ranks it. */
export type CreditOffender = {
  userid: string;
  expected: number;
  actual: number;
  delta: number;
  orderCount: number;
};

/**
 * Worst-first comparator for the offender list — largest absolute drift first,
 * so the biggest AR mismatch surfaces at the top of the incident / console.
 * Pure: returns the sort key delta; use as `offenders.sort(compareDriftWorstFirst)`.
 */
export function compareDriftWorstFirst(a: CreditOffender, b: CreditOffender): number {
  return Math.abs(b.delta) - Math.abs(a.delta);
}
