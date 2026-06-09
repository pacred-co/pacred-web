/**
 * Freight RFQ lead statuses + the BK-1 convert-idempotency predicate.
 *
 * The lead inbox (actions/admin/freight-leads.ts) is a "use server" module — it
 * may only export async functions — so this pure status logic lives here where
 * the action AND its unit test can both import it.
 *
 * BK-1 (audit · BLOCKER): `convertLeadToQuote` is NOT idempotent on its own — a
 * lead already converted (status 'quoted') re-converting would reserve a fresh
 * serial AND insert a duplicate orphan draft quotation (confirm-dialog +
 * useTransition narrow the double-submit window but a back-nav re-arms it). The
 * guard refuses when the lead is already 'quoted'.
 */

/** Allowed lead statuses (mirror migration 0134's freight_quote_status CHECK). */
export const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost", "spam"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * BK-1 — may a lead in this status be converted to a draft quotation?
 * Convertible for every status EXCEPT 'quoted' (already converted → re-converting
 * would burn a serial + spawn a duplicate draft). Behaviour-preserving: matches
 * the action's existing `lead.status === "quoted"` refusal exactly.
 */
export function isLeadConvertible(status: string | null | undefined): boolean {
  return status !== "quoted";
}
