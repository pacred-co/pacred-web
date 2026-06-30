/**
 * Freight WORKSPACE queue KEYS — the pure count-key contract (G1 freight lane).
 *
 * Split out of the server reader (freight-queue-counts.ts has `import
 * "server-only"`) so the pure type + key list can be imported by client-safe
 * pure modules (lib/admin/workspace.ts) AND the tsx unit harness without
 * pulling the server-only DB reader. Mirrors the lead-status.ts (pure) vs
 * freight-leads.ts (server) split.
 *
 * BUILD-TRAP: consts in a PLAIN module only. This file has NO "use server" /
 * NO "server-only" → it may export the const key list + the type freely.
 */

/**
 * One freight workspace-queue count key. Distinct from the cargo `BadgeKey`
 * (sidebar-menu.ts) — the freight spine is a separate set of tables, so the
 * counts come from a separate SOT (getFreightQueueCounts).
 *
 * Each key maps to a journey-status slice of the freight spine:
 *   - freightLeads          → freight_quote (RFQ lead) untriaged — new + contacted
 *   - freightQuoteToPrice   → freight_quotes awaiting pricing/approval — draft + pending_approval
 *   - freightQuoteToSend    → freight_quotes approved → SALES sends it out
 *   - freightQuoteSent      → freight_quotes sent → awaiting the customer's decision
 *   - freightShipPrep       → freight_shipments confirmed → DOC prepares เอกสาร/ใบขน
 *   - freightShipInTransit  → freight_shipments in_progress → OPERATION / clearance tracks
 *   - freightShipCleared    → freight_shipments cleared → ผ่านศุลกากร, ready to deliver/bill
 *   - freightShipDelivered  → freight_shipments delivered → ACC วางบิล (auto-draft invoice point)
 */
export type FreightQueueKey =
  | "freightLeads"
  | "freightQuoteToPrice"
  | "freightQuoteToSend"
  | "freightQuoteSent"
  | "freightShipPrep"
  | "freightShipInTransit"
  | "freightShipCleared"
  | "freightShipDelivered";

/** Counts resolved server-side; absent key → 0 (same contract as BadgeCounts). */
export type FreightQueueCounts = Partial<Record<FreightQueueKey, number>>;

/** Every freight queue key — used to size the fan-out + by the workspace tests. */
export const ALL_FREIGHT_QUEUE_KEYS: FreightQueueKey[] = [
  "freightLeads",
  "freightQuoteToPrice",
  "freightQuoteToSend",
  "freightQuoteSent",
  "freightShipPrep",
  "freightShipInTransit",
  "freightShipCleared",
  "freightShipDelivered",
];
