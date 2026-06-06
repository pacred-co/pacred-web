"use server";

/**
 * U1-6 — Refund money path admin actions.
 *
 * Per [docs/UPGRADE_PLAN.md] §1 U1-6 + [docs/research/gap-revenue-flow.md] H-3.
 *
 * Lifecycle:
 *   pending → approved (decision only, no money moved)
 *           ↘ rejected (terminal)
 *   approved → paid (writes a tb_wallet_hs type='5' refund credit + bumps
 *                    tb_wallet.wallettotal)
 *
 * V1 roles:
 *   create / approve / reject / mark-paid : super, accounting.
 *
 * Each mutation writes admin_audit_log per ADR-0014.
 *
 * Money write (in adminMarkRefundPaid) — 2026-06-05 §0e repoint:
 *   The refund credit lands in the LIVE legacy ledger, NOT the rebuilt
 *   wallet_transactions twin (0-row on prod — a dead-write trap: admin marked
 *   paid → green toast → the customer's real balance never moved).
 *   - tb_wallet_hs : type='5' (รายการคืนเงิน), status='2' (settled),
 *                    amount=+amount_thb (POSITIVE — direction is by type;
 *                    type-5 is a credit excluded from DEBIT_TYPES so it RAISES
 *                    the spendable balance), userid=member_code,
 *                    reforder=source_ref (parent, for reconciliation),
 *                    note="Refund {request_no}: …". Mirrors the proven
 *                    deposit-approve path in actions/admin/wallet-hs.ts.
 *   - tb_wallet    : wallettotal += amount_thb (read-then-update, upsert).
 *   The refund_requests → tb_wallet_hs linkage is stored in the new
 *   refund_requests.paid_wallet_hs_id (migration 0143); the legacy
 *   paid_wallet_tx_id stays for historical wallet_transactions-era rows.
 *   Identity bridge: refund_requests.profile_id (UUID) → profiles.member_code
 *   (PR-code) → every tb_* row.
 */

import { revalidatePath } from "next/cache";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  adminCreateRefundSchema, type AdminCreateRefundInput,
  approveRefundSchema,     type ApproveRefundInput,
  rejectRefundSchema,      type RejectRefundInput,
  markRefundPaidSchema,    type MarkRefundPaidInput,
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

  // Refund 1:1 (owner 2026-06-06 · option ก) — the legacy PCS refund covers SHOP
  // ORDERS only. forwarder/yuan refunds were a Pacred-original extension; cut them.
  if (d.source === "forwarder" || d.source === "yuan_payment") {
    return { ok: false, error: "คืนเงินได้เฉพาะออเดอร์ฝากสั่งซื้อ (shop-order) ตาม legacy 1:1" };
  }

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

    // For a non-manual source, verify the parent in the LEGACY tb_* schema —
    // exists, belongs to this customer (P1-1 IDOR), was ever paid (early UX
    // reject; the debit ceiling at mark-paid is the hard guard). The parent +
    // its money live in tb_*, keyed on the member_code, not the profile UUID.
    if (d.source !== "manual") {
      const memberCode = await getMemberCode(admin, d.profile_id);
      if (!memberCode) return { ok: false, error: "customer_has_no_member_code" };
      const verifyErr = await verifySourceRef(admin, d.source, d.source_ref, memberCode);
      if (verifyErr) return { ok: false, error: verifyErr };
    }

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
    // New refund request created → the admin refunds-pending queue badge grew;
    // refresh the chrome.
    bustAdminChrome();
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
      .select("id, request_no, status, source, source_ref, profile_id, amount_thb, reason, paid_at, paid_wallet_tx_id, paid_wallet_hs_id")
      .eq("id", input.id)
      .maybeSingle<{
        id: string; request_no: string; status: string;
        source: string; source_ref: string | null;
        profile_id: string; amount_thb: number; reason: string;
        paid_at: string | null; paid_wallet_tx_id: string | null; paid_wallet_hs_id: number | null;
      }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };
    if (row.status === "paid") {
      // Idempotent: already paid — return the REAL existing link + timestamp
      // (P2-6: previously returned paid_at:"" which is a falsy lie on replay).
      // New rows link via paid_wallet_hs_id (legacy ledger); legacy-paid rows
      // via the deprecated paid_wallet_tx_id.
      return {
        ok: true,
        data: {
          paid_at:      row.paid_at ?? "",
          wallet_tx_id: row.paid_wallet_hs_id != null ? String(row.paid_wallet_hs_id) : (row.paid_wallet_tx_id ?? ""),
        },
      };
    }
    if (row.status !== "approved") return { ok: false, error: `bad_status:${row.status}` };

    // Resolve the legacy identity once — the money lives in the legacy ledger
    // (tb_wallet / tb_wallet_hs), keyed on member_code, NOT the profile UUID
    // stored on refund_requests.
    const memberCode = await getMemberCode(admin, row.profile_id);
    if (!memberCode) return { ok: false, error: "customer_has_no_member_code" };

    // ── P0-1 amount-ceiling guard ──
    // Resolve what the customer actually paid against the parent (Σ tb_wallet_hs
    // settled DEBITS for that parent) + the sum of refunds already paid for the
    // same parent, then reject if this refund would push the total over the
    // collected amount. A DB CHECK cannot express this (cross-table) — it must
    // live here. source='manual' has no parent: admin judgement stands, but we
    // log loudly so over-refunds are auditable.
    if (row.source === "manual") {
      logger.warn("refund", "manual refund mark-paid — no parent ceiling check", {
        request_no: row.request_no,
        amount_thb: Number(row.amount_thb),
        admin_id:   adminId,
      });
    } else {
      const ceiling = await resolveRefundCeiling(
        admin, memberCode, row.source, row.source_ref, row.id, Number(row.amount_thb),
      );
      if (!ceiling.ok) return { ok: false, error: ceiling.error };
    }

    // ── Write the refund credit to the LIVE legacy ledger ──
    // tb_wallet_hs type='5' (รายการคืนเงิน / refund credit), status='2' settled,
    // + increment tb_wallet.wallettotal. Mirrors the proven credit path in
    // actions/admin/wallet-hs.ts (deposit-approve) EXACTLY — same NOT-NULL
    // column set, same read-then-update on tb_wallet. `amount` is stored
    // POSITIVE; direction is encoded by `type` (type-5 is excluded from
    // DEBIT_TYPES so it RAISES the spendable balance). This replaces the old
    // dead-write to the rebuilt wallet_transactions twin (§0e trap fix).
    const legacyAdminId = await resolveLegacyAdminId();
    const amount   = Number(row.amount_thb);
    const noteShort = `Refund ${row.request_no}: ${row.reason.slice(0, 200)}`.slice(0, 255);
    const nowIso   = new Date().toISOString();
    // reforder links the credit back to the parent order (non-manual) for
    // reconciliation; the ceiling reads DEBITS only (type 4/2/6) so a type-5
    // credit sharing the same reforder is never miscounted as "collected".
    const refOrder = row.source !== "manual" && row.source_ref ? row.source_ref : "";

    const { data: hsRow, error: hsErr } = await admin
      .from("tb_wallet_hs")
      .insert({
        date:            nowIso,
        dateslip:        null,
        amount:          amount,                  // POSITIVE — credit
        status:          "2",                     // settled (admin = verifier)
        type:            "5",                     // refund credit (รายการคืนเงิน)
        typenew:         "1",                     // credit bucket (matches deposit)
        typeservice:     "1",                     // cargo default
        paydeposit:      "0",
        imagesslip:      "",
        depositnamebank: "",
        nameuserbank:    "",
        nouserbank:      "",
        note:            noteShort,
        adminid:         legacyAdminId,
        adminidupdate:   legacyAdminId,
        session:         "admin-refund",
        reforder:        refOrder,
        whno:            "",                      // NOT NULL — refund has no warehouse #
        wusercredit:     "0",
        userid:          memberCode,              // legacy identity
        adminidcrate:    legacyAdminId,           // creator (NOT NULL)
      })
      .select("id")
      .single<{ id: number }>();
    if (hsErr || !hsRow) {
      return { ok: false, error: `wallet_credit_failed: ${hsErr?.message ?? "no_row"}` };
    }

    // Increment tb_wallet.wallettotal — read-then-update (upsert if missing).
    {
      const { data: wRow, error: wRowErr } = await admin
        .from("tb_wallet")
        .select("userid, wallettotal")
        .eq("userid", memberCode)
        .maybeSingle<{ userid: string; wallettotal: number }>();
      if (wRowErr) {
        console.error(`[tb_wallet read] failed`, { code: wRowErr.code, message: wRowErr.message });
      }
      const walletWriteErr = !wRow
        ? (await admin.from("tb_wallet").insert({ userid: memberCode, wallettotal: amount })).error
        : (await admin.from("tb_wallet").update({ wallettotal: Number(wRow.wallettotal) + amount }).eq("userid", memberCode)).error;
      if (walletWriteErr) {
        // tb_wallet_hs already wrote — roll it back so the ledger never shows a
        // credit the balance didn't receive, then surface the failure.
        await admin.from("tb_wallet_hs").delete().eq("id", hsRow.id);
        return {
          ok: false,
          error: `wallet_balance_update_failed: ${walletWriteErr.message} (ledger row ${hsRow.id} rolled back)`,
        };
      }
    }

    // ── Flip refund_requests → paid + link the ledger row ──
    const paidAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("refund_requests")
      .update({
        status:            "paid",
        paid_at:           paidAt,
        paid_by_admin_id:  adminId,
        paid_wallet_hs_id: hsRow.id,
      })
      .eq("id", input.id)
      .eq("status", "approved");
    if (updErr) {
      // Compensate: reverse the credit (delete the ledger row + decrement the
      // balance) so the customer doesn't get a duplicate credit on retry.
      await admin.from("tb_wallet_hs").delete().eq("id", hsRow.id);
      let compensateErr: string | null = null;
      const { data: wRow2, error: wRow2Err } = await admin
        .from("tb_wallet").select("wallettotal").eq("userid", memberCode)
        .maybeSingle<{ wallettotal: number }>();
      if (wRow2Err) {
        console.error(`[tb_wallet compensate read] failed`, { code: wRow2Err.code, message: wRow2Err.message });
        compensateErr = wRow2Err.message;
      }
      if (wRow2) {
        const { error: revErr } = await admin
          .from("tb_wallet")
          .update({ wallettotal: Number(wRow2.wallettotal) - amount })
          .eq("userid", memberCode);
        compensateErr = revErr?.message ?? null;
      }
      await logAdminAction(adminId, "refund.mark_paid_failed", "refund_request", input.id, {
        request_no:     row.request_no,
        wallet_hs_id:   hsRow.id,
        update_error:   updErr.message,
        compensate_ok:  !compensateErr,
        compensate_err: compensateErr,
      });
      return {
        ok: false,
        error: `update_failed: ${updErr.message}` +
               (compensateErr ? ` (balance compensate failed: ${compensateErr} — tb_wallet for ${memberCode} needs manual reconcile)` : ""),
      };
    }

    await logAdminAction(adminId, "refund.mark_paid", "refund_request", input.id, {
      request_no:   row.request_no,
      amount_thb:   row.amount_thb,
      wallet_hs_id: hsRow.id,
      userid:       memberCode,
    });

    revalidateOne(input.id);
    // Refresh the customer's wallet pages too.
    revalidatePath("/wallet/history");
    revalidatePath("/dashboard");
    return { ok: true, data: { paid_at: paidAt, wallet_tx_id: String(hsRow.id) } };
  });
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Bridge the rebuilt-era `profiles.id` (UUID, stored on refund_requests) to
 * the legacy `tb_users.userID` member-code (PR<n>) that every `tb_*` table
 * keys on. The whole refund subsystem stores `profile_id`, but the money +
 * parent live in the legacy schema → resolve once per action. Returns null
 * if the customer has no member code (shouldn't happen for a real customer).
 */
async function getMemberCode(admin: AdminClient, profileId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("member_code")
    .eq("id", profileId)
    .maybeSingle<{ member_code: string | null }>();
  if (error) {
    console.error(`[profiles member_code lookup] failed`, { code: error.code, message: error.message });
    return null;
  }
  return data?.member_code ?? null;
}

/**
 * Resolve the current admin's legacy `tb_admin.adminID` for the ledger
 * `adminid` columns — same helper as actions/admin/wallet-hs.ts. Falls back to
 * the email local-part (≤20 chars, varchar(20)) or "system".
 */
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase getUser] failed`, { code: dataErr.code, message: dataErr.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error(`[tb_admin adminID lookup] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID;
  return (email.split("@")[0] || "system").slice(0, 20);
}

/**
 * Legacy `tb_*` status codes that mean "never paid a baht" — the tb_*
 * equivalent of NEVER_PAID_PARENT_STATUSES (which keys on the rebuilt enum).
 * The real money-safety is the debit-based ceiling at mark-paid; this is the
 * early UX reject at creation.
 *   forwarder  tb_forwarder.fstatus : pay happens 5→6 (COD at arrival) → never-paid = 1..5
 *   order      tb_header_order.hstatus: รอชำระเงิน=2 → never-paid = 1,2
 *   yuan       tb_payment.paystatus : the THB is wallet-debited at submit
 *              (paystatus='1' already collected) → no never-paid status (the
 *              debit ceiling is the sole guard).
 */
function tbParentNeverPaid(source: string, status: string): boolean {
  if (source === "forwarder")     return ["1", "2", "3", "4", "5"].includes(status);
  if (source === "service_order") return ["1", "2"].includes(status);
  return false; // yuan_payment + anything else → rely on the debit ceiling
}

/**
 * For non-manual sources, verify the referenced parent in the LEGACY `tb_*`
 * schema (the rebuilt twins are 0-row on prod):
 *   - exists + belongs to `targetMemberCode` (P1-1 IDOR — refund customer B
 *     against customer A's order must be impossible),
 *   - was ever paid (early UX reject; the debit ceiling is the hard guard).
 * Returns an error string on failure, or null on success.
 */
async function verifySourceRef(
  admin:            AdminClient,
  source:           string,
  sourceRef:        string | undefined,
  targetMemberCode: string,
): Promise<string | null> {
  if (source === "manual") return null;
  if (!sourceRef) return "source_ref_required";

  if (source === "forwarder") {
    // source_ref = String(tb_forwarder.id) — tb_forwarder has NO fno column;
    // the forwarder is keyed by its integer id (= the type-4 debit's reforder).
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, userid, fstatus")
      .eq("id", sourceRef)
      .maybeSingle<{ id: number; userid: string; fstatus: string | null }>();
    if (error) return error.message;
    if (!data)  return "forwarder_not_found";
    if (data.userid !== targetMemberCode) return "forwarder_belongs_to_other_customer";
    if (tbParentNeverPaid(source, data.fstatus ?? "")) return "forwarder_not_paid";
    return null;
  }
  if (source === "service_order") {
    const { data, error } = await admin
      .from("tb_header_order")
      .select("hno, userid, hstatus")
      .eq("hno", sourceRef)
      .maybeSingle<{ hno: string; userid: string; hstatus: string | null }>();
    if (error) return error.message;
    if (!data)  return "service_order_not_found";
    if (data.userid !== targetMemberCode) return "service_order_belongs_to_other_customer";
    if (tbParentNeverPaid(source, data.hstatus ?? "")) return "service_order_not_paid";
    return null;
  }
  if (source === "yuan_payment") {
    const { data, error } = await admin
      .from("tb_payment")
      .select("id, userid, paystatus")
      .eq("id", sourceRef)
      .maybeSingle<{ id: number; userid: string; paystatus: string | null }>();
    if (error) return error.message;
    if (!data)  return "yuan_payment_not_found";
    if (data.userid !== targetMemberCode) return "yuan_payment_belongs_to_other_customer";
    return null; // yuan: debit ceiling is the guard
  }
  return `unknown_source:${source}`;
}

function revalidateOne(refundId: string): void {
  revalidatePath("/admin/refunds");
  revalidatePath(`/admin/refunds/${refundId}`);
  revalidatePath("/refunds");
  // A refund status moved (approve/reject/mark-paid) → the admin refunds-pending
  // queue badge + (on mark-paid) wallet totals changed; refresh the chrome.
  bustAdminChrome();
}

/**
 * P0-1 — resolve the amount-ceiling for a refund mark-paid and decide
 * whether it may proceed. Cross-table: it reads what the customer actually
 * paid against the parent + sums refunds already paid for the same parent.
 *
 * "Collected" per source = Σ settled tb_wallet_hs debit rows for the parent
 * (reforder == source_ref in every case):
 *   - forwarder      : type='4', reforder=tb_forwarder.id
 *   - service_order  : type='2', reforder=tb_header_order.hno
 *   - yuan_payment   : type='6', reforder=tb_payment.id
 *   (all WHERE userid=member_code AND status='2'; amount stored positive)
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
  memberCode:   string,
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

  // ── 1) Collected against the parent = Σ settled tb_wallet_hs DEBITS for it ──
  // The legacy ledger encodes "the customer paid this" as a status='2' debit
  // row keyed by (userid, type, reforder); `amount` is stored POSITIVE. In all
  // three cases reforder == source_ref (the parent's primary id as text):
  //   forwarder     → type '4', reforder = tb_forwarder.id
  //   service_order → type '2', reforder = tb_header_order.hno
  //   yuan_payment  → type '6', reforder = tb_payment.id
  let debitType: string;
  if (source === "forwarder")          debitType = "4";
  else if (source === "service_order") debitType = "2";
  else if (source === "yuan_payment")  debitType = "6";
  else return { ok: false, error: `refund_ceiling_unknown_source:${source}` };
  const reforder = sourceRef;

  const { data: debitRows, error: debitErr } = await admin
    .from("tb_wallet_hs")
    .select("amount")
    .eq("userid", memberCode)
    .eq("type", debitType)
    .eq("reforder", reforder)
    .eq("status", "2");
  if (debitErr) return { ok: false, error: `refund_ceiling_read_failed: ${debitErr.message}` };
  // amount stored positive; Math.abs keeps it safe against any legacy sign drift.
  const collected = (debitRows ?? []).reduce((sum, r) => sum + Math.abs(Number(r.amount) || 0), 0);

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
