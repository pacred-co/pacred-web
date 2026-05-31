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

// ════════════════════════════════════════════════════════════════════════
// 1) Monthly sales-by-rep — legacy: report-sale.php / report-sale-new.php
//    SQL group: (MONTH(fdate), tb_users.adminIDSale). Commission = 1% of
//    revenue (legacy: row.price * 0.01).
//
//    P0-20: was `from("forwarders")` (REBUILT, empty) → now reads
//    `tb_forwarder` joined to `tb_users.adminIDSale` via the lowercase
//    `userid` FK. Filter `fstatus IN ('6','7')` mirrors vw_sales_by_rep
//    (migration 0094 L60) and legacy report-sale-new.php revenue gates.
// ════════════════════════════════════════════════════════════════════════

export type SalesMonthlyRow = {
  rep_id:        string;        // tb_users.adminIDSale
  month:         string;        // YYYY-MM
  order_count:   number;
  weight_kg:     number;
  volume_cbm:    number;
  revenue_thb:   number;        // tb_forwarder.ftotalprice
  commission_thb: number;       // 1% of revenue (legacy: row.price * 0.01)
};

export async function getSalesMonthlyReport(range: DateRange): Promise<Result<SalesMonthlyRow[]>> {
  try {
    const admin = createAdminClient();

    // Step 1 — pull delivered/dispatched forwarders in window (the orders
    // that pay sales commission per legacy report-sale.php).
    // `fdate` is the order creation timestamp (0081 L1600) — the legacy
    // report keys monthly buckets off this column (matches vw_sales_by_rep
    // migration 0094 L52).
    const { data: fRows, error: fErr } = await admin
      .from("tb_forwarder")
      .select("id, userid, fdate, fweight, fvolume, ftotalprice, fstatus")
      .in("fstatus", ["6", "7"])
      .gte("fdate", dayStartIso(range.from))
      .lte("fdate", dayEndIso(range.to))
      .limit(LIMIT);

    if (fErr) {
      logger.error("reports", "sales-monthly tb_forwarder query failed", fErr);
      return { ok: false, error: fErr.message };
    }
    const forwarders = (fRows ?? []) as Array<{
      id: number;
      userid: string | null;
      fdate: string | null;
      fweight: number | null;
      fvolume: number | null;
      ftotalprice: number | null;
      fstatus: string;
    }>;

    // Step 2 — resolve each customer's assigned sales rep (tb_users.adminIDSale).
    // We pull only the userids that appeared in the forwarder window — cheaper
    // than a full users scan.
    const userids = Array.from(new Set(
      forwarders.map((f) => f.userid).filter((u): u is string => Boolean(u)),
    ));
    let userToRep = new Map<string, string>();
    if (userids.length > 0) {
      const { data: uRows, error: uErr } = await admin
        .from("tb_users")
        .select("userID, adminIDSale")
        .in("userID", userids)
        .limit(LIMIT);
      if (uErr) {
        logger.error("reports", "sales-monthly tb_users lookup failed", uErr);
        return { ok: false, error: uErr.message };
      }
      type URow = { userID: string; adminIDSale: string | null };
      userToRep = new Map(
        (uRows ?? []).map((u: URow) => [u.userID, u.adminIDSale ?? ""]),
      );
    }

    // Step 3 — aggregate per (month, rep_id).
    function monthOf(iso: string | null): string {
      if (!iso) return "—";
      return iso.slice(0, 7); // YYYY-MM
    }

    const aggMap = new Map<string, SalesMonthlyRow>();
    for (const f of forwarders) {
      const rep   = (f.userid ? userToRep.get(f.userid) : "") || "(ไม่มี sales rep)";
      const month = monthOf(f.fdate);
      const key   = `${month}::${rep}`;
      const a = aggMap.get(key) ?? {
        rep_id: rep, month,
        order_count: 0, weight_kg: 0, volume_cbm: 0,
        revenue_thb: 0, commission_thb: 0,
      };
      a.order_count    += 1;
      a.weight_kg      += Number(f.fweight     ?? 0);
      a.volume_cbm     += Number(f.fvolume     ?? 0);
      a.revenue_thb    += Number(f.ftotalprice ?? 0);
      a.commission_thb = a.revenue_thb * 0.01;       // legacy: 1 %
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
    const forwarders = (data ?? []) as FRow[];

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
//    Sale (priceUser) = (hTotalPriceCHN + hShippingCHN) × hRate   — legacy
//                     ≈ tb_header_order.htotalpriceuser            — Pacred
//    Cost (pricePCS)  = hRateCost × hCostAll                       — legacy
//                     ≈ tb_header_order.hcostallth                 — Pacred
//    Profit = sale - cost. P0-20: vat7 set to 0 (invented column removed).
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
  cost_thb:      number;
  sale_thb:      number;
  service_fee:   number;      // profit (legacy: priceUser - pricePCS)
  vat7:          number;      // P0-20: REMOVED — kept at 0 for back-compat
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
    const { data, error } = await admin
      .from("tb_header_order")
      .select(`id, userid, hno, hstatus, htitle, hcount, htotalpriceuser, hcostallth, hdate`)
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
      htotalpriceuser: number | null;
      hcostallth: number | null;
      hdate: string | null;
    };
    const orders = (data ?? []) as HRow[];

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
      const sale = Number(r.htotalpriceuser ?? 0);
      const cost = Number(r.hcostallth      ?? 0);
      const profit = sale - cost;
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
        // Restored here; the forwarder/yuan reports drop the column entirely.
        vat7:         Math.round(profit * 0.07 * 100) / 100,
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
    const payments = (data ?? []) as PRow[];

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
        cost_rate:     r.payratecost != null ? Number(r.payratecost) : null,
        cost_thb:      cost,
        sale_thb:      sale,
        profit,
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
    const otpRows = (otps ?? []) as OtpRow[];

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
      hsRows = (hsData ?? []) as HsRow[];
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
