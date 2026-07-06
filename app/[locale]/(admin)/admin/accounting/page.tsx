/**
 * /admin/accounting — accounting hub (faithful-port rewrite).
 *
 * Wave 20 P0-2 (2026-05-26) — swap all data sources from the rebuilt-app
 * tables (forwarders / service_orders / yuan_payments / wallet_transactions
 * — EMPTY on prod) to the legacy `tb_*` tables that the 8,898-customer
 * data import loaded.  Same UI surface, same tab structure, same sub-page
 * links; only the SQL changes.  Mirrors the Wave 6 P0 dashboard rewrite
 * at commit `9c0ffd6` (`/admin/page.tsx`).
 *
 * Field map (rebuilt → legacy):
 *   forwarders.total_price             → tb_forwarder.ftotalprice
 *   forwarders.created_at              → tb_forwarder.fdate
 *   forwarders.status enum             → tb_forwarder.fstatus '1'..'7'
 *                                        ('7' = delivered, '5' = pending payment)
 *   yuan_payments.thb_amount           → tb_payment.paythb
 *   yuan_payments.yuan_amount          → tb_payment.payyuan
 *   yuan_payments.exchange_rate        → tb_payment.payrate
 *   yuan_payments.channel              → tb_payment.paytype ('1'/'2'/'3')
 *   yuan_payments.status               → tb_payment.paystatus '1'/'2'/'3'
 *                                        ('2' = completed)
 *   yuan_payments.created_at           → tb_payment.paydate
 *   service_orders.total_thb           → tb_header_order.hcostallth
 *   service_orders.status enum         → tb_header_order.hstatus '1'..'6'
 *                                        ('5' = completed, '6' = cancelled)
 *   service_orders.created_at          → tb_header_order.hdate
 *   service_orders.h_no                → tb_header_order.hno
 *   service_orders.title               → tb_header_order.htitle
 *   service_orders.item_count          → tb_header_order.hcount
 *   wallet_transactions.amount         → tb_wallet_hs.amount
 *   wallet_transactions.kind=deposit   → tb_wallet_hs.type='1'  (topup)
 *   wallet_transactions.kind=withdraw  → tb_wallet_hs.type='3'  (withdraw)
 *   wallet_transactions.kind=refund    → tb_wallet_hs.type='5'  (refund)
 *   wallet_transactions.status=completed→ tb_wallet_hs.status='2'
 *   wallet_transactions.created_at     → tb_wallet_hs.date
 *
 * Customer name: legacy tables key on `userid` (text like PR12345); the
 * `profiles` table is empty for migrated customers, so we 2nd-query
 * `tb_users.in(userid, [...])` and merge in TS — mirrors the pattern in
 * `/admin/forwarders/page.tsx` (Wave 3 P0 #1, commit on Poom-pacred).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { AccountingMenubar } from "@/components/admin/accounting-menubar";
import { PageHeader } from "@/components/admin/page-header";
import { AccountingSegmentPills } from "@/components/admin/accounting-segment-pills";
import { ACCOUNTING_HUB_CARDS } from "@/lib/admin/accounting-menubar";
import {
  legacyOrderStatusThai,
  legacyForwarderStatusThai,
} from "@/lib/legacy-status-map";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

export const dynamic = "force-dynamic";

// Legacy user join shape (tb_users keyed by userid text).
type LegacyUser = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  // Juristic (นิติบุคคล) identity — populated by fetchUsersByUserId so the
  // display name resolves to the COMPANY, not the contact person.
  userCompany: string | null;
  corporateName: string | null;
};

// Per-row shapes after legacy → display normalisation.
type FRow = {
  id: number;
  f_no: string;                  // formatted display id (legacy uses raw integer)
  status: string;                // tb_forwarder.fstatus ('1'..'7')
  source_warehouse: string;      // fwarehousechina
  transport_type: string;        // ftransporttype
  weight_kg: number;
  volume_cbm: number;
  total_price: number;
  created_at: string;
  user: LegacyUser | null;
};
type YRow = {
  id: number;
  channel: string | null;        // paytype '1'/'2'/'3'
  yuan_amount: number;
  exchange_rate: number;
  thb_amount: number;
  status: string;                // paystatus '1'/'2'/'3'
  created_at: string;
  user: LegacyUser | null;
};
type SRow = {
  id: number;
  h_no: string;                  // tb_header_order.hno
  status: string;                // hstatus '1'..'6'
  title: string | null;
  item_count: number;
  total_thb: number;
  created_at: string;
  user: LegacyUser | null;
};
type WRow = {
  id: number;
  type: string;                  // tb_wallet_hs.type '1'/'3'/'5'
  amount: number;
  status: string;                // '1'/'2'/'3'
  bank_name: string | null;      // depositnamebank
  account_name: string | null;   // nameuserbank
  account_number: string | null; // nouserbank
  note: string | null;
  created_at: string;
  user: LegacyUser | null;
};

function sumCol<T extends Record<string, unknown>>(data: T[] | null, col: keyof T): number {
  if (!data) return 0;
  return data.reduce((s, r) => s + Math.abs(Number(r[col] ?? 0)), 0);
}
function thb(n: number) {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
// Juristic (นิติบุคคล) customers must show the COMPANY name, not the contact
// person. The company name is carried ON the user object (populated by
// fetchUsersByUserId) so every call site resolves identity identically.
function userDisplayName(u: LegacyUser | null) {
  if (!u) return "—";
  return (
    resolveBillingIdentity({
      userCompany: u.userCompany,
      userName: u.userName,
      userLastName: u.userLastName,
      corp: corpRowFromName(u.corporateName ?? undefined),
    }).name || "—"
  );
}

/**
 * 2nd-query helper: batch-load tb_users rows for the userid set on the page,
 * return a Map for O(1) lookup. Mirrors the Wave 3 P0 #1 pattern in
 * `/admin/forwarders/page.tsx`. Also batches a tb_corporate company-name
 * lookup (ONE `.in()` query) so juristic rows show the company name.
 */
async function fetchUsersByUserId(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<Map<string, LegacyUser>> {
  const map = new Map<string, LegacyUser>();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return map;
  const { data, error } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userCompany")
    .in("userID", unique);
  if (error) {
    console.error(`[tb_users batch] failed`, { code: error.code, message: error.message });
    return map;
  }
  // Batched company-name lookup (N+1-free) for the same userid set.
  const corpNames = await fetchCorporateNameMap(admin, unique);
  for (const u of (data ?? []) as Array<{
    userID: string;
    userName: string | null;
    userLastName: string | null;
    userTel: string | null;
    userCompany: string | null;
  }>) {
    map.set(u.userID, {
      userID: u.userID,
      userName: u.userName,
      userLastName: u.userLastName,
      userTel: u.userTel,
      userCompany: u.userCompany,
      corporateName: corpNames.get(u.userID) ?? null,
    });
  }
  return map;
}

// Forwarder status badges — keyed by tb_forwarder.fstatus single-char codes.
const FORWARDER_BADGE: Record<string, string> = {
  "1": "bg-blue-50 text-blue-700 border-blue-200",        // รอเข้าโกดังจีน
  "2": "bg-blue-50 text-blue-700 border-blue-200",        // ถึงโกดังจีน
  "3": "bg-indigo-50 text-indigo-700 border-indigo-200",  // กำลังส่งมาไทย
  "4": "bg-purple-50 text-purple-700 border-purple-200",  // ถึงไทย
  "5": "bg-yellow-50 text-yellow-700 border-yellow-200",  // รอชำระเงิน
  "6": "bg-orange-50 text-orange-700 border-orange-200",  // เตรียมส่ง
  "7": "bg-green-50 text-green-700 border-green-200",     // ส่งแล้ว
};
// Order status badges — keyed by tb_header_order.hstatus single-char codes.
const ORDER_BADGE: Record<string, string> = {
  "1": "bg-yellow-50 text-yellow-700 border-yellow-200",  // รอดำเนินการ
  "2": "bg-yellow-50 text-yellow-700 border-yellow-200",  // รอชำระเงิน
  "3": "bg-blue-50 text-blue-700 border-blue-200",        // สั่งสินค้า
  "4": "bg-indigo-50 text-indigo-700 border-indigo-200",  // รอร้านจีนจัดส่ง
  "40": "bg-teal-50 text-teal-700 border-teal-200",       // ถึงโกดังจีน
  "5": "bg-green-50 text-green-700 border-green-200",     // สำเร็จ
  "6": "bg-gray-50 text-gray-600 border-gray-200",        // ยกเลิก
};
// Payment status (tb_payment.paystatus) + wallet_hs status share the same enum.
const PAYMENT_BADGE: Record<string, string> = {
  "1": "bg-yellow-50 text-yellow-700 border-yellow-200",  // รอดำเนินการ
  "2": "bg-green-50 text-green-700 border-green-200",     // สำเร็จ
  "3": "bg-red-50 text-red-700 border-red-200",           // ไม่สำเร็จ
};
const PAYMENT_LABEL: Record<string, string> = {
  "1": "รอ", "2": "สำเร็จ", "3": "ไม่สำเร็จ",
};
// tb_payment.paytype channel labels.
const PAYTYPE_LABEL: Record<string, string> = {
  "1": "เว็บจีน",
  "2": "Alipay",
  "3": "อื่นๆ",
};
// tb_forwarder.ftransporttype labels.
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "รถ", "2": "เรือ", "3": "เครื่องบิน",
};

const TABS = [
  { key: "summary",   label: "บัญชีรวม" },
  { key: "forwarder", label: "ฝากนำเข้า" },
  { key: "yuan",      label: "ฝากโอนหยวน" },
  { key: "shop",      label: "ฝากสั่งซื้อ" },
  { key: "topup",     label: "ชำระเงิน" },
  { key: "withdraw",  label: "ถอนเงิน" },
  { key: "refund",    label: "คืนเงิน" },
];

type SP = { tab?: string; date_from?: string; date_to?: string };

export default async function AdminAccountingPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // W-1 (gap-admin H-1): page-level role gate. Exposes company-wide
  // revenue + per-customer financial rows via createAdminClient
  // (RLS-bypass) — accounting only (super implicit).
  await requireAdmin(["accounting"]);

  const sp       = await searchParams;
  const tab      = sp.tab ?? "summary";
  const dateFrom = sp.date_from;
  const dateTo   = sp.date_to;
  const admin    = createAdminClient();

  // ── fetch data per tab ──────────────────────────────────────────────────────

  let forwarderRows: FRow[] = [];
  let yuanRows: YRow[] = [];
  let shopRows: SRow[] = [];
  let walletRows: WRow[] = [];

  // summary-tab aggregate sums
  let sForwarder = 0, sYuan = 0, sShop = 0, sTopup = 0, sWithdraw = 0, sRefund = 0;
  // ภูม #9 PEAK redesign — 30-day daily revenue trend for the top-of-page chart.
  // Each item = { d: "YYYY-MM-DD", v: total THB realised that day (forwarder +
  // yuan + shop). } Empty array on non-summary tab or query failure.
  type DailyPoint = { d: string; v: number };
  let dailyTrend: DailyPoint[] = [];
  // T-P5 owner-overview additions
  let sPrevNet = 0;          // total net revenue in the previous same-length window
  let nPendingDeposits = 0;  // count of pending wallet deposits (revenue waiting to land)
  let vAwaitingPayment = 0;  // baht value of service-orders in รอชำระ status (revenue in flight)
  let vForwarderInFlight = 0;// baht value of forwarders not yet delivered (revenue in flight)
  let vYuanInProcess = 0;    // baht value of yuan_payments in รอดำเนินการ
  let nActiveCustomers = 0;  // distinct userids with any completed wallet outflow in current period
  // other tabs: running totals computed after fetch
  let tabTotal = 0, tabCount = 0, tabPending = 0;
  let tabExtra = 0; // e.g. total weight for forwarder, total CNY for yuan

  if (tab === "summary") {
    // Legacy "revenue this window" mapped to the 6 source-of-truth aggregates.
    // Note: tb_forwarder doesn't have a "delivered" filter that's free of
    // edge cases on real prod data — fstatus='7' is "ส่งแล้ว" per legacy
    // map. Use it as the "revenue realised" gate.
    const [fD, yD, sD, tD, wD, rD] = await Promise.all([
      (() => {
        let q = admin.from("tb_forwarder").select("ftotalprice").eq("fstatus", "7");
        if (dateFrom) q = q.gte("fdate", dateFrom);
        if (dateTo)   q = q.lte("fdate", dateTo + "T23:59:59");
        return q;
      })(),
      (() => {
        let q = admin.from("tb_payment").select("paythb").eq("paystatus", "2");
        if (dateFrom) q = q.gte("paydate", dateFrom);
        if (dateTo)   q = q.lte("paydate", dateTo + "T23:59:59");
        return q;
      })(),
      (() => {
        let q = admin.from("tb_header_order").select("hcostallth").eq("hstatus", "5");
        if (dateFrom) q = q.gte("hdate", dateFrom);
        if (dateTo)   q = q.lte("hdate", dateTo + "T23:59:59");
        return q;
      })(),
      (() => {
        // topup completed: tb_wallet_hs type='1' (ชำระเงิน) status='2' (สำเร็จ)
        let q = admin.from("tb_wallet_hs").select("amount").eq("type", "1").eq("status", "2");
        if (dateFrom) q = q.gte("date", dateFrom);
        if (dateTo)   q = q.lte("date", dateTo + "T23:59:59");
        return q;
      })(),
      (() => {
        // withdraw completed: type='3' status='2'
        let q = admin.from("tb_wallet_hs").select("amount").eq("type", "3").eq("status", "2");
        if (dateFrom) q = q.gte("date", dateFrom);
        if (dateTo)   q = q.lte("date", dateTo + "T23:59:59");
        return q;
      })(),
      (() => {
        // refund completed: type='5' status='2'
        let q = admin.from("tb_wallet_hs").select("amount").eq("type", "5").eq("status", "2");
        if (dateFrom) q = q.gte("date", dateFrom);
        if (dateTo)   q = q.lte("date", dateTo + "T23:59:59");
        return q;
      })(),
    ]);
    if (fD.error) console.error(`[tb_forwarder sum] failed`, { code: fD.error.code, message: fD.error.message });
    if (yD.error) console.error(`[tb_payment sum] failed`, { code: yD.error.code, message: yD.error.message });
    if (sD.error) console.error(`[tb_header_order sum] failed`, { code: sD.error.code, message: sD.error.message });
    if (tD.error) console.error(`[tb_wallet_hs topup sum] failed`, { code: tD.error.code, message: tD.error.message });
    if (wD.error) console.error(`[tb_wallet_hs withdraw sum] failed`, { code: wD.error.code, message: wD.error.message });
    if (rD.error) console.error(`[tb_wallet_hs refund sum] failed`, { code: rD.error.code, message: rD.error.message });

    sForwarder = sumCol(fD.data, "ftotalprice");
    sYuan      = sumCol(yD.data, "paythb");
    sShop      = sumCol(sD.data, "hcostallth");
    sTopup     = sumCol(tD.data, "amount");
    sWithdraw  = sumCol(wD.data, "amount");
    sRefund    = sumCol(rD.data, "amount");

    // T-P5 owner-overview: previous-period comparison + pending pipeline +
    // active-customer count. All run in parallel; each query degrades to 0
    // if dateFrom/dateTo aren't set (full-history view → no comparison).
    const sNetCurrent = sForwarder + sYuan + sShop;

    // Compute previous-period window (same length as current, immediately before).
    let prevFrom: string | undefined, prevTo: string | undefined;
    if (dateFrom && dateTo) {
      const cFrom = new Date(dateFrom);
      const cTo   = new Date(dateTo);
      const lenMs = cTo.getTime() - cFrom.getTime();
      if (lenMs > 0) {
        const pTo   = new Date(cFrom.getTime() - 1);                 // one ms before current window
        const pFrom = new Date(pTo.getTime() - lenMs);
        prevFrom = pFrom.toISOString().slice(0, 10);
        prevTo   = pTo.toISOString().slice(0, 10);
      }
    }

    const [prevF, prevY, prevS, pendDep, awaitPay, fwdInFlight, yuanInProc, activeCust] = await Promise.all([
      // PREV PERIOD revenue — only if both dates are set (else returns 0)
      prevFrom && prevTo
        ? admin.from("tb_forwarder").select("ftotalprice").eq("fstatus", "7")
            .gte("fdate", prevFrom).lte("fdate", prevTo + "T23:59:59")
        : Promise.resolve({ data: [] as Array<{ ftotalprice: number }>, error: null }),
      prevFrom && prevTo
        ? admin.from("tb_payment").select("paythb").eq("paystatus", "2")
            .gte("paydate", prevFrom).lte("paydate", prevTo + "T23:59:59")
        : Promise.resolve({ data: [] as Array<{ paythb: number }>, error: null }),
      prevFrom && prevTo
        ? admin.from("tb_header_order").select("hcostallth").eq("hstatus", "5")
            .gte("hdate", prevFrom).lte("hdate", prevTo + "T23:59:59")
        : Promise.resolve({ data: [] as Array<{ hcostallth: number }>, error: null }),

      // PIPELINE — what's in flight that will become revenue (independent of date window)
      // Pending wallet deposits: type='1' (เติม) AND status='1' (รอ)
      admin.from("tb_wallet_hs")
        .select("id", { count: "exact", head: true })
        .eq("type", "1").eq("status", "1"),
      // Service orders awaiting payment: hstatus='2' (รอชำระเงิน)
      admin.from("tb_header_order").select("hcostallth").eq("hstatus", "2"),
      // Forwarders not yet delivered / cancelled — fstatus '1'..'6' (everything except '7' completed)
      admin.from("tb_forwarder").select("ftotalprice").neq("fstatus", "7"),
      // Yuan transfers in process: paystatus='1' (รอ)
      admin.from("tb_payment").select("paythb").eq("paystatus", "1"),

      // ACTIVE customers — distinct userids that paid us anything in the window.
      // tb_wallet_hs is the canonical revenue join point — every outflow
      // (type IN '2','4','6' = paid for shop/import/yuan) lands a row here.
      (() => {
        let q = admin.from("tb_wallet_hs")
          .select("userid")
          .eq("status", "2")
          .in("type", ["2", "4", "6"]);
        if (dateFrom) q = q.gte("date", dateFrom);
        if (dateTo)   q = q.lte("date", dateTo + "T23:59:59");
        return q;
      })(),
    ]);
    if (prevF.error)      console.error(`[tb_forwarder prev sum] failed`, { code: prevF.error.code, message: prevF.error.message });
    if (prevY.error)      console.error(`[tb_payment prev sum] failed`, { code: prevY.error.code, message: prevY.error.message });
    if (prevS.error)      console.error(`[tb_header_order prev sum] failed`, { code: prevS.error.code, message: prevS.error.message });
    if (pendDep.error)    console.error(`[tb_wallet_hs pending count] failed`, { code: pendDep.error.code, message: pendDep.error.message });
    if (awaitPay.error)   console.error(`[tb_header_order awaiting_payment] failed`, { code: awaitPay.error.code, message: awaitPay.error.message });
    if (fwdInFlight.error)console.error(`[tb_forwarder in-flight] failed`, { code: fwdInFlight.error.code, message: fwdInFlight.error.message });
    if (yuanInProc.error) console.error(`[tb_payment in-process] failed`, { code: yuanInProc.error.code, message: yuanInProc.error.message });
    if (activeCust.error) console.error(`[tb_wallet_hs active customers] failed`, { code: activeCust.error.code, message: activeCust.error.message });

    sPrevNet           = sumCol(prevF.data, "ftotalprice") + sumCol(prevY.data, "paythb") + sumCol(prevS.data, "hcostallth");
    nPendingDeposits   = pendDep.count ?? 0;
    vAwaitingPayment   = sumCol(awaitPay.data, "hcostallth");
    vForwarderInFlight = sumCol(fwdInFlight.data, "ftotalprice");
    vYuanInProcess     = sumCol(yuanInProc.data, "paythb");
    nActiveCustomers   = new Set(((activeCust.data ?? []) as Array<{ userid: string }>).map((r) => r.userid)).size;

    // Stash for the render block (so we don't recompute or pass extra args).
    void sNetCurrent;

    // ── ภูม #9 PEAK redesign — 30-day daily revenue trend ─────────────
    // Single batch of 3 queries against the source-of-truth completed rows
    // (forwarder fstatus=7 + yuan paystatus=2 + shop hstatus=5). Bucketed
    // in TS by date so we don't need a DB function. Window: 29 days back +
    // today. Each bar = sum of THB realised that day.
    const TREND_DAYS = 30;
    const trendCutoff = new Date();
    trendCutoff.setUTCDate(trendCutoff.getUTCDate() - (TREND_DAYS - 1));
    const trendCutoffIso = trendCutoff.toISOString().slice(0, 10);

    const [trendF, trendY, trendS] = await Promise.all([
      admin.from("tb_forwarder").select("ftotalprice, fdate").eq("fstatus", "7").gte("fdate", trendCutoffIso),
      admin.from("tb_payment").select("paythb, paydate").eq("paystatus", "2").gte("paydate", trendCutoffIso),
      admin.from("tb_header_order").select("hcostallth, hdate").eq("hstatus", "5").gte("hdate", trendCutoffIso),
    ]);
    if (trendF.error) console.error(`[trend tb_forwarder] failed`, { code: trendF.error.code, message: trendF.error.message });
    if (trendY.error) console.error(`[trend tb_payment] failed`,   { code: trendY.error.code, message: trendY.error.message });
    if (trendS.error) console.error(`[trend tb_header_order] failed`, { code: trendS.error.code, message: trendS.error.message });

    // Build a YYYY-MM-DD → v map seeded with zeros so empty days show in the chart.
    const bucket = new Map<string, number>();
    for (let i = 0; i < TREND_DAYS; i++) {
      const d = new Date(trendCutoff);
      d.setUTCDate(d.getUTCDate() + i);
      bucket.set(d.toISOString().slice(0, 10), 0);
    }
    const addRow = (raw: unknown, dateKey: string, valKey: string) => {
      const arr = (raw ?? []) as Array<Record<string, unknown>>;
      for (const r of arr) {
        const ts = r[dateKey];
        const v  = Number(r[valKey] ?? 0);
        if (typeof ts !== "string" || !Number.isFinite(v)) continue;
        const k = ts.slice(0, 10);
        const prev = bucket.get(k);
        if (prev === undefined) continue; // outside window
        bucket.set(k, prev + v);
      }
    };
    addRow(trendF.data, "fdate",   "ftotalprice");
    addRow(trendY.data, "paydate", "paythb");
    addRow(trendS.data, "hdate",   "hcostallth");
    dailyTrend = Array.from(bucket.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, v]) => ({ d, v }));
  } else if (tab === "forwarder") {
    let q = admin
      .from("tb_forwarder")
      .select(`id, fdate, fstatus, fwarehousechina, ftransporttype, fweight, fvolume, ftotalprice, userid`)
      .order("fdate", { ascending: false })
      .limit(500);
    if (dateFrom) q = q.gte("fdate", dateFrom);
    if (dateTo)   q = q.lte("fdate", dateTo + "T23:59:59");
    const { data, error } = await q;
    if (error) {
      console.error(`[tb_forwarder list] failed`, { code: error.code, message: error.message });
    }
    type Raw = {
      id: number; fdate: string | null; fstatus: string;
      fwarehousechina: string; ftransporttype: string;
      fweight: number | null; fvolume: number | null;
      ftotalprice: number | null; userid: string;
    };
    const raw = (data ?? []) as Raw[];
    const usersByUserId = await fetchUsersByUserId(admin, raw.map((r) => r.userid));
    forwarderRows = raw.map((r) => ({
      id: r.id,
      f_no: `${r.id}`,
      status: r.fstatus,
      source_warehouse: r.fwarehousechina,
      transport_type: r.ftransporttype,
      weight_kg: Number(r.fweight ?? 0),
      volume_cbm: Number(r.fvolume ?? 0),
      total_price: Number(r.ftotalprice ?? 0),
      created_at: r.fdate ?? "",
      user: usersByUserId.get(r.userid) ?? null,
    }));
    tabCount = forwarderRows.length;
    tabTotal = forwarderRows.reduce((s, r) => s + r.total_price, 0);
    tabExtra = forwarderRows.reduce((s, r) => s + r.weight_kg, 0);

  } else if (tab === "yuan") {
    let q = admin
      .from("tb_payment")
      .select(`id, paytype, payyuan, payrate, paythb, paystatus, paydate, userid`)
      .order("paydate", { ascending: false })
      .limit(500);
    if (dateFrom) q = q.gte("paydate", dateFrom);
    if (dateTo)   q = q.lte("paydate", dateTo + "T23:59:59");
    const { data, error } = await q;
    if (error) {
      console.error(`[tb_payment list] failed`, { code: error.code, message: error.message });
    }
    type Raw = {
      id: number; paytype: string | null;
      payyuan: number | null; payrate: number | null; paythb: number | null;
      paystatus: string; paydate: string | null; userid: string;
    };
    const raw = (data ?? []) as Raw[];
    const usersByUserId = await fetchUsersByUserId(admin, raw.map((r) => r.userid));
    yuanRows = raw.map((r) => ({
      id: r.id,
      channel: r.paytype,
      yuan_amount: Number(r.payyuan ?? 0),
      exchange_rate: Number(r.payrate ?? 0),
      thb_amount: Number(r.paythb ?? 0),
      status: r.paystatus,
      created_at: r.paydate ?? "",
      user: usersByUserId.get(r.userid) ?? null,
    }));
    tabCount = yuanRows.length;
    tabTotal = yuanRows.reduce((s, r) => s + r.thb_amount, 0);
    tabExtra = yuanRows.reduce((s, r) => s + r.yuan_amount, 0);

  } else if (tab === "shop") {
    let q = admin
      .from("tb_header_order")
      .select(`id, hno, hstatus, htitle, hcount, hcostallth, hdate, userid`)
      .order("hdate", { ascending: false })
      .limit(500);
    if (dateFrom) q = q.gte("hdate", dateFrom);
    if (dateTo)   q = q.lte("hdate", dateTo + "T23:59:59");
    const { data, error } = await q;
    if (error) {
      console.error(`[tb_header_order list] failed`, { code: error.code, message: error.message });
    }
    type Raw = {
      id: number; hno: string; hstatus: string;
      htitle: string | null; hcount: number | null;
      hcostallth: number | null; hdate: string | null; userid: string;
    };
    const raw = (data ?? []) as Raw[];
    const usersByUserId = await fetchUsersByUserId(admin, raw.map((r) => r.userid));
    shopRows = raw.map((r) => ({
      id: r.id,
      h_no: r.hno,
      status: r.hstatus,
      title: r.htitle,
      item_count: Number(r.hcount ?? 0),
      total_thb: Number(r.hcostallth ?? 0),
      created_at: r.hdate ?? "",
      user: usersByUserId.get(r.userid) ?? null,
    }));
    tabCount = shopRows.length;
    tabTotal = shopRows.reduce((s, r) => s + r.total_thb, 0);
    tabExtra = shopRows.reduce((s, r) => s + r.item_count, 0);

  } else if (tab === "topup" || tab === "withdraw" || tab === "refund") {
    // Wallet history (tb_wallet_hs) — map tab to legacy `type` value.
    const legacyType = tab === "topup" ? "1" : tab === "withdraw" ? "3" : "5";
    let q = admin
      .from("tb_wallet_hs")
      .select(`id, type, amount, status, depositnamebank, nameuserbank, nouserbank, note, date, userid`)
      .eq("type", legacyType)
      .order("date", { ascending: false })
      .limit(500);
    if (dateFrom) q = q.gte("date", dateFrom);
    if (dateTo)   q = q.lte("date", dateTo + "T23:59:59");
    const { data, error } = await q;
    if (error) {
      console.error(`[tb_wallet_hs list] failed`, { code: error.code, message: error.message });
    }
    type Raw = {
      id: number; type: string;
      amount: number | null; status: string | null;
      depositnamebank: string | null; nameuserbank: string | null; nouserbank: string | null;
      note: string | null; date: string | null; userid: string;
    };
    const raw = (data ?? []) as Raw[];
    const usersByUserId = await fetchUsersByUserId(admin, raw.map((r) => r.userid));
    walletRows = raw.map((r) => ({
      id: r.id,
      type: r.type,
      amount: Number(r.amount ?? 0),
      status: r.status ?? "1",
      bank_name: r.depositnamebank,
      account_name: r.nameuserbank,
      account_number: r.nouserbank,
      note: r.note,
      created_at: r.date ?? "",
      user: usersByUserId.get(r.userid) ?? null,
    }));
    tabCount   = walletRows.length;
    tabPending = walletRows.filter((r) => r.status === "1").length;
    tabTotal   = walletRows
      .filter((r) => r.status === "2")
      .reduce((s, r) => s + Math.abs(r.amount), 0);
  }

  // ── CSV data ────────────────────────────────────────────────────────────────

  const forwarderCsv: CsvRow[] = forwarderRows.map((r) => ({
    เลขที่: r.f_no,
    รหัสสมาชิก: r.user?.userID ?? "",
    ชื่อ: userDisplayName(r.user),
    เบอร์: r.user?.userTel ?? "",
    คลัง: r.source_warehouse,
    ขนส่ง: TRANSPORT_LABEL[r.transport_type] ?? r.transport_type,
    น้ำหนักkg: r.weight_kg,
    ปริมาตรcbm: r.volume_cbm,
    ราคา: r.total_price,
    สถานะ: legacyForwarderStatusThai(r.status),
    วันที่: r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "",
  }));

  const yuanCsv: CsvRow[] = yuanRows.map((r) => ({
    รหัสสมาชิก: r.user?.userID ?? "",
    ชื่อ: userDisplayName(r.user),
    เบอร์: r.user?.userTel ?? "",
    ช่องทาง: r.channel ? PAYTYPE_LABEL[r.channel] ?? r.channel : "",
    หยวน: r.yuan_amount,
    อัตราแลกเปลี่ยน: r.exchange_rate,
    บาท: r.thb_amount,
    สถานะ: PAYMENT_LABEL[r.status] ?? r.status,
    วันที่: r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "",
  }));

  const shopCsv: CsvRow[] = shopRows.map((r) => ({
    เลขที่: r.h_no,
    รหัสสมาชิก: r.user?.userID ?? "",
    ชื่อ: userDisplayName(r.user),
    เบอร์: r.user?.userTel ?? "",
    รายการ: r.title ?? "",
    ชิ้น: r.item_count,
    ยอด: r.total_thb,
    สถานะ: legacyOrderStatusThai(r.status),
    วันที่: r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "",
  }));

  const walletCsv: CsvRow[] = walletRows.map((r) => ({
    รหัสสมาชิก: r.user?.userID ?? "",
    ชื่อ: userDisplayName(r.user),
    เบอร์: r.user?.userTel ?? "",
    จำนวน: r.amount,
    ธนาคาร: r.bank_name ?? "",
    ชื่อบัญชี: r.account_name ?? "",
    เลขบัญชี: r.account_number ?? "",
    หมายเหตุ: r.note ?? "",
    สถานะ: PAYMENT_LABEL[r.status] ?? r.status,
    วันที่: r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "",
  }));

  const csvFilename = `accounting_${tab}_${dateFrom ?? "all"}_${dateTo ?? "all"}.csv`;

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* ── Header — PEAK-style (Wave 20 fix 2026-05-26 per ภูม) ──
          - h1 + Cargo/Freight segment pills (was on /cargo only)
          - subtitle hint about the 6 section labels
          - Optional date-range chip when filter is set
          - "ปิดงบรายเดือน" CTA stays right-side */}
      <PageHeader
        eyebrow="ADMIN · ระบบบัญชี"
        title="ระบบบัญชี"
        badges={<AccountingSegmentPills active="cargo" />}
        subtitle={
          <>
            Cargo · ฝากสั่งซื้อ · ฝากนำเข้า · ฝากโอนหยวน — รายรับ · รายจ่าย · ผู้ติดต่อ · การเงิน · การบัญชี
            {(dateFrom || dateTo) && (
              <span className="block mt-1 text-xs">
                ช่วงเวลา: {dateFrom ? new Date(dateFrom).toLocaleDateString("th-TH") : "ทั้งหมด"}
                {" — "}
                {dateTo ? new Date(dateTo).toLocaleDateString("th-TH") : "ปัจจุบัน"}
              </span>
            )}
          </>
        }
        actions={
          <Link
            href="/admin/accounting/closing"
            className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            📋 ปิดงบฝากนำเข้ารายเดือน →
          </Link>
        }
      />

      {/* ── PEAK-style TOP menubar — purple bar with cascading dropdowns ──
          Shared config from `lib/admin/accounting-menubar.ts`. Many leaf
          URLs are TODO placeholders (legacy `acc-system-cargo.php` parity
          — owner brief 2026-05-20 night). activeHref="/admin/accounting"
          so "หน้าหลัก" lights up on this dashboard. */}
      <AccountingMenubar activeHref="/admin/accounting" />

      {/* Tab nav */}
      <div className="flex flex-wrap border-b border-border gap-0">
        {TABS.map((t) => {
          const params = new URLSearchParams();
          params.set("tab", t.key);
          if (dateFrom) params.set("date_from", dateFrom);
          if (dateTo)   params.set("date_to", dateTo);
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/admin/accounting?${params}`}
              className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Date filter */}
      <Suspense>
        <AdminDateFilter tab={tab} dateFrom={dateFrom} dateTo={dateTo} />
      </Suspense>

      {/* ── Summary tab ───────────────────────────────────────────────── */}
      {tab === "summary" && (
        <div className="space-y-4">
          {/* ภูม #9 PEAK redesign — 30-day revenue trend chart at top.
              Sums forwarder + yuan + shop revenue per day across the last
              30 calendar days. Pure SVG · no chart library dependency.
              ภูม brief 2026-05-30: "ตัด ประกาศโฆษณา + อัพเดตล่าสุด" — we
              don't have these blocks anywhere (Pacred clean baseline). */}
          {dailyTrend.length > 0 && <RevenueTrendChart data={dailyTrend} />}

          {/* T-P5 owner-overview hero — net revenue big number + delta vs prev period */}
          <OwnerHero
            netCurrent={sForwarder + sYuan + sShop}
            netPrev={sPrevNet}
            hasComparison={Boolean(dateFrom && dateTo) && sPrevNet > 0}
            breakdown={[
              { label: "ฝากนำเข้า", value: sForwarder },
              { label: "ฝากโอนหยวน", value: sYuan },
              { label: "ฝากสั่งซื้อ", value: sShop },
            ]}
          />

          {/* T-P5 pipeline cards — what's in flight (future revenue) */}
          <div>
            <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-2">
              💼 รายได้ที่กำลังจะเข้า (Pending pipeline)
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <PipelineCard
                label="Deposits รอตรวจสลิป"
                value={`${nPendingDeposits} รายการ`}
                hint="ลูกค้าโอนแล้ว รอ admin อนุมัติ"
                href="/admin/wallet?kind=deposit&status=pending"
                tone="yellow"
              />
              <PipelineCard
                label="ฝากสั่งรอชำระ"
                value={thb(vAwaitingPayment)}
                hint="ออเดอร์ที่ลูกค้ายังไม่จ่าย"
                href="/admin/service-orders?status=awaiting_payment"
                tone="yellow"
              />
              <PipelineCard
                label="ฝากนำเข้ายังไม่ส่งมอบ"
                value={thb(vForwarderInFlight)}
                hint="กำลังเดินทาง / รอชำระ / เคลียร์ด่าน"
                href="/admin/forwarders"
                tone="blue"
              />
              <PipelineCard
                label="ฝากโอนหยวนกำลังโอน"
                value={thb(vYuanInProcess)}
                hint="รอดำเนินการ"
                href="/admin/yuan-payments?status=pending"
                tone="blue"
              />
            </div>
          </div>

          {/* Active-customer count — only meaningful if a date window is set.
              (We removed the "new customers" card; tb_users.userregistered is
               loaded but the rebuilt-era profile gate doesn't exist on legacy
               schema — most legacy customers signed up years ago.) */}
          {(dateFrom || dateTo) && (
            <div>
              <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-2">
                👥 ลูกค้าในช่วงนี้
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <PipelineCard
                  label="ลูกค้าที่ใช้บริการ (จ่ายเงินจริง)"
                  value={`${nActiveCustomers} คน`}
                  hint="distinct userid ที่จ่ายเงิน Pacred ในช่วง"
                  href="/admin/customers"
                  tone="green"
                />
              </div>
            </div>
          )}

          {/* Existing breakdown cards — by revenue source */}
          <div>
            <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-2">
              📊 รายได้แยกประเภท
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <SumCard label="ฝากนำเข้า (ส่งแล้ว)" value={sForwarder} tone="green" />
              <SumCard label="ฝากโอนหยวน (สำเร็จ)"  value={sYuan}      tone="green" />
              <SumCard label="ฝากสั่งซื้อ (สำเร็จ)"  value={sShop}      tone="green" />
              <SumCard label="ชำระเงินรวม (สำเร็จ)"  value={sTopup}     tone="blue" />
              <SumCard label="ถอนเงินรวม (จ่ายแล้ว)" value={sWithdraw}  tone="red" />
              <SumCard label="คืนเงินรวม (สำเร็จ)"    value={sRefund}    tone="red" />
            </div>
          </div>

          {/* (ลบการ์ด "รายรับสุทธิ" ซ้ำออก · 2026-07-06 — OwnerHero ด้านบนโชว์แล้ว
              พร้อม breakdown → กันซ้ำ · จัดวางคลีนขึ้น) */}
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-border bg-white p-4 space-y-2">
              <p className="font-semibold text-muted uppercase tracking-wide text-[11px]">ลิงก์ด่วน</p>
              {[
                ["/admin/forwarders?status=7", "ฝากนำเข้าที่ส่งแล้ว"],
                ["/admin/yuan-payments?status=completed", "ฝากโอนหยวนสำเร็จ"],
                ["/admin/service-orders?status=completed", "ฝากสั่งสำเร็จ"],
              ].map(([href, label]) => (
                <Link key={href} href={href} className="block text-primary-500 hover:underline">→ {label}</Link>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-white p-4 space-y-2">
              <p className="font-semibold text-muted uppercase tracking-wide text-[11px]">กระเป๋าเงิน</p>
              {[
                ["/admin/wallet?kind=deposit&status=pending", "ชำระเงินรอตรวจ"],
                ["/admin/wallet?kind=withdraw&status=pending", "ถอนเงินรอจ่าย"],
              ].map(([href, label]) => (
                <Link key={href} href={href} className="block text-primary-500 hover:underline">→ {label}</Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Forwarder tab ─────────────────────────────────────────────── */}
      {tab === "forwarder" && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <StatCard label="รายการทั้งหมด" value={String(tabCount)} />
            <StatCard label="น้ำหนักรวม"    value={`${tabExtra.toFixed(2)} kg`} />
            <StatCard label="รายรับรวม"     value={thb(tabTotal)} tone="green" />
          </div>
          <div className="flex justify-end">
            <CsvButton
              rows={forwarderCsv}
              cols={Object.keys(forwarderCsv[0] ?? {}).map((k) => ({ key: k, label: k }))}
              filename={csvFilename}
            />
          </div>
          <DataTable
            headers={["เลขที่", "ลูกค้า", "คลัง/ขนส่ง", "น้ำหนัก/CBM", "ราคา", "สถานะ", "วันที่"]}
            empty={forwarderRows.length === 0}
          >
            {forwarderRows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/admin/forwarders/${r.f_no}`} className="text-primary-600 hover:underline">#{r.f_no}</Link>
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="font-mono">{r.user?.userID ?? "—"}</div>
                  <div>{userDisplayName(r.user)}</div>
                  <div className="text-muted">{r.user?.userTel ?? ""}</div>
                </td>
                <td className="px-4 py-3 text-xs">{r.source_warehouse} / {TRANSPORT_LABEL[r.transport_type] ?? r.transport_type}</td>
                <td className="px-4 py-3 text-right text-xs">
                  {r.weight_kg.toFixed(2)} kg<br />
                  <span className="text-muted">{r.volume_cbm.toFixed(3)} cbm</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.total_price)}</td>
                <td className="px-4 py-3"><ForwarderStatusBadge s={r.status} /></td>
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "—"}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      {/* ── Yuan tab ──────────────────────────────────────────────────── */}
      {tab === "yuan" && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <StatCard label="รายการทั้งหมด"  value={String(tabCount)} />
            <StatCard label="รวมหยวน"        value={`¥${tabExtra.toFixed(2)}`} />
            <StatCard label="รวมบาท"          value={thb(tabTotal)} tone="green" />
          </div>
          <div className="flex justify-end">
            <CsvButton
              rows={yuanCsv}
              cols={Object.keys(yuanCsv[0] ?? {}).map((k) => ({ key: k, label: k }))}
              filename={csvFilename}
            />
          </div>
          <DataTable
            headers={["ลูกค้า", "ช่องทาง", "หยวน", "อัตรา", "บาท", "สถานะ", "วันที่"]}
            empty={yuanRows.length === 0}
          >
            {yuanRows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                <td className="px-4 py-3 text-xs">
                  <div className="font-mono">{r.user?.userID ?? "—"}</div>
                  <div>{userDisplayName(r.user)}</div>
                  <div className="text-muted">{r.user?.userTel ?? ""}</div>
                </td>
                <td className="px-4 py-3 text-xs">{r.channel ? PAYTYPE_LABEL[r.channel] ?? r.channel : "—"}</td>
                <td className="px-4 py-3 text-right font-mono">¥{r.yuan_amount.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-xs text-muted">{r.exchange_rate.toFixed(4)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.thb_amount)}</td>
                <td className="px-4 py-3"><PaymentStatusBadge s={r.status} /></td>
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "—"}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      {/* ── Shop tab ──────────────────────────────────────────────────── */}
      {tab === "shop" && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <StatCard label="รายการทั้งหมด" value={String(tabCount)} />
            <StatCard label="จำนวนชิ้นรวม"  value={`${tabExtra} ชิ้น`} />
            <StatCard label="ยอดรวม"        value={thb(tabTotal)} tone="green" />
          </div>
          <div className="flex justify-end">
            <CsvButton
              rows={shopCsv}
              cols={Object.keys(shopCsv[0] ?? {}).map((k) => ({ key: k, label: k }))}
              filename={csvFilename}
            />
          </div>
          <DataTable
            headers={["เลขที่", "ลูกค้า", "รายการ", "ชิ้น", "ยอด", "สถานะ", "วันที่"]}
            empty={shopRows.length === 0}
          >
            {shopRows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/admin/service-orders/${r.h_no}`} className="text-primary-600 hover:underline">{r.h_no}</Link>
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="font-mono">{r.user?.userID ?? "—"}</div>
                  <div>{userDisplayName(r.user)}</div>
                  <div className="text-muted">{r.user?.userTel ?? ""}</div>
                </td>
                <td className="px-4 py-3 text-xs">{r.title ?? "—"}</td>
                <td className="px-4 py-3 text-right text-xs">{r.item_count}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.total_thb)}</td>
                <td className="px-4 py-3"><OrderStatusBadge s={r.status} /></td>
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "—"}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      {/* ── Wallet tabs (topup / withdraw / refund) ────────────────────── */}
      {(tab === "topup" || tab === "withdraw" || tab === "refund") && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <StatCard label="รายการทั้งหมด"    value={String(tabCount)} />
            <StatCard label="รอดำเนินการ"      value={String(tabPending)} tone={tabPending > 0 ? "warn" : undefined} />
            <StatCard
              label={tab === "topup" ? "เติมรวม (สำเร็จ)" : tab === "withdraw" ? "ถอนรวม (จ่ายแล้ว)" : "คืนรวม (สำเร็จ)"}
              value={thb(tabTotal)}
              tone={tab === "topup" ? "green" : "red"}
            />
          </div>
          <div className="flex justify-end">
            <CsvButton
              rows={walletCsv}
              cols={Object.keys(walletCsv[0] ?? {}).map((k) => ({ key: k, label: k }))}
              filename={csvFilename}
            />
          </div>
          <DataTable
            headers={["ลูกค้า", "จำนวน (฿)", "บัญชี/หลักฐาน", "หมายเหตุ", "สถานะ", "วันที่"]}
            empty={walletRows.length === 0}
          >
            {walletRows.map((r) => {
              // For "ถอนเงิน" tab, render the legacy amount as negative for UX
              // clarity (legacy stores all wallet_hs.amount as positive, the
              // direction comes from `type`).
              const isOutflow = r.type === "3" || r.type === "5"; // withdraw / refund
              const renderedAmount = isOutflow ? -Math.abs(r.amount) : Math.abs(r.amount);
              return (
                <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-4 py-3 text-xs">
                    <div className="font-mono">{r.user?.userID ?? "—"}</div>
                    <div>{userDisplayName(r.user)}</div>
                    <div className="text-muted">{r.user?.userTel ?? ""}</div>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${renderedAmount < 0 ? "text-red-700" : "text-green-700"}`}>
                    {renderedAmount > 0 ? "+" : ""}{renderedAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-xs space-y-0.5">
                    {r.bank_name    && <div>{r.bank_name}</div>}
                    {r.account_name && <div className="text-muted">{r.account_name}</div>}
                    {r.account_number && <div className="font-mono text-muted text-[11px]">{r.account_number}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{r.note ?? "—"}</td>
                  <td className="px-4 py-3"><PaymentStatusBadge s={r.status} /></td>
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString("th-TH") : "—"}</td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      )}

      {/* ── Quick-access cards — pulled in from the old /cargo hub
            (Wave 20 fix 2026-05-26). Shown only on the Summary tab so the
            other tabs stay focused on their ledgers. */}
      {tab === "summary" && (
        <section className="pt-2">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-3">
            🗂 หน้าบัญชีที่ใช้ได้ตอนนี้
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ACCOUNTING_HUB_CARDS.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="block rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm hover:shadow-md hover:border-primary-300 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground">{card.title}</h3>
                  <span className="rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 text-[11px] font-medium uppercase">
                    {card.badge}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted leading-relaxed">{card.desc}</p>
                <p className="mt-3 text-xs font-medium text-primary-600">เปิด →</p>
              </Link>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted italic">
            เมนูด้านบน (รายรับ / รายจ่าย / ผู้ติดต่อ / การเงิน / การบัญชี) เป็นโครงเดียวกับ legacy{" "}
            <code className="rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5">acc-system-cargo.php</code>{" "}
            — บางลิงก์ปลายทางยังเป็น placeholder (รอสร้างหน้าจริง)
          </p>
        </section>
      )}
    </main>
  );
}

// ── Shared sub-components ───────────────────────────────────────────────────

function SumCard({ label, value, tone = "green" }: { label: string; value: number; tone?: "green" | "blue" | "red" }) {
  const colors = { green: "text-green-700", blue: "text-blue-700", red: "text-red-700" }[tone];
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold font-mono ${colors}`}>
        ฿{value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
}

// T-P5: Hero "net revenue" card with comparison to previous same-length window.
// Falls back to a simpler card (no delta) if `hasComparison` is false — that
// happens when the date filter isn't a closed window (all-time view).
function OwnerHero({ netCurrent, netPrev, hasComparison, breakdown }: { netCurrent: number; netPrev: number; hasComparison: boolean; breakdown: Array<{ label: string; value: number }> }) {
  const deltaAbs = netCurrent - netPrev;
  const deltaPct = netPrev > 0 ? ((netCurrent - netPrev) / netPrev) * 100 : null;
  const trendColor =
    !hasComparison      ? "text-muted"
    : deltaAbs > 0      ? "text-green-700"
    : deltaAbs < 0      ? "text-red-700"
    :                     "text-muted";
  const trendIcon =
    !hasComparison      ? ""
    : deltaAbs > 0      ? "↑"
    : deltaAbs < 0      ? "↓"
    :                     "→";

  return (
    <div className="rounded-3xl border border-primary-300 bg-gradient-to-br from-primary-50 to-white dark:from-primary-950/30 dark:to-surface p-6 shadow-md flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
      {/* LEFT — รายรับสุทธิ ตัวเลขใหญ่ + trend */}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-primary-700 uppercase tracking-widest">รายรับสุทธิ {hasComparison ? "ในช่วงที่เลือก" : "(ทั้งหมด)"}</p>
        <p className="mt-2 text-4xl sm:text-5xl font-bold font-mono text-primary-700 tabular-nums">
          ฿{netCurrent.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
        </p>
        {hasComparison ? (
          <p className={`mt-2 text-sm font-medium ${trendColor}`}>
            {trendIcon} {deltaAbs >= 0 ? "+" : ""}฿{deltaAbs.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            {deltaPct !== null && (
              <> ({deltaAbs >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)</>
            )}
            <span className="text-muted font-normal"> เทียบช่วงก่อนหน้า (฿{netPrev.toLocaleString("th-TH", { minimumFractionDigits: 2 })})</span>
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted">
            เลือกช่วงเวลา (&ldquo;ตั้งแต่&rdquo; + &ldquo;ถึง&rdquo;) เพื่อดูเทียบกับช่วงก่อนหน้า
          </p>
        )}
      </div>
      {/* RIGHT — แยกตามแหล่งรายรับ (เติมพื้นที่ให้สมดุล) */}
      <div className="grid grid-cols-3 gap-2 lg:gap-3 shrink-0 lg:min-w-[340px]">
        {breakdown.map((b) => (
          <div key={b.label} className="rounded-xl border border-primary-100 bg-white/70 dark:bg-surface/60 px-3 py-2.5 text-center">
            <p className="text-[11px] text-muted leading-tight">{b.label}</p>
            <p className="mt-1 text-sm font-bold font-mono text-primary-700 tabular-nums">
              ฿{b.value.toLocaleString("th-TH", { maximumFractionDigits: 0 })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// T-P5: pipeline / quick-look card. value is a string so it can show
// counts ("12 รายการ") or money ("฿4,500.00") — owner shouldn't have to
// guess units.
function PipelineCard({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  href: string;
  tone: "yellow" | "blue" | "green";
}) {
  const borderColor =
    tone === "yellow" ? "border-yellow-200"
    : tone === "blue" ? "border-blue-200"
    :                   "border-green-200";
  const valueColor =
    tone === "yellow" ? "text-yellow-700"
    : tone === "blue" ? "text-blue-700"
    :                   "text-green-700";
  return (
    <Link
      href={href}
      className={`rounded-2xl border ${borderColor} bg-white dark:bg-surface p-4 shadow-sm hover:shadow-md transition-shadow block`}
    >
      <p className="text-xs text-muted font-medium">{label}</p>
      <p className={`mt-1 text-lg font-bold font-mono ${valueColor}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted">{hint}</p>
    </Link>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" | "warn" }) {
  const color = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : tone === "warn" ? "text-yellow-700" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${color}`}>{value}</p>
    </div>
  );
}

function ForwarderStatusBadge({ s }: { s: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${FORWARDER_BADGE[s] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {legacyForwarderStatusThai(s) || s}
    </span>
  );
}

function OrderStatusBadge({ s }: { s: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${ORDER_BADGE[s] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {legacyOrderStatusThai(s) || s}
    </span>
  );
}

function PaymentStatusBadge({ s }: { s: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${PAYMENT_BADGE[s] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {PAYMENT_LABEL[s] ?? s}
    </span>
  );
}

function DataTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: React.ReactNode;
  empty: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      {empty ? (
        <p className="p-12 text-center text-sm text-muted">ไม่มีรายการที่ตรงกัน</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                {headers.map((h) => (
                  <th key={h} className={`px-4 py-3 ${h.startsWith("ราคา") || h.startsWith("ยอด") || h.startsWith("น้ำ") || h === "หยวน" || h === "อัตรา" || h === "บาท" || h === "ชิ้น" || h === "จำนวน (฿)" ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ภูม #9 PEAK redesign — RevenueTrendChart
// 30-day daily revenue bar chart · pure SVG · no chart-lib dependency.
// Inputs: array of { d: "YYYY-MM-DD", v: number } sorted oldest → newest.
// Renders responsive: chart scales to container width via viewBox.
// ─────────────────────────────────────────────────────────────────────
function RevenueTrendChart({ data }: { data: Array<{ d: string; v: number }> }) {
  if (data.length === 0) return null;
  const maxV   = Math.max(1, ...data.map((p) => p.v));
  const total  = data.reduce((s, p) => s + p.v, 0);
  const avg    = total / data.length;
  const peakP  = data.reduce((best, p) => (p.v > best.v ? p : best), data[0]!);
  const activeDays = data.filter((p) => p.v > 0).length;
  const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
  const thaiDay = (iso: string) => {
    // "YYYY-MM-DD" → "D ม.ค." (readable, never cramped like a stretched SVG label)
    const MO = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const [, m, d] = iso.split("-");
    return `${Number(d)} ${MO[Number(m) - 1] ?? m}`;
  };
  const midP = data[Math.floor(data.length / 2)]!;

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm">
      {/* header — title + 3 clean stat pills */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-base font-bold text-foreground">📈 รายได้ {data.length} วันย้อนหลัง</h2>
          <p className="text-[11px] text-muted mt-0.5">
            ฝากนำเข้า (ส่งแล้ว) + ฝากโอนหยวน (สำเร็จ) + ฝากสั่งซื้อ (สำเร็จ)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "รวมทั้งช่วง", value: `฿${fmt(total)}`, cls: "border-primary-200 bg-primary-50 text-primary-700" },
            { label: "เฉลี่ย/วัน", value: `฿${fmt(avg)}`, cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
            { label: `วันสูงสุด · ${thaiDay(peakP.d)}`, value: `฿${fmt(peakP.v)}`, cls: "border-blue-200 bg-blue-50 text-blue-700" },
          ].map((s) => (
            <div key={s.label} className={`rounded-lg border px-3 py-1.5 ${s.cls}`}>
              <p className="text-[11px] leading-none opacity-80">{s.label}</p>
              <p className="text-sm font-bold leading-tight mt-0.5 tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* chart — CSS flexbox bars (fully responsive · no SVG stretch distortion) */}
      <div className="relative h-40 rounded-lg bg-surface-alt/30 px-1 pt-1">
        {/* ค่าเฉลี่ย dashed reference line */}
        {avg > 0 && (
          <div
            className="pointer-events-none absolute inset-x-1 border-t border-dashed border-emerald-400/80"
            style={{ bottom: `${Math.min(98, (avg / maxV) * 100)}%` }}
          >
            <span className="absolute -top-4 right-0 rounded bg-emerald-50 px-1 text-[11px] font-medium text-emerald-700">
              เฉลี่ย ฿{fmt(avg)}
            </span>
          </div>
        )}
        <div className="flex h-full items-end gap-[2px]">
          {data.map((p) => {
            const pct = (p.v / maxV) * 100;
            const isPeak = p.d === peakP.d && p.v > 0;
            return (
              <div
                key={p.d}
                className="group relative flex h-full flex-1 items-end"
                title={`${thaiDay(p.d)} — ฿${fmt(p.v)}`}
              >
                <div
                  className={`w-full rounded-t transition-colors ${
                    p.v > 0 ? (isPeak ? "bg-blue-500" : "bg-primary-600 group-hover:bg-primary-500") : "bg-gray-200/70"
                  }`}
                  style={{ height: p.v > 0 ? `${Math.max(pct, 3)}%` : "3px" }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* x-axis — first · mid · last (HTML → always crisp, never cut off) */}
      <div className="mt-1.5 flex justify-between text-[11px] text-muted">
        <span>{thaiDay(data[0]!.d)}</span>
        <span>{thaiDay(midP.d)}</span>
        <span>{thaiDay(data[data.length - 1]!.d)}</span>
      </div>

      {/* legend */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary-600"></span> รายวัน</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500"></span> วันสูงสุด</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-emerald-500"></span> ค่าเฉลี่ย</span>
        <span className="ml-auto">มีรายรับ {activeDays}/{data.length} วัน</span>
      </div>
    </div>
  );
}
