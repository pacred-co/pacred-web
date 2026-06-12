import "server-only";

/**
 * รายงานยอดการใช้ API จีน — READ-ONLY data layer.
 *
 * Faithful port of legacy `pcs-admin/report-api-china.php` (the menu entry
 * "ยอดการใช้ API จีน" in pcs-admin left-menu/OOP/Cargo/menu-report.php L30).
 * The legacy report counted China-search/API calls per day + per customer
 * out of `tb_history_key` (the 1688/Taobao/Tmall keyword + URL lookup log).
 *
 * ── Source note (verified from source, §0b) ──────────────────────────────
 * The legacy `tb_history_key` table WAS ported to Pacred (migration 0081,
 * lowercase cols: date · keyword · userid · type[1=keyword/2=1688/3=taobao/
 * 4=tmall] · apierror · categoryname) BUT it is EMPTY in prod (0 rows — the
 * legacy INSERT side-effect was never re-wired). The LIVE China-search log
 * is `public.tb_search_history` (migration 0102) — every customer China
 * search/API lookup is written there by actions/search.ts (the search-history
 * logger). Its `source` column carries the channel the legacy `type` column
 * encoded: "china-search.keyword" / "china-search.url" / "china-search.url-
 * detail" (search-history-logger.tsx). So we aggregate from tb_search_history.
 *
 * tb_search_history schema (migration 0102, verified):
 *   id uuid · user_id uuid (FK auth.users, nullable) · query text ·
 *   source text · result_count int · created_at timestamptz
 *
 * `user_id` is a Supabase auth uuid — resolved to (member_code · name) via
 * `public.profiles` (id uuid · member_code · first_name · last_name · phone).
 *
 * Two cuts, mirroring the legacy "ยอดการใช้ API จีน" (usage counts per day +
 * per customer):
 *   - per-DAY    : calls/day + error rate (result_count = 0)
 *   - per-CUSTOMER: calls/customer + last call + error count
 *
 * READ-ONLY — no writes. Uses createAdminClient() (RLS bypass) like the
 * sibling report data layers (actions/admin/reports-monitoring.ts).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  type DateRange,
  dayStartIso,
  dayEndIso,
} from "@/lib/admin/reports/types";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

// Match the row cap the sibling monitoring reports use — tb_search_history is
// a write-heavy log, so we aggregate in JS off a capped pull (PostgREST can't
// COUNT/GROUP without an RPC).
const LIMIT = 20_000;

/** One row of the per-day usage cut. */
export type ApiChinaDayRow = {
  id: string;
  /** YYYY-MM-DD (UTC). */
  day: string;
  /** Total China-search/API calls that day. */
  calls: number;
  /** Calls that returned 0 results (≈ API error / no match). */
  errors: number;
  /** Distinct customers that searched that day. */
  users: number;
};

/** One row of the per-customer usage cut. */
export type ApiChinaCustomerRow = {
  id: string;
  /** PR member code (or "ไม่ระบุ" if profile not found). */
  member_code: string;
  /** Customer display name. */
  customer_name: string;
  /** Total calls by this customer in the window. */
  calls: number;
  /** Calls that returned 0 results. */
  errors: number;
  /** Most-recent call timestamp (ISO). */
  last_call: string;
};

export type ApiChinaReport = {
  byDay: ApiChinaDayRow[];
  byCustomer: ApiChinaCustomerRow[];
  totals: {
    calls: number;
    errors: number;
    users: number;
  };
};

type RawSearch = {
  user_id: string | null;
  query: string | null;
  source: string | null;
  result_count: number | null;
  created_at: string | null;
};

/**
 * Fetch + aggregate the China-API usage report for a date window.
 *
 * `channel`:
 *   - "all"     → every tb_search_history row in the window
 *   - "keyword" → source starts with "china-search.keyword"
 *   - "url"     → source starts with "china-search.url" (1688/Taobao/Tmall URL)
 */
export async function getApiChinaReport(
  range: DateRange,
  channel: "all" | "keyword" | "url" = "all",
): Promise<Result<ApiChinaReport>> {
  try {
    const admin = createAdminClient();

    let q = admin
      .from("tb_search_history")
      .select("user_id, query, source, result_count, created_at")
      .gte("created_at", dayStartIso(range.from))
      .lte("created_at", dayEndIso(range.to))
      .order("created_at", { ascending: false })
      .limit(LIMIT);

    // Channel narrowing on the `source` prefix (the legacy `type` axis).
    if (channel === "keyword") q = q.like("source", "china-search.keyword%");
    else if (channel === "url") q = q.like("source", "china-search.url%");

    const { data, error } = await q;
    if (error) {
      logger.error("reports", "api-china tb_search_history query failed", error);
      console.error("[api-china] tb_search_history query failed", error.message);
      return { ok: false, error: error.message };
    }

    const raw = (data ?? []) as unknown as RawSearch[];

    // ── per-DAY aggregation ───────────────────────────────────────────────
    const dayMap = new Map<string, { calls: number; errors: number; users: Set<string> }>();
    // ── per-CUSTOMER aggregation ──────────────────────────────────────────
    const custMap = new Map<string, { calls: number; errors: number; last: string }>();

    let totalCalls = 0;
    let totalErrors = 0;
    const totalUsers = new Set<string>();

    for (const r of raw) {
      const ts = r.created_at ?? "";
      if (!ts) continue;
      const day = ts.slice(0, 10); // YYYY-MM-DD
      const isError = (r.result_count ?? 0) === 0;
      const uid = r.user_id ?? "";

      totalCalls += 1;
      if (isError) totalErrors += 1;
      if (uid) totalUsers.add(uid);

      // per-day
      const d = dayMap.get(day);
      if (d) {
        d.calls += 1;
        if (isError) d.errors += 1;
        if (uid) d.users.add(uid);
      } else {
        dayMap.set(day, {
          calls: 1,
          errors: isError ? 1 : 0,
          users: new Set(uid ? [uid] : []),
        });
      }

      // per-customer (rows arrive newest-first → first sighting = last call)
      if (uid) {
        const c = custMap.get(uid);
        if (c) {
          c.calls += 1;
          if (isError) c.errors += 1;
        } else {
          custMap.set(uid, { calls: 1, errors: isError ? 1 : 0, last: ts });
        }
      }
    }

    // Resolve user_id (auth uuid) → member_code + name via profiles.
    const uids = Array.from(custMap.keys());
    const profileMap = new Map<string, { member_code: string; name: string }>();
    if (uids.length > 0) {
      const { data: profiles, error: pErr } = await admin
        .from("profiles")
        .select("id, member_code, first_name, last_name")
        .in("id", uids)
        .limit(LIMIT);
      if (pErr) {
        logger.error("reports", "api-china profiles lookup failed", pErr);
        console.error("[api-china] profiles lookup failed", pErr.message);
      }
      type P = {
        id: string;
        member_code: string | null;
        first_name: string | null;
        last_name: string | null;
      };
      for (const p of (profiles ?? []) as P[]) {
        const name = [p.first_name ?? "", p.last_name ?? ""].join(" ").trim();
        profileMap.set(p.id, {
          member_code: p.member_code ?? "ไม่ระบุ",
          name: name || "—",
        });
      }
    }

    const byDay: ApiChinaDayRow[] = Array.from(dayMap.entries())
      .map(([day, v]) => ({
        id: day,
        day,
        calls: v.calls,
        errors: v.errors,
        users: v.users.size,
      }))
      .sort((a, b) => (a.day < b.day ? 1 : -1)); // newest day first

    const byCustomer: ApiChinaCustomerRow[] = Array.from(custMap.entries())
      .map(([uid, v]) => {
        const prof = profileMap.get(uid);
        return {
          id: uid,
          member_code: prof?.member_code ?? "ไม่ระบุ",
          customer_name: prof?.name ?? "—",
          calls: v.calls,
          errors: v.errors,
          last_call: v.last,
        };
      })
      .sort((a, b) => b.calls - a.calls); // busiest customer first

    return {
      ok: true,
      data: {
        byDay,
        byCustomer,
        totals: {
          calls: totalCalls,
          errors: totalErrors,
          users: totalUsers.size,
        },
      },
    };
  } catch (e) {
    logger.error("reports", "api-china crashed", e);
    console.error("[api-china] crashed", e);
    return { ok: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}
