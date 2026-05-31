/**
 * Re-sweep A2 #24 — Admin MONITORING reports data layer (faithful ports of
 * two legacy PCS Cargo `report-*.php` pages that had NO Pacred equivalent).
 *
 * These are READ-ONLY operational-monitoring reports (no writes). They sit
 * alongside the existing `actions/admin/reports.ts` fetchers and share its
 * `Result<T>` + `DateRange` contract + `createAdminClient()` (RLS-bypass).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 1) search-demand  ← legacy `pcs-admin/report-search.php` (179 LOC)
 *    "รายงานค้นหาสินค้า" — what customers search (keyword demand).
 *
 *    Legacy SQL (L71):
 *      SELECT *, COUNT(ID) FROM `tb_history_key` GROUP BY keyWord
 *      (aaSorting [[2,"desc"]] → ordered by COUNT desc client-side)
 *
 *    NB on legacy fidelity:
 *      - The legacy `$sql` is a FIXED `GROUP BY keyWord` — it does NOT apply
 *        the date-range / status filter the form renders (the form posts to a
 *        `report-search/` route but the inline query ignores `$startDate`/
 *        `$endDate`). We preserve the form's *intent* (date range narrows the
 *        rows; status narrows by apierror) — the analyst gets the filter the
 *        UI promises, which is strictly more faithful to what the screen says.
 *      - Legacy echoes `$row['data']` for the "วันที่ค้นหา" cell, but the
 *        migrated Postgres column is `date` (legacy MySQL `*` exposed a `date`
 *        column; `data` was a typo that rendered blank). We surface the most
 *        recent search `date` per keyword — the column the screen labels
 *        "วันที่ค้นหา".
 *
 *    Table: tb_history_key (migration 0081 L2752-2760, ALL LOWERCASE):
 *      id bigint · date timestamp · keyword text · userid varchar(10) ·
 *      type varchar(1) [1=keyword/2=1688/3=taobao/4=tmall] ·
 *      apierror varchar(1) · categoryname varchar(300)
 *    (Legacy PHP referenced `keyWord` camelCase; the migrated column is
 *     `keyword` lowercase — confirmed in 0081. Do NOT query `keyWord`.)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 2) sms-usage  ← legacy `pcs-admin/report-api-sms.php` (305 LOC)
 *    "รายงานการใช้ระบบ API SMS" — SMS send log / credit burn.
 *
 *    Legacy SQL (L63-64):
 *      SELECT * FROM `tb_sms_hs` WHERE DATE(date) > '2024-03-26'
 *      (+ optional ?type=1|2 → status filter; order [[0,'desc']])
 *
 *    NB on legacy fidelity:
 *      - The credit-balance card (L66-89) calls a LIVE partner API
 *        (`local-api.com/api/SMS/getCredit`) with a hard-coded apiSecret.
 *        That is a runtime side-call we cannot faithfully reproduce here
 *        (no credential in Pacred env + it's a network call, not table data).
 *        We instead surface a usage-derived summary: total sent, success /
 *        fail counts, and a credit-burn ESTIMATE at 160 chars/credit (the
 *        rate the legacy card states verbatim at L113). Marked ⚠️ in the page.
 *
 *    Table: tb_sms_hs (migration 0081 L5018-5024, ALL LOWERCASE):
 *      id bigint · date timestamp · msisdn text · message text ·
 *      status varchar(1) [1=สำเร็จ / 2=ไม่สำเร็จ — legacy stSMS() L495-501]
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  type DateRange,
  dayStartIso,
  dayEndIso,
} from "@/lib/admin/reports/types";

type Ok<T>  = { ok: true; data: T };
type Err    = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

// Match the row cap used by actions/admin/reports.ts. tb_history_key /
// tb_sms_hs are write-heavy log tables, so we aggregate in JS off a capped
// pull (the legacy DataTables paginates client-side off the same fetch).
const LIMIT = 20_000;

// ════════════════════════════════════════════════════════════════════════
// 1) search-demand — รายงานค้นหาสินค้า (legacy report-search.php)
// ════════════════════════════════════════════════════════════════════════

/** tb_history_key.type → channel label (migration 0081 comment L2767). */
export const SEARCH_TYPE_LABEL: Record<string, string> = {
  "1": "คำค้นหา",
  "2": "1688",
  "3": "Taobao",
  "4": "Tmall",
};

/** tb_history_key.apierror → API-status label (legacy hStatus dropdown L49). */
export const SEARCH_APIERROR_LABEL: Record<string, string> = {
  "1": "API มีปัญหา",
  "2": "API ไม่มีปัญหา",
};

export type SearchDemandRow = {
  /** Stable key for React (the keyword itself — unique after GROUP BY). */
  id: string;
  /** Most recent search date for this keyword in the window. */
  last_searched: string;
  /** The search term (legacy keyWord → migrated `keyword`). */
  keyword: string;
  /** Times searched in the window (legacy COUNT(ID)). */
  count: number;
};

/**
 * Filter shape mirrors the legacy form (report-search.php L44-62):
 *   - range  → date-range narrowing (preserves the form's stated intent)
 *   - status → "all" | "1" (apierror) | "2" (no apierror)
 */
export async function getSearchDemandReport(
  range: DateRange,
  status: string = "all",
): Promise<Result<SearchDemandRow[]>> {
  try {
    const admin = createAdminClient();

    let q = admin
      .from("tb_history_key")
      .select("date, keyword, apierror")
      .gte("date", dayStartIso(range.from))
      .lte("date", dayEndIso(range.to))
      .order("date", { ascending: false })
      .limit(LIMIT);

    // Legacy hStatus dropdown: "1" = API problem, "2" = no problem.
    if (status === "1" || status === "2") {
      q = q.eq("apierror", status);
    }

    const { data, error } = await q;
    if (error) {
      logger.error("reports", "search-demand tb_history_key query failed", error);
      return { ok: false, error: error.message };
    }

    type Raw = { date: string | null; keyword: string | null; apierror: string | null };
    const raw = (data ?? []) as Raw[];

    // GROUP BY keyword in JS (PostgREST can't COUNT/GROUP without an RPC).
    // Rows arrive newest-first, so the first sighting of a keyword carries
    // its most-recent date.
    const agg = new Map<string, { count: number; last: string }>();
    for (const r of raw) {
      const kw = (r.keyword ?? "").trim();
      if (!kw) continue;
      const cur = agg.get(kw);
      if (cur) {
        cur.count += 1;
      } else {
        agg.set(kw, { count: 1, last: r.date ?? "" });
      }
    }

    const rows: SearchDemandRow[] = Array.from(agg.entries())
      .map(([keyword, v]) => ({
        id: keyword,
        last_searched: v.last,
        keyword,
        count: v.count,
      }))
      // Legacy aaSorting [[2,"desc"]] → by count descending.
      .sort((a, b) => b.count - a.count);

    return { ok: true, data: rows };
  } catch (e) {
    logger.error("reports", "search-demand crashed", e);
    return { ok: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}

// ════════════════════════════════════════════════════════════════════════
// 2) sms-usage — รายงานการใช้ระบบ API SMS (legacy report-api-sms.php)
// ════════════════════════════════════════════════════════════════════════

/** tb_sms_hs.status → label (legacy stSMS() function.php L495-501). */
export const SMS_STATUS_LABEL: Record<string, string> = {
  "1": "สำเร็จ",
  "2": "ไม่สำเร็จ",
};

/** Legacy card constant (report-api-sms.php L113): 1 credit = 160 chars. */
export const SMS_CHARS_PER_CREDIT = 160;

export type SmsUsageRow = {
  id: string;
  /** Send timestamp (tb_sms_hs.date). */
  date: string;
  /** Recipient MSISDN (tb_sms_hs.msisdn). */
  msisdn: string;
  /** Message body (tb_sms_hs.message). */
  message: string;
  /** Send status '1'/'2' (tb_sms_hs.status). */
  status: string;
};

/**
 * Filter shape mirrors the legacy form (report-api-sms.php L136-156):
 *   - range  → date range (legacy hard-floored at >'2024-03-26'; we honour
 *              the user's chosen window, which is the form's actual contract)
 *   - status → "all" | "1" (สำเร็จ) | "2" (ผิดพลาด)
 */
export async function getSmsUsageReport(
  range: DateRange,
  status: string = "all",
): Promise<Result<SmsUsageRow[]>> {
  try {
    const admin = createAdminClient();

    let q = admin
      .from("tb_sms_hs")
      .select("id, date, msisdn, message, status")
      .gte("date", dayStartIso(range.from))
      .lte("date", dayEndIso(range.to))
      .order("date", { ascending: false })
      .limit(LIMIT);

    if (status === "1" || status === "2") {
      q = q.eq("status", status);
    }

    const { data, error } = await q;
    if (error) {
      logger.error("reports", "sms-usage tb_sms_hs query failed", error);
      return { ok: false, error: error.message };
    }

    type Raw = {
      id: number; date: string | null; msisdn: string | null;
      message: string | null; status: string | null;
    };
    const raw = (data ?? []) as Raw[];

    const rows: SmsUsageRow[] = raw.map((r) => ({
      id:      String(r.id),
      date:    r.date ?? "",
      msisdn:  r.msisdn ?? "",
      message: r.message ?? "",
      status:  r.status ?? "",
    }));

    return { ok: true, data: rows };
  } catch (e) {
    logger.error("reports", "sms-usage crashed", e);
    return { ok: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}
