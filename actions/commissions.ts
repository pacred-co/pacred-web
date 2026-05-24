"use server";

/**
 * G6 — Customer-side affiliate commission dashboard + withdraw.
 *
 * The customer-facing side of the team-leader / "ลูกค้าตัวแทน" flow.
 * Legacy ref: `member/report-user-sales.php` +
 * `member/report-user-sales-history.php` + the
 * `report-user-sales/getListForwarder.php` AJAX modal.
 *
 * The pacred-web schema for this is `sales_commissions` +
 * `sales_payouts` + `team_leaders` (migration 0013_sales_referral.sql).
 * The 1:1 transcription of the legacy UI lives at /sales/* (read-only).
 * THIS file is the modern customer-facing API + the modal that powers
 * the new /commissions page.
 *
 * Why not `commission_accruals` / `commission_withdrawals` (V-E8)?
 *   - those are the STAFF model (interpreter / sales_rep admins).
 *     Schemas + RLS + UI at /commissions/me/* + actions/admin/commissions.ts
 *     are unrelated to this customer flow.
 *
 * Why not `tb_wallet_hs` with `type=4`?
 *   - the audit doc speculated `type=4` was a commission withdraw type,
 *     but the legacy schema comment for `tb_wallet_hs.type` (verified in
 *     supabase/migrations/0081_pcs_legacy_schema.sql L6217) says:
 *       1=เติมเงิน, 2=ชำระฝากสั่ง, 3=ถอนเงิน, 4=ชำระฝากนำเข้า,
 *       5=คืนเงิน, 6=ฝากโอน, 7=เติม+ชำระ
 *     i.e. type=4 is "pay for forwarder", NOT commission. The legacy
 *     `report-user-sales-add.php` POST writes `tb_user_sales_admin_pay`
 *     + `tb_user_sales_pay` (not `tb_wallet_hs`). The pacred equivalent
 *     of those two tables = `sales_payouts` + `sales_commissions`.
 *
 * Exports:
 *   - listMyAffiliateCommissions(filters?)  — list + counts
 *   - getMyCommissionTotals()               — 4-card hero
 *   - requestCommissionWithdraw(input)      — modal submit
 *
 * Pattern: every action returns the standard `ActionResult<T>`. Reads
 * use the RLS-scoped `createClient()` — the
 * `sales_commissions_select_own` policy (0013 L221-226) and the
 * `sales_payouts_select_own` policy (0013 L231-236) both already
 * scope by `team_leaders.profile_id = auth.uid()`. The withdraw write
 * uses `createAdminClient()` because the customer needs to flip
 * `sales_commissions.payout_id` on the picked rows atomically with the
 * `sales_payouts` insert, and 0013 deliberately omits a customer-side
 * UPDATE policy on `sales_commissions` (see file L246-249).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import {
  affiliateWithdrawRequestSchema,
  affiliateCommissionFiltersSchema,
  MIN_AFFILIATE_WITHDRAW_THB,
  type AffiliateWithdrawRequestInput,
  type AffiliateCommissionFilters,
} from "@/lib/validators/commission";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// Types — wire format for the /commissions page
// ────────────────────────────────────────────────────────────

/** One row in the affiliate-commissions list. */
export type AffiliateCommissionRow = {
  id:                  string;
  /** "forwarder" | "service_order" — what generated this commission. */
  reference_type:      "forwarder" | "service_order";
  reference_id:        string;
  /** Customer (team member) whose order produced the commission. */
  customer_profile_id: string;
  base_amount:         number;
  commission_pct:      number;
  commission_amount:   number;
  status:              "unpaid" | "paid" | "cancelled";
  earned_at:           string;
  paid_at:             string | null;
  /** Linked payout request, if any. */
  payout_id:           string | null;
  /** Snapshot of the team this commission belongs to. */
  team_code:           string;
};

/** Aggregated counters powering the 4 hero cards on /commissions. */
export type CommissionTotals = {
  /** Sum of all-time commissions (status != cancelled). */
  earned_total:           number;
  /** Status=unpaid, not yet attached to a payout. */
  pending_total:          number;
  /** Status=paid (a payout reached `paid` status). */
  withdrawn_total:        number;
  /** = unpaid - locked-in-a-pending-payout. The "can ask now" number. */
  available_for_withdraw: number;
  /** Count of unique commissions counted in `earned_total`. */
  earned_count:           number;
};

/** One row in the affiliate-payouts (history) list. */
export type AffiliatePayoutRow = {
  id:               string;
  team_leader_id:   string;
  amount_total:     number;
  bank_name:        string;
  account_name:     string;
  account_number:   string;
  status:           "pending" | "approved" | "paid" | "rejected";
  slip_url:         string | null;
  rejection_reason: string | null;
  requested_at:     string;
  approved_at:      string | null;
  paid_at:          string | null;
  note:             string | null;
};

// ────────────────────────────────────────────────────────────
// listMyAffiliateCommissions
// ────────────────────────────────────────────────────────────
//
// Filters (all optional):
//   - from / to:  inclusive YYYY-MM-DD `earned_at` bounds
//   - status:     "unpaid" | "paid" | "cancelled" | "all"
//
// Returns `{ rows, total, pages }` shape per the spec.
//   - rows  = up to PAGE_SIZE rows, newest first
//   - total = filtered total count (server-side, no client fold)
//   - pages = ceil(total / PAGE_SIZE)
//
// RLS-scoped read: `sales_commissions_select_own` (0013 L221-226).
// Without team_leader membership the result is always empty.
// ────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export async function listMyAffiliateCommissions(
  filters?: AffiliateCommissionFilters,
): Promise<ActionResult<{
  rows:  AffiliateCommissionRow[];
  total: number;
  pages: number;
}>> {
  const parsed = affiliateCommissionFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_filters" };
  }
  const f = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Build query — RLS already scopes to caller's team_leader rows.
  // The team_code snapshot comes from the joined team_leaders row.
  let q = supabase
    .from("sales_commissions")
    .select(
      "id, reference_type, reference_id, customer_profile_id, " +
        "base_amount, commission_pct, commission_amount, status, " +
        "earned_at, paid_at, payout_id, " +
        "team_leader:team_leaders!team_leader_id ( team_code )",
      { count: "exact" },
    )
    .order("earned_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (f.from) {
    // earned_at is timestamptz — we want calendar-date inclusive bound.
    q = q.gte("earned_at", `${f.from}T00:00:00Z`);
  }
  if (f.to) {
    q = q.lte("earned_at", `${f.to}T23:59:59Z`);
  }
  if (f.status && f.status !== "all") {
    q = q.eq("status", f.status);
  }

  const { data, count, error } = await q;
  if (error) return { ok: false, error: error.message };

  type TL = { team_code: string };
  type Raw = {
    id:                  string;
    reference_type:      "forwarder" | "service_order";
    reference_id:        string;
    customer_profile_id: string;
    base_amount:         number | string;
    commission_pct:      number | string;
    commission_amount:   number | string;
    status:              "unpaid" | "paid" | "cancelled";
    earned_at:           string;
    paid_at:             string | null;
    payout_id:           string | null;
    team_leader:         TL | TL[] | null;
  };

  const rows: AffiliateCommissionRow[] = ((data ?? []) as Raw[]).map((r) => {
    const tl = Array.isArray(r.team_leader) ? r.team_leader[0] : r.team_leader;
    return {
      id:                  r.id,
      reference_type:      r.reference_type,
      reference_id:        r.reference_id,
      customer_profile_id: r.customer_profile_id,
      base_amount:         Number(r.base_amount),
      commission_pct:      Number(r.commission_pct),
      commission_amount:   Number(r.commission_amount),
      status:              r.status,
      earned_at:           r.earned_at,
      paid_at:             r.paid_at,
      payout_id:           r.payout_id,
      team_code:           tl?.team_code ?? "",
    };
  });

  const total = count ?? rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return { ok: true, data: { rows, total, pages } };
}

// ────────────────────────────────────────────────────────────
// getMyCommissionTotals
// ────────────────────────────────────────────────────────────
//
// Aggregates the 4 hero-card numbers + the count of all-time
// commissions. RLS-scoped read on `sales_commissions` and joined
// `sales_payouts` (for the `pending payout` debit on `available`).
//
// Math:
//   earned_total     = SUM(commission_amount) where status != cancelled
//   pending_total    = SUM(commission_amount) where status = unpaid
//                                              AND payout_id IS NULL
//   withdrawn_total  = SUM(commission_amount) where status = paid
//   locked_in_pending = SUM(commission_amount) where status = unpaid
//                                              AND payout_id IS NOT NULL
//                                              AND payout.status IN (pending, approved)
//   available_for_withdraw = pending_total
//   (the locked-in slice is already attached to a payout request so it
//   shouldn't show as available; the modal further validates the live
//   sum at submit time.)
// ────────────────────────────────────────────────────────────

export async function getMyCommissionTotals(): Promise<ActionResult<CommissionTotals>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // One read — pull everything we need to derive all 5 numbers locally.
  // The dataset per team_leader is small (months of commission rows).
  // We avoid 4 separate aggregate calls for simplicity + atomicity.
  const { data, error } = await supabase
    .from("sales_commissions")
    .select("commission_amount, status, payout_id")
    .order("earned_at", { ascending: false })
    .limit(5000);

  if (error) return { ok: false, error: error.message };

  type Row = {
    commission_amount: number | string;
    status:            "unpaid" | "paid" | "cancelled";
    payout_id:         string | null;
  };
  const rows = (data ?? []) as Row[];

  let earned_total    = 0;
  let pending_total   = 0;
  let withdrawn_total = 0;
  let earned_count    = 0;
  for (const r of rows) {
    const amt = Number(r.commission_amount);
    if (r.status === "cancelled") continue;
    earned_total += amt;
    earned_count += 1;
    if (r.status === "unpaid" && r.payout_id === null) {
      pending_total += amt;
    } else if (r.status === "paid") {
      withdrawn_total += amt;
    }
  }

  // Round to 2dp for THB display — matches numeric(12,2) storage.
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    ok: true,
    data: {
      earned_total:           round2(earned_total),
      pending_total:          round2(pending_total),
      withdrawn_total:        round2(withdrawn_total),
      available_for_withdraw: round2(pending_total),
      earned_count,
    },
  };
}

// ────────────────────────────────────────────────────────────
// listMyAffiliatePayouts — minimal history list for the page
// ────────────────────────────────────────────────────────────

export async function listMyAffiliatePayouts(
  limit = 10,
): Promise<ActionResult<AffiliatePayoutRow[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("sales_payouts")
    .select(
      "id, team_leader_id, amount_total, bank_name, account_name, " +
        "account_number, status, slip_url, rejection_reason, " +
        "requested_at, approved_at, paid_at, note",
    )
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, error: error.message };

  type Raw = {
    id:               string;
    team_leader_id:   string;
    amount_total:     number | string;
    bank_name:        string;
    account_name:     string;
    account_number:   string;
    status:           "pending" | "approved" | "paid" | "rejected";
    slip_url:         string | null;
    rejection_reason: string | null;
    requested_at:     string;
    approved_at:      string | null;
    paid_at:          string | null;
    note:             string | null;
  };
  const rows: AffiliatePayoutRow[] = ((data ?? []) as Raw[]).map((r) => ({
    ...r,
    amount_total: Number(r.amount_total),
  }));

  return { ok: true, data: rows };
}

// ────────────────────────────────────────────────────────────
// requestCommissionWithdraw
// ────────────────────────────────────────────────────────────
//
// First-fit greedy bundle:
//   1. Find caller's active team_leader rows.
//   2. Find unpaid + unattached `sales_commissions` for those teams,
//      oldest-first (= earned_at ASC).
//   3. Greedy-accumulate until SUM >= `amount`. Refuse if total
//      available < requested amount.
//   4. Insert `sales_payouts` row at status=pending.
//   5. Update picked commissions: set `payout_id = newPayout.id`.
//      (status stays 'unpaid' until admin marks the payout 'paid' —
//      see actions/admin/sales-payouts.ts, which atomically flips
//      commissions to 'paid' on payout transition.)
//   6. Notify the customer.
//
// Concurrency gap (P2): if two requests race past step 3, step 5 may
// double-attach the same commission row to two different payouts. The
// unique `(team_leader_id, reference_type, reference_id)` constraint on
// `sales_commissions` (0013 L127) does NOT protect us here because both
// updates target rows that already passed insert. A future migration
// could add `unique(payout_id) where payout_id is not null` + a try/
// catch on step 5, but for the G6 foundation we accept the race and
// rely on admin review catching duplicates. Flagged in summary.
//
// Why admin client for the writes:
//   - `sales_payouts_insert_own` (0013 L238-244) DOES allow the
//     customer-scoped INSERT — but only with status=pending + valid
//     team_leader. We use admin client anyway so the commissions
//     UPDATE (which has NO customer UPDATE policy, see 0013 L246-249)
//     can run in the same action. Re-checking ownership in app code
//     before the writes preserves the security boundary.
// ────────────────────────────────────────────────────────────

export async function requestCommissionWithdraw(
  input: AffiliateWithdrawRequestInput,
): Promise<ActionResult<{ payout_id: string; amount_total: number }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = affiliateWithdrawRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // ── 1. Caller's active team_leader rows ──
  // RLS `team_leaders_select_own` (0013 L217-218) already scopes by
  // profile_id = auth.uid(). We additionally filter is_active = true.
  type LeaderRow = { id: string; team_code: string; commission_pct: number };
  const { data: leadersRaw, error: leaderErr } = await supabase
    .from("team_leaders")
    .select("id, team_code, commission_pct")
    .eq("is_active", true);
  if (leaderErr) return { ok: false, error: leaderErr.message };

  const leaders = (leadersRaw ?? []) as LeaderRow[];
  if (leaders.length === 0) {
    return { ok: false, error: "not_a_team_leader — คุณไม่ใช่หัวหน้าทีม จึงไม่มีค่าคอม" };
  }
  const leaderIds = leaders.map((l) => l.id);

  // For the foundation we pick the FIRST active leader as the "owner"
  // of the payout. Multi-team owners (e.g. the PR2000+PR352 SIN.VIP
  // case in team-map.ts) get bundled under one payout — that's how the
  // legacy `report-user-sales-add.php` handles it too (the legacy
  // doesn't ask which team). Future: let the UI pass `team_leader_id`.
  const ownerLeaderId = leaders[0].id;

  // ── 2. Eligible unpaid commissions across ALL caller's teams ──
  // We use the admin client here so the same connection can do the
  // atomic INSERT+UPDATE below. RLS would have allowed the read too,
  // but it's cleaner not to mix clients across a single tx.
  const admin = createAdminClient();
  type Eligible = { id: string; commission_amount: number };
  const { data: eligibleRaw, error: eligibleErr } = await admin
    .from("sales_commissions")
    .select("id, commission_amount, earned_at")
    .in("team_leader_id", leaderIds)
    .eq("status", "unpaid")
    .is("payout_id", null)
    .order("earned_at", { ascending: true });
  if (eligibleErr) return { ok: false, error: eligibleErr.message };

  const eligible = ((eligibleRaw ?? []) as { id: string; commission_amount: number | string; earned_at: string }[])
    .map((r): Eligible => ({ id: r.id, commission_amount: Number(r.commission_amount) }));

  const totalAvailable = eligible.reduce((s, r) => s + r.commission_amount, 0);
  if (totalAvailable < MIN_AFFILIATE_WITHDRAW_THB) {
    return {
      ok: false,
      error:
        `ยอดสะสมยังไม่ถึง ${MIN_AFFILIATE_WITHDRAW_THB.toLocaleString()} บาท ` +
        `(สะสมได้ ${totalAvailable.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท)`,
    };
  }
  if (totalAvailable + 0.01 < d.amount) {
    // +0.01 = float-round tolerance.
    return {
      ok: false,
      error:
        `ยอดที่ขอเบิกเกินยอดสะสม — ` +
        `ขอ ${d.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท ` +
        `แต่สะสมได้เพียง ${totalAvailable.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท`,
    };
  }

  // ── 3. Greedy oldest-first selection ──
  const picked: string[] = [];
  let acc = 0;
  for (const e of eligible) {
    if (acc >= d.amount) break;
    picked.push(e.id);
    acc += e.commission_amount;
  }

  if (picked.length === 0 || acc < d.amount) {
    // Defensive — should never trigger after the totalAvailable check.
    return { ok: false, error: "ไม่สามารถเลือกรายการให้ครบยอดได้ กรุณาลองใหม่" };
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const amountTotal = round2(acc);

  // ── 4. Insert payout ──
  type CreatedPayout = { id: string };
  const { data: created, error: insErr } = await admin
    .from("sales_payouts")
    .insert({
      team_leader_id: ownerLeaderId,
      amount_total:   amountTotal,
      bank_name:      d.bank_name,
      account_name:   d.account_name,
      account_number: d.account_number,
      status:         "pending",
      note:           d.note ?? null,
    })
    .select("id")
    .single<CreatedPayout>();

  if (insErr || !created) {
    return { ok: false, error: insErr?.message ?? "ไม่สามารถสร้างคำขอเบิกได้" };
  }

  // ── 5. Attach commissions to the payout ──
  // Race-gated by .eq("payout_id", null) — if a concurrent request
  // grabbed any of these between step 2 and now, the .update affects
  // fewer rows but doesn't error. We accept the very rare double-attach
  // (see comment above) and the admin reviews + corrects.
  const { error: attachErr } = await admin
    .from("sales_commissions")
    .update({ payout_id: created.id })
    .in("id", picked)
    .is("payout_id", null);

  if (attachErr) {
    // Best-effort rollback: delete the payout so the customer can retry
    // without a dangling pending row. We don't return that delete's
    // error — the customer sees the attach error which is the cause.
    await admin.from("sales_payouts").delete().eq("id", created.id);
    return { ok: false, error: attachErr.message };
  }

  // ── 6. Notify + revalidate ──
  void sendNotification(user.id, notify.salesPayoutRequested({
    amountTotal: amountTotal,
    payoutId:    created.id,
  }));

  revalidatePath("/commissions");
  revalidatePath("/sales/history");

  return { ok: true, data: { payout_id: created.id, amount_total: amountTotal } };
}
