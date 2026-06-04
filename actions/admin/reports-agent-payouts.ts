"use server";

/**
 * actions/admin/reports-agent-payouts.ts — the ADMIN-side, read-only VIEW of
 * sales-agent commission + payout history (re-sweep A2 #22).
 *
 * This is the report that was MISSING. The existing slot
 * `/admin/reports/user-sales-history` is a NAME-COLLISION: it reuses the legacy
 * URL but actually serves the V-G6 #4 per-customer 3-service cohort SUM — NOT
 * the agent-commission payout report. The real legacy agent-commission report
 * lives in two PHP files; this action faithfully ports BOTH as one read:
 *
 *   1. pcs-admin/report-user-sales.php (the per-team commission summary —
 *      `?page=THADAVIP|SINVIP|OOAEOMVIP|DECHAVIP|SWAN`):
 *        SELECT … FROM tb_user_sales us
 *          LEFT JOIN tb_forwarder f ON f.ID = us.IDF
 *          LEFT JOIN tb_users     u ON f.userID = u.userID
 *          WHERE u.coID = '<team>' AND usStatus = 1   (unwithdrawn rows)
 *      → footer: ค่าขนส่งจีน Σ(fTotalPrice−fDiscount) · ส่วนแบ่ง × $percen ·
 *        หักภาษี 3% · ส่วนแบ่งสุทธิ.  (L316-319 — the same math as
 *        lib/sales-commission/calc.ts.)
 *
 *   2. pcs-admin/report-user-sales-history.php (the payout-history list):
 *        SELECT ID, DATE(date), TIME(date), imagesSlip, amount, adminCreate,
 *               userIDMain, status FROM tb_user_sales_admin_pay
 *      → one row per payout batch · status 2=รอดำเนินการ / 3=เบิกจ่ายแล้ว
 *        (nameStatusUserPay · function.php:1868).
 *
 * The canonical commission SOT (ADR-0020 · docs/decisions/0020-commission-sot.md)
 * is the legacy `tb_user_sales` / `tb_user_sales_admin_pay` / `tb_user_sales_pay`
 * family — the SAME tables the live earn→withdraw E2E (actions/commissions-tb.ts)
 * and the admin pay-out (`/admin/sales-payouts`, status 2→3) write to. This
 * report only READS them.
 *
 * Casing landmine (learnings/php-port-patterns.md): `tb_users` / `tb_forwarder`
 * carry camelCase money/key columns on prod (`coID`, `userID`, `ftotalprice`,
 * `fdiscount` — verified live in commissions-tb.ts), while the `tb_user_sales*`
 * family is all-lowercase (`usstatus`, `useridmain`, `amount`, `status`,
 * `admincreate`, `date`, `imagesslip`). Read both exactly as commissions-tb.ts
 * already does — never guess.
 *
 *   - Reads via createAdminClient() (RLS-bypass — admin only · tb_* is
 *     service_role-locked).
 *   - The date range filters the PAYOUT HISTORY (tb_user_sales_admin_pay.date),
 *     mirroring report-user-sales-history.php which lists batches by date. The
 *     per-agent commission summary aggregates across ALL of an agent's rows
 *     (unwithdrawn earned + every payout batch), independent of the range —
 *     same as report-user-sales.php which sums the team's open balance.
 *   - §0c: every Supabase query destructures { data, error } + logs on failure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { dayStartIso, dayEndIso, type DateRange } from "@/lib/admin/reports/types";
import {
  computeCommission,
  sumGross,
  SALES_MIN_WITHDRAWAL_THB,
} from "@/lib/sales-commission/calc";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

const LIMIT = 1000;

// NB: this is a "use server" file — it may export ONLY `type`s and async
// functions (Next 16 rejects value exports like `export const X = {}`). The
// payout-status label map (nameStatusUserPay · function.php:1868) is a UI
// concern, so it lives in the page (agent-payouts/page.tsx), NOT here.
//
// tb_user_sales_admin_pay.status: 2=รอดำเนินการ (customer-requested, awaiting
// admin pay-out) · 3=เบิกจ่ายแล้ว (paid). (1=ยังไม่เบิกจ่าย is a
// tb_user_sales.usstatus value, not a payout-batch status.)

// ── Per-agent commission summary row ─────────────────────────────────────
export type AgentSummaryRow = {
  /** member code of the team leader (PR888 / PR2000 / …). */
  member_code: string;
  /** legacy coID — the value joined against tb_users.coID (THADA.VIP / …). */
  team_code: string;
  /** the per-team commission rate (0.01 for all five whitelist agents). */
  percen: number;
  /** Σ(fTotalPrice−fDiscount) over UNWITHDRAWN earned rows (usstatus='1'). */
  open_gross: number;
  /** commission on the open gross (= open_gross × percen). */
  open_commission: number;
  /** 3% WHT on the open commission. */
  open_wht: number;
  /** net the agent could still withdraw now (open_commission − open_wht). */
  open_net: number;
  /** number of unwithdrawn earned rows. */
  open_rows: number;
  /** Σ amount of payout batches still รอดำเนินการ (status='2'). */
  pending_payout: number;
  /** count of pending (status='2') payout batches. */
  pending_count: number;
  /** Σ amount of payout batches เบิกจ่ายแล้ว (status='3'). */
  paid_payout: number;
  /** count of paid (status='3') payout batches. */
  paid_count: number;
};

// ── One payout-history batch (report-user-sales-history.php list) ────────
export type PayoutHistoryRow = {
  /** tb_user_sales_admin_pay.id. */
  id: number;
  /** the request/create timestamp (tb_user_sales_admin_pay.date). */
  date: string | null;
  /** the team coID (useridmain — THADA.VIP / …). */
  team_code: string;
  /** the team-leader member code resolved from the whitelist (PR888 / …). */
  member_code: string;
  /** net amount paid/owed (tb_user_sales_admin_pay.amount). */
  amount: number;
  /** who created the request (admincreate — agent's own code for self-request). */
  created_by: string | null;
  /** whether a transfer slip is attached. */
  has_slip: boolean;
  /** raw status '2'/'3' (label via PAYOUT_STATUS_LABEL). */
  status: string;
};

export type AgentPayoutReport = {
  agents: AgentSummaryRow[];
  history: PayoutHistoryRow[];
  /** echoed so the page can show the min-withdrawal gate. */
  minWithdrawalThb: number;
};

// ── The legacy team whitelist (team-map.ts is a customer-portal module that
//    imports React-navigation-adjacent code, so we keep an admin-local copy of
//    the same five rows here to avoid pulling a (protected)-lane import into an
//    admin action). Source = team-map.ts SALES_AGENTS, verbatim. ────────────
const TEAM_WHITELIST: ReadonlyArray<{
  memberCode: string;
  teamCode: string;
  percen: number;
}> = [
  { memberCode: "PR888", teamCode: "THADA.VIP", percen: 0.01 },
  { memberCode: "PR2000", teamCode: "SIN.VIP", percen: 0.01 },
  { memberCode: "PR352", teamCode: "SIN.VIP", percen: 0.01 },
  { memberCode: "PR2678", teamCode: "OOAEOM.VIP", percen: 0.01 },
  { memberCode: "PR4155", teamCode: "SWAN", percen: 0.01 },
] as const;

/** First whitelist member-code for a given coID (for the history label). */
function memberCodeForTeam(teamCode: string): string {
  return TEAM_WHITELIST.find((t) => t.teamCode === teamCode)?.memberCode ?? "—";
}

/**
 * Build the admin agent-payout report.
 *
 * @param range filters the PAYOUT HISTORY by tb_user_sales_admin_pay.date.
 */
export async function getAgentPayoutReport(
  range: DateRange,
): Promise<Result<AgentPayoutReport>> {
  try {
    const admin = createAdminClient();

    // The distinct teams (coIDs) we report on — dedupe the whitelist (SIN.VIP
    // appears twice: PR352 + PR2000).
    const teamCodes = Array.from(new Set(TEAM_WHITELIST.map((t) => t.teamCode)));
    const percenByTeam = new Map(TEAM_WHITELIST.map((t) => [t.teamCode, t.percen]));

    // ── Step 1 — every team member id (tb_users WHERE coID IN (teams)) ──
    // Mirrors report-user-sales.php's LEFT JOIN tb_users … WHERE u.coID.
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, coID")
      .in("coID", teamCodes);
    if (usersErr) {
      logger.error("reports", "agent-payouts tb_users team lookup failed", usersErr);
      return { ok: false, error: usersErr.message };
    }
    // userid → coID, so each forwarder can be attributed to its team.
    const teamByUserId = new Map<string, string>();
    for (const u of (usersRaw ?? []) as { userID: string; coID: string | null }[]) {
      if (u.userID && u.coID) teamByUserId.set(u.userID, u.coID);
    }

    // ── Step 2 — the UNWITHDRAWN earned rows (tb_user_sales usstatus='1') ──
    // report-user-sales.php default query: WHERE usStatus=1 (the open balance).
    const { data: usRaw, error: usErr } = await admin
      .from("tb_user_sales")
      .select("id, idf")
      .eq("usstatus", "1")
      .limit(50_000);
    if (usErr) {
      logger.error("reports", "agent-payouts tb_user_sales open rows failed", usErr);
      return { ok: false, error: usErr.message };
    }
    const usRows = (usRaw ?? []) as { id: number; idf: number }[];

    // ── Step 3 — the forwarders behind those earned rows (fTotalPrice/fDiscount
    //    + userid so we can attribute each to a team). ──
    const forwarderIds = Array.from(new Set(usRows.map((r) => r.idf).filter(Boolean)));
    type FwdRow = {
      id: number;
      userid: string | null;
      ftotalprice: number | string | null;
      fdiscount: number | string | null;
    };
    const fwdById = new Map<number, FwdRow>();
    // Chunk the .in() so a very large open balance never blows the URL length.
    for (let i = 0; i < forwarderIds.length; i += 1000) {
      const chunk = forwarderIds.slice(i, i + 1000);
      if (chunk.length === 0) break;
      const { data: fwdRaw, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select("id, userid, ftotalprice, fdiscount")
        .in("id", chunk);
      if (fwdErr) {
        logger.error("reports", "agent-payouts tb_forwarder lookup failed", fwdErr);
        return { ok: false, error: fwdErr.message };
      }
      for (const f of (fwdRaw ?? []) as unknown as FwdRow[]) fwdById.set(f.id, f);
    }

    // Bucket the open gross + row-count per team (only rows whose forwarder
    // belongs to a member of that team — the LEFT JOIN … WHERE u.coID filter).
    const openGrossRowsByTeam = new Map<string, FwdRow[]>();
    const openRowCountByTeam = new Map<string, number>();
    for (const us of usRows) {
      const f = fwdById.get(us.idf);
      if (!f || !f.userid) continue;
      const team = teamByUserId.get(f.userid);
      if (!team) continue; // forwarder not owned by any reported team
      const arr = openGrossRowsByTeam.get(team) ?? [];
      arr.push(f);
      openGrossRowsByTeam.set(team, arr);
      openRowCountByTeam.set(team, (openRowCountByTeam.get(team) ?? 0) + 1);
    }

    // ── Step 4 — every payout batch (tb_user_sales_admin_pay) for these teams.
    //    The summary needs ALL batches (pending + paid sums per team); the
    //    history list needs the date-windowed subset. We fetch once (windowed
    //    for the list) PLUS the full set for the per-team sums. To keep it one
    //    pass, fetch the full set for the teams and date-filter in TS for the
    //    history rows — the batch count is tiny (one row per withdrawal). ──
    const { data: payRaw, error: payErr } = await admin
      .from("tb_user_sales_admin_pay")
      .select("id, useridmain, amount, admincreate, imagesslip, date, status")
      .in("useridmain", teamCodes)
      .order("date", { ascending: false })
      .limit(50_000);
    if (payErr) {
      logger.error("reports", "agent-payouts tb_user_sales_admin_pay failed", payErr);
      return { ok: false, error: payErr.message };
    }
    type PayRow = {
      id: number;
      useridmain: string;
      amount: number | string | null;
      admincreate: string | null;
      imagesslip: string | null;
      date: string | null;
      status: string | null;
    };
    const payRows = (payRaw ?? []) as unknown as PayRow[];

    // Per-team pending/paid sums (status '2' / '3'), over ALL batches.
    const pendingPayoutByTeam = new Map<string, number>();
    const pendingCountByTeam = new Map<string, number>();
    const paidPayoutByTeam = new Map<string, number>();
    const paidCountByTeam = new Map<string, number>();
    for (const p of payRows) {
      const amt = Number(p.amount ?? 0);
      if (p.status === "2") {
        pendingPayoutByTeam.set(p.useridmain, (pendingPayoutByTeam.get(p.useridmain) ?? 0) + amt);
        pendingCountByTeam.set(p.useridmain, (pendingCountByTeam.get(p.useridmain) ?? 0) + 1);
      } else if (p.status === "3") {
        paidPayoutByTeam.set(p.useridmain, (paidPayoutByTeam.get(p.useridmain) ?? 0) + amt);
        paidCountByTeam.set(p.useridmain, (paidCountByTeam.get(p.useridmain) ?? 0) + 1);
      }
    }

    // ── Assemble the per-agent summary (one row per distinct team). ──
    const agents: AgentSummaryRow[] = teamCodes
      .map((team) => {
        const percen = percenByTeam.get(team) ?? 0.01;
        const gross = sumGross(openGrossRowsByTeam.get(team) ?? []);
        const breakdown = computeCommission(gross, percen);
        return {
          member_code: memberCodeForTeam(team),
          team_code: team,
          percen,
          open_gross: breakdown.gross,
          open_commission: breakdown.commission,
          open_wht: breakdown.wht,
          open_net: breakdown.net,
          open_rows: openRowCountByTeam.get(team) ?? 0,
          pending_payout: pendingPayoutByTeam.get(team) ?? 0,
          pending_count: pendingCountByTeam.get(team) ?? 0,
          paid_payout: paidPayoutByTeam.get(team) ?? 0,
          paid_count: paidCountByTeam.get(team) ?? 0,
        };
      })
      // Sort by the live obligation (pending + open net) descending — the rows
      // that need an admin's attention first.
      .sort((a, b) => b.pending_payout + b.open_net - (a.pending_payout + a.open_net));

    // ── Assemble the payout history (date-windowed batches). ──
    const fromIso = dayStartIso(range.from);
    const toIso = dayEndIso(range.to);
    const history: PayoutHistoryRow[] = payRows
      .filter((p) => {
        if (!p.date) return false;
        return p.date >= fromIso && p.date <= toIso;
      })
      .map((p) => ({
        id: p.id,
        date: p.date,
        team_code: p.useridmain,
        member_code: memberCodeForTeam(p.useridmain),
        amount: Number(p.amount ?? 0),
        created_by: p.admincreate,
        has_slip: !!(p.imagesslip && p.imagesslip.trim() !== ""),
        status: p.status ?? "2",
      }))
      .slice(0, LIMIT);

    return {
      ok: true,
      data: { agents, history, minWithdrawalThb: SALES_MIN_WITHDRAWAL_THB },
    };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "agent-payouts threw", err);
    return { ok: false, error: err.message };
  }
}
