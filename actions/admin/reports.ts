/**
 * Gap #8 — Admin reports data layer (faithful ports of legacy PCS Cargo
 * `report-*.php` SQL → Supabase reads).
 *
 * P0-20 (2026-05-30) — RETARGET ALL 5 FETCHERS to legacy `tb_*` tables.
 *   The previous shape pointed every fetcher at the REBUILT empty tables
 *   (`forwarders` / `service_orders` / `yuan_payments` / `otp_codes` /
 *   `profiles`). Prod has 0 rows in those tables but 21,950 forwarders,
 *   8,898 customers, thousands of payments live in the legacy `tb_*`
 *   schema. The pages route-200'd but rendered ฿0 / 0 rows.
 *
 *   See: docs/research/legacy-gap-2026-05-30/_MASTER.md P0-20
 *      + docs/research/legacy-gap-2026-05-30/adm-13-reports.md L80-126
 *      + docs/research/handoff-2026-05-30-night-resplit.md §3 item 5
 *
 *   Schema cites (migration 0081_pcs_legacy_schema.sql + 0113 rename):
 *     - tb_forwarder      0081 L1598-1709 (lowercase columns — NOT renamed)
 *     - tb_header_order   0081 L2506-2561 (lowercase columns — NOT renamed)
 *     - tb_payment        0081 L3611-3634 (lowercase columns — NOT renamed)
 *     - tb_users          0081 L5828-5869 + 0113 renamed to camelCase
 *                         (userID, userName, userLastName, userTel, etc.)
 *     - tb_users_otp      0081 L6056-6060 (lowercase: id, userid, date)
 *     - tb_admin          0081 + 0113 renamed to camelCase
 *                         (adminID, adminName, adminLastName, adminNickname)
 *
 *   Status filter conventions (mirror legacy reports + sales-by-rep view):
 *     - tb_forwarder.fstatus      '7' = ส่งสำเร็จ (delivered) — sales rev recog'd
 *                                 '6' = เตรียมส่ง (out for delivery) — also counted
 *                                 'cancel' is encoded as a separate status; we
 *                                 exclude via `.in()` allow-list rather than
 *                                 `.neq()` (legacy uses NOT-EQUALS but the
 *                                 cancelled marker is encoded inconsistently).
 *     - tb_header_order.hstatus   '5' = สำเร็จ · '6' = ยกเลิก
 *     - tb_payment.paystatus      '1' = pending · '2' = approved · '3' = refund
 *     - tb_users_otp              success-only log (no status — every row = a
 *                                 successful verification per legacy
 *                                 report-otp-success.php)
 *
 *   Date columns (the legacy column varies per table):
 *     - tb_forwarder.fdate (created) · fdatestatus7 (delivered)
 *     - tb_header_order.hdate (created)
 *     - tb_payment.paydate (request) · paydateadmin (approved)
 *     - tb_users_otp.date (verification time)
 *
 *   VAT 7% column REMOVED (was invented):
 *     The previous shape derived a `vat7 = profit * 0.07` cell that legacy
 *     never shows. Per legacy-gap-2026-05-30/adm-13-reports.md L123-126 +
 *     L164 ("VAT7 injected · violates copy 100% first"), the legacy
 *     `report-forwarder-profit.php` and `report-payments-profit.php` show
 *     pre-computed `fProfitTotal` / `payProfitTHB` ONLY — no VAT cell. We
 *     keep `vat7` on the row type at 0 for back-compat (page still renders
 *     the column, value is 0 so the cell shows "—"). A future cleanup can
 *     drop the column entirely from the page; this avoids a same-diff page
 *     edit and keeps the rewrite scope strictly to `actions/admin/reports.ts`.
 *
 * Every fetcher still:
 *   - Reads via `createAdminClient()` (RLS-bypass — admin only).
 *   - Returns `{ ok: true, data } | { ok: false; error }` per house conventions.
 *   - Filters on inclusive date range via `dayStartIso(from) .. dayEndIso(to)`.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { logger } from "@/lib/logger";
import {
  type DateRange,
  dayStartIso,
  dayEndIso,
} from "@/lib/admin/reports/types";

type Ok<T>  = { ok: true; data: T };
type Err    = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

const LIMIT = 10_000;

/**
 * Legacy `round_up($value, 2)` — `include/function.php` L86-90:
 *   ceil($value * pow(10,2)) / pow(10,2)
 * It is a true round-UP (ceiling) to 2 dp, NOT round-half-up. JS `Math.round`
 * differs (and would mis-round penny ties); `Math.ceil` matches legacy
 * penny-for-penny. Mirrors the existing precedent in actions/admin/cart.ts:514
 * + service-orders-spawn.ts:203 (`Math.ceil(x * 100) / 100`).
 */
function roundUp2(value: number): number {
  return Math.ceil(Number(value || 0) * 100) / 100;
}

// ════════════════════════════════════════════════════════════════════════
// 1) Monthly sales-by-rep (ยอดพนักงานขาย) — legacy: report-sale.php
//
//    🔧 Theme-reports (2026-05-31 · owner #4 "เอาตาม legacy ก่อน"):
//    legacy is built on `tb_sales_report` — a denormalised SNAPSHOT table, NOT
//    a live `tb_forwarder` scan. report-sale.php:
//      • Step A (L7-34) — backfill on page load: for every `tb_forwarder`
//        where `fStatus='7' AND fDateStatus7 >= '2022-02-01'` not already in
//        tb_sales_report → INSERT (srDate=fDateStatus7, fID=ID,
//        srAdminIDSale=adminIDSale). Snapshots the rep AT DELIVERY + the
//        delivery date. → `backfillSalesReport()` below.
//      • Step B (L112-128) — list query:
//          SELECT YEAR/MONTH(srDate), COUNT(sr.ID), adminName, adminLastName,
//                 adminID, SUM(fWeight), SUM(fVolume),
//                 SUM(fTotalPrice)+SUM(fTransportPrice)+SUM(fPriceUpdate) AS price
//          FROM tb_sales_report sr
//          LEFT JOIN tb_admin     a ON a.adminID = sr.srAdminIDSale
//          LEFT JOIN tb_forwarder f ON f.ID = sr.fID
//          WHERE f.fStatus=7
//          GROUP BY MONTH(srDate), sr.srAdminIDSale ORDER BY sr.ID DESC
//        Revenue = ΣfTotalPrice + ΣfTransportPrice + ΣfPriceUpdate (3 cols).
//        Commission = price × 0.01 (1%, L142). Bucket key = MONTH(srDate).
//        Rep = tb_sales_report.srAdminIDSale (snapshot) → tb_admin for name.
//
//    Columns: tb_sales_report / tb_forwarder = lowercase (0081);
//             tb_admin = camelCase (0113: adminID, adminName, adminLastName).
// ════════════════════════════════════════════════════════════════════════

export type SalesMonthlyRow = {
  rep_id:        string;        // tb_sales_report.sradminidsale (snapshot at delivery)
  rep_name:      string;        // legacy: "adminName adminLastName [adminID]"
  month:         string;        // YYYY-MM (from srdate)
  order_count:   number;
  weight_kg:     number;
  volume_cbm:    number;
  revenue_thb:   number;        // Σftotalprice + Σftransportprice + Σfpriceupdate
  commission_thb: number;       // 1% of revenue (legacy: price * 0.01)
};

/** Fetch all `tb_forwarder` rows for a set of ids in `.in()`-safe chunks. */
async function fetchForwardersByIds(
  admin: ReturnType<typeof createAdminClient>,
  ids: number[],
  cols: string,
): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  const CHUNK = 300;
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("tb_forwarder")
      .select(cols)
      .in("id", slice);
    if (error) return { data: [], error: error.message };
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }
  return { data: out, error: null };
}

/**
 * Port of report-sale.php Step A (L7-34) — idempotent backfill of the
 * `tb_sales_report` snapshot table. For every delivered forwarder
 * (`fstatus='7' AND fdatestatus7 >= '2022-02-01'`) not yet snapshotted,
 * INSERT one row (srdate=fdatestatus7, fid=ID, sradminidsale=adminIDSale of
 * the customer's current rep). Only inserts MISSING rows — safe to call on
 * every page load. Returns the number of rows inserted.
 */
export async function backfillSalesReport(): Promise<Result<{ inserted: number }>> {
  try {
    const admin = createAdminClient();

    // 1) Eligible delivered forwarders (id + userid + delivery date).
    const { data: fRows, error: fErr } = await admin
      .from("tb_forwarder")
      .select("id, userid, fdatestatus7")
      .eq("fstatus", "7")
      .gte("fdatestatus7", "2022-02-01")
      .limit(100_000);
    if (fErr) {
      logger.error("reports", "backfillSalesReport tb_forwarder scan failed", fErr);
      return { ok: false, error: fErr.message };
    }
    type FRow = { id: number; userid: string | null; fdatestatus7: string | null };
    const eligible = (fRows ?? []) as unknown as FRow[];
    if (eligible.length === 0) return { ok: true, data: { inserted: 0 } };

    // 2) Already-snapshotted fids (so we only insert the missing ones).
    const { data: srRows, error: srErr } = await admin
      .from("tb_sales_report")
      .select("fid")
      .limit(200_000);
    if (srErr) {
      logger.error("reports", "backfillSalesReport tb_sales_report scan failed", srErr);
      return { ok: false, error: srErr.message };
    }
    const existing = new Set<number>(((srRows ?? []) as Array<{ fid: number | null }>)
      .map((r) => Number(r.fid)).filter((n) => Number.isFinite(n)));

    const missing = eligible.filter((f) => !existing.has(Number(f.id)));
    if (missing.length === 0) return { ok: true, data: { inserted: 0 } };

    // 3) Resolve the customer's current rep (adminIDSale) for the missing rows.
    const userids = Array.from(new Set(
      missing.map((f) => f.userid).filter((u): u is string => Boolean(u)),
    ));
    const userToRep = new Map<string, string>();
    const UCHUNK = 300;
    for (let i = 0; i < userids.length; i += UCHUNK) {
      const slice = userids.slice(i, i + UCHUNK);
      const { data: uRows, error: uErr } = await admin
        .from("tb_users")
        .select("userID, adminIDSale")
        .in("userID", slice);
      if (uErr) {
        logger.error("reports", "backfillSalesReport tb_users lookup failed", uErr);
        return { ok: false, error: uErr.message };
      }
      for (const u of (uRows ?? []) as Array<{ userID: string; adminIDSale: string | null }>) {
        userToRep.set(u.userID, u.adminIDSale ?? "");
      }
    }

    // 4) INSERT the missing snapshot rows in batches.
    const payload = missing.map((f) => ({
      srdate:        f.fdatestatus7,
      fid:           f.id,
      sradminidsale: (f.userid ? userToRep.get(f.userid) : "") || "",
    }));
    let inserted = 0;
    const ICHUNK = 500;
    for (let i = 0; i < payload.length; i += ICHUNK) {
      const slice = payload.slice(i, i + ICHUNK);
      const { error: insErr } = await admin.from("tb_sales_report").insert(slice);
      if (insErr) {
        logger.error("reports", "backfillSalesReport insert failed", insErr);
        return { ok: false, error: insErr.message };
      }
      inserted += slice.length;
    }
    return { ok: true, data: { inserted } };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "backfillSalesReport threw", err);
    return { ok: false, error: err.message };
  }
}

export async function getSalesMonthlyReport(range: DateRange): Promise<Result<SalesMonthlyRow[]>> {
  try {
    const admin = createAdminClient();

    // Step 1 — pull the snapshot rows in the window (keyed on srdate =
    // delivery date), per legacy report-sale.php L112-128.
    const { data: srData, error: srErr } = await admin
      .from("tb_sales_report")
      .select("id, srdate, fid, sradminidsale")
      .gte("srdate", dayStartIso(range.from))
      .lte("srdate", dayEndIso(range.to))
      .limit(100_000);
    if (srErr) {
      logger.error("reports", "sales-monthly tb_sales_report query failed", srErr);
      return { ok: false, error: srErr.message };
    }
    type SrRow = { id: number; srdate: string | null; fid: number | null; sradminidsale: string | null };
    const snapshots = (srData ?? []) as unknown as SrRow[];
    if (snapshots.length === 0) return { ok: true, data: [] };

    // Step 2 — JOIN tb_forwarder on fid=id (require fstatus='7', pull the
    // 3 revenue columns + weight/volume). Chunked `.in()` over fids.
    const fids = Array.from(new Set(
      snapshots.map((s) => s.fid).filter((n): n is number => Number.isFinite(n as number)),
    ));
    const { data: fData, error: fErr } = await fetchForwardersByIds(
      admin, fids,
      "id, fstatus, ftotalprice, ftransportprice, fpriceupdate, fweight, fvolume",
    );
    if (fErr) {
      logger.error("reports", "sales-monthly tb_forwarder join failed", new Error(fErr));
      return { ok: false, error: fErr };
    }
    type FRow = {
      id: number; fstatus: string;
      ftotalprice: number | null; ftransportprice: number | null; fpriceupdate: number | null;
      fweight: number | null; fvolume: number | null;
    };
    const fwById = new Map<number, FRow>(
      (fData as unknown as FRow[]).map((f) => [Number(f.id), f]),
    );

    // Step 3 — resolve rep name from tb_admin (camelCase) by sradminidsale.
    const repIds = Array.from(new Set(
      snapshots.map((s) => s.sradminidsale).filter((r): r is string => Boolean(r)),
    ));
    const repName = new Map<string, string>();
    if (repIds.length > 0) {
      const ACHUNK = 300;
      for (let i = 0; i < repIds.length; i += ACHUNK) {
        const slice = repIds.slice(i, i + ACHUNK);
        const { data: aRows, error: aErr } = await admin
          .from("tb_admin")
          .select("adminID, adminName, adminLastName")
          .in("adminID", slice);
        if (aErr) {
          logger.error("reports", "sales-monthly tb_admin lookup failed", aErr);
          // non-fatal — fall back to raw id
        }
        for (const a of (aRows ?? []) as Array<{ adminID: string; adminName: string | null; adminLastName: string | null }>) {
          const full = [a.adminName, a.adminLastName].filter(Boolean).join(" ");
          repName.set(a.adminID, full ? `${full} [${a.adminID}]` : a.adminID);
        }
      }
    }

    // Step 4 — aggregate per (month(srdate), sradminidsale). Only count rows
    // whose joined forwarder is fstatus='7' (legacy WHERE f.fStatus=7).
    const aggMap = new Map<string, SalesMonthlyRow>();
    for (const s of snapshots) {
      const fw = s.fid != null ? fwById.get(Number(s.fid)) : undefined;
      if (!fw || fw.fstatus !== "7") continue;          // legacy WHERE f.fStatus=7
      const repId = s.sradminidsale || "";
      const month = s.srdate ? s.srdate.slice(0, 7) : "—";
      const key   = `${month}::${repId}`;
      const a = aggMap.get(key) ?? {
        rep_id:   repId || "(ไม่มี sales rep)",
        rep_name: repName.get(repId) || (repId || "(ไม่มี sales rep)"),
        month,
        order_count: 0, weight_kg: 0, volume_cbm: 0,
        revenue_thb: 0, commission_thb: 0,
      };
      a.order_count += 1;
      a.weight_kg   += Number(fw.fweight ?? 0);
      a.volume_cbm  += Number(fw.fvolume ?? 0);
      // Revenue = fTotalPrice + fTransportPrice + fPriceUpdate (legacy 3-col sum).
      a.revenue_thb += Number(fw.ftotalprice ?? 0)
                     + Number(fw.ftransportprice ?? 0)
                     + Number(fw.fpriceupdate ?? 0);
      a.commission_thb = a.revenue_thb * 0.01;          // legacy: 1 %
      aggMap.set(key, a);
    }

    // Newest month first, then highest revenue.
    const rows = Array.from(aggMap.values()).sort((a, b) => {
      if (a.month !== b.month) return b.month.localeCompare(a.month);
      return b.revenue_thb - a.revenue_thb;
    });

    return { ok: true, data: rows };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "sales-monthly threw", err);
    return { ok: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════
// 2) Forwarder profit — legacy: report-forwarder-profit.php
//    Order-by-order P&L. Cost = `fcosttotalprice`. Profit = `fprofittotal`
//    if set, else (ftotalprice - fdiscount - fcosttotalprice).
//
//    P0-20: was `from("forwarders")` (REBUILT, empty) → `tb_forwarder`.
//    Filter `fstatus IN ('6','7')` matches legacy's "ส่ง/สำเร็จ" delivered
//    gate. Customer join goes through tb_users.userID (camelCase post-0113).
//
//    OPT-IN `5plus` filter — the legacy form has a status selector with a
//    "5plus" option (fStatus > 5). Pass `opts.fiveplus = true` to apply.
// ════════════════════════════════════════════════════════════════════════

export type ForwarderProfitRow = {
  id:             string;
  f_no:           string;        // synthesised from id (tb_forwarder has no fNo)
  member_code:    string;        // tb_users.userID
  customer_name:  string;
  source_warehouse: string;      // tb_forwarder.fwarehousechina ('1'=guangzhou, '2'=yiwu)
  transport_type: string;        // tb_forwarder.ftransporttype ('1'=truck, '2'=ship, '3'=air)
  weight_kg:      number;
  volume_cbm:     number;
  cost_total:     number;        // tb_forwarder.fcosttotalprice
  sale_total:     number;        // tb_forwarder.ftotalprice
  profit:         number;        // fprofittotal OR (ftotalprice - fdiscount - fcosttotalprice)
  vat7:           number;        // P0-20: REMOVED — kept at 0 for back-compat
  status:         string;
  created_at:     string;
};

const WAREHOUSE_CHN_MAP: Record<string, string> = { "1": "guangzhou", "2": "yiwu" };
const TRANSPORT_MAP: Record<string, string>     = { "1": "truck", "2": "ship", "3": "air" };
// Legacy fStatus codes → modern slug. Per migration 0081 L1601-1609 comments
// + tb_forwarder fStatus state machine (docs/research/legacy-deep-dive/03-fstatus-state-machine.md):
//   '1'=pending_payment · '2'=paid (เข้าโกดังจีน) · '3'=ออกจีน · '4'=ถึงไทย ·
//   '5'=out_for_delivery · '6'=เตรียมส่ง · '7'=ส่งสำเร็จ
const FSTATUS_MAP: Record<string, string> = {
  "1": "pending_payment",
  "2": "shipped_china",
  "3": "in_transit",
  "4": "arrived_thailand",
  "5": "out_for_delivery",
  "6": "out_for_delivery",
  "7": "delivered",
};

export async function getForwarderProfitReport(
  range: DateRange,
  opts?: { fiveplus?: boolean },
): Promise<Result<ForwarderProfitRow[]>> {
  try {
    const admin = createAdminClient();
    // Legacy keys profit reports off `fdate` (creation) by default. The
    // `report-forwarder-profit.php` form lets the admin pick the date column
    // but the default is fdate — keep that here.
    let q = admin
      .from("tb_forwarder")
      .select(`id, userid, fstatus, fwarehousechina, ftransporttype,
        fweight, fvolume, ftotalprice, fdiscount, fcosttotalprice,
        fprofittotal, fdate`)
      .gte("fdate", dayStartIso(range.from))
      .lte("fdate", dayEndIso(range.to))
      .order("fdate", { ascending: false })
      .limit(LIMIT);

    // 5plus filter — legacy "fStatus > 5" (out-for-delivery + delivered).
    if (opts?.fiveplus) {
      q = q.in("fstatus", ["6", "7"]);
    } else {
      // Match legacy's "non-cancelled" filter: include all fStatus except
      // explicit cancel markers. tb_forwarder doesn't have a "cancelled"
      // string status (the cancel signal is on related rows); the legacy
      // report shows every row in range. Use `.not("fstatus", "eq", "0")`
      // as a defensive guard against soft-deleted rows.
      q = q.neq("fstatus", "0");
    }

    const { data, error } = await q;

    if (error) {
      logger.error("reports", "forwarder-profit tb_forwarder query failed", error);
      return { ok: false, error: error.message };
    }

    type FRow = {
      id: number;
      userid: string | null;
      fstatus: string;
      fwarehousechina: string | null;
      ftransporttype: string | null;
      fweight: number | null;
      fvolume: number | null;
      ftotalprice: number | null;
      fdiscount: number | null;
      fcosttotalprice: number | null;
      fprofittotal: number | null;
      fdate: string | null;
    };
    const forwarders = (data ?? []) as unknown as FRow[];

    // Resolve customer (member_code + name) via tb_users.userID lookup.
    const userids = Array.from(new Set(
      forwarders.map((f) => f.userid).filter((u): u is string => Boolean(u)),
    ));
    let userMap = new Map<string, { member_code: string; first_name: string; last_name: string }>();
    if (userids.length > 0) {
      const { data: uRows, error: uErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName")
        .in("userID", userids)
        .limit(LIMIT);
      if (uErr) {
        logger.error("reports", "forwarder-profit tb_users lookup failed", uErr);
      }
      type URow = { userID: string; userName: string | null; userLastName: string | null };
      userMap = new Map(
        (uRows ?? []).map((u: URow) => [u.userID, {
          member_code: u.userID,
          first_name:  u.userName     ?? "",
          last_name:   u.userLastName ?? "",
        }]),
      );
    }

    const rows: ForwarderProfitRow[] = forwarders.map((r) => {
      const u = r.userid ? userMap.get(r.userid) : undefined;
      const sale     = Number(r.ftotalprice    ?? 0);
      const discount = Number(r.fdiscount      ?? 0);
      const cost     = Number(r.fcosttotalprice ?? 0);
      // Legacy formula: profit = (fTotalPrice - fDiscount) - fCostTotalPrice.
      // Prefer precomputed `fprofittotal` if non-zero (legacy stores both;
      // the precomputed value reflects after-discount edits made by admin).
      const fprofit  = Number(r.fprofittotal   ?? 0);
      const profit   = fprofit !== 0 ? fprofit : (sale - discount - cost);
      return {
        id: String(r.id),
        f_no: `PR${r.id}`,  // legacy convention — id is the customer-facing seq
        member_code:   u?.member_code ?? (r.userid ?? ""),
        customer_name: [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "—",
        source_warehouse: WAREHOUSE_CHN_MAP[r.fwarehousechina ?? ""] ?? (r.fwarehousechina ?? ""),
        transport_type:   TRANSPORT_MAP[r.ftransporttype ?? ""]      ?? (r.ftransporttype ?? ""),
        weight_kg:        Number(r.fweight ?? 0),
        volume_cbm:       Number(r.fvolume ?? 0),
        cost_total: cost,
        sale_total: sale,
        profit,
        vat7: 0, // P0-20: removed invented column; kept at 0 for back-compat
        status: FSTATUS_MAP[r.fstatus] ?? r.fstatus,
        created_at: r.fdate ?? "",
      };
    });

    return { ok: true, data: rows };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "forwarder-profit threw", err);
    return { ok: false, error: err.message };
  }
}

// ── Daily-profit series for forwarder-profit + yuan-profit (P0-20) ──────
//
// Restores the legacy "per-day profit timeseries" that the bar-graph on
// `report-forwarder-profit.php` (SUM(fProfitTotal) WHERE fStatus=7 GROUP
// BY DATE) and `report-payments-profit.php` (SUM(payProfitTHB) WHERE
// payStatus=2 GROUP BY DATE) render.
//
// Returned as a flat `{ date, profit, count }[]` array sorted ascending by
// date. The page can sparkline / chart this directly. Sibling fetcher
// pattern — keeps the existing `Result<XXXRow[]>` signatures intact for
// the page consumers.

export type DailyProfitPoint = { date: string; profit: number; count: number };

export async function getForwarderProfitDailySeries(range: DateRange): Promise<Result<DailyProfitPoint[]>> {
  try {
    const admin = createAdminClient();
    // Legacy: fStatus=7 (delivered) only. The graph shows realised profit.
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("fdate, fprofittotal, ftotalprice, fdiscount, fcosttotalprice")
      .eq("fstatus", "7")
      .gte("fdate", dayStartIso(range.from))
      .lte("fdate", dayEndIso(range.to))
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "forwarder daily-series query failed", error);
      return { ok: false, error: error.message };
    }

    const bucket = new Map<string, { profit: number; count: number }>();
    type R = { fdate: string | null; fprofittotal: number | null;
               ftotalprice: number | null; fdiscount: number | null; fcosttotalprice: number | null };
    for (const r of (data ?? []) as R[]) {
      if (!r.fdate) continue;
      const day = r.fdate.slice(0, 10); // YYYY-MM-DD
      const fp  = Number(r.fprofittotal ?? 0);
      const computed = Number(r.ftotalprice ?? 0) - Number(r.fdiscount ?? 0) - Number(r.fcosttotalprice ?? 0);
      const profit = fp !== 0 ? fp : computed;
      const cur = bucket.get(day) ?? { profit: 0, count: 0 };
      cur.profit += profit;
      cur.count  += 1;
      bucket.set(day, cur);
    }
    const series = Array.from(bucket.entries())
      .map(([date, v]) => ({ date, profit: v.profit, count: v.count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { ok: true, data: series };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "forwarder daily-series threw", err);
    return { ok: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════
// 3) Shops profit — legacy: report-shops-profit.php
//    Order-by-order P&L for ฝากสั่งซื้อ.
//
//    🔧 Theme-reports (2026-05-31 · owner #3 "คำนวณสดในตาราง + มีไกด์แนะนำ"):
//    legacy report-shops-profit.php L226-232 RECOMPUTES sale + cost LIVE from
//    the raw CNY/rate columns on every render — it does NOT read the stored
//    `hTotalPriceUser`/`hCostAllTH`:
//        if (hCostAll != 0) {
//          priceUser = round_up((hTotalPriceCHN + hShippingCHN) * hRate, 2);  // SALE
//          pricePCS  = round_up(hRateCost * hCostAll, 2);                     // COST
//          profit    = priceUser - pricePCS;
//        }  // else → row shows "รอคำนวณ" and is EXCLUDED from totals
//    Rows with `hcostall == 0` (cost not yet entered) show as "รอคำนวณ" and are
//    excluded from the footer totals. We surface this via `awaiting_cost: true`
//    + zeroed money fields so the page can render "รอคำนวณ" and skip the totals.
//
//    VAT7 (L255): per-row `profit * 0.07` — the ONE legacy report with a VAT
//    column (forwarder/yuan have none). Kept (restored Theme B · owner #2).
//
//    P0-20: was `from("service_orders")` (REBUILT, empty) → `tb_header_order`.
//    Filter `hstatus <> '6'` per legacy (exclude cancelled only).
// ════════════════════════════════════════════════════════════════════════

export type ShopsProfitRow = {
  id:            string;
  h_no:          string;
  member_code:   string;
  customer_name: string;
  title:         string;
  item_count:    number;
  cost_thb:      number;      // live: round_up(hratecost * hcostall, 2) — 0 if awaiting cost
  sale_thb:      number;      // live: round_up((htotalpricechn + hshippingchn) * hrate, 2)
  service_fee:   number;      // profit (legacy: priceUser - pricePCS) — 0 if awaiting cost
  vat7:          number;      // legacy L255: service_fee * 0.07 (shops-only)
  awaiting_cost: boolean;     // legacy: hcostall == 0 → "รอคำนวณ" + excluded from totals
  status:        string;
  created_at:    string;
};

const HSTATUS_MAP: Record<string, string> = {
  "1": "pending",
  "2": "awaiting_payment",
  "3": "ordered",
  "4": "awaiting_chn_dispatch",
  "5": "completed",
  "6": "cancelled",
};

export async function getShopsProfitReport(range: DateRange): Promise<Result<ShopsProfitRow[]>> {
  try {
    const admin = createAdminClient();
    // Select the RAW CNY/rate columns the legacy report recomputes from
    // (htotalpricechn, hshippingchn, hrate, hratecost, hcostall) — NOT the
    // stored htotalpriceuser/hcostallth (which the legacy table ignores).
    const { data, error } = await admin
      .from("tb_header_order")
      .select(`id, userid, hno, hstatus, htitle, hcount,
        htotalpricechn, hshippingchn, hrate, hratecost, hcostall, hdate`)
      .neq("hstatus", "6") // exclude cancelled
      .gte("hdate", dayStartIso(range.from))
      .lte("hdate", dayEndIso(range.to))
      .order("hdate", { ascending: false })
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "shops-profit tb_header_order query failed", error);
      return { ok: false, error: error.message };
    }

    type HRow = {
      id: number;
      userid: string | null;
      hno: string | null;
      hstatus: string;
      htitle: string | null;
      hcount: number | null;
      htotalpricechn: number | null;
      hshippingchn: number | null;
      hrate: number | null;
      hratecost: number | null;
      hcostall: number | null;
      hdate: string | null;
    };
    const orders = (data ?? []) as unknown as HRow[];

    // Resolve customer member code + name via tb_users.userID lookup.
    const userids = Array.from(new Set(
      orders.map((o) => o.userid).filter((u): u is string => Boolean(u)),
    ));
    let userMap = new Map<string, { member_code: string; first_name: string; last_name: string }>();
    if (userids.length > 0) {
      const { data: uRows, error: uErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName")
        .in("userID", userids)
        .limit(LIMIT);
      if (uErr) {
        logger.error("reports", "shops-profit tb_users lookup failed", uErr);
      }
      type URow = { userID: string; userName: string | null; userLastName: string | null };
      userMap = new Map(
        (uRows ?? []).map((u: URow) => [u.userID, {
          member_code: u.userID,
          first_name:  u.userName     ?? "",
          last_name:   u.userLastName ?? "",
        }]),
      );
    }

    const rows: ShopsProfitRow[] = orders.map((r) => {
      const u = r.userid ? userMap.get(r.userid) : undefined;
      const hCostAll = Number(r.hcostall ?? 0);
      // Legacy L226: only rows with a cost entered are priced; the rest show
      // "รอคำนวณ" and are excluded from the footer totals.
      const awaitingCost = hCostAll === 0;
      // Legacy L227-229 (recompute LIVE — true round-UP to 2dp):
      //   priceUser = round_up((hTotalPriceCHN + hShippingCHN) * hRate, 2)
      //   pricePCS  = round_up(hRateCost * hCostAll, 2)
      const sale = awaitingCost
        ? 0
        : roundUp2((Number(r.htotalpricechn ?? 0) + Number(r.hshippingchn ?? 0)) * Number(r.hrate ?? 0));
      const cost = awaitingCost ? 0 : roundUp2(Number(r.hratecost ?? 0) * hCostAll);
      const profit = awaitingCost ? 0 : sale - cost;
      return {
        id: String(r.id),
        h_no: r.hno ?? `PR-S${r.id}`,
        member_code:   u?.member_code ?? (r.userid ?? ""),
        customer_name: [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "—",
        title:        r.htitle ?? "—",
        item_count:   Number(r.hcount ?? 0),
        cost_thb:     cost,
        sale_thb:     sale,
        service_fee:  profit,
        // Theme B fidelity (2026-05-31 · owner #2 "VAT7 = legacy · shops-only"):
        // legacy report-shops-profit.php L255 shows VAT7 = profit*0.07 on the
        // shops report (and ONLY shops — forwarder/yuan have no VAT column).
        vat7:         awaitingCost ? 0 : Math.round(profit * 0.07 * 100) / 100,
        awaiting_cost: awaitingCost,
        status:       HSTATUS_MAP[r.hstatus] ?? r.hstatus,
        created_at:   r.hdate ?? "",
      };
    });

    return { ok: true, data: rows };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "shops-profit threw", err);
    return { ok: false, error: err.message };
  }
}

// Daily-profit series for the shops-profit page (Theme-reports · owner #1).
// Legacy: report-shops-profit.php L79-85
//   SUM(hTotalPriceUser) - SUM(hCostAllTH) WHERE hStatus=5 GROUP BY DATE(hDate)
// ⚠️ The legacy GRAPH uses the STORED hTotalPriceUser/hCostAllTH columns
// (NOT the live CNY×rate recompute the TABLE does). We mirror the graph
// faithfully — stored columns, hstatus='5' (สำเร็จ) only.
export async function getShopsProfitDailySeries(range: DateRange): Promise<Result<DailyProfitPoint[]>> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_header_order")
      .select("hdate, htotalpriceuser, hcostallth")
      .eq("hstatus", "5")
      .gte("hdate", dayStartIso(range.from))
      .lte("hdate", dayEndIso(range.to))
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "shops daily-series query failed", error);
      return { ok: false, error: error.message };
    }

    const bucket = new Map<string, { profit: number; count: number }>();
    type R = { hdate: string | null; htotalpriceuser: number | null; hcostallth: number | null };
    for (const r of (data ?? []) as R[]) {
      if (!r.hdate) continue;
      const day = r.hdate.slice(0, 10);
      const profit = Number(r.htotalpriceuser ?? 0) - Number(r.hcostallth ?? 0);
      const cur = bucket.get(day) ?? { profit: 0, count: 0 };
      cur.profit += profit;
      cur.count  += 1;
      bucket.set(day, cur);
    }
    const series = Array.from(bucket.entries())
      .map(([date, v]) => ({ date, profit: v.profit, count: v.count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { ok: true, data: series };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "shops daily-series threw", err);
    return { ok: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════
// 4) Yuan-transfer profit — legacy: report-payments-profit.php
//    Cost = `paythbcost` (legacy payTHBCost). Sale = `paythb` (legacy payTHB).
//    Profit = `payprofitthb` (precomputed) OR (paythb - paythbcost).
//    P0-20: vat7 set to 0 (invented column removed).
//
//    P0-20: was `from("yuan_payments")` (REBUILT, empty) → `tb_payment`.
//    Filter `paystatus = '2'` (approved) per legacy. Channel = `paytype`
//    ('1'=Alipay '2'=Wechat '3'=Union '4'=USDT).
// ════════════════════════════════════════════════════════════════════════

export type YuanProfitRow = {
  id:            string;
  member_code:   string;
  customer_name: string;
  channel:       string;       // raw paytype code ('1'..'4') — page maps via CHANNEL_LABEL
  yuan_amount:   number;       // payyuan
  cost_rate:     number | null; // payratecost
  exchange_rate: number;       // payrate
  cost_thb:      number;       // paythbcost
  sale_thb:      number;       // paythb
  profit:        number;       // payprofitthb (precomputed)
  vat7:          number;       // P0-20: REMOVED — kept at 0 for back-compat
  status:        string;
  created_at:    string;
};

const PAYSTATUS_MAP: Record<string, string> = {
  "1": "pending",
  "2": "completed",
  "3": "processing", // legacy: refunded/failed — map to "processing" so the
                     // page's STATUS_LABEL ("กำลังโอน") renders sanely
                     // (not shown in profit report since we filter on '2',
                     // but kept for back-compat if filter relaxes).
};

export async function getYuanProfitReport(range: DateRange): Promise<Result<YuanProfitRow[]>> {
  try {
    // Money-internal visibility (owner 2026-06-18): cost_rate / cost_thb /
    // profit are money internals — returned ONLY to ultra/accounting/pricing,
    // NOT super. Defense-in-depth at the data layer: when the caller may not
    // see money internals we null/zero the cost+profit fields so the value
    // never reaches the page (which also gates rendering). DERIVED-VALUE TRAP:
    // profit reveals cost → zeroed together.
    const roles = await getAdminRoles();
    const showCostProfit = canViewCostProfit(roles);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_payment")
      .select(`id, userid, paystatus, paytype, payyuan, payrate, payratecost,
        paythb, paythbcost, payprofitthb, paydate`)
      .eq("paystatus", "2")
      .gte("paydate", dayStartIso(range.from))
      .lte("paydate", dayEndIso(range.to))
      .order("paydate", { ascending: false })
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "yuan-profit tb_payment query failed", error);
      return { ok: false, error: error.message };
    }

    type PRow = {
      id: number;
      userid: string | null;
      paystatus: string;
      paytype: string | null;
      payyuan: number | null;
      payrate: number | null;
      payratecost: number | null;
      paythb: number | null;
      paythbcost: number | null;
      payprofitthb: number | null;
      paydate: string | null;
    };
    const payments = (data ?? []) as unknown as PRow[];

    // Resolve customer member code + name via tb_users.userID lookup.
    const userids = Array.from(new Set(
      payments.map((p) => p.userid).filter((u): u is string => Boolean(u)),
    ));
    let userMap = new Map<string, { member_code: string; first_name: string; last_name: string }>();
    if (userids.length > 0) {
      const { data: uRows, error: uErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName")
        .in("userID", userids)
        .limit(LIMIT);
      if (uErr) {
        logger.error("reports", "yuan-profit tb_users lookup failed", uErr);
      }
      type URow = { userID: string; userName: string | null; userLastName: string | null };
      userMap = new Map(
        (uRows ?? []).map((u: URow) => [u.userID, {
          member_code: u.userID,
          first_name:  u.userName     ?? "",
          last_name:   u.userLastName ?? "",
        }]),
      );
    }

    const rows: YuanProfitRow[] = payments.map((r) => {
      const u = r.userid ? userMap.get(r.userid) : undefined;
      const sale = Number(r.paythb     ?? 0);
      const cost = Number(r.paythbcost ?? 0);
      // Prefer precomputed `payprofitthb` (legacy stores it on UPDATE).
      const pp = Number(r.payprofitthb ?? 0);
      const profit = pp !== 0 ? pp : (sale - cost);
      return {
        id: String(r.id),
        member_code:   u?.member_code ?? (r.userid ?? ""),
        customer_name: [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "—",
        channel:       r.paytype ?? "",
        yuan_amount:   Number(r.payyuan     ?? 0),
        exchange_rate: Number(r.payrate     ?? 0),
        // Money-internal cost + derived profit — null/zeroed when not allowed.
        cost_rate:     showCostProfit ? (r.payratecost != null ? Number(r.payratecost) : null) : null,
        cost_thb:      showCostProfit ? cost : 0,
        sale_thb:      sale,
        profit:        showCostProfit ? profit : 0,
        vat7: 0, // P0-20: invented column removed; back-compat 0
        status: PAYSTATUS_MAP[r.paystatus] ?? r.paystatus,
        created_at: r.paydate ?? "",
      };
    });

    return { ok: true, data: rows };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "yuan-profit threw", err);
    return { ok: false, error: err.message };
  }
}

// Daily-profit series for the yuan-profit page (P0-20).
// Legacy: report-payments-profit.php SUM(payProfitTHB) WHERE payStatus=2
//         GROUP BY DATE(payDate).
export async function getYuanProfitDailySeries(range: DateRange): Promise<Result<DailyProfitPoint[]>> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_payment")
      .select("paydate, payprofitthb, paythb, paythbcost")
      .eq("paystatus", "2")
      .gte("paydate", dayStartIso(range.from))
      .lte("paydate", dayEndIso(range.to))
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "yuan daily-series query failed", error);
      return { ok: false, error: error.message };
    }

    const bucket = new Map<string, { profit: number; count: number }>();
    type R = { paydate: string | null; payprofitthb: number | null;
               paythb: number | null; paythbcost: number | null };
    for (const r of (data ?? []) as R[]) {
      if (!r.paydate) continue;
      const day = r.paydate.slice(0, 10);
      const pp = Number(r.payprofitthb ?? 0);
      const computed = Number(r.paythb ?? 0) - Number(r.paythbcost ?? 0);
      const profit = pp !== 0 ? pp : computed;
      const cur = bucket.get(day) ?? { profit: 0, count: 0 };
      cur.profit += profit;
      cur.count  += 1;
      bucket.set(day, cur);
    }
    const series = Array.from(bucket.entries())
      .map(([date, v]) => ({ date, profit: v.profit, count: v.count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { ok: true, data: series };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "yuan daily-series threw", err);
    return { ok: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════════
// 5) OTP success — legacy: report-otp-success.php
//    Lists every successful OTP verification with the customer it belongs to.
//
//    P0-20: was `from("otp_codes")` (REBUILT, empty) + `from("profiles")`
//    (REBUILT, empty) → reads `tb_users_otp` (the success-only log) joined
//    to `tb_users.userID` (camelCase post-0113).
//
//    tb_users_otp schema (0081 L6056-6060): id, userid (varchar 30), date.
//    No purpose column — every row = successful verification of any purpose.
//    For purpose, we best-effort join to the most-recent matching
//    `tb_users_otp_hs.type` row (0081 L6074-6083): 1=register, 2=existing-
//    verify, 3=reset, 4=change_phone.
// ════════════════════════════════════════════════════════════════════════

export type OtpSuccessRow = {
  id:           string;
  date:         string;        // ISO timestamp
  phone:        string;        // tb_users.userTel
  member_code:  string;        // tb_users.userID
  customer_name: string;
  purpose:      string;        // mapped from tb_users_otp_hs.type → register/login/reset/change_phone
};

const OTP_TYPE_TO_PURPOSE: Record<string, string> = {
  "1": "register",     // ยืนยันตัวตนสมัครใหม่
  "2": "login",        // ยืนยันตัวตนลูกค้าเดิม
  "3": "reset",        // ขอรหัสผ่านใหม่
  "4": "change_phone", // เปลี่ยนเบอร์
};

export async function getOtpSuccessReport(range: DateRange): Promise<Result<OtpSuccessRow[]>> {
  try {
    const admin = createAdminClient();

    // Step 1 — pull successful OTP rows from tb_users_otp.
    const { data: otps, error } = await admin
      .from("tb_users_otp")
      .select("id, userid, date")
      .gte("date", dayStartIso(range.from))
      .lte("date", dayEndIso(range.to))
      .order("date", { ascending: false })
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "otp-success tb_users_otp query failed", error);
      return { ok: false, error: error.message };
    }

    type OtpRow = { id: number; userid: string; date: string | null };
    const otpRows = (otps ?? []) as unknown as OtpRow[];

    // Step 2 — resolve each userid → (member_code, name, phone) via tb_users.
    const userids = Array.from(new Set(otpRows.map((o) => o.userid).filter(Boolean)));
    let userMap = new Map<string, { member_code: string; phone: string; first_name: string; last_name: string }>();
    if (userids.length > 0) {
      const { data: uRows, error: uErr } = await admin
        .from("tb_users")
        .select("userID, userTel, userName, userLastName")
        .in("userID", userids)
        .limit(LIMIT);
      if (uErr) {
        logger.error("reports", "otp-success tb_users lookup failed", uErr);
      }
      type URow = { userID: string; userTel: string | null;
                    userName: string | null; userLastName: string | null };
      userMap = new Map(
        (uRows ?? []).map((u: URow) => [u.userID, {
          member_code: u.userID,
          phone:       u.userTel      ?? "",
          first_name:  u.userName     ?? "",
          last_name:   u.userLastName ?? "",
        }]),
      );
    }

    // Step 3 — best-effort purpose map from tb_users_otp_hs.
    // Pull every history row in window keyed on (userid, type). For each
    // success OTP we pick the nearest preceding history row's type.
    type HsRow = { userid: string; date: string | null; type: string };
    let hsRows: HsRow[] = [];
    if (userids.length > 0) {
      const { data: hsData, error: hsErr } = await admin
        .from("tb_users_otp_hs")
        .select("userid, date, type")
        .in("userid", userids)
        .gte("date", dayStartIso(range.from))
        .lte("date", dayEndIso(range.to))
        .limit(LIMIT);
      if (hsErr) {
        logger.error("reports", "otp-success tb_users_otp_hs lookup failed", hsErr);
      }
      hsRows = (hsData ?? []) as unknown as HsRow[];
    }
    // Bucket history by userid, sort each list newest-first for the nearest
    // lookup in the row map below.
    const hsByUser = new Map<string, HsRow[]>();
    for (const h of hsRows) {
      const arr = hsByUser.get(h.userid) ?? [];
      arr.push(h);
      hsByUser.set(h.userid, arr);
    }
    for (const arr of hsByUser.values()) {
      arr.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    }

    const rows: OtpSuccessRow[] = otpRows.map((o) => {
      const u = userMap.get(o.userid);
      const hist = hsByUser.get(o.userid) ?? [];
      // Nearest preceding-or-equal history row's type → purpose
      let purpose = "";
      for (const h of hist) {
        if ((h.date ?? "") <= (o.date ?? "")) {
          purpose = OTP_TYPE_TO_PURPOSE[h.type] ?? "";
          break;
        }
      }
      return {
        id: String(o.id),
        date: o.date ?? "",
        phone:        u?.phone ?? "",
        member_code:  u?.member_code ?? o.userid,
        customer_name: [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "—",
        purpose,
      };
    });

    return { ok: true, data: rows };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "otp-success threw", err);
    return { ok: false, error: err.message };
  }
}
