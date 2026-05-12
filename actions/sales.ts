"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestPayoutSchema, type RequestPayoutInput } from "@/lib/validators/sales";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type TeamLeaderRole = {
  id: string;
  team_code: string;
  commission_pct: number;
  is_active: boolean;
};

export type SalesCommission = {
  id: string;
  team_leader_id: string;
  reference_type: "forwarder" | "service_order";
  reference_id: string;
  customer_profile_id: string;
  base_amount: number;
  commission_pct: number;
  commission_amount: number;
  status: "unpaid" | "paid" | "cancelled";
  earned_at: string;
  paid_at: string | null;
  payout_id: string | null;
  // Joined customer for display
  customer_member_code: string | null;
  customer_name: string | null;
};

export type SalesPayout = {
  id: string;
  team_leader_id: string;
  amount_total: number;
  bank_name: string;
  account_name: string;
  account_number: string;
  status: "pending" | "approved" | "paid" | "rejected";
  rejection_reason: string | null;
  slip_url: string | null;
  requested_at: string;
  paid_at: string | null;
};

// ────────────────────────────────────────────────────────────
// READ: am I a team leader?
// ────────────────────────────────────────────────────────────
export async function getMyTeamRoles(): Promise<ActionResult<TeamLeaderRole[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("team_leaders")
    .select("id, team_code, commission_pct, is_active")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as TeamLeaderRole[] };
}

// ────────────────────────────────────────────────────────────
// READ: commissions for one of my teams
// ────────────────────────────────────────────────────────────
export async function listMyCommissions(opts?: {
  status?: SalesCommission["status"][];
  teamLeaderId?: string;
  limit?: number;
}): Promise<ActionResult<SalesCommission[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Find leader rows for this profile (so RLS-friendly we filter in app layer too)
  const { data: leaderRows } = await supabase
    .from("team_leaders")
    .select("id")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  if (!leaderRows || leaderRows.length === 0) {
    return { ok: true, data: [] };
  }
  const leaderIds = leaderRows.map((r) => r.id);
  const filterLeaderIds = opts?.teamLeaderId
    ? leaderIds.filter((id) => id === opts.teamLeaderId)
    : leaderIds;

  if (filterLeaderIds.length === 0) {
    return { ok: true, data: [] };
  }

  let q = supabase
    .from("sales_commissions")
    .select(
      `id, team_leader_id, reference_type, reference_id,
       customer_profile_id, base_amount, commission_pct, commission_amount,
       status, earned_at, paid_at, payout_id,
       customer:profiles!customer_profile_id ( member_code, first_name, last_name, company_name )`,
    )
    .in("team_leader_id", filterLeaderIds)
    .order("earned_at", { ascending: false })
    .limit(opts?.limit ?? 200);

  if (opts?.status && opts.status.length) {
    q = q.in("status", opts.status);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  type Row = Omit<SalesCommission, "customer_member_code" | "customer_name"> & {
    customer: { member_code: string | null; first_name: string | null; last_name: string | null; company_name: string | null } | null;
  };
  const out = (data ?? []).map((r: Row) => ({
    id: r.id,
    team_leader_id: r.team_leader_id,
    reference_type: r.reference_type,
    reference_id: r.reference_id,
    customer_profile_id: r.customer_profile_id,
    base_amount: Number(r.base_amount),
    commission_pct: Number(r.commission_pct),
    commission_amount: Number(r.commission_amount),
    status: r.status,
    earned_at: r.earned_at,
    paid_at: r.paid_at,
    payout_id: r.payout_id,
    customer_member_code: r.customer?.member_code ?? null,
    customer_name:
      r.customer?.first_name || r.customer?.last_name
        ? `${r.customer?.first_name ?? ""} ${r.customer?.last_name ?? ""}`.trim()
        : r.customer?.company_name ?? null,
  })) as SalesCommission[];

  return { ok: true, data: out };
}

// ────────────────────────────────────────────────────────────
// READ: my payout history
// ────────────────────────────────────────────────────────────
export async function listMyPayouts(limit = 50): Promise<ActionResult<SalesPayout[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data: leaderRows } = await supabase
    .from("team_leaders")
    .select("id")
    .eq("profile_id", user.id);
  if (!leaderRows || leaderRows.length === 0) return { ok: true, data: [] };
  const leaderIds = leaderRows.map((r) => r.id);

  const { data, error } = await supabase
    .from("sales_payouts")
    .select("id, team_leader_id, amount_total, bank_name, account_name, account_number, status, rejection_reason, slip_url, requested_at, paid_at")
    .in("team_leader_id", leaderIds)
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as SalesPayout[] };
}

// ────────────────────────────────────────────────────────────
// MUTATE: request payout (atomic via admin client)
// ────────────────────────────────────────────────────────────
export async function requestPayout(input: RequestPayoutInput): Promise<ActionResult<{ payout_id: string; amount_total: number }>> {
  const parsed = requestPayoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Read commissions with user-scoped client first to verify ownership
  // before stepping up to the admin client for the atomic 2-step.
  const { data: commissions, error: cErr } = await supabase
    .from("sales_commissions")
    .select("id, team_leader_id, commission_amount, status, team_leader:team_leaders!team_leader_id ( profile_id )")
    .in("id", d.commission_ids);

  if (cErr) return { ok: false, error: cErr.message };
  if (!commissions || commissions.length === 0) {
    return { ok: false, error: "no_commissions" };
  }
  if (commissions.length !== d.commission_ids.length) {
    return { ok: false, error: "some_commissions_not_found" };
  }

  type CommissionRow = {
    id: string;
    team_leader_id: string;
    commission_amount: number;
    status: string;
    team_leader: { profile_id: string } | { profile_id: string }[] | null;
  };
  // All commissions must:
  // - belong to the same team_leader
  // - be unpaid
  // - be owned by this user
  const firstLeaderId = (commissions[0] as CommissionRow).team_leader_id;
  for (const c of commissions as CommissionRow[]) {
    if (c.team_leader_id !== firstLeaderId) {
      return { ok: false, error: "mixed_leaders_not_allowed" };
    }
    if (c.status !== "unpaid") {
      return { ok: false, error: "some_already_paid" };
    }
    const tl = Array.isArray(c.team_leader) ? c.team_leader[0] : c.team_leader;
    if (tl?.profile_id !== user.id) {
      return { ok: false, error: "not_your_commission" };
    }
  }

  const amount_total = (commissions as CommissionRow[]).reduce((s, c) => s + Number(c.commission_amount), 0);
  if (amount_total <= 0) return { ok: false, error: "zero_total" };

  // Step up to admin client for the atomic insert + update
  const admin = createAdminClient();

  const { data: payout, error: payErr } = await admin
    .from("sales_payouts")
    .insert({
      team_leader_id: firstLeaderId,
      amount_total,
      bank_name:      d.bank_name,
      account_name:   d.account_name,
      account_number: d.account_number,
      note:           d.note ?? null,
      status:         "pending",
    })
    .select("id")
    .single<{ id: string }>();

  if (payErr || !payout) {
    return { ok: false, error: payErr?.message ?? "payout_insert_failed" };
  }

  const { error: updErr } = await admin
    .from("sales_commissions")
    .update({ payout_id: payout.id })
    .in("id", d.commission_ids)
    .eq("status", "unpaid");          // guard against double-claim race

  if (updErr) {
    // Rollback the payout if we can't link any commissions
    await admin.from("sales_payouts").delete().eq("id", payout.id);
    return { ok: false, error: updErr.message };
  }

  revalidatePath("/sales");
  revalidatePath("/sales/report");
  revalidatePath("/sales/history");
  return { ok: true, data: { payout_id: payout.id, amount_total } };
}
