/**
 * U2-2 · Container margin helper — `computeContainerMargin(...)`
 *
 * Given a cargo_container, computes:
 *   - total_revenue_thb = sum of forwarders.total_price for every
 *     forwarder whose shipments live in this container.
 *   - total_cost_thb    = sum of container_disbursements.amount_thb
 *     for this container (i.e. the AP-ledger total).
 *   - margin_thb        = revenue − cost
 *   - margin_pct        = revenue > 0 ? (margin / revenue) * 100 : null
 *
 * This is the V1 cost-vs-revenue read. It does NOT yet:
 *   - apply commission carve-outs (TBD post R-7 ADR)
 *   - flag "billed below cost" cells (callers can compare margin_thb < 0)
 *   - prorate shared disbursements across containers (each disbursement
 *     row belongs to exactly one container; if a real-world bill spans
 *     multiple, admin enters multiple rows split per-container)
 *
 * Revenue side notes:
 *   - We sum forwarders.total_price (the customer-facing charge) — NOT
 *     forwarders.cost_total_price (which is the legacy admin-internal
 *     cost field per 0010 lines 117-118 + legacy fCostTotalPrice).
 *   - service_orders (China-shop) revenue is NOT included here yet because
 *     a single service_order rarely maps cleanly to one container —
 *     the consolidation lives at the forwarder level (cargo-import).
 *     If a use-case emerges (service-orders shipped via Pacred container
 *     directly), revise to add service_orders.total_thb summation.
 *   - DISTINCT forwarder_f_no — a forwarder can have multiple shipments
 *     in the same container; we must not double-count its total_price.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ContainerMargin = {
  total_revenue_thb: number;
  total_cost_thb:    number;
  margin_thb:        number;
  /** null when revenue is 0 (avoids divide-by-zero). */
  margin_pct:        number | null;
  details: {
    revenue: {
      /** distinct forwarder f_nos counted in the revenue sum */
      forwarder_count: number;
      /** raw total before rounding (cumulative, for debugging) */
      raw_revenue_thb: number;
    };
    cost: {
      disbursement_count: number;
      raw_cost_thb:       number;
    };
  };
};

export type ComputeMarginResult =
  | { ok: true;  data: ContainerMargin }
  | { ok: false; error: string };

/**
 * Compute the margin for a single cargo_container. Caller MUST pass an
 * admin client (createAdminClient) because container_disbursements RLS
 * is super/accounting-only — a regular server client will return 0 rows
 * for any other role and silently report zero cost.
 */
export async function computeContainerMargin(
  admin:        SupabaseClient,
  container_id: string,
): Promise<ComputeMarginResult> {
  // ── 1) Revenue: distinct forwarders attached via cargo_shipments ──
  // We use forwarder_f_no (text PK on forwarders) because cargo_shipments
  // joins via that column (per 0033 line 90).
  const { data: shipRows, error: shipErr } = await admin
    .from("cargo_shipments")
    .select("forwarder_f_no")
    .eq("cargo_container_id", container_id)
    .not("forwarder_f_no", "is", null)
    .returns<Array<{ forwarder_f_no: string | null }>>();
  if (shipErr) return { ok: false, error: `cargo_shipments: ${shipErr.message}` };

  const fNos = Array.from(
    new Set((shipRows ?? []).map((r) => r.forwarder_f_no).filter((x): x is string => !!x)),
  );

  let rawRevenue = 0;
  if (fNos.length > 0) {
    const { data: fwdRows, error: fwdErr } = await admin
      .from("forwarders")
      .select("total_price")
      .in("f_no", fNos)
      .returns<Array<{ total_price: number | string | null }>>();
    if (fwdErr) return { ok: false, error: `forwarders: ${fwdErr.message}` };
    for (const r of fwdRows ?? []) {
      const n = Number(r.total_price ?? 0);
      if (Number.isFinite(n)) rawRevenue += n;
    }
  }

  // ── 2) Cost: sum of container_disbursements.amount_thb ─────────
  const { data: disbRows, error: disbErr } = await admin
    .from("container_disbursements")
    .select("amount_thb")
    .eq("cargo_container_id", container_id)
    .returns<Array<{ amount_thb: number | string }>>();
  if (disbErr) return { ok: false, error: `container_disbursements: ${disbErr.message}` };

  let rawCost = 0;
  for (const r of disbRows ?? []) {
    const n = Number(r.amount_thb);
    if (Number.isFinite(n)) rawCost += n;
  }

  // ── 3) Round (THB satang precision — same rule as wallet balance) ──
  const total_revenue_thb = Math.round(rawRevenue * 100) / 100;
  const total_cost_thb    = Math.round(rawCost    * 100) / 100;
  const margin_thb        = Math.round((total_revenue_thb - total_cost_thb) * 100) / 100;
  const margin_pct =
    total_revenue_thb > 0
      ? Math.round(((margin_thb / total_revenue_thb) * 100) * 100) / 100
      : null;

  return {
    ok: true,
    data: {
      total_revenue_thb,
      total_cost_thb,
      margin_thb,
      margin_pct,
      details: {
        revenue: {
          forwarder_count: fNos.length,
          raw_revenue_thb: rawRevenue,
        },
        cost: {
          disbursement_count: (disbRows ?? []).length,
          raw_cost_thb:       rawCost,
        },
      },
    },
  };
}
