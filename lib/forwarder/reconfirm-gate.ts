/**
 * Forwarder >10%-over-preview RE-CONFIRM gate (pure helper).
 *
 * Source: docs/audit/pcs-business-flow-2026-05-20.md §3 (Priority 2)
 *         BUSINESS_FLOW.md L85-87 (verbatim ops rule):
 *           "[ถ้าราคาเพิ่มเกิน 10%] แจ้งลูกค้ายืนยัน"
 *
 * ── Semantics ─────────────────────────────────────────────────
 * `preview_total_thb` = the price the customer agreed to at order time
 *                      (= forwarders.total_price at insert time).
 * `existing_cumulative_thb`
 *                    = SUM of all NON-cancelled forwarder_cost_adjustments
 *                      rows already booked against the forwarder, EXCLUDING
 *                      the new one. Includes paid + unpaid + pending_reconfirm.
 * `new_adjustment_thb`
 *                    = the about-to-be-inserted adjustment amount.
 * `threshold_pct`   = the % over preview at which the gate fires
 *                     (10 by default per business_config
 *                      `forwarder.reprice_threshold_pct`).
 *
 * Computation:
 *   actual_total       = preview + existing_cumulative + new_adjustment
 *   delta_pct          = (actual_total - preview) / preview * 100
 *   triggered          = delta_pct > threshold_pct
 *
 * When `triggered=true`, the caller should insert the new adjustment with
 * status='pending_reconfirm' instead of the default 'unpaid', stash
 * preview_total_thb + cumulative_after_thb on the row, fire a
 * work_items entry for ops, and notify the customer.
 *
 * Pure — no IO, no DB, no time. Safe to unit-test in isolation.
 */

export type ReconfirmGateInput = {
  preview_total_thb:        number;
  existing_cumulative_thb:  number;
  new_adjustment_thb:       number;
  threshold_pct:            number;
};

export type ReconfirmGateResult = {
  /** True when (actual − preview)/preview * 100 > threshold_pct. */
  triggered:           boolean;
  /** preview + existing + new (i.e. the "actual" total AFTER this row). */
  actual_total_thb:    number;
  /** The delta of actual over preview, in baht (signed). */
  delta_thb:           number;
  /** Same delta but as a percent of preview (signed). */
  delta_pct:           number;
  /** The threshold the caller compared against (echoed for logging). */
  threshold_pct:       number;
};

/**
 * Decide whether a new adjustment trips the >threshold% re-confirm gate.
 *
 * Returns numbers safe to display to the customer (already rounded to
 * 2 decimal places for THB, 1 decimal for percent).
 *
 * Degenerate cases:
 *   - preview_total_thb <= 0 → treated as "no meaningful preview"; gate
 *     does NOT trigger (any non-zero delta is undefined % — refusing to
 *     bill silently here would block every legacy migrated forwarder
 *     that was loaded without a preview). The caller may decide to still
 *     route to admin review via other means.
 *   - new_adjustment_thb <= 0 → no new amount → gate does NOT trigger
 *     (cancellation / negative-amount adjustments are out of scope —
 *     0038 schema already forbids amount_thb <= 0 on insert).
 *   - threshold_pct <= 0 → invalid config → defensively treat as 10.
 */
export function evaluateReconfirmGate(input: ReconfirmGateInput): ReconfirmGateResult {
  const preview     = Number(input.preview_total_thb)       || 0;
  const existing    = Number(input.existing_cumulative_thb) || 0;
  const newAdj      = Number(input.new_adjustment_thb)      || 0;
  const thresholdIn = Number(input.threshold_pct);
  const threshold   = thresholdIn > 0 ? thresholdIn : 10;

  const actualTotal = round2(preview + existing + newAdj);
  const deltaThb    = round2(actualTotal - preview);

  // Degenerate guards (see file header).
  if (preview <= 0 || newAdj <= 0) {
    return {
      triggered:        false,
      actual_total_thb: actualTotal,
      delta_thb:        deltaThb,
      delta_pct:        0,
      threshold_pct:    threshold,
    };
  }

  const deltaPct = round1((deltaThb / preview) * 100);

  return {
    triggered:        deltaPct > threshold,
    actual_total_thb: actualTotal,
    delta_thb:        deltaThb,
    delta_pct:        deltaPct,
    threshold_pct:    threshold,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** business_config key for the tunable threshold. */
export const RECONFIRM_THRESHOLD_CONFIG_KEY = "forwarder.reprice_threshold_pct";
/** Fallback when business_config row is missing / unreachable. */
export const RECONFIRM_THRESHOLD_DEFAULT_PCT = 10;
