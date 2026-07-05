"use server";

/**
 * actions/admin/near-churn.ts — inactive customers report (win-back lane).
 *
 * Per CEO directive 2026-06-01 (CLAUDE.md PM):
 *   "ทำธุรกิจโดยไม่มีพี่ลงไปทำ" + "scale via CRM + Marketing + standardised
 *    workflow + training"
 *
 * Surfaces customers that USED to be active but haven't placed an order
 * in N days — actionable list for the sales rep to call/LINE / win-back.
 *
 * Cohort definition (per business sense):
 *   · userActive='1' (still a valid Pacred customer, not suspended)
 *   · last tb_forwarder.fdate is OLDER than the cutoff (e.g. 90 days ago)
 *   · AT LEAST 1 historical delivered order (fstatus=7) — proves "real
 *     customer who used to be active" (excludes newly-signed leads who
 *     never placed an order · those = /admin/leads).
 *
 * Output: ranked by lifetime margin (most valuable first) — sales reps
 * should call the highest-LTV inactive customers first.
 *
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type NearChurnRow = {
  userid:           string;
  fullName:         string;
  userTel:          string | null;
  userEmail:        string | null;
  userActive:       string | null;
  adminIDSale:      string | null;
  lastOrderDate:    string | null;    // last tb_forwarder.fdate
  daysSinceLast:    number;            // computed at query time
  totalDelivered:   number;            // count fstatus=7
  totalRevenue:     number;            // sum ftotalprice (delivered)
  totalMargin:      number;            // sum margin (delivered)
};

export type NearChurnReport = {
  asOf:           string;
  daysIdle:       number;              // the cutoff used
  totalRows:      number;
  totalRevenue:   number;
  totalMargin:    number;
  byRep:          { adminID: string; count: number; revenue: number; margin: number }[];
  rows:           NearChurnRow[];
};

// ────────────────────────────────────────────────────────────────────────
// 1. Main entry
// ────────────────────────────────────────────────────────────────────────

export async function getNearChurnReport(opts: {
  daysIdle: number;
  limit?: number;
}): Promise<NearChurnReport> {
  await requireAdmin(["super", "accounting", "sales_admin"]);
  const admin = createAdminClient();
  const daysIdle = Math.max(1, Math.min(opts.daysIdle, 365 * 5));
  const limit    = Math.max(1, Math.min(opts.limit ?? 200, 1000));
  const asOf     = new Date().toISOString();
  const cutoff   = new Date(Date.now() - daysIdle * 86_400_000).toISOString();

  // ── 1. Pull delivered forwarder rows · 2-step strategy to keep query small ──
  //
  // 2026-06-05 (perf): the dev server was hanging on a `range(0, 49_999)`
  // pull against prod's ~47k delivered rows (PostgREST round-trip + ssr
  // serialization ate 30+ seconds). 2-step plan instead:
  //   step 1: pull recent deliveries (fdate >= cutoff − 2y) — gives
  //           lifetime aggregates for the cohort that COULD be near-churn.
  //           A customer with last order > 2 years ago is "lost", not
  //           "near-churn" — out of scope for win-back anyway.
  //   step 2: that's it. JS aggregates the result; the size cap is
  //           naturally bounded by the date window now.
  //
  // The window is `daysIdle + 24 months` so a customer who placed an
  // order at the cutoff is still captured · 24-month LTV is plenty for
  // ranking. Cap at 30k for safety (tested fast on prod 2026-06-05).
  type RawFwd = {
    userid: string | null;
    fdate: string | null;
    ftotalprice: number | string | null;
    fcosttotalprice: number | string | null;
    fdiscount: number | string | null;
  };
  const windowStart = new Date(
    Date.now() - (daysIdle + 730) * 86_400_000,
  ).toISOString();
  const { data: fwdRaw, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("userid, fdate, ftotalprice, fcosttotalprice, fdiscount")
    .eq("fstatus", "7")
    .gte("fdate", windowStart)
    .not("userid", "is", null)
    .order("fdate", { ascending: false })
    .range(0, 29_999);
  if (fwdErr) {
    console.error("[near-churn tb_forwarder] failed", { code: fwdErr.code, message: fwdErr.message });
  }
  const fwd = (fwdRaw ?? []) as RawFwd[];

  type PerUser = {
    lastDate: string | null;
    count:    number;
    revenue:  number;
    margin:   number;
  };
  const byUser = new Map<string, PerUser>();
  for (const r of fwd) {
    if (!r.userid) continue;
    const ftotalprice     = Number(r.ftotalprice ?? 0);
    const fcosttotalprice = Number(r.fcosttotalprice ?? 0);
    const fdiscount       = Number(r.fdiscount ?? 0);
    const margin          = ftotalprice - fcosttotalprice - fdiscount;
    const cur = byUser.get(r.userid) ?? { lastDate: null, count: 0, revenue: 0, margin: 0 };
    if (!cur.lastDate || (r.fdate && r.fdate > cur.lastDate)) cur.lastDate = r.fdate;
    cur.count   += 1;
    cur.revenue += ftotalprice;
    cur.margin  += margin;
    byUser.set(r.userid, cur);
  }

  // ── 2. Filter to inactive (last order < cutoff) — these are near-churn ──
  const inactiveUserids: string[] = [];
  for (const [userid, agg] of byUser.entries()) {
    if (!agg.lastDate) continue;
    if (agg.lastDate < cutoff) inactiveUserids.push(userid);
  }

  if (inactiveUserids.length === 0) {
    return {
      asOf, daysIdle, totalRows: 0, totalRevenue: 0, totalMargin: 0,
      byRep: [], rows: [],
    };
  }

  // ── 3. Pull user master data in batch — tb_users (chunk to avoid IN-list limit) ──
  type RawUser = {
    userID: string | null;
    userName: string | null;
    userLastName: string | null;
    userCompany: string | null;
    userTel: string | null;
    userEmail: string | null;
    userActive: string | null;
    adminIDSale: string | null;
  };
  const usersById = new Map<string, RawUser>();
  const CHUNK = 500;
  for (let i = 0; i < inactiveUserids.length; i += CHUNK) {
    const slice = inactiveUserids.slice(i, i + CHUNK);
    const { data: chunkRaw, error: usrErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userCompany, userTel, userEmail, userActive, adminIDSale")
      .in("userID", slice);
    if (usrErr) {
      console.error("[near-churn tb_users chunk] failed", {
        chunkStart: i, code: usrErr.code, message: usrErr.message,
      });
      continue;
    }
    for (const u of ((chunkRaw ?? []) as RawUser[])) {
      if (u.userID) usersById.set(u.userID, u);
    }
  }

  // นิติบุคคล → company name (not the contact person). One batched .in() lookup.
  const corpNames = await fetchCorporateNameMap(admin, inactiveUserids);

  // ── 4. Enrich + apply userActive filter ──
  const now = Date.now();
  const candidates: NearChurnRow[] = [];
  let totalRevenue = 0;
  let totalMargin  = 0;
  const repAgg = new Map<string, { count: number; revenue: number; margin: number }>();

  for (const userid of inactiveUserids) {
    const u = usersById.get(userid);
    if (!u) continue;
    // userActive='1' = valid customer · '0' / NULL = suspended / cold lead
    if (u.userActive !== "1") continue;
    const agg = byUser.get(userid)!;
    const lastDate = agg.lastDate!;
    const daysSinceLast = Math.floor((now - new Date(lastDate).getTime()) / 86_400_000);
    const row: NearChurnRow = {
      userid,
      fullName:       resolveBillingIdentity({
        userCompany: u.userCompany,
        userName: u.userName,
        userLastName: u.userLastName,
        corp: corpRowFromName(corpNames.get(userid)),
      }).name || "—",
      userTel:        u.userTel,
      userEmail:      u.userEmail,
      userActive:     u.userActive,
      adminIDSale:    u.adminIDSale,
      lastOrderDate:  lastDate,
      daysSinceLast,
      totalDelivered: agg.count,
      totalRevenue:   Math.round(agg.revenue * 100) / 100,
      totalMargin:    Math.round(agg.margin * 100) / 100,
    };
    candidates.push(row);
    totalRevenue += agg.revenue;
    totalMargin  += agg.margin;
    if (u.adminIDSale) {
      const r = repAgg.get(u.adminIDSale) ?? { count: 0, revenue: 0, margin: 0 };
      r.count   += 1;
      r.revenue += agg.revenue;
      r.margin  += agg.margin;
      repAgg.set(u.adminIDSale, r);
    }
  }

  // Sort by lifetime margin DESC (highest-LTV first = highest-priority win-back).
  candidates.sort((a, b) => b.totalMargin - a.totalMargin);

  const byRep = Array.from(repAgg.entries())
    .map(([adminID, agg]) => ({
      adminID,
      count:    agg.count,
      revenue:  Math.round(agg.revenue * 100) / 100,
      margin:   Math.round(agg.margin * 100) / 100,
    }))
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 20);

  return {
    asOf,
    daysIdle,
    totalRows:    candidates.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalMargin:  Math.round(totalMargin * 100) / 100,
    byRep,
    rows:         candidates.slice(0, limit),
  };
}
