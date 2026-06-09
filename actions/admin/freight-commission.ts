"use server";

/**
 * actions/admin/freight-commission.ts — WAVE 6 · the FREIGHT staff-commission
 * accrual + withdrawal workflow. 💰 MONEY-CRITICAL · ships DORMANT.
 *
 * ── Safety design (do NOT weaken without owner sign-off) ──
 *   1. DORMANT GATE — adminAccrueFreightCommission NO-OPs (records nothing) when
 *      business_config commission.freight_enabled is OFF (mig 0167 seeds it OFF).
 *      The accrual respects the flag; the read/withdrawal/pay actions stay usable
 *      (so an accountant can inspect history) but nothing is minted while OFF.
 *   2. RATES ARE DATA — the calc (lib/freight-commission/calc-v2.ts) reads the
 *      ACTIVE freight_commission_tiers rows. The accrual only uses tiers that are
 *      ACTIVE *and* is_owner_confirmed (so an unconfirmed seed never mints money).
 *   3. NO AUTO-PAY — withdrawals go pending → approved → paid. The `paid` flip
 *      is super-only + confirm-gated (the UI), never automatic.
 *   4. IDEMPOTENT — the accrual upserts on the partial-UNIQUE
 *      (source_kind, source_ref, earner_admin_id) so re-running never double-credits.
 *
 * All reads/writes go through the SERVICE-ROLE admin client (RLS-locked tables);
 * every action is withAdmin([...])-gated + logAdminAction-audited.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/upload";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { isFreightCommissionEnabled } from "@/lib/freight-commission/flag";
import { selectActiveConfirmedTiers } from "@/lib/freight/commission-tier-select";
import {
  computeFreightCommission,
  computeFreightWithdrawalNumbers,
  round2,
  type FreightCommissionTier,
  type FreightCommissionScope,
} from "@/lib/freight-commission/calc-v2";

// The full commission role set (mirror the mig 0167 RLS).
const ROLES_VIEW = [
  "super", "accounting", "sales_admin", "pricing", "interpreter",
  "freight_sales_manager", "freight_sales", "freight_import_manager", "freight_export_manager",
] as const;
// Approval = super + accounting (a manager-tier money review).
const ROLES_APPROVE = ["super", "accounting"] as const;
// PAY = super ONLY (no auto-pay · the explicit money-out gate).
const ROLES_PAY = ["super"] as const;

// ════════════════════════════════════════════════════════════════
// Helpers — load the active+confirmed tiers (the rate catalogue).
// ════════════════════════════════════════════════════════════════

type TierRow = {
  id: string;
  service_kind: FreightCommissionScope;
  rate_pct: number | null;
  flat_thb: number | null;
  wht_pct: number;
  is_owner_confirmed: boolean;
  active: boolean;
  effective_from: string;
};

/** Load the latest ACTIVE tier per service_kind (newest effective_from wins). */
async function loadActiveTiers(
  admin: ReturnType<typeof createAdminClient>,
): Promise<TierRow[]> {
  const { data, error } = await admin
    .from("freight_commission_tiers")
    .select("id, service_kind, rate_pct, flat_thb, wht_pct, is_owner_confirmed, active, effective_from")
    .eq("active", true)
    .order("service_kind", { ascending: true })
    .order("effective_from", { ascending: false });
  if (error) {
    console.error(`[freight-commission tiers] failed`, { code: error.code, message: error.message });
    return [];
  }
  // Keep only the newest OWNER-CONFIRMED active row per service_kind. Filtering
  // confirmed FIRST (before the newest-per-scope pick) is load-bearing: a newer
  // *unconfirmed* tier must not shadow an older *confirmed* one — otherwise that
  // scope silently stops accruing real money (audit S2). Only confirmed tiers
  // accrue; this loader feeds the minting path exclusively. The pick logic is
  // the pure, tested `selectActiveConfirmedTiers` (lib/freight/commission-tier-select).
  return selectActiveConfirmedTiers((data ?? []) as TierRow[]);
}

function toCalcTier(r: TierRow): FreightCommissionTier {
  return {
    service_kind: r.service_kind,
    rate_pct: r.rate_pct == null ? null : Number(r.rate_pct),
    flat_thb: r.flat_thb == null ? null : Number(r.flat_thb),
    wht_pct: Number(r.wht_pct ?? 0),
    is_owner_confirmed: Boolean(r.is_owner_confirmed),
  };
}

// ════════════════════════════════════════════════════════════════
// 1. adminAccrueFreightCommission — idempotent · NO-OP when flag OFF.
// ════════════════════════════════════════════════════════════════

const accrueSchema = z.object({
  /** what minted this accrual — e.g. 'freight_invoice'. */
  sourceKind: z.string().trim().min(1).max(60),
  /** the source id — e.g. the job_no / invoice_no. */
  sourceRef: z.string().trim().min(1).max(100),
  /** profile_id of the staff earning the commission. */
  earnerAdminId: z.string().uuid(),
  /** per-scope revenue bases (THB) the rates apply to. */
  bases: z.object({
    freightThb: z.number().min(0).max(99_999_999).optional(),
    customsThb: z.number().min(0).max(99_999_999).optional(),
    docThb: z.number().min(0).max(99_999_999).optional(),
    shipmentCount: z.number().int().min(0).max(10_000).optional(),
  }),
  notes: z.string().trim().max(500).optional(),
});
export type AdminAccrueFreightCommissionInput = z.infer<typeof accrueSchema>;

export type AccrueResult = {
  /** false when the dormant flag is OFF → nothing recorded. */
  recorded: boolean;
  /** present when an accrual was (or already was) recorded. */
  accrualId?: string;
  /** true when the (source × earner) accrual already existed (idempotent). */
  alreadyExisted?: boolean;
  /** the net commission accrued (0 when no confirmed tier matched). */
  accruedAmountThb?: number;
  /** why nothing was recorded ('dormant' | 'no_confirmed_tier' | 'zero_commission'). */
  skippedReason?: string;
};

/**
 * Accrue freight commission for one source (e.g. a freight invoice).
 *
 * DORMANT-SAFE: when commission.freight_enabled is OFF this NO-OPs and returns
 * `{ recorded: false, skippedReason: 'dormant' }`. When ON, it reads the active
 * + owner-confirmed tiers, computes the split, and idempotently upserts ONE
 * accrual ledger row per (source × earner). It NEVER moves money — the accrual
 * is a visibility row, paid out only via the withdrawal workflow.
 */
export async function adminAccrueFreightCommission(
  input: AdminAccrueFreightCommissionInput,
): Promise<AdminActionResult<AccrueResult>> {
  const parsed = accrueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<AccrueResult>([...ROLES_VIEW], async ({ adminId }) => {
    // 🔒 DORMANT GATE — when OFF, record NOTHING.
    const enabled = await isFreightCommissionEnabled();
    if (!enabled) {
      return { ok: true as const, data: { recorded: false, skippedReason: "dormant" } };
    }

    const admin = createAdminClient();

    // Idempotency: if the (source × earner) accrual already exists, return it.
    const { data: existing, error: existErr } = await admin
      .from("freight_commission_accruals")
      .select("id, accrued_amount_thb")
      .eq("source_kind", d.sourceKind)
      .eq("source_ref", d.sourceRef)
      .eq("earner_admin_id", d.earnerAdminId)
      .maybeSingle<{ id: string; accrued_amount_thb: number }>();
    if (existErr) {
      console.error(`[freight-commission accrue lookup] failed`, { code: existErr.code, message: existErr.message });
      return { ok: false, error: `db_error:${existErr.code ?? "unknown"}` };
    }
    if (existing) {
      return {
        ok: true as const,
        data: {
          recorded: true,
          accrualId: existing.id,
          alreadyExisted: true,
          accruedAmountThb: Number(existing.accrued_amount_thb ?? 0),
        },
      };
    }

    // Load the active tiers; keep ONLY owner-confirmed ones for minting (an
    // unconfirmed seed must never accrue real money).
    const allTiers = await loadActiveTiers(admin);
    const confirmed = allTiers.filter((t) => t.is_owner_confirmed);
    if (confirmed.length === 0) {
      // The flag is ON but no rate is confirmed yet → don't mint a phantom 0-row.
      return { ok: true as const, data: { recorded: false, skippedReason: "no_confirmed_tier" } };
    }

    const result = computeFreightCommission({
      tiers: confirmed.map(toCalcTier),
      bases: d.bases,
    });
    if (result.net_thb <= 0) {
      return { ok: true as const, data: { recorded: false, skippedReason: "zero_commission" } };
    }

    // Insert the ledger row. The partial-UNIQUE may fire if a concurrent accrual
    // won the race — handle 23505 by re-reading.
    const { data: inserted, error: insErr } = await admin
      .from("freight_commission_accruals")
      .insert({
        earner_admin_id: d.earnerAdminId,
        source_kind: d.sourceKind,
        source_ref: d.sourceRef,
        base_thb: result.base_thb,
        accrued_amount_thb: result.net_thb,
        wht_pct: result.blended_wht_pct,
        commission_scope_breakdown: result.lines,
        status: "accrued",
        notes: d.notes ?? null,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (insErr && (insErr.code === "23505" || /duplicate|unique/i.test(insErr.message))) {
      const { data: peer, error: peerErr } = await admin
        .from("freight_commission_accruals")
        .select("id, accrued_amount_thb")
        .eq("source_kind", d.sourceKind)
        .eq("source_ref", d.sourceRef)
        .eq("earner_admin_id", d.earnerAdminId)
        .maybeSingle<{ id: string; accrued_amount_thb: number }>();
      if (peerErr) {
        console.error(`[freight-commission accrue peer reread] failed`, { code: peerErr.code, message: peerErr.message });
      }
      if (peer) {
        return {
          ok: true as const,
          data: { recorded: true, accrualId: peer.id, alreadyExisted: true, accruedAmountThb: Number(peer.accrued_amount_thb ?? 0) },
        };
      }
    }
    if (insErr || !inserted) {
      console.error(`[freight-commission accrue insert] failed`, { code: insErr?.code, message: insErr?.message });
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "freight_commission.accrue", "freight_commission_accruals", inserted.id, {
      source_kind: d.sourceKind,
      source_ref: d.sourceRef,
      earner_admin_id: d.earnerAdminId,
      gross_thb: result.gross_thb,
      wht_thb: result.wht_thb,
      net_thb: result.net_thb,
      base_thb: result.base_thb,
    });

    revalidatePath("/admin/commission/freight");
    return {
      ok: true as const,
      data: { recorded: true, accrualId: inserted.id, alreadyExisted: false, accruedAmountThb: result.net_thb },
    };
  });
}

// ════════════════════════════════════════════════════════════════
// 2. adminListCommissionAccruals — the ledger view.
// ════════════════════════════════════════════════════════════════

export type CommissionAccrualRow = {
  id: string;
  earnerAdminId: string;
  earnerName: string;
  sourceKind: string;
  sourceRef: string;
  baseThb: number;
  accruedAmountThb: number;
  whtPct: number;
  status: string;
  withdrawalId: string | null;
  createdAt: string | null;
};

/** List commission accruals (newest first), optionally filtered by status. */
export async function adminListCommissionAccruals(
  status?: "accrued" | "withdrawn" | "void" | "all",
): Promise<AdminActionResult<CommissionAccrualRow[]>> {
  return withAdmin([...ROLES_VIEW], async () => {
    const admin = createAdminClient();
    let q = admin
      .from("freight_commission_accruals")
      .select("id, earner_admin_id, source_kind, source_ref, base_thb, accrued_amount_thb, wht_pct, status, withdrawal_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (status && status !== "all") q = q.eq("status", status);

    const { data, error } = await q;
    if (error) {
      console.error(`[freight-commission accruals list] failed`, { code: error.code, message: error.message });
      return { ok: false as const, error: `list_failed: ${error.message}` };
    }
    const rows = (data ?? []) as Array<{
      id: string; earner_admin_id: string; source_kind: string; source_ref: string;
      base_thb: number | string | null; accrued_amount_thb: number | string | null;
      wht_pct: number | string | null; status: string; withdrawal_id: string | null; created_at: string | null;
    }>;

    const earnerNames = await resolveEarnerNames(admin, rows.map((r) => r.earner_admin_id));

    return {
      ok: true as const,
      data: rows.map((r) => ({
        id: r.id,
        earnerAdminId: r.earner_admin_id,
        earnerName: earnerNames.get(r.earner_admin_id) ?? "—",
        sourceKind: r.source_kind,
        sourceRef: r.source_ref,
        baseThb: Number(r.base_thb ?? 0),
        accruedAmountThb: Number(r.accrued_amount_thb ?? 0),
        whtPct: Number(r.wht_pct ?? 0),
        status: r.status,
        withdrawalId: r.withdrawal_id,
        createdAt: r.created_at,
      })),
    };
  });
}

async function resolveEarnerNames(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data, error } = await admin
    .from("profiles")
    .select("id, first_name, last_name, member_code")
    .in("id", unique);
  if (error) {
    console.error(`[freight-commission earner names] failed`, { code: error.code, message: error.message });
    return map;
  }
  for (const p of (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; member_code: string | null }>) {
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    map.set(p.id, name || p.member_code || p.id.slice(0, 8));
  }
  return map;
}

// ════════════════════════════════════════════════════════════════
// 3. adminListCommissionWithdrawals — the approval/pay queue.
// ════════════════════════════════════════════════════════════════

export type CommissionWithdrawalRow = {
  id: string;
  earnerAdminId: string;
  earnerName: string;
  grossThb: number;
  whtThb: number;
  netThb: number;
  whtRatePct: number;
  status: string;
  payeeBankName: string | null;
  payeeAccountName: string | null;
  payeeAccountNo: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  rejectedReason: string | null;
};

/** List withdrawals (newest first), optionally filtered by status. */
export async function adminListCommissionWithdrawals(
  status?: "pending" | "approved" | "paid" | "rejected" | "all",
): Promise<AdminActionResult<CommissionWithdrawalRow[]>> {
  return withAdmin([...ROLES_VIEW], async () => {
    const admin = createAdminClient();
    let q = admin
      .from("freight_commission_withdrawals")
      .select("id, earner_admin_id, gross_thb, wht_thb, net_thb, wht_rate_pct, status, payee_bank_name, payee_account_name, payee_account_no, requested_at, approved_at, paid_at, rejected_reason")
      .order("requested_at", { ascending: false })
      .limit(500);
    if (status && status !== "all") q = q.eq("status", status);

    const { data, error } = await q;
    if (error) {
      console.error(`[freight-commission withdrawals list] failed`, { code: error.code, message: error.message });
      return { ok: false as const, error: `list_failed: ${error.message}` };
    }
    const rows = (data ?? []) as Array<{
      id: string; earner_admin_id: string;
      gross_thb: number | string | null; wht_thb: number | string | null; net_thb: number | string | null;
      wht_rate_pct: number | string | null; status: string;
      payee_bank_name: string | null; payee_account_name: string | null; payee_account_no: string | null;
      requested_at: string | null; approved_at: string | null; paid_at: string | null; rejected_reason: string | null;
    }>;
    const earnerNames = await resolveEarnerNames(admin, rows.map((r) => r.earner_admin_id));

    return {
      ok: true as const,
      data: rows.map((r) => ({
        id: r.id,
        earnerAdminId: r.earner_admin_id,
        earnerName: earnerNames.get(r.earner_admin_id) ?? "—",
        grossThb: Number(r.gross_thb ?? 0),
        whtThb: Number(r.wht_thb ?? 0),
        netThb: Number(r.net_thb ?? 0),
        whtRatePct: Number(r.wht_rate_pct ?? 0),
        status: r.status,
        payeeBankName: r.payee_bank_name,
        payeeAccountName: r.payee_account_name,
        payeeAccountNo: r.payee_account_no,
        requestedAt: r.requested_at,
        approvedAt: r.approved_at,
        paidAt: r.paid_at,
        rejectedReason: r.rejected_reason,
      })),
    };
  });
}

// ════════════════════════════════════════════════════════════════
// 4. adminCreateCommissionWithdrawal — bundle N accruals into a request.
// ════════════════════════════════════════════════════════════════

const createWithdrawalSchema = z.object({
  earnerAdminId: z.string().uuid(),
  accrualIds: z.array(z.string().uuid()).min(1, "เลือกอย่างน้อย 1 รายการ").max(500),
  payeeBankName: z.string().trim().max(100).optional(),
  payeeAccountName: z.string().trim().max(200).optional(),
  payeeAccountNo: z.string().trim().max(50).optional(),
  /** WHT override (default 15%). Set 0 for taxable-elsewhere (audited). */
  whtRatePct: z.coerce.number().min(0).max(50).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type AdminCreateCommissionWithdrawalInput = z.infer<typeof createWithdrawalSchema>;

/**
 * Create a withdrawal request that bundles N OPEN accruals. The accruals MUST
 * belong to the named earner + still be 'accrued' (unbundled). Status starts
 * 'pending' — NO money moves. Sum drives gross; WHT 15% on > 5k (§50(1)).
 */
export async function adminCreateCommissionWithdrawal(
  input: AdminCreateCommissionWithdrawalInput,
): Promise<AdminActionResult<{ id: string; netThb: number }>> {
  const parsed = createWithdrawalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_VIEW], async ({ adminId }) => {
    const admin = createAdminClient();

    // Load the accruals — must all belong to the earner + be 'accrued'.
    const { data: accruals, error: accErr } = await admin
      .from("freight_commission_accruals")
      .select("id, earner_admin_id, accrued_amount_thb, status")
      .in("id", d.accrualIds);
    if (accErr) {
      console.error(`[freight-commission withdrawal accruals] failed`, { code: accErr.code, message: accErr.message });
      return { ok: false, error: `db_error:${accErr.code ?? "unknown"}` };
    }
    const rows = (accruals ?? []) as Array<{ id: string; earner_admin_id: string; accrued_amount_thb: number | string | null; status: string }>;
    if (rows.length !== d.accrualIds.length) {
      return { ok: false, error: "บางรายการสะสมไม่พบ (อาจถูกเบิกไปแล้ว)" };
    }
    for (const r of rows) {
      if (r.earner_admin_id !== d.earnerAdminId) return { ok: false, error: "รายการสะสมไม่ตรงกับผู้รับ" };
      if (r.status !== "accrued") return { ok: false, error: `รายการ ${r.id.slice(0, 8)} ไม่อยู่ในสถานะพร้อมเบิก (สถานะ=${r.status})` };
    }

    const gross = round2(rows.reduce((s, r) => s + Number(r.accrued_amount_thb ?? 0), 0));
    if (gross <= 0) return { ok: false, error: "ยอดรวมต้องมากกว่า 0" };

    const { wht_thb, net_thb, wht_rate_pct } = computeFreightWithdrawalNumbers({
      gross_thb: gross,
      wht_rate_pct: d.whtRatePct,
    });

    // Insert the pending withdrawal header.
    const { data: inserted, error: insErr } = await admin
      .from("freight_commission_withdrawals")
      .insert({
        earner_admin_id: d.earnerAdminId,
        gross_thb: gross,
        wht_thb,
        net_thb,
        wht_rate_pct,
        payee_bank_name: d.payeeBankName ?? null,
        payee_account_name: d.payeeAccountName ?? null,
        payee_account_no: d.payeeAccountNo ?? null,
        status: "pending",
        notes: d.notes ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      console.error(`[freight-commission withdrawal insert] failed`, { code: insErr?.code, message: insErr?.message });
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    // Link the accruals (UNIQUE on accrual_id guards double-include) + flip them
    // to 'withdrawn'. On any failure, roll the header back so we don't strand it.
    const items = rows.map((r) => ({
      withdrawal_id: inserted.id,
      accrual_id: r.id,
      amount_thb: Number(r.accrued_amount_thb ?? 0),
    }));
    const { error: itemsErr } = await admin.from("freight_commission_withdrawal_items").insert(items);
    if (itemsErr) {
      await admin.from("freight_commission_withdrawals").delete().eq("id", inserted.id);
      console.error(`[freight-commission withdrawal items] failed`, { code: itemsErr.code, message: itemsErr.message });
      return { ok: false, error: `รายการอาจถูกเบิกไปแล้ว: ${itemsErr.message}` };
    }
    // Flip the linked accruals to 'withdrawn' (guard: only those still 'accrued').
    const { error: flipErr } = await admin
      .from("freight_commission_accruals")
      .update({ status: "withdrawn", withdrawal_id: inserted.id })
      .in("id", d.accrualIds)
      .eq("status", "accrued");
    if (flipErr) {
      console.error(`[freight-commission accrual flip] failed`, { code: flipErr.code, message: flipErr.message });
      // Items + header exist; the flip can be repaired. Don't hard-fail the request.
    }

    await logAdminAction(adminId, "freight_commission.withdrawal_create", "freight_commission_withdrawals", inserted.id, {
      earner_admin_id: d.earnerAdminId,
      accrual_count: d.accrualIds.length,
      gross_thb: gross,
      wht_thb,
      net_thb,
    });

    revalidatePath("/admin/commission/freight");
    return { ok: true, data: { id: inserted.id, netThb: net_thb } };
  });
}

// ════════════════════════════════════════════════════════════════
// 5. adminApproveCommissionWithdrawal — pending → approved (super/accounting).
// ════════════════════════════════════════════════════════════════

const idSchema = z.object({ id: z.string().uuid() });

export async function adminApproveCommissionWithdrawal(
  input: z.infer<typeof idSchema>,
): Promise<AdminActionResult<void>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_APPROVE], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    // Optimistic: only flip a still-pending row.
    const { data: updated, error } = await admin
      .from("freight_commission_withdrawals")
      .update({ status: "approved", approved_at: now, approved_by: adminId })
      .eq("id", parsed.data.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) {
      console.error(`[freight-commission approve] failed`, { code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }
    if (!updated) return { ok: false, error: "รายการนี้ไม่อยู่ในสถานะรอตรวจ (อาจถูกดำเนินการแล้ว)" };

    await logAdminAction(adminId, "freight_commission.withdrawal_approve", "freight_commission_withdrawals", parsed.data.id, {});
    revalidatePath("/admin/commission/freight");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════
// 6. adminRejectCommissionWithdrawal — pending → rejected (super/accounting).
// ════════════════════════════════════════════════════════════════

const rejectSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3, "เหตุผล ≥3 ตัวอักษร").max(500),
});

export async function adminRejectCommissionWithdrawal(
  input: z.infer<typeof rejectSchema>,
): Promise<AdminActionResult<void>> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...ROLES_APPROVE], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    // Only a pending row can be rejected.
    const { data: updated, error } = await admin
      .from("freight_commission_withdrawals")
      .update({ status: "rejected", rejected_at: now, rejected_by: adminId, rejected_reason: d.reason })
      .eq("id", d.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) {
      console.error(`[freight-commission reject] failed`, { code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }
    if (!updated) return { ok: false, error: "รายการนี้ไม่อยู่ในสถานะรอตรวจ" };

    // Release the bundled accruals back to 'accrued' so they can be re-bundled.
    const { error: releaseErr } = await admin
      .from("freight_commission_accruals")
      .update({ status: "accrued", withdrawal_id: null })
      .eq("withdrawal_id", d.id)
      .eq("status", "withdrawn");
    if (releaseErr) {
      console.error(`[freight-commission reject release] failed`, { code: releaseErr.code, message: releaseErr.message });
    }

    await logAdminAction(adminId, "freight_commission.withdrawal_reject", "freight_commission_withdrawals", d.id, { reason: d.reason });
    revalidatePath("/admin/commission/freight");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════
// 7. adminMarkCommissionWithdrawalPaid — approved → paid (SUPER ONLY · NO AUTO).
// ════════════════════════════════════════════════════════════════

const paidSchema = z.object({ id: z.string().uuid() });
export type AdminMarkCommissionWithdrawalPaidInput = z.infer<typeof paidSchema>;

/**
 * Mark an APPROVED withdrawal as paid + record the transfer slip. SUPER ONLY.
 * This is the explicit money-out gate — never automatic. The slip is required
 * (mirrors adminMarkSalesPayoutPaidTb). The guard `.eq("status","approved")`
 * closes any double-pay TOCTOU. On a slip-upload-then-flip failure the slip is
 * removed so no orphan file lingers.
 */
export async function adminMarkCommissionWithdrawalPaid(
  input: AdminMarkCommissionWithdrawalPaidInput,
  slipImage: File,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = paidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { id } = parsed.data;

  if (!(slipImage instanceof File) || slipImage.size === 0) {
    return { ok: false, error: "กรุณาแนบหลักฐานการโอน (สลิปรายการ)" };
  }

  return withAdmin<{ id: string }>([...ROLES_PAY], async ({ adminId }) => {
    const admin = createAdminClient();

    // Guard pre-read: must be APPROVED (not pending / paid / rejected).
    const { data: row, error: rowErr } = await admin
      .from("freight_commission_withdrawals")
      .select("id, status, earner_admin_id, net_thb")
      .eq("id", id)
      .maybeSingle<{ id: string; status: string; earner_admin_id: string; net_thb: number | string | null }>();
    if (rowErr) {
      console.error(`[freight-commission pay lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "ไม่พบรายการ" };
    if (row.status === "paid") return { ok: false, error: "รายการนี้จ่ายเงินไปแล้ว" };
    if (row.status !== "approved") return { ok: false, error: `ต้องอนุมัติก่อนจ่าย (สถานะปัจจุบัน=${row.status})` };

    // Upload the slip to the commission-slips bucket (foldered by earner).
    const up = await uploadToBucket(slipImage, "commission-slips", `${row.earner_admin_id}/freight`);
    if (!up.ok) return { ok: false, error: `อัปโหลดสลิปไม่สำเร็จ: ${up.error}` };

    // Flip approved → paid (guard folded into WHERE closes the double-pay race).
    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await admin
      .from("freight_commission_withdrawals")
      .update({ status: "paid", paid_at: now, paid_by: adminId, slip_storage_path: up.filename })
      .eq("id", id)
      .eq("status", "approved")
      .select("id")
      .maybeSingle<{ id: string }>();
    if (updErr) {
      console.error(`[freight-commission pay update] failed`, { code: updErr.code, message: updErr.message });
      await admin.storage.from("commission-slips").remove([up.filename]);
      return { ok: false, error: updErr.message };
    }
    if (!updated) {
      await admin.storage.from("commission-slips").remove([up.filename]);
      return { ok: false, error: "รายการนี้ถูกดำเนินการไปแล้ว (มีผู้ทำรายการพร้อมกัน)" };
    }

    await logAdminAction(adminId, "freight_commission.withdrawal_pay", "freight_commission_withdrawals", id, {
      earner_admin_id: row.earner_admin_id,
      net_thb: Number(row.net_thb ?? 0),
      slip: up.filename,
    });

    revalidatePath("/admin/commission/freight");
    return { ok: true, data: { id } };
  });
}

// ════════════════════════════════════════════════════════════════
// 8. getFreightCommissionState — dormant flag + the seeded tiers (for the UI).
// ════════════════════════════════════════════════════════════════

export type FreightCommissionTierView = {
  id: string;
  serviceKind: string;
  ratePct: number | null;
  flatThb: number | null;
  whtPct: number;
  isOwnerConfirmed: boolean;
  active: boolean;
  effectiveFrom: string;
  notes: string | null;
};

export type FreightCommissionState = {
  /** the dormant master flag — false = system OFF. */
  enabled: boolean;
  /** the seeded/active rate tiers (review view). */
  tiers: FreightCommissionTierView[];
  /** true when at least one active tier is NOT owner-confirmed (pending). */
  anyTierPending: boolean;
};

/** Read the dormant flag + the tier catalogue (for the admin page banner). */
export async function getFreightCommissionState(): Promise<AdminActionResult<FreightCommissionState>> {
  return withAdmin([...ROLES_VIEW], async () => {
    const enabled = await isFreightCommissionEnabled();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("freight_commission_tiers")
      .select("id, service_kind, rate_pct, flat_thb, wht_pct, is_owner_confirmed, active, effective_from, notes")
      .order("service_kind", { ascending: true })
      .order("effective_from", { ascending: false });
    if (error) {
      console.error(`[freight-commission state tiers] failed`, { code: error.code, message: error.message });
      return { ok: true as const, data: { enabled, tiers: [], anyTierPending: false } };
    }
    const tiers: FreightCommissionTierView[] = (data ?? []).map((r) => ({
      id: String(r.id),
      serviceKind: String(r.service_kind),
      ratePct: r.rate_pct == null ? null : Number(r.rate_pct),
      flatThb: r.flat_thb == null ? null : Number(r.flat_thb),
      whtPct: Number(r.wht_pct ?? 0),
      isOwnerConfirmed: Boolean(r.is_owner_confirmed),
      active: Boolean(r.active),
      effectiveFrom: String(r.effective_from ?? "").slice(0, 10),
      notes: r.notes ?? null,
    }));
    const anyTierPending = tiers.some((t) => t.active && !t.isOwnerConfirmed);
    return { ok: true as const, data: { enabled, tiers, anyTierPending } };
  });
}
