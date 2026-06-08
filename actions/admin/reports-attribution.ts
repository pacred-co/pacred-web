"use server";

/**
 * Lead-source / acquisition ATTRIBUTION report — data layer.
 *
 * READ-ONLY (no writes). Surfaces which acquisition channel drives
 * leads → orders → revenue, so marketing isn't blind. CEO North-Star item
 * (scale via marketing/CRM). Pairs with the page at
 * /admin/reports/lead-source.
 *
 * ── Honest scope ──
 * No ad-spend / Meta-Ads / UTM / fb_ad_touchpoints table exists in the DB,
 * so this report computes NO ROAS / cost-per-lead (omitted, not fabricated).
 * It groups REAL customer rows by the registration-channel dimension that
 * does exist (tb_users.userregisterwith) + the referral dimension
 * (tb_users.userrecom), and joins each bucket to downstream ฝากนำเข้า orders
 * (tb_forwarder) for a source→lead→order→revenue funnel.
 *
 * ── Method ──
 *   1) Pull tb_users rows registered in the date window (capped).
 *   2) Bucket by userregisterwith → leads + cold counts; collect userid set.
 *   3) Batch-pull tb_forwarder rows for that userid set (chunked .in()) and
 *      fold revenue + first-order presence back per userid → per channel.
 *   4) Same bucket pass over userrecom for the top-referrers list.
 *
 * Every Supabase query destructures { data, error } (§0c); a failed sub-query
 * degrades the affected metric (0 / empty) and logs — the report never 500s.
 *
 * Shares the Result<T> + DateRange contract + createAdminClient() (RLS-bypass)
 * with the sibling actions/admin/reports-monitoring.ts.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { DateRange } from "@/lib/admin/reports/types";
import { dayStartIso, dayEndIso } from "@/lib/admin/reports/types";
import {
  registerWithLabel,
  referralLabel,
  type AttributionReport,
  type SourceRow,
  type ReferralRow,
} from "./reports-attribution-types";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

/** Cap the customer pull — keeps the page snappy on the 8.9k-customer table. */
const USER_LIMIT = 20_000;
/** Postgrest `.in()` list size cap per chunk (URL-length safe). */
const IN_CHUNK = 300;
/** Top-N referrers shown in the secondary table. */
const TOP_REFERRERS = 15;

type UserRow = {
  userid: string;
  userregisterwith: string | null;
  userrecom: string | null;
  useractive: string | null;
};

type FwdRow = {
  userid: string | null;
  ftotalprice: number | null;
};

/** Split an array into fixed-size chunks. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function getAttributionReport(
  range: DateRange,
): Promise<Result<AttributionReport>> {
  try {
    const admin = createAdminClient();
    const fromTs = dayStartIso(range.from);
    const toTs = dayEndIso(range.to);

    // ── 1) Customers registered in the window ──────────────────────────────
    const { data: userData, error: userErr } = await admin
      .from("tb_users")
      .select("userid, userregisterwith, userrecom, useractive")
      .gte("userregistered", fromTs)
      .lte("userregistered", toTs)
      .limit(USER_LIMIT);

    if (userErr) {
      logger.error("reports", "attribution tb_users pull failed", userErr);
      return { ok: false, error: userErr.message };
    }

    const users = (userData ?? []) as UserRow[];
    const capped = users.length >= USER_LIMIT;

    // Empty window → return a clean empty payload (page shows empty-state).
    if (users.length === 0) {
      return {
        ok: true,
        data: {
          sources: [],
          referrals: [],
          totalLeads: 0,
          totalCold: 0,
          totalConverted: 0,
          totalRevenue: 0,
          capped: false,
          empty: true,
        },
      };
    }

    // ── 2) Bucket by registration channel + referral; index userid→channel ──
    type Bucket = { leads: number; cold: number; converted: number; revenue: number };
    const sourceBuckets = new Map<string, Bucket>();
    const referralCounts = new Map<string, number>();
    const userToChannel = new Map<string, string>();

    for (const u of users) {
      const ch = (u.userregisterwith ?? "").trim() || "(unknown)";
      const b = sourceBuckets.get(ch) ?? { leads: 0, cold: 0, converted: 0, revenue: 0 };
      b.leads += 1;
      if ((u.useractive ?? "").trim() === "") b.cold += 1;
      sourceBuckets.set(ch, b);
      if (u.userid) userToChannel.set(u.userid, ch);

      const recom = (u.userrecom ?? "").trim();
      if (recom) referralCounts.set(recom, (referralCounts.get(recom) ?? 0) + 1);
    }

    // ── 3) Join to forwarder orders (chunked .in) → revenue + conversion ────
    //   Tracks per-userid whether they have ≥1 order (so a customer counts as
    //   "converted" once, regardless of order count) + total revenue.
    const userids = Array.from(userToChannel.keys());
    const orderedUsers = new Set<string>();
    const revenueByUser = new Map<string, number>();
    let fwdFailed = false;

    await Promise.all(
      chunk(userids, IN_CHUNK).map(async (ids) => {
        const { data: fwdData, error: fwdErr } = await admin
          .from("tb_forwarder")
          .select("userid, ftotalprice")
          .in("userid", ids)
          .neq("fstatus", "99"); // exclude cancelled
        if (fwdErr) {
          fwdFailed = true;
          logger.error("reports", "attribution tb_forwarder join failed", fwdErr);
          return;
        }
        for (const f of (fwdData ?? []) as FwdRow[]) {
          if (!f.userid) continue;
          orderedUsers.add(f.userid);
          revenueByUser.set(
            f.userid,
            (revenueByUser.get(f.userid) ?? 0) + Number(f.ftotalprice ?? 0),
          );
        }
      }),
    );

    if (!fwdFailed) {
      for (const uid of orderedUsers) {
        const ch = userToChannel.get(uid);
        if (!ch) continue;
        const b = sourceBuckets.get(ch);
        if (b) b.converted += 1;
      }
      for (const [uid, rev] of revenueByUser) {
        const ch = userToChannel.get(uid);
        if (!ch) continue;
        const b = sourceBuckets.get(ch);
        if (b) b.revenue += rev;
      }
    }

    // ── 4) Finalize sorted rows + grand totals ─────────────────────────────
    const sources: SourceRow[] = Array.from(sourceBuckets.entries())
      .map(([key, b]) => ({
        key,
        label: registerWithLabel(key === "(unknown)" ? "" : key),
        leads: b.leads,
        cold: b.cold,
        converted: b.converted,
        revenue: b.revenue,
        conv_pct: b.leads > 0 ? (b.converted / b.leads) * 100 : 0,
      }))
      .sort((a, b) => b.leads - a.leads);

    const referrals: ReferralRow[] = Array.from(referralCounts.entries())
      .map(([key, leads]) => ({ key, label: referralLabel(key), leads }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, TOP_REFERRERS);

    const totalLeads = sources.reduce((s, r) => s + r.leads, 0);
    const totalCold = sources.reduce((s, r) => s + r.cold, 0);
    const totalConverted = sources.reduce((s, r) => s + r.converted, 0);
    const totalRevenue = sources.reduce((s, r) => s + r.revenue, 0);

    return {
      ok: true,
      data: {
        sources,
        referrals,
        totalLeads,
        totalCold,
        totalConverted,
        totalRevenue,
        capped,
        empty: false,
      },
    };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "attribution report threw", err);
    return { ok: false, error: err.message };
  }
}
