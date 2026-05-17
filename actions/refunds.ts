"use server";

/**
 * U1-6 — Customer-side refund request entry.
 *
 * Per [docs/UPGRADE_PLAN.md] §1 U1-6.
 *
 * Customer flow:
 *   1. Picks a source (forwarder / service_order / yuan_payment) — 'manual'
 *      is admin-only (RLS enforces this too).
 *   2. Picks the parent ref (f_no / h_no / yuan_payment id) — must be one
 *      they actually own.
 *   3. Types an amount + reason (reason ≥10 chars).
 *   4. Submits → row inserted at status='pending', created_by_admin_id=NULL.
 *
 * Admin then approves / rejects via /admin/refunds. Mark-paid (writes the
 * wallet credit) lives in actions/admin/refunds.ts.
 *
 * Defense-in-depth:
 *   - RLS-scoped INSERT (refund_requests_self_insert policy in 0058)
 *   - This action also verifies the source_ref belongs to auth.uid() —
 *     a customer can only request a refund against their OWN parent.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger, redactId } from "@/lib/logger";
import {
  createRefundRequestSchema,
  type CreateRefundRequestInput,
} from "@/lib/validators/refund";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function customerCreateRefundRequest(
  input: CreateRefundRequestInput,
): Promise<ActionResult<{ id: string; request_no: string }>> {
  const parsed = createRefundRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // ── Verify the source_ref is owned by this customer ──
  // RLS already filters reads to profile_id = auth.uid() on forwarders /
  // service_orders / yuan_payments, so a missing row here = "not yours
  // or doesn't exist".
  if (d.source === "forwarder") {
    const { data } = await supabase
      .from("forwarders")
      .select("f_no")
      .eq("f_no", d.source_ref)
      .maybeSingle<{ f_no: string }>();
    if (!data) return { ok: false, error: "forwarder_not_found_or_not_owned" };
  } else if (d.source === "service_order") {
    const { data } = await supabase
      .from("service_orders")
      .select("h_no")
      .eq("h_no", d.source_ref)
      .maybeSingle<{ h_no: string }>();
    if (!data) return { ok: false, error: "service_order_not_found_or_not_owned" };
  } else if (d.source === "yuan_payment") {
    const { data } = await supabase
      .from("yuan_payments")
      .select("id")
      .eq("id", d.source_ref)
      .maybeSingle<{ id: string }>();
    if (!data) return { ok: false, error: "yuan_payment_not_found_or_not_owned" };
  }

  // ── Reserve serial via admin client (the fn is service_role only) ──
  const admin = createAdminClient();
  const { data: requestNo, error: serialErr } = await admin.rpc("next_refund_request_no");
  if (serialErr || typeof requestNo !== "string") {
    return { ok: false, error: `serial_reserve_failed: ${serialErr?.message ?? "rpc"}` };
  }

  // ── Insert via the user's client so RLS self-insert policy applies ──
  // The policy enforces: profile_id = auth.uid(), status='pending',
  // source in non-manual set, source_ref not null, all admin-side fields null.
  const { data: inserted, error: insErr } = await supabase
    .from("refund_requests")
    .insert({
      request_no:  requestNo,
      profile_id:  user.id,
      source:      d.source,
      source_ref:  d.source_ref,
      amount_thb:  d.amount_thb,
      reason:      d.reason,
      status:      "pending",
    })
    .select("id, request_no")
    .single<{ id: string; request_no: string }>();
  if (insErr || !inserted) {
    return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
  }

  // ── Audit log (best-effort; customer-as-actor pattern from actions/wht.ts) ──
  try {
    await admin.from("admin_audit_log").insert({
      admin_id:    user.id,
      action:      "refund.customer_request",
      target_type: "refund_request",
      target_id:   inserted.id,
      payload: {
        request_no: requestNo,
        source:     d.source,
        source_ref: d.source_ref,
        amount_thb: d.amount_thb,
      },
    });
  } catch (e) {
    logger.error("audit", "refund customer-request audit insert failed", e, {
      userId:    redactId(user.id),
      target_id: redactId(inserted.id),
    });
  }

  revalidatePath("/refunds");
  revalidatePath("/admin/refunds");
  return { ok: true, data: { id: inserted.id, request_no: inserted.request_no } };
}
