import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Customer-flow clarity (2026-07-08 · S3) — "อยู่ในใบวางบิลแล้ว รอชำระผ่านบิล".
 *
 * When staff roll a customer's ฝากนำเข้า rows into a ใบวางบิล
 * (`tb_forwarder_invoice`, status='issued'), the customer must pay through
 * that bill — NOT via the per-row direct-pay button on /service-import. With
 * no indicator the customer pays twice (direct-slip + bill). This helper
 * resolves WHICH of the passed forwarder ids currently sit on an OPEN
 * (status='issued', i.e. not paid, not cancelled) invoice so the customer
 * surfaces can suppress the direct-pay affordance and show a clear note.
 *
 * The link (mirrors actions/admin/billing-run.ts `listEligibleForwarders`
 * already-billed check):
 *   tb_forwarder_invoice_item.forwarder_id = tb_forwarder.id     ← the join key
 *   tb_forwarder_invoice.status = 'issued'                       ← OPEN only
 * A 'paid' or 'cancelled' invoice does NOT suppress (paid = already settled →
 * the row won't be fstatus=5 anyway; cancelled = the bill is void).
 *
 * READ-ONLY — never mutates fstatus/money/paydeposit. Additive guard only.
 * The ids passed in are already the caller's own forwarder rows, so id-scoping
 * is sufficient (a customer can't probe another customer's rows). On any query
 * error this returns an EMPTY set (fail-soft): a missing guard is strictly
 * better than a thrown render on a supplementary signal — and it never
 * WRONGLY suppresses a legitimately-payable cash row.
 */

const OPEN_INVOICE_STATUS = "issued";

export async function resolveOpenBillForwarderIds(
  admin: SupabaseClient,
  forwarderIds: number[],
): Promise<Set<number>> {
  const ids = forwarderIds.filter((id) => Number.isFinite(id));
  if (ids.length === 0) return new Set();

  const { data, error } = await admin
    .from("tb_forwarder_invoice_item")
    .select("forwarder_id, tb_forwarder_invoice!inner(status)")
    .in("forwarder_id", ids);
  if (error) {
    console.error(`[tb_forwarder_invoice open-bill] failed`, {
      code: error.code,
      message: error.message,
    });
    return new Set();
  }

  const out = new Set<number>();
  for (const row of (data ?? []) as unknown as Array<{
    forwarder_id: number;
    tb_forwarder_invoice?: { status?: string } | { status?: string }[] | null;
  }>) {
    const inv = Array.isArray(row.tb_forwarder_invoice)
      ? row.tb_forwarder_invoice[0]
      : row.tb_forwarder_invoice;
    if (inv && inv.status === OPEN_INVOICE_STATUS) {
      out.add(row.forwarder_id);
    }
  }
  return out;
}
