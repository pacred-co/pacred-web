"use server";

/**
 * U1-6 — Refund money path admin actions.
 *
 * Per [docs/UPGRADE_PLAN.md] §1 U1-6 + [docs/research/gap-revenue-flow.md] H-3.
 *
 * Lifecycle:
 *   pending → approved (decision only, no money moved)
 *           ↘ rejected (terminal)
 *   approved → paid (writes wallet_transactions kind='refund' credit)
 *
 * V1 roles:
 *   create / approve / reject / mark-paid : super, accounting.
 *
 * Each mutation writes admin_audit_log per ADR-0014.
 *
 * Wallet tx (in adminMarkRefundPaid):
 *   - profile_id     = refund_requests.profile_id
 *   - bucket         = 'main'
 *   - amount         = +amount_thb (POSITIVE credit — overdraw guard ignores credits)
 *   - kind           = 'refund'
 *   - status         = 'completed'
 *   - reference_type = 'manual'           (refund domain — see decision below)
 *   - reference_id   = refund_request.request_no (RF-YYMMDD-NNNN)
 *   - note           = "Refund {request_no}: {first 200 chars of reason}"
 *   - admin_id       = adminId (text-typed column per migration 0007)
 *
 * Decision: reference_type='manual' is the closest existing value to "refund
 * domain". Adding a new 'refund_request' enum value to wallet_transactions.
 * reference_type would require a follow-up migration (extend the 0063 CHECK)
 * — out of V1 scope. The refund_requests.id linkage flows the OTHER direction
 * via refund_requests.paid_wallet_tx_id (FK to wallet_transactions), so the
 * audit chain is intact even without a back-pointer on the wallet tx itself.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  adminCreateRefundSchema, type AdminCreateRefundInput,
  approveRefundSchema,     type ApproveRefundInput,
  rejectRefundSchema,      type RejectRefundInput,
  markRefundPaidSchema,    type MarkRefundPaidInput,
  isNeverPaidParentStatus,
  checkRefundCeiling,
} from "@/lib/validators/refund";

const REFUND_ROLES = ["super", "accounting"] as const;

// ────────────────────────────────────────────────────────────
// 1) adminCreateRefund — admin creates on behalf of customer
// ────────────────────────────────────────────────────────────
// Used for e.g. carrier-change over-collection (scenario 3) where ops/
// accounting notices Pacred over-billed the customer and initiates the
// refund without waiting for the customer to ask.

type CreateResult = { id: string; request_no: string };

export async function adminCreateRefund(
  input: AdminCreateRefundInput,
): Promise<AdminActionResult<CreateResult>> {
  const parsed = adminCreateRefundSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...REFUND_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Verify customer exists (tight FK already exists; this gives a nice error).
    {
      const { data: prof, error } = await admin
        .from("profiles")
        .select("id")
        .eq("id", d.profile_id)
        .maybeSingle<{ id: string }>();
      if (error) return { ok: false, error: error.message };
      if (!prof)  return { ok: false, error: "customer_not_found" };
    }

    // For a non-manual source, verify the parent exists, belongs to this
    // customer (P1-1 IDOR), and was ever paid (P0-1 never-paid reject).
    const verifyErr = await verifySourceRef(admin, d.source, d.source_ref, d.profile_id);
    if (verifyErr) return { ok: false, error: verifyErr };

    // Reserve serial. P2-1 accepted gap: next_refund_request_no() consumes
    // the counter before the INSERT, so a failed INSERT leaves a hole in the
    // RF-YYMMDD-NNNN sequence. This matches the accepted freight-quote/invoice
    // serial precedent (freight-invoices.ts "gap will be logged") — RF numbers
    // are non-contiguous-by-design, not a guarantee. Not worth a txn rewrite.
    const { data: requestNo, error: serialErr } = await admin.rpc("next_refund_request_no");
    if (serialErr || typeof requestNo !== "string") {
      return { ok: false, error: `serial_reserve_failed: ${serialErr?.message ?? "rpc"}` };
    }

    const { data: inserted, error: insErr } = await admin
      .from("refund_requests")
      .insert({
        request_no:          requestNo,
        profile_id:          d.profile_id,
        source:              d.source,
        source_ref:          d.source_ref ?? null,
        amount_thb:          d.amount_thb,
        reason:              d.reason,
        status:              "pending",
        created_by_admin_id: adminId,
      })
      .select("id, request_no")
      .single<{ id: string; request_no: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "refund.create", "refund_request", inserted.id, {
      request_no: requestNo,
      profile_id: d.profile_id,
      source:     d.source,
      source_ref: d.source_ref ?? null,
      amount_thb: d.amount_thb,
    });

    revalidatePath("/admin/refunds");
    revalidatePath("/refunds");
    return { ok: true, data: { id: inserted.id, request_no: inserted.request_no } };
  });
}

// ────────────────────────────────────────────────────────────
// 2) adminApproveRefund — pending → approved (decision only)
// ────────────────────────────────────────────────────────────

export async function adminApproveRefund(
  input: ApproveRefundInput,
): Promise<AdminActionResult<{ approved_at: string }>> {
  const parsed = approveRefundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...REFUND_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: readErr } = await admin
      .from("refund_requests")
      .select("id, request_no, status, profile_id")
      .eq("id", input.id)
      .maybeSingle<{ id: string; request_no: string; status: string; profile_id: string }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };
    if (row.status !== "pending") return { ok: false, error: `bad_status:${row.status}` };

    const approvedAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("refund_requests")
      .update({
        status:               "approved",
        approved_by_admin_id: adminId,
        approved_at:          approvedAt,
      })
      .eq("id", input.id)
      .eq("status", "pending");                                       // optimistic race-guard
    if (updErr) {
      return { ok: false, error: `update_failed: ${updErr.message}` };
    }

    await logAdminAction(adminId, "refund.approve", "refund_request", input.id, {
      request_no: row.request_no,
    });

    revalidateOne(input.id);
    return { ok: true, data: { approved_at: approvedAt } };
  });
}

// ────────────────────────────────────────────────────────────
// 3) adminRejectRefund — pending → rejected
// ────────────────────────────────────────────────────────────

export async function adminRejectRefund(
  input: RejectRefundInput,
): Promise<AdminActionResult<{ rejected_at: string }>> {
  const parsed = rejectRefundSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...REFUND_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: readErr } = await admin
      .from("refund_requests")
      .select("id, request_no, status")
      .eq("id", d.id)
      .maybeSingle<{ id: string; request_no: string; status: string }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };
    if (row.status !== "pending") return { ok: false, error: `bad_status:${row.status}` };

    const rejectedAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("refund_requests")
      .update({
        status:               "rejected",
        rejected_reason:      d.rejected_reason,
        rejected_by_admin_id: adminId,
        rejected_at:          rejectedAt,
      })
      .eq("id", d.id)
      .eq("status", "pending");
    if (updErr) {
      return { ok: false, error: `update_failed: ${updErr.message}` };
    }

    await logAdminAction(adminId, "refund.reject", "refund_request", d.id, {
      request_no:      row.request_no,
      rejected_reason: d.rejected_reason,
    });

    revalidateOne(d.id);
    return { ok: true, data: { rejected_at: rejectedAt } };
  });
}

// ────────────────────────────────────────────────────────────
// 4) adminMarkRefundPaid — approved → paid (writes wallet credit)
// ────────────────────────────────────────────────────────────
// THIS IS THE ONLY ACTION THAT MOVES MONEY. The wallet credit + the
// refund_requests.status='paid' + paid_wallet_tx_id linkage must succeed
// together — if the wallet insert fails, we abort. If the post-insert
// refund_requests UPDATE fails, we DELETE the orphan wallet tx so the
// customer doesn't get a duplicate credit on retry.

export async function adminMarkRefundPaid(
  input: MarkRefundPaidInput,
): Promise<AdminActionResult<{ paid_at: string; wallet_tx_id: string }>> {
  const parsed = markRefundPaidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...REFUND_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: readErr } = await admin
      .from("refund_requests")
      .select("id, request_no, status, source, source_ref, profile_id, amount_thb, reason, paid_at, paid_wallet_tx_id")
      .eq("id", input.id)
      .maybeSingle<{
        id: string; request_no: string; status: string;
        source: string; source_ref: string | null;
        profile_id: string; amount_thb: number; reason: string;
        paid_at: string | null; paid_wallet_tx_id: string | null;
      }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };
    if (row.status === "paid") {
      // Idempotent: already paid — return the REAL existing link + timestamp
      // (P2-6: previously returned paid_at:"" which is a falsy lie on replay).
      return {
        ok: true,
        data: {
          paid_at:      row.paid_at ?? "",
          wallet_tx_id: row.paid_wallet_tx_id ?? "",
        },
      };
    }
    if (row.status !== "approved") return { ok: false, error: `bad_status:${row.status}` };

    // ── P0-1 amount-ceiling guard ──
    // Resolve what the customer actually paid against the parent + the sum
    // of refunds already paid for the same parent, then reject if this
    // refund would push the total over the collected amount. A DB CHECK
    // cannot express this (cross-table) — it must live here, mirroring the
    // billing-gate pattern. source='manual' has no parent: admin judgement
    // stands, but we log loudly so over-refunds are auditable.
    if (row.source === "manual") {
      logger.warn("refund", "manual refund mark-paid — no parent ceiling check", {
        request_no: row.request_no,
        amount_thb: Number(row.amount_thb),
        admin_id:   adminId,
      });
    } else {
      const ceiling = await resolveRefundCeiling(
        admin, row.source, row.source_ref, row.id, Number(row.amount_thb),
      );
      if (!ceiling.ok) return { ok: false, error: ceiling.error };
    }

    // ── Write wallet_transactions credit ──
    // Positive amount = credit; overdraw guard (0064) ignores credits.
    const noteShort = `Refund ${row.request_no}: ${row.reason.slice(0, 200)}`;
    const { data: wTx, error: walletErr } = await admin
      .from("wallet_transactions")
      .insert({
        profile_id:     row.profile_id,
        bucket:         "main",
        amount:         Number(row.amount_thb),                       // POSITIVE → credit
        kind:           "refund",
        status:         "completed",
        reference_type: "manual",                                     // see file header decision
        reference_id:   row.request_no,
        note:           noteShort,
        admin_id:       adminId,
      })
      .select("id")
      .single<{ id: string }>();
    if (walletErr || !wTx) {
      return { ok: false, error: `wallet_credit_failed: ${walletErr?.message ?? "no_row"}` };
    }

    // ── Flip refund_requests → paid + link the wallet tx ──
    const paidAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("refund_requests")
      .update({
        status:            "paid",
        paid_at:           paidAt,
        paid_by_admin_id:  adminId,
        paid_wallet_tx_id: wTx.id,
      })
      .eq("id", input.id)
      .eq("status", "approved");
    if (updErr) {
      // Compensate: delete the orphan wallet credit so the customer
      // doesn't get a duplicate when the action is retried.
      const { error: delErr } = await admin
        .from("wallet_transactions")
        .delete()
        .eq("id", wTx.id);
      await logAdminAction(adminId, "refund.mark_paid_failed", "refund_request", input.id, {
        request_no:      row.request_no,
        wallet_tx_id:    wTx.id,
        update_error:    updErr.message,
        compensate_ok:   !delErr,
        compensate_err:  delErr?.message ?? null,
      });
      return {
        ok: false,
        error: `update_failed: ${updErr.message}` +
               (delErr ? ` (compensate also failed: ${delErr.message} — wallet tx ${wTx.id} stays; manual cleanup needed)` : ""),
      };
    }

    await logAdminAction(adminId, "refund.mark_paid", "refund_request", input.id, {
      request_no:   row.request_no,
      amount_thb:   row.amount_thb,
      wallet_tx_id: wTx.id,
    });

    revalidateOne(input.id);
    // Refresh the customer's wallet pages too.
    revalidatePath("/wallet/history");
    revalidatePath("/dashboard");
    return { ok: true, data: { paid_at: paidAt, wallet_tx_id: wTx.id } };
  });
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * For non-manual sources, verify the referenced parent:
 *   - exists,
 *   - belongs to `targetProfileId` (P1-1 IDOR guard — an admin must not be
 *     able to refund customer B against customer A's order),
 *   - was ever paid (P0-1 — reject creation against a never-paid parent).
 * Manual sources skip this check entirely (no parent).
 *
 * Returns an error string when any check fails, or null on success.
 */
async function verifySourceRef(
  admin:           AdminClient,
  source:          string,
  sourceRef:       string | undefined,
  targetProfileId: string,
): Promise<string | null> {
  if (source === "manual") return null;
  if (!sourceRef) return "source_ref_required";

  if (source === "forwarder") {
    const { data, error } = await admin
      .from("forwarders")
      .select("f_no, profile_id, status")
      .eq("f_no", sourceRef)
      .maybeSingle<{ f_no: string; profile_id: string; status: string }>();
    if (error) return error.message;
    if (!data)  return "forwarder_not_found";
    if (data.profile_id !== targetProfileId) return "forwarder_belongs_to_other_customer";
    if (isNeverPaidParentStatus(source, data.status)) return "forwarder_not_paid";
    return null;
  }
  if (source === "service_order") {
    const { data, error } = await admin
      .from("service_orders")
      .select("h_no, profile_id, status")
      .eq("h_no", sourceRef)
      .maybeSingle<{ h_no: string; profile_id: string; status: string }>();
    if (error) return error.message;
    if (!data)  return "service_order_not_found";
    if (data.profile_id !== targetProfileId) return "service_order_belongs_to_other_customer";
    if (isNeverPaidParentStatus(source, data.status)) return "service_order_not_paid";
    return null;
  }
  if (source === "yuan_payment") {
    const { data, error } = await admin
      .from("yuan_payments")
      .select("id, profile_id, status")
      .eq("id", sourceRef)
      .maybeSingle<{ id: string; profile_id: string; status: string }>();
    if (error) return error.message;
    if (!data)  return "yuan_payment_not_found";
    if (data.profile_id !== targetProfileId) return "yuan_payment_belongs_to_other_customer";
    if (isNeverPaidParentStatus(source, data.status)) return "yuan_payment_not_paid";
    return null;
  }
  return `unknown_source:${source}`;
}

function revalidateOne(refundId: string): void {
  revalidatePath("/admin/refunds");
  revalidatePath(`/admin/refunds/${refundId}`);
  revalidatePath("/refunds");
}

/**
 * P0-1 — resolve the amount-ceiling for a refund mark-paid and decide
 * whether it may proceed. Cross-table: it reads what the customer actually
 * paid against the parent + sums refunds already paid for the same parent.
 *
 * "Collected" per source:
 *   - forwarder      : Σ wallet_transactions where reference_type='forwarder',
 *                      reference_id=f_no, kind='import_payment', status='completed'
 *                      (negative debits — summed as absolute THB)
 *   - service_order  : same, reference_type='order_header', kind='order_payment'
 *   - yuan_payment   : the transfer's thb_amount (rate locked at request time)
 *
 * On a DB read error this fails CLOSED (rejects the mark-paid) — unlike the
 * billing-gate's fail-open: this guard protects a direct money-out path, so a
 * transient error must not let an unbounded credit through. The admin can
 * retry once the DB recovers.
 *
 * Returns { ok:true } when the credit is within the ceiling, or
 * { ok:false, error } when it is not / cannot be verified.
 */
async function resolveRefundCeiling(
  admin:        AdminClient,
  source:       string,
  sourceRef:    string | null,
  refundId:     string,
  refundAmount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!sourceRef) {
    // Non-manual refund with no parent ref should be impossible (DB CHECK
    // refund_requests_source_ref_consistent + verifySourceRef). Fail closed.
    return { ok: false, error: "refund_ceiling_no_source_ref" };
  }

  // ── 1) Collected against the parent ──
  let collected: number;
  if (source === "forwarder" || source === "service_order") {
    const refType = source === "forwarder" ? "forwarder" : "order_header";
    const refKind = source === "forwarder" ? "import_payment" : "order_payment";
    const { data, error } = await admin
      .from("wallet_transactions")
      .select("amount")
      .eq("reference_type", refType)
      .eq("reference_id", sourceRef)
      .eq("kind", refKind)
      .eq("status", "completed");
    if (error) return { ok: false, error: `refund_ceiling_read_failed: ${error.message}` };
    // Payment debits are stored negative — sum as absolute THB collected.
    collected = (data ?? []).reduce((sum, r) => sum + Math.abs(Number(r.amount) || 0), 0);
  } else if (source === "yuan_payment") {
    const { data, error } = await admin
      .from("yuan_payments")
      .select("thb_amount")
      .eq("id", sourceRef)
      .maybeSingle<{ thb_amount: number }>();
    if (error) return { ok: false, error: `refund_ceiling_read_failed: ${error.message}` };
    if (!data) return { ok: false, error: "refund_ceiling_parent_not_found" };
    collected = Number(data.thb_amount) || 0;
  } else {
    return { ok: false, error: `refund_ceiling_unknown_source:${source}` };
  }

  // ── 2) Refunds already PAID for the same parent (exclude this row) ──
  const { data: priorRows, error: priorErr } = await admin
    .from("refund_requests")
    .select("id, amount_thb")
    .eq("source", source)
    .eq("source_ref", sourceRef)
    .eq("status", "paid");
  if (priorErr) return { ok: false, error: `refund_ceiling_read_failed: ${priorErr.message}` };
  const priorPaid = (priorRows ?? [])
    .filter((r) => r.id !== refundId)            // never count this request against itself
    .reduce((sum, r) => sum + (Number(r.amount_thb) || 0), 0);

  // ── 3) Pure ceiling decision ──
  const verdict = checkRefundCeiling(collected, priorPaid, refundAmount);
  return verdict.ok ? { ok: true } : { ok: false, error: verdict.reason };
}
