"use server";

/**
 * V-E8/H1/H2 — Commission admin + staff actions.
 *
 * Per port-spec [docs/port-specs/commission-withdrawal.md] +
 * ADR-0015 Q3 + Phase I2 RBAC ack 2026-05-17.
 *
 * V1 surface area:
 *   ADMIN (super + accounting):
 *     - adminAccrueCommissionForOrder — mint an accrual from one closed order
 *     - adminApproveWithdrawal        — pending → approved
 *     - adminRejectWithdrawal         — pending → rejected (reason required)
 *     - adminMarkWithdrawalPaid       — approved → paid (requires slip path)
 *     - uploadCommissionSlip          — multi-part upload helper
 *     - adminUpsertCommissionTier     — CRUD on tier table
 *
 *   STAFF (interpreter + sales_admin):
 *     - staffRequestWithdrawal — earner bundles N accruals + payee bank
 *
 * Every mutation logs to admin_audit_log per ADR-0014.
 *
 * V1 DEFERRED (= V1.1):
 *   - Background cron /api/cron/commission-accrue (daily auto-mint)
 *   - WHT UX (column + computation exists; admin/staff UI to override is V1.1)
 *   - Multi-currency
 *   - Per-team rate override (V1 = per-role flat rate via tiers)
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminRoles } from "@/lib/auth/require-admin";
import {
  accrueCommissionSchema,        type AccrueCommissionInput,
  approveWithdrawalSchema,       type ApproveWithdrawalInput,
  rejectWithdrawalSchema,        type RejectWithdrawalInput,
  markWithdrawalPaidSchema,      type MarkWithdrawalPaidInput,
  requestWithdrawalSchema,       type RequestWithdrawalInput,
  upsertCommissionTierSchema,    type UpsertCommissionTierInput,
  computeAccrualAmount,
  computeWithdrawalNumbers,
  roundThb,
  DEFAULT_WHT_RATE_PCT,
  MIN_WITHDRAWAL_THB,
  type RoleKind,
  type SourceKind,
} from "@/lib/validators/commission";

const ROLES_ADMIN = ["super", "accounting"] as const;
const ROLES_STAFF = ["interpreter", "sales_admin"] as const;

// ────────────────────────────────────────────────────────────
// 1) Accrue commission for one closed order (admin-triggered)
// ────────────────────────────────────────────────────────────
// V1: admin runs this per closed order. V1.1 will add a cron at
// /api/cron/commission-accrue that auto-scans terminal-state orders.
//
// Idempotency: DB partial-unique on (source_kind, source_ref, earner_admin_id)
// — re-run silently returns the existing row.

type AccrueResult = {
  id:                   string;
  accrued_amount_thb:   number;
  already_existed:      boolean;
};

export async function adminAccrueCommissionForOrder(
  input: AccrueCommissionInput,
): Promise<AdminActionResult<AccrueResult>> {
  const parsed = accrueCommissionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_ADMIN], async ({ adminId }) => {
    const admin = createAdminClient();

    // ── Load tier (so we can snapshot rate + compute) ──
    const { data: tier, error: tierErr } = await admin
      .from("commission_tiers")
      .select("id, role_kind, service_kind, rate_pct, flat_thb, min_base_thb, is_active")
      .eq("id", d.tier_id)
      .maybeSingle<{
        id:           string;
        role_kind:    RoleKind;
        service_kind: SourceKind;
        rate_pct:     number | null;
        flat_thb:     number | null;
        min_base_thb: number | null;
        is_active:    boolean;
      }>();
    if (tierErr) return { ok: false, error: tierErr.message };
    if (!tier)   return { ok: false, error: "tier_not_found" };
    if (!tier.is_active)                      return { ok: false, error: "tier_inactive" };
    if (tier.role_kind    !== d.role_kind)    return { ok: false, error: "tier_role_mismatch" };
    if (tier.service_kind !== d.source_kind)  return { ok: false, error: "tier_service_mismatch" };
    if (tier.min_base_thb !== null && d.base_thb < Number(tier.min_base_thb)) {
      return { ok: false, error: "below_min_base" };
    }

    const accrued_amount_thb = computeAccrualAmount({
      base_thb: d.base_thb,
      rate_pct: tier.rate_pct,
      flat_thb: tier.flat_thb,
    });
    if (accrued_amount_thb <= 0) {
      return { ok: false, error: "accrual_non_positive" };
    }

    // ── Idempotency check (give nicer error than 23505) ──
    const { data: existing, error: existingErr } = await admin
      .from("commission_accruals")
      .select("id, accrued_amount_thb")
      .eq("source_kind", d.source_kind)
      .eq("source_ref", d.source_ref)
      .eq("earner_admin_id", d.earner_admin_id)
      .maybeSingle<{ id: string; accrued_amount_thb: number }>();
    if (existingErr) {
      console.error(`[commission_accruals list] failed`, { code: existingErr.code, message: existingErr.message });
    }
    if (existing) {
      return {
        ok: true,
        data: {
          id:                  existing.id,
          accrued_amount_thb:  Number(existing.accrued_amount_thb),
          already_existed:     true as boolean,
        },
      };
    }

    // ── Insert ──
    const { data: inserted, error: insErr } = await admin
      .from("commission_accruals")
      .insert({
        earner_admin_id:    d.earner_admin_id,
        role_kind:          d.role_kind,
        tier_id:            d.tier_id,
        source_kind:        d.source_kind,
        source_ref:         d.source_ref,
        base_thb:           d.base_thb,
        accrued_amount_thb,
        notes:              d.notes ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "commission_accrual.create", "commission_accrual", inserted.id, {
      earner_admin_id:    d.earner_admin_id,
      role_kind:          d.role_kind,
      source_kind:        d.source_kind,
      source_ref:         d.source_ref,
      base_thb:           d.base_thb,
      accrued_amount_thb,
      tier_id:            d.tier_id,
    });

    revalidatePath("/admin/commissions");
    return {
      ok: true,
      data: {
        id:                  inserted.id,
        accrued_amount_thb,
        already_existed:     false as boolean,
      },
    };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Approve a pending withdrawal (admin)
// ────────────────────────────────────────────────────────────

export async function adminApproveWithdrawal(
  input: ApproveWithdrawalInput,
): Promise<AdminActionResult<{ approved_at: string }>> {
  const parsed = approveWithdrawalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_ADMIN], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("commission_withdrawals")
      .select("id, status, withdrawal_no")
      .eq("id", parsed.data.id)
      .maybeSingle<{ id: string; status: string; withdrawal_no: string }>();
    if (rowErr) {
      console.error(`[commission_withdrawals mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "not_found" };
    if (row.status !== "pending") {
      return { ok: false, error: `bad_status:${row.status}` };
    }

    const approvedAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("commission_withdrawals")
      .update({
        status:               "approved",
        approved_at:          approvedAt,
        approved_by_admin_id: adminId,
      })
      .eq("id", parsed.data.id)
      .eq("status", "pending");                                       // optimistic race-guard
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "commission_withdrawal.approve", "commission_withdrawal", parsed.data.id, {
      withdrawal_no: row.withdrawal_no,
    });

    revalidateWithdrawal(parsed.data.id);
    return { ok: true, data: { approved_at: approvedAt } };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Reject a pending withdrawal (admin, reason required)
// ────────────────────────────────────────────────────────────
// Releases the bundled accruals back to unpaid (sets withdrawal_item_id
// = null) and deletes the join rows.

export async function adminRejectWithdrawal(
  input: RejectWithdrawalInput,
): Promise<AdminActionResult<{ rejected_at: string }>> {
  const parsed = rejectWithdrawalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_ADMIN], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("commission_withdrawals")
      .select("id, status, withdrawal_no")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; withdrawal_no: string }>();
    if (rowErr) {
      console.error(`[commission_withdrawals mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "not_found" };
    if (row.status !== "pending") {
      return { ok: false, error: `bad_status:${row.status}` };
    }

    const rejectedAt = new Date().toISOString();

    // AUDIT-FOLLOWUP (Agent F MED #1): flip status FIRST so we never end up
    // in a state where items are gone but the withdrawal header is still
    // pending (race-window between deletes and the failed status update).
    // After status='rejected' commits, the join cleanup is safe — even if
    // it fails, an admin can replay it idempotently; the canonical state
    // (status) is correct.
    const { error: updErr } = await admin
      .from("commission_withdrawals")
      .update({
        status:               "rejected",
        rejected_at:          rejectedAt,
        rejected_by_admin_id: adminId,
        rejected_reason:      d.rejected_reason,
      })
      .eq("id", d.id)
      .eq("status", "pending");                                      // optimistic
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    // Release accruals + delete join rows AFTER successful status flip.
    // Failures here log only — admin can re-run from /admin/commissions
    // via "Reapply reject cleanup" follow-up (V-E8.1).
    try {
      await admin
        .from("commission_accruals")
        .update({ withdrawal_item_id: null })
        .in("withdrawal_item_id", await getItemIds(admin, d.id));
      await admin
        .from("commission_withdrawal_items")
        .delete()
        .eq("commission_withdrawal_id", d.id);
    } catch (cleanupErr) {
      // Status is already rejected; just log + carry on.
      await logAdminAction(adminId, "commission_withdrawal.reject_cleanup_failed", "commission_withdrawal", d.id, {
        withdrawal_no: row.withdrawal_no,
        error:         (cleanupErr as Error).message ?? "unknown",
      });
    }

    await logAdminAction(adminId, "commission_withdrawal.reject", "commission_withdrawal", d.id, {
      withdrawal_no:   row.withdrawal_no,
      rejected_reason: d.rejected_reason,
    });

    revalidateWithdrawal(d.id);
    return { ok: true, data: { rejected_at: rejectedAt } };
  });
}

// ────────────────────────────────────────────────────────────
// 4) Mark approved withdrawal as paid (admin, slip required)
// ────────────────────────────────────────────────────────────

export async function adminMarkWithdrawalPaid(
  input: MarkWithdrawalPaidInput,
): Promise<AdminActionResult<{ paid_at: string }>> {
  const parsed = markWithdrawalPaidSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_ADMIN], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("commission_withdrawals")
      .select("id, status, withdrawal_no")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; withdrawal_no: string }>();
    if (rowErr) {
      console.error(`[commission_withdrawals mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "not_found" };
    if (row.status !== "approved") {
      return { ok: false, error: `bad_status:${row.status}` };
    }

    const paidAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("commission_withdrawals")
      .update({
        status:            "paid",
        paid_at:           paidAt,
        paid_by_admin_id:  adminId,
        slip_storage_path: d.slip_storage_path,
      })
      .eq("id", d.id)
      .eq("status", "approved");
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "commission_withdrawal.mark_paid", "commission_withdrawal", d.id, {
      withdrawal_no:     row.withdrawal_no,
      slip_storage_path: d.slip_storage_path,
    });

    revalidateWithdrawal(d.id);
    return { ok: true, data: { paid_at: paidAt } };
  });
}

// ────────────────────────────────────────────────────────────
// 5) Upload commission slip — admin-only multi-part upload
// ────────────────────────────────────────────────────────────
// Caller passes a File from a form. Writes to bucket commission-slips
// under {earner_admin_id}/ folder, then returns the path so the caller
// can pass it to adminMarkWithdrawalPaid.

export async function uploadCommissionSlip(
  withdrawalId: string,
  file:         File,
): Promise<AdminActionResult<{ storage_path: string }>> {
  if (!withdrawalId || typeof withdrawalId !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "no_file" };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "file_too_large" };
  }

  return withAdmin([...ROLES_ADMIN], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: readErr } = await admin
      .from("commission_withdrawals")
      .select("id, earner_admin_id, withdrawal_no, status")
      .eq("id", withdrawalId)
      .maybeSingle<{
        id:               string;
        earner_admin_id:  string;
        withdrawal_no:    string;
        status:           string;
      }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };
    if (row.status !== "approved") {
      // Allow slip upload only on approved (admin is about to mark paid).
      return { ok: false, error: "bad_status_for_slip" };
    }

    const ext   = inferExtension(file);
    const stamp = slipTimestamp();
    const path  = `${row.earner_admin_id}/${row.withdrawal_no}-${stamp}${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from("commission-slips")
      .upload(path, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert:      false,
      });
    if (uploadErr) {
      return { ok: false, error: `upload_failed: ${uploadErr.message}` };
    }

    await logAdminAction(adminId, "commission_withdrawal.slip_upload", "commission_withdrawal", withdrawalId, {
      withdrawal_no: row.withdrawal_no,
      storage_path:  path,
      filename:      file.name,
      size_bytes:    file.size,
    });

    return { ok: true, data: { storage_path: path } };
  });
}

// ────────────────────────────────────────────────────────────
// 6) Staff requests withdrawal (interpreter / sales_admin / sales_rep)
// ────────────────────────────────────────────────────────────
// App-layer enforces:
//   - all accruals belong to caller
//   - all are still unpaid (withdrawal_item_id null)
//   - sum ≥ MIN_WITHDRAWAL_THB
//
// Atomic-ish (best-effort: insert withdrawal → insert N items → backfill
// withdrawal_item_id on each accrual). Race-safe via UNIQUE on
// commission_withdrawal_items.commission_accrual_id.

export async function staffRequestWithdrawal(
  input: RequestWithdrawalInput,
): Promise<AdminActionResult<{ id: string; withdrawal_no: string; net_thb: number }>> {
  const parsed = requestWithdrawalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // requireAuth ensures user is signed in; getAdminRoles confirms they
  // hold an eligible commission role.
  const { user } = await requireAuth();
  const roles = await getAdminRoles();
  if (!roles || !roles.some((r) => (ROLES_STAFF as readonly string[]).includes(r) || r === "super")) {
    return { ok: false, error: "forbidden_role" };
  }
  const earnerId = user.id;

  const admin = createAdminClient();

  // ── Load accruals + verify ownership + unpaid status ──
  const { data: accrualsRaw, error: readErr } = await admin
    .from("commission_accruals")
    .select("id, earner_admin_id, role_kind, accrued_amount_thb, withdrawal_item_id")
    .in("id", d.accrual_ids);
  if (readErr) return { ok: false, error: readErr.message };
  const accruals = (accrualsRaw ?? []) as Array<{
    id:                  string;
    earner_admin_id:     string;
    role_kind:           RoleKind;
    accrued_amount_thb:  number;
    withdrawal_item_id:  string | null;
  }>;

  if (accruals.length !== d.accrual_ids.length) {
    return { ok: false, error: "accruals_missing" };
  }
  for (const a of accruals) {
    if (a.earner_admin_id !== earnerId) return { ok: false, error: "accrual_not_owned" };
    if (a.withdrawal_item_id !== null) return { ok: false, error: "accrual_already_included" };
  }

  // Role kind must be consistent across the bundle.
  const roleKind = accruals[0]?.role_kind;
  if (!roleKind) return { ok: false, error: "no_accruals" };
  if (!accruals.every((a) => a.role_kind === roleKind)) {
    return { ok: false, error: "mixed_role_kinds" };
  }

  // ── Compute gross / WHT / net ──
  const gross_thb = roundThb(
    accruals.reduce((s, a) => s + Number(a.accrued_amount_thb), 0),
  );
  if (gross_thb < MIN_WITHDRAWAL_THB) {
    return { ok: false, error: "below_minimum" };
  }
  const wht_rate_pct = d.wht_rate_pct ?? DEFAULT_WHT_RATE_PCT;
  const { wht_amount_thb, net_thb } = computeWithdrawalNumbers({ gross_thb, wht_rate_pct });

  // ── Reserve serial ──
  const { data: withdrawalNo, error: serialErr } = await admin.rpc("next_commission_withdrawal_no");
  if (serialErr || typeof withdrawalNo !== "string") {
    return { ok: false, error: `serial_reserve_failed: ${serialErr?.message ?? "rpc"}` };
  }

  // ── Insert withdrawal header ──
  const { data: inserted, error: insErr } = await admin
    .from("commission_withdrawals")
    .insert({
      withdrawal_no:       withdrawalNo,
      earner_admin_id:     earnerId,
      role_kind:           roleKind,
      title:               d.title,
      gross_thb,
      wht_rate_pct,
      wht_amount_thb,
      net_thb,
      payee_bank_name:     d.payee_bank_name,
      payee_account_name:  d.payee_account_name,
      payee_account_no:    d.payee_account_no,
      status:              "pending",
      notes:               d.notes ?? null,
    })
    .select("id, withdrawal_no")
    .single<{ id: string; withdrawal_no: string }>();
  if (insErr || !inserted) {
    return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
  }

  // ── Insert N join rows ──
  const itemRows = accruals.map((a) => ({
    commission_withdrawal_id: inserted.id,
    commission_accrual_id:    a.id,
    included_amount_thb:      a.accrued_amount_thb,
  }));
  const { data: itemsInserted, error: itemsErr } = await admin
    .from("commission_withdrawal_items")
    .insert(itemRows)
    .select("id, commission_accrual_id");

  if (itemsErr) {
    // Rollback header (best-effort).
    await admin.from("commission_withdrawals").delete().eq("id", inserted.id);
    if (itemsErr.code === "23505" || /duplicate|unique/i.test(itemsErr.message)) {
      return { ok: false, error: "accrual_already_included" };
    }
    return { ok: false, error: `items_insert_failed: ${itemsErr.message}` };
  }

  // ── Backfill withdrawal_item_id on each accrual ──
  const items = (itemsInserted ?? []) as Array<{
    id: string;
    commission_accrual_id: string;
  }>;
  for (const it of items) {
    await admin
      .from("commission_accruals")
      .update({ withdrawal_item_id: it.id })
      .eq("id", it.commission_accrual_id)
      .is("withdrawal_item_id", null);
  }

  await logAdminAction(earnerId, "commission_withdrawal.request", "commission_withdrawal", inserted.id, {
    withdrawal_no: inserted.withdrawal_no,
    gross_thb,
    wht_amount_thb,
    net_thb,
    accrual_count: accruals.length,
  });

  revalidatePath("/commissions/me");
  revalidatePath("/admin/commissions");

  return {
    ok: true,
    data: { id: inserted.id, withdrawal_no: inserted.withdrawal_no, net_thb },
  };
}

// ────────────────────────────────────────────────────────────
// 7) Upsert commission tier (admin)
// ────────────────────────────────────────────────────────────

export async function adminUpsertCommissionTier(
  input: UpsertCommissionTierInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = upsertCommissionTierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_ADMIN], async ({ adminId }) => {
    const admin = createAdminClient();

    const payload = {
      role_kind:       d.role_kind,
      service_kind:    d.service_kind,
      tier_name:       d.tier_name,
      rate_pct:        d.rate_pct ?? null,
      flat_thb:        d.flat_thb ?? null,
      min_base_thb:    d.min_base_thb ?? null,
      effective_from:  d.effective_from ?? null,
      effective_to:    d.effective_to ?? null,
      is_active:       d.is_active ?? true,
      notes:           d.notes ?? null,
    };

    if (d.id) {
      const { error } = await admin
        .from("commission_tiers")
        .update(payload)
        .eq("id", d.id);
      if (error) return { ok: false, error: `update_failed: ${error.message}` };

      await logAdminAction(adminId, "commission_tier.update", "commission_tier", d.id, payload);
      revalidatePath("/admin/commissions");
      return { ok: true, data: { id: d.id } };
    }

    const { data: inserted, error } = await admin
      .from("commission_tiers")
      .insert(payload)
      .select("id")
      .single<{ id: string }>();
    if (error || !inserted) {
      return { ok: false, error: `insert_failed: ${error?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "commission_tier.create", "commission_tier", inserted.id, payload);
    revalidatePath("/admin/commissions");
    return { ok: true, data: { id: inserted.id } };
  });
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;

async function getItemIds(admin: AdminClient, withdrawalId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("commission_withdrawal_items")
    .select("id")
    .eq("commission_withdrawal_id", withdrawalId);
  if (error) {
    console.error(`[commission_withdrawal_items list] failed`, { code: error.code, message: error.message });
  }
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

function revalidateWithdrawal(id: string): void {
  revalidatePath("/admin/commissions");
  revalidatePath(`/admin/commissions/${id}`);
  revalidatePath("/commissions/me");
}

/**
 * Module-scope timestamp helper.
 * React Compiler `react-hooks/purity` rule flags `Date.now()` inside JSX —
 * keep our impure-time-source isolated to module scope.
 */
function slipTimestamp(): string {
  return String(Date.now());
}

function inferExtension(file: File): string {
  const name = (file.name ?? "").toLowerCase();
  if (name.endsWith(".pdf"))                            return ".pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return ".jpg";
  if (name.endsWith(".png"))                            return ".png";
  const t = (file.type ?? "").toLowerCase();
  if (t.includes("pdf"))                          return ".pdf";
  if (t.includes("jpeg") || t.includes("jpg"))    return ".jpg";
  if (t.includes("png"))                          return ".png";
  return ".bin";
}
