/**
 * lib/admin/topup-slip-dedup.ts
 *
 * The "ชำระเงิน" slip-verify queue on /admin is fed by TWO disjoint sources
 * that can describe the SAME payment twice (the owner's เบิ้ล / double-row bug):
 *
 *   1. tb_wallet_hs — a customer's direct forwarder-pay slip (type='4',
 *      typeservice='2', reforder=<tb_forwarder.id>).
 *   2. tb_forwarder_invoice — a ใบวางบิล (FRI) that the seller attached a slip
 *      to; its `tb_forwarder_invoice_item.forwarder_id` rows list the SAME
 *      forwarder(s) the wallet slip pays.
 *
 * There is NO join between the two → the same ฿ for the same forwarder shows as
 * a raw wallet row AND an FRI row. This module collapses that pair for the
 * LIST + the BADGE only — it is READ/aggregation, it moves NO money and drops
 * NO row from any settlement writer (adminApproveWalletDeposit / markBillingRunPaid
 * are untouched). Deterministic rule: the FRI (richer legacy-shaped doc, routes
 * to the /admin/billing-run/[id] 2-round gate) WINS; the raw wallet twin whose
 * forwarder id is fully covered by an FRI is SUPPRESSED from the display + the
 * count.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { pendingTopupFilter } from "@/lib/wallet/wallet-hs";

type AdminClient = ReturnType<typeof createAdminClient>;

/** One pending ใบวางบิล (FRI) + the forwarder ids it bills. */
export type FriForwarderSet = {
  invoiceId: number;
  forwarderIds: number[];
};

/**
 * PURE — decide which raw wallet rows are covered by a pending FRI (→ suppress)
 * and which FRIs to keep (always — the FRI is canonical). Keyed by forwarder id.
 *
 * @param walletForwarderIds  the forwarder id each surviving wallet slip settles
 *                            (type='4' direct pay · reforder=fid).
 * @param friForwarderSets    the pending FRIs + the forwarder ids each bills.
 * @returns suppressedWalletFids = forwarder ids whose raw wallet twin should be
 *          dropped (an FRI already covers it) · keptFriInvoiceIds = every FRI id
 *          (the FRI is the single canonical verify surface for a covered pair).
 */
export function collapseWalletBillingPairs(input: {
  walletForwarderIds: number[];
  friForwarderSets: FriForwarderSet[];
}): { suppressedWalletFids: Set<number>; keptFriInvoiceIds: number[] } {
  const friFids = new Set<number>();
  for (const f of input.friForwarderSets) {
    for (const id of f.forwarderIds) friFids.add(id);
  }
  const suppressedWalletFids = new Set<number>();
  for (const fid of input.walletForwarderIds) {
    if (friFids.has(fid)) suppressedWalletFids.add(fid);
  }
  return {
    suppressedWalletFids,
    keptFriInvoiceIds: input.friForwarderSets.map((f) => f.invoiceId),
  };
}

/**
 * Load the pending ใบวางบิล (FRI) slips + resolve each invoice's forwarder-id
 * set (batch-read of tb_forwarder_invoice_item). Shared by the LIST
 * (fetchBillingRunSlipRows) and the BADGE (computeTopupBadge) so the two agree.
 *
 * Read-only · best-effort (a failed sub-query yields an empty set, never throws).
 */
export async function loadPendingFriForwarderSets(
  admin: AdminClient,
): Promise<FriForwarderSet[]> {
  const { data: friRows, error: friErr } = await admin
    .from("tb_forwarder_invoice")
    .select("id")
    .eq("status", "issued")
    .eq("slip_status", "pending");
  if (friErr) {
    console.warn("[loadPendingFriForwarderSets] FRI head read failed (soft-fail)", friErr);
    return [];
  }
  const invoiceIds = ((friRows ?? []) as Array<{ id: number }>).map((r) => r.id);
  if (invoiceIds.length === 0) return [];

  const { data: items, error: itemErr } = await admin
    .from("tb_forwarder_invoice_item")
    .select("invoice_id, forwarder_id")
    .in("invoice_id", invoiceIds);
  if (itemErr) {
    console.warn("[loadPendingFriForwarderSets] FRI item read failed (soft-fail)", itemErr);
    // Still return the invoices (with empty fid sets) so the FRI rows list.
    return invoiceIds.map((invoiceId) => ({ invoiceId, forwarderIds: [] }));
  }

  const byInvoice = new Map<number, number[]>();
  for (const id of invoiceIds) byInvoice.set(id, []);
  for (const it of (items ?? []) as Array<{ invoice_id: number; forwarder_id: number }>) {
    const arr = byInvoice.get(it.invoice_id);
    if (arr && it.forwarder_id != null) arr.push(Number(it.forwarder_id));
  }
  return invoiceIds.map((invoiceId) => ({
    invoiceId,
    forwarderIds: byInvoice.get(invoiceId) ?? [],
  }));
}

/**
 * The single SOT for the "ชำระเงิน" (topup) badge count — used by BOTH the
 * /admin dashboard tab badge AND the sidebar badge so they can never disagree.
 *
 *   badge = pending-wallet-topup rows
 *         − wallet rows whose forwarder is already on a pending FRI (the เบิ้ล)
 *         + pending FRIs (each = one canonical row in the list)
 *
 * Read-only. Best-effort — a failure returns the un-deduped wallet+FRI sum
 * rather than throwing (a badge must never break the sidebar).
 */
export async function computeTopupBadge(admin: AdminClient): Promise<number> {
  const [walletCountRes, friSets] = await Promise.all([
    pendingTopupFilter(
      admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }),
    ) as unknown as Promise<{ count: number | null }>,
    loadPendingFriForwarderSets(admin),
  ]);
  const walletCount = walletCountRes.count ?? 0;
  const friCount = friSets.length;

  const friFids = new Set<number>();
  for (const f of friSets) for (const id of f.forwarderIds) friFids.add(id);
  if (friFids.size === 0) return walletCount + friCount;

  // Count the raw wallet twins to suppress: pending topup rows (same SOT filter)
  // that are a DIRECT forwarder-pay (type='4') for a forwarder already on a
  // pending FRI. Same predicate the list uses (only type-4 direct rows carry a
  // reforder=fid; pendingTopupFilter already excludes the type-4 cascade half).
  const suppressedRes = (await (
    pendingTopupFilter(
      admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }),
    ) as unknown as {
      eq: (c: string, v: string) => {
        in: (c: string, v: string[]) => Promise<{ count: number | null }>;
      };
    }
  )
    .eq("type", "4")
    .in("reforder", [...friFids].map(String))) as { count: number | null };
  const suppressed = suppressedRes.count ?? 0;

  return walletCount - suppressed + friCount;
}
