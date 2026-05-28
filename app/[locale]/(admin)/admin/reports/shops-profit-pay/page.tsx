/**
 * /admin/reports/shops-profit-pay — รายงานเบิกเงินส่วนแบ่งร้านค้า
 *
 * **Wave 23 P1 batch 3 (2026-05-27 morning):** new Pacred surface ported
 * 1:1 from legacy `pcs-admin/report-shops-profit-pay.php` (33 KB · 435
 * LOC PHP). Closes Tech-debt #15 (the PCS Freight branch this report
 * lives in had no Pacred equivalent before today). Read-only profit
 * triage report for the shop-order disbursement flow:
 *
 *   - Lists every `tb_header_order` row whose wallet payment confirmed
 *     (`tb_wallet_hs.status='2'`) and whose order isn't cancelled
 *     (`hstatus > 2 AND hstatus != 6`)
 *   - Computes per-row profit math:
 *       priceUser = (hTotalPriceCHN + hShippingCHN) * hRate   // ลูกค้าจ่าย
 *       pricePCS  = hRateCost * hCostAll                       // Pacred ซื้อจริง
 *       profit    = priceUser - pricePCS                       // ค่าบริการ/กำไร
 *       VAT       = profit * 0.07                              // ภาษี 7%
 *   - 4 aggregate totals in the footer card
 *   - Status chip per row (hstatus) + payout chip (hshoppay)
 *   - Filter: date range (default month-to-date) + sStatus (all/unpaid/paid)
 *   - CSV export of all visible rows
 *
 * **DEFERRED to Phase C / Wave 24+** (per AGENTS §0a — fidelity first,
 * enhancement second): the legacy "เบิกจ่ายค่าสินค้า" multi-select +
 * INSERT-into-tb_shop_pay_h batch-create action (legacy L4-62 + L357-371).
 * That flow needs new Pacred infrastructure (tb_shop_pay_h migration · server
 * action · ADR for the payout-batch state machine · 5+ hours of work) — out
 * of scope for the chrome-rewrite phase. A banner in the page UI links staff
 * to `/admin/shop-payouts` (the customer-initiated withdrawal queue, which
 * IS implemented) for the meantime.
 *
 * **Two surfaces, two flows (don't conflate):**
 *   - `/admin/shop-payouts` (existing · Wave 21 · `tb_shop_transactions`)
 *     = customer push — shop owner requests payout, admin approves
 *   - `/admin/reports/shops-profit-pay` (this file · Wave 23 P1 batch 3)
 *     = admin pull — staff sees which orders haven't been disbursed yet
 *       so they can decide who to bulk-pay (legacy workflow)
 *
 * §0c compliance: every Supabase query destructures `{ data, error }` +
 * `console.error` on failure. The 2 driving queries (tb_header_order +
 * tb_wallet_hs) hard-throw; the tb_users decoration query soft-fails so
 * a stale customer name doesn't 500 the report.
 *
 * **Wave 24 #189 (2026-05-27 ค่ำ):** drop the silent `.limit(1000)` PostgREST
 * cap → swap for `?offset=`-based pagination (200 rows per page) + a separate
 * `count: "exact", head: true` query for the grand total. Footer renders
 * Prev/Next + "หน้า X จาก Y · แสดง M-N จาก T". Same pattern Agent B used on
 * `/admin/reports/forwarder` (commit `399ed01`) and `/admin/reports/payment`
 * (#185 · `22dd746`). **NOTE:** the "ทั้งหมด" count reflects the
 * `tb_header_order` DB-side filtered set (date + hStatus + sStatus on
 * hshoppay) — it does NOT subtract orders that fail the post-query
 * `tb_wallet_hs.status='2'` confirmation filter (PostgREST can't perform
 * that join in a head count). So the rendered page may show fewer rows
 * than `totalRows` would suggest; this is an honest upper-bound, matching
 * legacy behaviour (legacy used SQL JOINs at the DB layer for the exact
 * count, which Supabase REST can't replicate cleanly for a text-FK join).
 *
 * Pattern source: `reports/payment/page.tsx` (Wave 20 P1 batch 2-b).
 * Legacy source: D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\report-shops-profit-pay.php
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { CsvButton } from "@/components/admin/csv-button";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";

export const dynamic = "force-dynamic";

// ── Pagination constants (Wave 24 #189) ──────────────────────────────────
const PAGE_SIZE = 200;

// ── Helpers ──────────────────────────────────────────────────────────────

function firstDayOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastDayOfThisMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}
function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Round-up to 2 decimals — matches legacy `round_up()` helper. */
function roundUp2(n: number): number {
  return Math.ceil(n * 100) / 100;
}

// tb_header_order.hstatus enum (per migration 0081 column comment).
const ORDER_STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "รอชำระเงิน",
  "3": "สั่งสินค้า",
  "4": "รอร้านจีนจัดส่ง",
  "5": "สำเร็จ",
  "6": "ยกเลิกออเดอร์",
};
const ORDER_STATUS_CLS: Record<string, string> = {
  "1": "bg-amber-50 text-amber-700 border-amber-200",
  "2": "bg-red-50 text-red-700 border-red-200",
  "3": "bg-blue-50 text-blue-700 border-blue-200",
  "4": "bg-amber-50 text-amber-700 border-amber-200",
  "5": "bg-green-50 text-green-700 border-green-200",
  "6": "bg-red-50 text-red-700 border-red-200",
};

const S_STATUS_OPTIONS = [
  { value: "all",    label: "ทั้งหมด" },
  { value: "unpaid", label: "ยังไม่จ่าย" },
  { value: "paid",   label: "เบิกจ่ายแล้ว" },
];

// Reports menubar (mirrors REPORTS_MENUBAR shape from /admin/reports/page.tsx).
const REPORTS_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/reports" },
  {
    label: "ฝั่งบัญชี",
    children: [
      { label: "ฝากสั่ง",                   href: "/admin/reports/shop" },
      { label: "ฝากนำเข้า",                 href: "/admin/reports/forwarder" },
      { label: "ฝากชำระ",                   href: "/admin/reports/payment" },
      { label: "เบิกเงินส่วนแบ่งร้านค้า",   href: "/admin/reports/shops-profit-pay" },
    ],
  },
  { label: "การเข้าถึงระบบ", href: "/admin/reports/system" },
];

// ── Row shapes ───────────────────────────────────────────────────────────

type RawHeaderOrder = {
  id: number;
  hno: string;
  hdate: string | null;
  hdatepayment: string | null;
  hstatus: string | null;
  htitle: string | null;
  hcount: number | null;
  htotalpricechn: number | string | null;
  hshippingchn: number | string | null;
  hrate: number | string | null;
  hratecost: number | string | null;
  hcostall: number | string | null;
  hshoppay: string | null;
  userid: string | null;
};

type RawWalletHs = {
  reforder: string | null;
  status: string | null;
};

type RawUser = {
  userid: string;
  username: string | null;
  userlastname: string | null;
};

type Row = RawHeaderOrder & {
  priceUser: number;  // ลูกค้าจ่าย
  pricePCS:  number;  // Pacred ซื้อจริง (cost)
  profit:    number;  // กำไร / ค่าบริการ
  vat:       number;  // 7% ของกำไร
  customer:  string;  // ชื่อลูกค้า (decorated)
};

// ── Page ─────────────────────────────────────────────────────────────────

type SP = {
  report_shopsTable?: string;
  sStatus?:    string;
  date_from?:  string;
  date_to?:    string;
  offset?:     string;
};

export default async function AdminReportShopsProfitPayPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  const submitted = sp.report_shopsTable === "true";
  const dateFrom  = sp.date_from ?? firstDayOfThisMonth();
  const dateTo    = sp.date_to   ?? lastDayOfThisMonth();
  const sStatus   = sp.sStatus   ?? "all";

  // Wave 24 #189 — parse + clamp ?offset= (default 0, never negative).
  const offsetRaw = Number(sp.offset ?? 0);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;

  // 1) Fetch tb_header_order in date range + non-cancelled + past payment stage.
  //    Mirrors legacy: hStatus>2 AND hStatus<>6 + date filter.
  //    Wave 24 #189: dropped the silent `.limit(1000)` cap → `.range()` +
  //    a separate `count: "exact", head: true` query for the grand total.
  //    (Note: count is the DB-side filtered count — see JSDoc at top for the
  //    post-query wallet-confirmation caveat.)
  let q = admin
    .from("tb_header_order")
    .select(
      "id, hno, hdate, hdatepayment, hstatus, htitle, hcount, " +
      "htotalpricechn, hshippingchn, hrate, hratecost, hcostall, hshoppay, userid",
    )
    .gte("hdate", `${dateFrom} 00:00:00`)
    .lte("hdate", `${dateTo} 23:59:59`)
    .gt("hstatus", "2")
    .neq("hstatus", "6")
    .order("hdate", { ascending: false, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (sStatus === "paid")   q = q.eq("hshoppay", "1");
  if (sStatus === "unpaid") q = q.is("hshoppay", null);

  // 2) Exact-count head query (mirrors the same DB-side filter set).
  let totalQ = admin
    .from("tb_header_order")
    .select("id", { count: "exact", head: true })
    .gte("hdate", `${dateFrom} 00:00:00`)
    .lte("hdate", `${dateTo} 23:59:59`)
    .gt("hstatus", "2")
    .neq("hstatus", "6");
  if (sStatus === "paid")   totalQ = totalQ.eq("hshoppay", "1");
  if (sStatus === "unpaid") totalQ = totalQ.is("hshoppay", null);

  const [
    { data: orderData, error: orderErr },
    { count: grandTotal, error: countErr },
  ] = await Promise.all([q, totalQ]);

  if (orderErr) {
    console.error(`[tb_header_order list] failed`, {
      code: orderErr.code, message: orderErr.message, details: orderErr.details,
    });
    throw new Error(`Failed to load tb_header_order (${orderErr.code ?? "unknown"}): ${orderErr.message}`);
  }
  if (countErr) {
    // Count is a UX nicety, not load-bearing — log + fall through.
    console.error(`[tb_header_order count] failed`, {
      code: countErr.code, message: countErr.message,
    });
  }
  const ordersAll = (orderData ?? []) as unknown as RawHeaderOrder[];

  // 2) Wallet-confirmed filter — 2-pass join (PostgREST can't auto-join the
  //    legacy `reforder` text FK). Keep only orders that have at least one
  //    tb_wallet_hs row with status='2' (payment confirmed).
  const confirmedHnos = new Set<string>();
  if (ordersAll.length > 0) {
    const hnos = Array.from(new Set(ordersAll.map((o) => o.hno).filter(Boolean))) as string[];
    const { data: walletData, error: walletErr } = await admin
      .from("tb_wallet_hs")
      .select("reforder, status")
      .in("reforder", hnos)
      .eq("status", "2");
    if (walletErr) {
      console.error(`[tb_wallet_hs join] failed`, {
        code: walletErr.code, message: walletErr.message,
      });
      throw new Error(`Failed to load tb_wallet_hs (${walletErr.code ?? "unknown"}): ${walletErr.message}`);
    }
    for (const w of (walletData ?? []) as unknown as RawWalletHs[]) {
      if (w.reforder) confirmedHnos.add(w.reforder);
    }
  }
  const orders = ordersAll.filter((o) => o.hno && confirmedHnos.has(o.hno));

  // 3) 2-pass tb_users decoration for customer name.
  const userIds = Array.from(new Set(orders.map((o) => o.userid).filter(Boolean))) as string[];
  const userMap = new Map<string, RawUser>();
  if (userIds.length > 0) {
    const { data: usersData, error: usersErr } = await admin
      .from("tb_users")
      .select("userid, username, userlastname")
      .in("userid", userIds);
    if (usersErr) {
      // Soft-fail per §0c — stale customer name shouldn't 500 the report.
      console.error(`[tb_users join] soft-fail`, { code: usersErr.code, message: usersErr.message });
    } else {
      for (const u of (usersData ?? []) as unknown as RawUser[]) userMap.set(u.userid, u);
    }
  }

  // 4) Shape rows + compute profit math.
  // Pure map — no in-loop accumulators (react-hooks/immutability rule).
  // Aggregates derived from rows[] via reduce afterwards.
  const rows: Row[] = orders.map((o) => {
    const totalChn  = Number(o.htotalpricechn ?? 0);
    const shipChn   = Number(o.hshippingchn ?? 0);
    const rate      = Number(o.hrate ?? 0);
    const rateCost  = Number(o.hratecost ?? 0);
    const costAll   = Number(o.hcostall ?? 0);
    const priceUser = roundUp2((totalChn + shipChn) * rate);
    const pricePCS  = roundUp2(rateCost * costAll);
    // Legacy only counts profit when hCostAll != 0 (else "รอคำนวณ").
    const hasCost   = costAll !== 0;
    const profit    = hasCost ? priceUser - pricePCS : NaN;
    const vat       = hasCost ? profit * 0.07 : NaN;
    const u = o.userid ? userMap.get(o.userid) : undefined;
    return {
      ...o,
      priceUser,
      pricePCS:  hasCost ? pricePCS : NaN,
      profit,
      vat,
      customer:  u ? `${u.username ?? ""} ${u.userlastname ?? ""}`.trim() : "",
    };
  });

  // 5) Aggregates — fully immutable reduce (no mutation; new object each step)
  // so it passes the react-hooks/immutability rule cleanly.
  const totals = rows.reduce(
    (acc, r) =>
      Number.isFinite(r.profit)
        ? {
            pricePCSAll:  acc.pricePCSAll + r.pricePCS,
            priceUserAll: acc.priceUserAll + r.priceUser,
            profitAll:    acc.profitAll + r.profit,
            vatAll:       acc.vatAll + r.vat,
          }
        : acc,
    { pricePCSAll: 0, priceUserAll: 0, profitAll: 0, vatAll: 0 },
  );
  const { pricePCSAll, priceUserAll, profitAll, vatAll } = totals;

  const unpaidCount = rows.filter((r) => !r.hshoppay).length;
  const paidCount   = rows.filter((r) => r.hshoppay === "1").length;

  // Wave 24 #189 — pagination boundary + Prev/Next href builder. Mirrors
  // /admin/reports/payment commit 22dd746 (which mirrors /reports/forwarder
  // 399ed01 · which mirrors cnt-hs/page.tsx).
  //
  // NOTE: `totalRows` is the DB-side filtered count from PostgREST head query —
  // it does NOT subtract orders that fail the post-query tb_wallet_hs
  // confirmation filter. So `rows.length` (visible after wallet-confirm filter)
  // is generally <= the page slice from `totalRows`. The "ทั้งหมด" card +
  // footer total reflect the DB-side filtered upper bound (honest because
  // legacy used SQL JOIN at the DB layer; Supabase REST can't replicate that
  // cleanly for the text-FK reforder join).
  const totalRows = grandTotal ?? ordersAll.length;
  const hasPrev = offset > 0;
  // ordersAll.length is the unfiltered DB slice — if the page got a full
  // PAGE_SIZE we likely have more to fetch (some may filter out post-join).
  const hasNext = offset + ordersAll.length < totalRows;
  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const rangeFrom = totalRows === 0 ? 0 : offset + 1;
  const rangeTo = Math.min(offset + ordersAll.length, totalRows);
  const buildPageHref = (newOffset: number): string => {
    const params = new URLSearchParams();
    if (sp.report_shopsTable) params.set("report_shopsTable", sp.report_shopsTable);
    if (sp.sStatus)           params.set("sStatus", sp.sStatus);
    if (sp.date_from)         params.set("date_from", sp.date_from);
    if (sp.date_to)           params.set("date_to", sp.date_to);
    if (newOffset > 0)        params.set("offset", String(newOffset));
    const qs = params.toString();
    return qs ? `/admin/reports/shops-profit-pay?${qs}` : "/admin/reports/shops-profit-pay";
  };

  // 5) CSV.
  const csvRows = rows.map((r) => ({
    id:        r.id,
    hno:       r.hno,
    hdate:     r.hdate ?? "",
    customer:  r.customer,
    userid:    r.userid ?? "",
    htitle:    r.htitle ?? "",
    hcount:    r.hcount ?? 0,
    pricePCS:  Number.isFinite(r.pricePCS) ? r.pricePCS : 0,
    priceUser: r.priceUser,
    profit:    Number.isFinite(r.profit) ? r.profit : 0,
    vat:       Number.isFinite(r.vat) ? r.vat : 0,
    hstatus:   ORDER_STATUS_LABEL[r.hstatus ?? ""] ?? r.hstatus ?? "",
    payout:    r.hshoppay === "1" ? "เบิกจ่ายแล้ว" : "ยังไม่จ่าย",
  }));
  const csvCols = [
    { key: "hdate",     label: "วันที่ชำระ" },
    { key: "id",        label: "ID" },
    { key: "hno",       label: "เลขออเดอร์" },
    { key: "userid",    label: "รหัสลูกค้า" },
    { key: "customer",  label: "ชื่อลูกค้า" },
    { key: "htitle",    label: "สินค้า" },
    { key: "hcount",    label: "จำนวนรายการ" },
    { key: "pricePCS",  label: "ราคาต้นทุน (บาท)" },
    { key: "priceUser", label: "ราคาขาย (บาท)" },
    { key: "profit",    label: "ค่าบริการ/กำไร (บาท)" },
    { key: "vat",       label: "VAT 7% (บาท)" },
    { key: "hstatus",   label: "สถานะออเดอร์" },
    { key: "payout",    label: "สถานะเบิก" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <PageTopMenubar items={REPORTS_MENUBAR} />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รายงาน · เบิกเงิน</p>
          <h1 className="mt-1 text-2xl font-bold">เบิกเงินส่วนแบ่งร้านค้า</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono">tb_header_order</span> ↔ <span className="font-mono">tb_wallet_hs</span> ·
            ออเดอร์ที่ลูกค้าจ่ายเงินสำเร็จและพร้อมเบิกส่วนแบ่งให้ร้านค้า
          </p>
        </div>
        <Link
          href="/admin/reports"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      {/* Phase C placeholder banner — disbursement action deferred */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 leading-relaxed">
        🚧 <span className="font-semibold">โหมด read-only</span> — หน้ารายงานแสดงข้อมูลกำไร/ค่าบริการสำหรับการเบิกจ่ายเท่านั้น.
        ปุ่ม &quot;เบิกจ่ายค่าสินค้า&quot; (multi-select + สร้างใบเบิกใหม่ <span className="font-mono">tb_shop_pay_h</span>)
        กำหนดส่งใน Phase C / Wave 24+ — ต้องการ migration ใหม่ + ADR สำหรับ payout-batch state machine.
        ระหว่างนี้: ลูกค้า/ร้านค้าขอเบิกผ่าน{" "}
        <Link href="/admin/shop-payouts" className="font-semibold underline hover:text-amber-700">
          /admin/shop-payouts
        </Link>{" "}
        (queue เบิกเงินจากกระเป๋าร้าน — Wave 21 ปิดแล้ว).
      </div>

      {/* Wave 24 #189 — pagination notice (replaces the silent 1000-cap). */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
        <span aria-hidden>✓</span>
        <div className="flex-1">
          <span className="font-semibold">ลบเพดาน 1,000 แถวต่อหน้าแล้ว</span> ·
          แบ่งหน้าละ {PAGE_SIZE.toLocaleString("th-TH")} รายการ ·
          ใช้ปุ่ม &ldquo;ก่อนหน้า / ถัดไป&rdquo; ใต้ตารางเพื่อดูทั้งหมด.
          <span className="text-emerald-700/80">{" "}(Wave 24 #189)</span>
        </div>
      </div>

      {/* Filter banner (when submitted) */}
      {submitted && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ผลลัพธ์การค้นหา · สถานะเบิก:{" "}
          <span className="font-semibold">
            {S_STATUS_OPTIONS.find((o) => o.value === sStatus)?.label ?? "ทั้งหมด"}
          </span>
          {" · "}
          ช่วงวันที่: <span className="font-semibold">{dateFrom}</span> ถึง{" "}
          <span className="font-semibold">{dateTo}</span>
        </div>
      )}

      {/* Filter form */}
      <form
        method="GET"
        action="/admin/reports/shops-profit-pay"
        className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3"
      >
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="sStatus" className="block text-xs text-muted mb-1">
              สถานะเบิกจ่าย
            </label>
            <select
              id="sStatus"
              name="sStatus"
              defaultValue={sStatus}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            >
              {S_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="date_from" className="block text-xs text-muted mb-1">
              ตั้งแต่
            </label>
            <input
              id="date_from"
              type="date"
              name="date_from"
              defaultValue={dateFrom}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <div>
            <label htmlFor="date_to" className="block text-xs text-muted mb-1">
              ถึง
            </label>
            <input
              id="date_to"
              type="date"
              name="date_to"
              defaultValue={dateTo}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="submit"
            name="report_shopsTable"
            value="true"
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
          >
            ค้นหาข้อมูล
          </button>
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename={`shops-profit-pay-${dateFrom}-${dateTo}.csv`}
          />
        </div>
      </form>

      {/* Stat cards — Wave 24 #189 prepended "ทั้งหมด (ทุกหน้า)" so the
          grand total isn't misread as the page subtotal; the 4 aggregate
          cards stay page-scoped (their values are derived from rendered
          rows only). */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Card label="ทั้งหมด (ทุกหน้า)" value={totalRows.toLocaleString("th-TH")} />
        <Card label="ราคาทุนรวม (หน้านี้)"  value={thb(pricePCSAll)} />
        <Card label="ราคาขายรวม (หน้านี้)" value={thb(priceUserAll)} />
        <Card label="ค่าบริการ/กำไรรวม (หน้านี้)" value={thb(profitAll)} highlight />
        <Card label="VAT 7% รวม (หน้านี้)" value={thb(vatAll)} highlight />
      </div>

      {/* Sub-stats */}
      <div className="flex items-center gap-3 text-xs text-muted">
        <span>รายการทั้งหมด: <strong className="font-mono text-foreground">{rows.length}</strong></span>
        <span>·</span>
        <span>ยังไม่เบิก: <strong className="font-mono text-red-700">{unpaidCount}</strong></span>
        <span>·</span>
        <span>เบิกแล้ว: <strong className="font-mono text-green-700">{paidCount}</strong></span>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีออเดอร์ในช่วงเวลานี้ที่ตรงเงื่อนไข</p>
        ) : (
          <>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">วันที่ชำระ</th>
                  <th className="px-4 py-3">เลขออเดอร์</th>
                  <th className="px-4 py-3">สินค้า</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3 text-right">ต้นทุน</th>
                  <th className="px-4 py-3 text-right">ขาย</th>
                  <th className="px-4 py-3 text-right">กำไร</th>
                  <th className="px-4 py-3 text-right">VAT 7%</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">เบิก</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30 align-top">
                    <td className="px-4 py-3 font-mono text-xs">{r.id}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                      {r.hdate ? new Date(r.hdate).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/admin/service-orders/${r.hno}`}
                        className="text-primary-600 hover:underline"
                      >
                        {r.hno}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-xs truncate" title={r.htitle ?? ""}>
                      {r.htitle ?? "—"}
                      {r.hcount && r.hcount > 1 ? (
                        <span className="text-muted ml-1">และอีก {r.hcount - 1} รายการ</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.userid ? (
                        <Link
                          href={`/admin/customers/${r.userid}`}
                          className="text-primary-600 hover:underline"
                        >
                          {r.customer || "—"}
                        </Link>
                      ) : (
                        <span>—</span>
                      )}
                      {r.userid && <div className="font-mono text-[10px] text-muted">{r.userid}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {Number.isFinite(r.pricePCS) ? thb(r.pricePCS) : <span className="text-muted">รอคำนวณ</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.priceUser)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-red-700">
                      {Number.isFinite(r.profit) ? thb(r.profit) : <span className="text-muted">รอคำนวณ</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-red-700">
                      {Number.isFinite(r.vat) ? thb(r.vat) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap ${
                          ORDER_STATUS_CLS[r.hstatus ?? ""] ?? "bg-gray-50 text-gray-600 border-gray-200"
                        }`}
                      >
                        {ORDER_STATUS_LABEL[r.hstatus ?? ""] ?? r.hstatus ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.hshoppay === "1" ? (
                        <span className="rounded-full border bg-green-50 text-green-700 border-green-200 px-2 py-0.5 text-[10px] whitespace-nowrap">
                          เบิกจ่ายแล้ว
                        </span>
                      ) : (
                        <span className="rounded-full border bg-red-50 text-red-700 border-red-200 px-2 py-0.5 text-[10px] whitespace-nowrap">
                          ยังไม่จ่าย
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Wave 24 #189 — Prev/Next footer (only when there's >1 page). */}
          {(hasPrev || hasNext) && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted flex-wrap">
              <span>
                หน้า <span className="font-semibold text-foreground">{pageNumber.toLocaleString("th-TH")}</span> จาก{" "}
                <span className="font-semibold text-foreground">{totalPages.toLocaleString("th-TH")}</span>
                {" · "}
                แสดง <span className="font-semibold text-foreground">{rangeFrom.toLocaleString("th-TH")}</span>
                –<span className="font-semibold text-foreground">{rangeTo.toLocaleString("th-TH")}</span> จากทั้งหมด{" "}
                <span className="font-semibold text-foreground">{totalRows.toLocaleString("th-TH")}</span>
              </span>
              <div className="flex gap-2">
                {hasPrev ? (
                  <Link
                    href={buildPageHref(prevOffset)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
                  >
                    ← ก่อนหน้า
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium opacity-40 pointer-events-none"
                  >
                    ← ก่อนหน้า
                  </span>
                )}
                {hasNext ? (
                  <Link
                    href={buildPageHref(nextOffset)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt"
                  >
                    ถัดไป →
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium opacity-40 pointer-events-none"
                  >
                    ถัดไป →
                  </span>
                )}
              </div>
            </div>
          )}
          </>
        )}
      </div>

      <p className="text-[11px] text-muted">
        หน้าละ {PAGE_SIZE.toLocaleString("th-TH")} รายการ · ใช้ตัวกรองช่วงวันที่/สถานะเพื่อจำกัดผลลัพธ์ ·
        CSV ดาวน์โหลดเฉพาะหน้าที่แสดง (หากต้องการครบทุกหน้า ให้ไล่กดถัดไปแล้วโหลดทีละหน้า) ·
        กำไร = ราคาขาย − ราคาต้นทุน (เฉพาะออเดอร์ที่บันทึก hCostAll แล้ว)
      </p>
    </main>
  );
}

function Card({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-red-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${highlight ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}
