/**
 * U1-3 · Arrival→billing gate for cargo forwarder wallet debits.
 *
 * Per [docs/UPGRADE_PLAN.md] §1 U1-3 + datanew L-3:
 * MOMO and PCS disagree on container CBM/quantity on *every* container,
 * sometimes massively (e.g. GZS260516-2: PCS 21.17 CBM vs MOMO 14.56 →
 * ~31% gap). Billing must run off the MOMO closed-container figure, not
 * the order-time estimate the customer typed when creating the forwarder.
 *
 * ── Semantics ───────────────────────────────────────────────────────
 * The gate is on the **post-arrival settlement** wallet-debit of an
 * ARRIVED cargo job — NOT on the initial deposit. Concretely:
 *
 *   Forwarder status                  | Gate behaviour
 *   ──────────────────────────────────┼─────────────────────────────
 *   pending_payment                   | { blocked: false } (initial deposit)
 *   shipped_china / in_transit        | { blocked: false } (still in flight;
 *                                      | wallet-debit here is the legacy/recovery
 *                                      | path for late deposits, not a re-bill)
 *   arrived_thailand                  | gated — needs container closed
 *   out_for_delivery                  | gated — needs container closed
 *   delivered                         | { blocked: false } (terminal; the caller's
 *                                      | own "already delivered" guard wins first)
 *   cancelled                         | { blocked: false } (terminal; caller blocks)
 *
 * Why this interpretation?
 * Pre-arrival the customer paid the ESTIMATED total at order time (the
 * forwarder.total_price column on insert). Post-arrival, the ACTUAL CBM
 * differs (datanew L-3: ~31%) and a cost adjustment lands via
 * forwarder_cost_adjustments. Re-charging for the adjusted amount is
 * what U1-3 gates — staff must not bill the customer until the linked
 * cargo_container is `closed` (final CBM measured + "ตัดตู้" done).
 *
 * ── Output ──────────────────────────────────────────────────────────
 *   { blocked: false }                          → caller may proceed
 *   { blocked: true, reason: 'no_container_linked' }
 *      → forwarder is in a gated status but forwarders.cargo_container_id
 *        is NULL. Staff must link a container via the spine first.
 *   { blocked: true, reason: 'awaiting_container_close', container_status }
 *      → container linked but not yet `closed`. Wait for the MOMO sync /
 *        manual close-out, OR use the admin allow_unverified_billing
 *        escape hatch with a recorded reason.
 *
 * ── Fail-OPEN policy on DB error ────────────────────────────────────
 * Mirrors the freight WHT gate (sibling commit 6681657): if either of
 * the two reads (forwarders / cargo_containers) returns an error, we
 * fall through to { blocked: false } and let the underlying wallet-tx
 * insert decide. A real DB outage will surface there with the actual
 * Postgres error, not a synthetic gate-failure message that misleads
 * the operator. The gate's job is correctness when the DB is healthy.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CargoBillingGate =
  | { blocked: false }
  | {
      blocked: true;
      reason: "awaiting_container_close" | "no_container_linked";
      container_status?: string;
    };

/**
 * Statuses where a wallet debit needs the container-closed gate.
 * Mirrors the forwarder.status enum (see actions/forwarder.ts) — post-arrival
 * lifecycle states only. pending_payment / shipped_china / in_transit are
 * pre-arrival or in-flight and use the order-time estimate. delivered /
 * cancelled are terminal (caller's own guards stop those first).
 */
const GATED_STATUSES = new Set<string>([
  "arrived_thailand",
  "out_for_delivery",
]);

/**
 * Returns whether wallet debit on this forwarder is blocked by the
 * arrival→billing gate. Read-only, idempotent — safe to call multiple
 * times in the same request.
 */
export async function getCargoBillingGate(
  admin: SupabaseClient,
  fNo: string,
): Promise<CargoBillingGate> {
  // Defensive — never throw out of a gate.
  if (!fNo || typeof fNo !== "string") return { blocked: false };

  const { data: forwarder, error: fwdErr } = await admin
    .from("forwarders")
    .select("status, cargo_container_id")
    .eq("f_no", fNo)
    .maybeSingle<{ status: string; cargo_container_id: string | null }>();

  // Fail-OPEN on read error — see the file header doc-block. Caller's
  // wallet-tx insert will surface a real DB outage as a downstream error.
  if (fwdErr) return { blocked: false };
  // Unknown forwarder → caller's own not_found guard handles it; don't
  // double-block here.
  if (!forwarder) return { blocked: false };

  // Pre-arrival / terminal statuses → no gate. The initial deposit on
  // pending_payment is what funds the cargo job; downstream paths
  // (shipped_china/in_transit late-deposit recovery) are still billing
  // off the order-time estimate by design.
  if (!GATED_STATUSES.has(forwarder.status)) return { blocked: false };

  // Gated status reached but no container link — the U1-1 spine link
  // is the prerequisite for closing-out CBM at all.
  if (!forwarder.cargo_container_id) {
    return { blocked: true, reason: "no_container_linked" };
  }

  const { data: container, error: cErr } = await admin
    .from("cargo_containers")
    .select("status")
    .eq("id", forwarder.cargo_container_id)
    .maybeSingle<{ status: string }>();

  // Fail-OPEN on read error (same rationale as forwarder read above).
  if (cErr) return { blocked: false };
  // Link existed but row vanished — treat as missing link (fail closed
  // because this is a data-integrity issue, not a transient DB error).
  if (!container) return { blocked: true, reason: "no_container_linked" };

  if (container.status !== "closed") {
    return {
      blocked: true,
      reason: "awaiting_container_close",
      container_status: container.status,
    };
  }

  return { blocked: false };
}
