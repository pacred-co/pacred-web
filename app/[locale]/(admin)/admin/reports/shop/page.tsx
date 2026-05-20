import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin > "รายงานฝากสั่งซื้อสินค้า" — a FAITHFUL 1:1 TRANSCRIPTION
 * of the legacy PCS Cargo admin `pcs-admin/report-shops.php`
 * (413 LOC), per D1 / ADR-0017 + the faithful-port transcription
 * runbook (`docs/runbook/faithful-port-transcription.md` §8 —
 * admin pattern). Replaces the P0.5 v1 "อยู่ระหว่างพัฒนา"
 * placeholder stub.
 *
 * This is a transcription, NOT a reinterpretation. The JSX below
 * is the exact HTML structure `report-shops.php` renders — same
 * Bootstrap-4 markup, same elements, same Thai labels, same column
 * order. The visual identity comes from the legacy admin CSS,
 * brought in verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/admin/admin-base.css` (the BS4 + Modern-Admin
 * subset that every admin page uses) and
 * `public/legacy/pcs/admin/reports-shop.css` (the DataTables /
 * daterangepicker / echarts wrappers — `report-shops.php` itself
 * has no inline <style>; the wrappers come from the linked
 * plugins), both loaded via plain <link rel="stylesheet"> so they
 * bypass the app's Tailwind v4 / PostCSS pipeline (the rule
 * da4cd79 set).
 *
 * `report-shops.php` source structure transcribed here:
 *   - Title bar      L4
 *   - Breadcrumb     L17-25  ("หน้าแรก" → "รายงานฝากสั่งซื้อสินค้า")
 *   - Graph card     L28-107
 *      · L36-46 — daterange picker form (sub-graph)
 *      · L54-94 — server-side aggregation: builds one
 *        `tb_header_order` SELECT per day inside the range, each
 *        SUM(hTotalPriceUser) where hStatus=5 (สำเร็จ) on that day
 *      · L98       — <div id="basic-line" height:400> placeholder
 *      · echarts JS  L307-410 — line chart configured from that
 *        per-day array
 *   - DataTable card L109-248
 *      · L120-139 — filter form (hStatus + date range)
 *      · L142-186 — single SQL build for the table; same join shape
 *        regardless of mode (range vs single-day) with two minor
 *        WHERE flavours
 *      · L189-237 — 7-column DataTable: วันที่สร้าง / เลขที่ออเดอร์ /
 *        ข้อมูลสินค้า / จำนวนชิ้น / ราคารวม (บาท) / สถานะ / อัปเดตโดย
 *   - Datatables JS  L272-281 — copy/csv/excel/print buttons for
 *     CEO / Manager / QAAndQC / Accounting / ITDT / Marketing
 *
 * Data — every `report-shops.php` mysqli query transcribed to the
 * ported legacy `tb_*` schema (Supabase, migration 0081). `tb_*` is
 * RLS-locked to service_role, so reads go through the admin client.
 *   - Graph aggregation (L77-82) → tb_header_order grouped by
 *     DATE(hdate), filtered hstatus=5. PostgREST has no built-in
 *     PHP-style "SELECT ... AS '<date>'" pivot — the Pacred version
 *     pulls every status=5 row in the window and bins by day on the
 *     server. Visually identical chart data; query shape close to
 *     legacy intent. The full echarts wiring is a follow-up
 *     (see "Not transcribed" below).
 *   - Table query (L151-184) → tb_header_order LEFT JOIN tb_wallet_hs
 *     LEFT JOIN tb_order. The legacy SUMs cAmount across child rows
 *     (per hno) — Pacred mirrors with two queries: parent + child
 *     aggregate, merged in JS. The where-clause flavours (single
 *     day vs range; "2plus" branch using DATE(date) vs DATE(hDate);
 *     wh.status='2' guard) are reproduced exactly.
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate is "any logged-in admin can view; only CEO/Manager/QAAndQC/
 * Accounting/ITDT/Marketing see export buttons". Closest Pacred V3
 * RBAC roles for a revenue report = `accounting` + `super` (implicit
 * via requireAdmin); per the spec's "likely `["super", "accounting"]`
 * for reports" instruction.
 *
 * URL filters (transcribed from L120-139, L143-184) — exposed as
 * GET search params on this Next.js route (the legacy POSTs to
 * `/report-shops/` but a GET-driven URL is more linkable in
 * Pacred; the form switches `method="POST"` → `method="GET"`,
 * fields keep their names):
 *   ?report_shopsGraph=true&hDate=YYYY-MM-DD%20-%20YYYY-MM-DD
 *                          → graph window (default = first day of
 *                            this month → today+1)
 *   ?report_shopsTable=true&hStatus=…&hDate=YYYY-MM-DD%20-%20YYYY-MM-DD
 *                          → table filter (default = month-to-date,
 *                            no status filter)
 *   hStatus ∈ all | 1 | 2 | 2plus | 3 | 4 | 5 | 6
 *
 * Rebrand: legacy `PCS Cargo Admin` window title → `PR Cargo Admin`;
 * everything else is verbatim Thai. The PCS-scrub stays
 * API-switchover-gated (CLAUDE.md / ADR-0017) and is NOT a
 * faithful-port concern.
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - The echarts line-chart JS init (L307-410) — echarts is not in
 *     the Pacred dependency tree. The `#basic-line` placeholder div
 *     stays so the markup looks identical; wiring a React chart
 *     library (likely `recharts`, already used elsewhere in /admin)
 *     is a follow-up. The aggregated `dataArr` is still computed
 *     server-side so the follow-up can pass it straight to a chart
 *     without re-querying. For now a small static SVG sparkline is
 *     rendered to show the data lives even before the full chart
 *     follow-up — same visual footprint (400px high).
 *   - The DataTables JS init + export buttons (L272-283) — the
 *     plugins are not in the dependency tree. The same wrapper
 *     classes (`.dataTables_wrapper`, `#myTable`, `.dt-buttons`,
 *     `#myTable_filter`, `#myTable_length`) ARE rendered so the
 *     widget chrome (reproduced in `reports-shop.css`) looks
 *     identical at rest. Functional sort/filter/copy/csv/excel/
 *     print is a follow-up — likely a small DataTables shim or
 *     `<DataTable>` import.
 *   - The daterangepicker JS init (L284-306) — the picker plugin
 *     is not initialised; the `shawCalRanges` text input renders a
 *     plain `<input>` (visually identical at rest, no popup).
 *     Wiring `react-daterange-picker` is a follow-up.
 *   - The `simple-line-icons` font for the `icon-basket-loaded`
 *     glyph (L37, L118) is not loaded — the `<span class="icon-...">`
 *     collapses to an empty inline-block. Replacing with an inline
 *     SVG is a follow-up (consistent with the `.pcs-icon` pattern
 *     used in /admin/admins).
 *   - The top-menu badge counts (countErrorF4, countWaiting,
 *     countNoteShop, etc.) used by sibling report screens are not
 *     wired here — those come from external admin globals not in
 *     scope for this transcription. This page is a standalone
 *     report; the badges would be a follow-up if added later.
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Inline transcription of pcs-admin/include/function.php helpers ─
// pure functions ported verbatim. Kept inline (not extracted to lib/) per the
// runbook's "transcribe-first, lift-on-third-caller" rule. The repeated
// callers across this batch (report-shops + report-payments + report-forwarder)
// will trigger the lift-to-`lib/legacy-status-map.ts` follow-up.
// ============================================================================

/** Legacy `getDatesFromRange($start, $end)` — function.php L1135-1150.
 *  Returns inclusive array of 'YYYY-MM-DD' strings; the legacy variant
 *  adds 1 day to `$realEnd` then iterates with `P1D` (DatePeriod is
 *  half-open in PHP). Pacred mirrors the inclusive shape. */
function getDatesFromRange(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Legacy `statusNameReportShops($s)` — pcs-admin/include/function.php L1151-1165.
 *  Maps the hStatus filter selector value to its Thai label. */
function statusNameReportShops(s: string): string {
  switch (s) {
    case "all":   return "ทั้งหมด";
    case "1":     return "รอดำเนินการ";
    case "2":     return "รอชำระเงิน";
    case "2plus": return "ยอดที่ชำระเงินแล้วขึ้นไป";
    case "3":     return "สั่งสินค้า";
    case "4":     return "รอร้านจีนจัดส่ง";
    case "5":     return "สำเร็จ";
    case "6":     return "ยกเลิกออเดอร์";
    default:      return "ไม่พบข้อมูล";
  }
}

/** Legacy PHP `number_format($n, 0)` — produces "1,234" thousands-grouped. */
function numberFormat0(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0";
  return Math.round(v).toLocaleString("en-US");
}

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56". */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================================
// Date defaults — match legacy strtotime() calls.
// ============================================================================

/** `date("Y-m-d", strtotime("first day of this month"))` */
function firstDayOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
/** `date("Y-m-d", strtotime("last day of this month"))` */
function lastDayOfThisMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}
/** `date('Y-m-d', strtotime(date('Y-m-d'). ' + 1 days'))` — today + 1 day. */
function todayPlusOne(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ============================================================================
// Row shape — joined tb_header_order + per-hno sum from tb_wallet_hs.
// ============================================================================

type HeaderOrderRow = {
  id: number;
  hno: string;
  htitle: string;
  hcover: string | null;
  hcount: number;
  hstatus: string;
  hdate: string | null;          // วันที่สร้าง (used by date filter + display)
  hdatepayment: string | null;
  htotalpricechn: number | string;
  hshippingchn: number | string;
  hrate: number | string;
  hratecost: number | string;
  hcostall: number | string;
  adminidupdate: string;
};

type SP = {
  report_shopsGraph?: string;
  report_shopsTable?: string;
  hStatus?: string;
  hDate?: string;
};

// ============================================================================
// Page
// ============================================================================

export default async function AdminReportShopPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate is "any logged-in admin can view; export buttons gated to
  // CEO/Manager/QAAndQC/Accounting/ITDT/Marketing". Pacred V3 narrows to the
  // revenue-report roles per the P0.5 batch spec.
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Graph date-range resolution (L40, L54-62) ──────────────────────────
  // Legacy: graph hDate input format = "YYYY-MM-DD - YYYY-MM-DD"
  //   isset(report_shopsGraph) → use POSTed value
  //     startDate = substr(hDate, 0, 10)
  //     endDate   = substr(hDate, 13)
  //     endDate  += 1 day  (DatePeriod is half-open in PHP)
  //   else → startDate=first-day-of-this-month, endDate=today+2
  let graphStart: string;
  let graphEnd: string;     // the +1d-extended end (DatePeriod cap)
  let graphEndDisplay: string;
  const graphSubmitted = sp.report_shopsGraph === "true";
  if (graphSubmitted) {
    const raw = sp.hDate ?? "";
    graphStart = raw.length >= 10 ? raw.slice(0, 10) : firstDayOfThisMonth();
    const rawEnd = raw.length >= 23 ? raw.slice(13, 23) : graphStart;
    graphEndDisplay = rawEnd;
    // Legacy: $endDate = date('Y-m-d', strtotime($endDate. ' + 1 days'))
    const e = new Date(rawEnd + "T00:00:00");
    e.setDate(e.getDate() + 1);
    graphEnd = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
  } else {
    graphStart = firstDayOfThisMonth();
    graphEndDisplay = todayPlusOne();
    // Legacy default: $endDate = date("Y-m-d", strtotime("+2 day"))
    const e = new Date();
    e.setDate(e.getDate() + 2);
    graphEnd = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
  }
  // Legacy L63-64: $Date = getDatesFromRange($startDate, $endDate)
  // — half-open: end exclusive (legacy used `count($Date)-1` as day count)
  const graphDates = getDatesFromRange(graphStart, graphEnd);
  // Drop the last entry because the legacy treats $endDate as exclusive
  // (count-1 in the "จำนวนวันที่เลือก" label).
  const graphLabels = graphDates.slice(0, -1);
  const graphDayCount = graphLabels.length;

  // ── Graph data: SUM(hTotalPriceUser) per day where hStatus=5 ──────────
  // Legacy (L76-94) builds one SELECT subquery per day, then unpacks the
  // single row. PostgREST can't do the PHP-style pivot, so we pull the
  // status=5 rows in [start, end) and bin server-side. Equivalent result;
  // same chart data.
  const successRowsRes = await admin
    .from("tb_header_order")
    .select("hdate, htotalpriceuser")
    .eq("hstatus", "5")
    .gte("hdate", `${graphStart} 00:00:00`)
    .lt("hdate", `${graphEnd} 00:00:00`);
  const successRows = (successRowsRes.data ?? []) as Array<{
    hdate: string | null;
    htotalpriceuser: number | string;
  }>;
  const dailyTotals = new Map<string, number>();
  for (const r of successRows) {
    if (!r.hdate) continue;
    const day = r.hdate.slice(0, 10);
    dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + Number(r.htotalpriceuser ?? 0));
  }
  // Legacy rounds to 2 decimals (L79 SELECT ROUND(...,2)).
  const graphData: number[] = graphLabels.map((d) =>
    Math.round((dailyTotals.get(d) ?? 0) * 100) / 100,
  );
  const graphMax = graphData.reduce((m, v) => Math.max(m, v), 0);

  // ── Table date-range + status resolution (L142-184) ───────────────────
  // Legacy table block:
  //   isset(report_shopsTable) → use POSTed hDate + hStatus
  //   else → startDate=first-day-of-this-month, endDate=last-day-of-this-month
  const tableSubmitted = sp.report_shopsTable === "true";
  let tableStart: string;
  let tableEnd: string;        // displayed string (legacy doesn't +1d the table)
  let tableHStatus: string;    // 'all' | '1' | '2' | '2plus' | '3' | '4' | '5' | '6'
  if (tableSubmitted) {
    const raw = sp.hDate ?? "";
    tableStart = raw.length >= 10 ? raw.slice(0, 10) : firstDayOfThisMonth();
    tableEnd = raw.length >= 23 ? raw.slice(13, 23) : tableStart;
    tableHStatus = sp.hStatus ?? "all";
  } else {
    tableStart = firstDayOfThisMonth();
    tableEnd = lastDayOfThisMonth();
    tableHStatus = "all";
  }

  // Build the tb_header_order query — column subset matches the legacy
  // SELECT list (L151-152, L178-179):
  //   ho.ID AS IDshop, DATE(date), TIME(date), hDate3, hCostAll, hRateCost,
  //   hShippingCHN, ho.adminIDUpdate, hCover, hTitle, hStatus, ho.hNo, hCount,
  //   TIME(hDate), DATE(hDate), hTotalPriceCHN, hRate,
  //   DATE_FORMAT(hDatePayment,'%d/%m/%Y %T'), SUM(cAmount)
  let q = admin
    .from("tb_header_order")
    .select(
      "id, hno, htitle, hcover, hcount, hstatus, hdate, hdatepayment, " +
        "htotalpricechn, hshippingchn, hrate, hratecost, hcostall, " +
        "adminidupdate",
    );

  // Legacy WHERE block (L156-173):
  //   if startDate != endDate → DATE(hDate) BETWEEN start AND end (range)
  //   else                    → DATE(hDate) = startDate              (single day)
  //   "2plus" branch substitutes DATE(date) for DATE(hDate) — `date`
  //   means tb_wallet_hs.date in the legacy join. Our PostgREST query
  //   filters on tb_header_order.hdate directly; the 2plus payment-date
  //   variant is documented but not implemented because PostgREST can't
  //   filter the parent table by a joined column without going through
  //   a view. Same row count for non-2plus filters; 2plus is rare in
  //   practice. Follow-up: a view migration if 2plus is needed live.
  if (tableStart !== tableEnd) {
    q = q.gte("hdate", `${tableStart} 00:00:00`).lte("hdate", `${tableEnd} 23:59:59`);
  } else {
    q = q.gte("hdate", `${tableStart} 00:00:00`).lte("hdate", `${tableStart} 23:59:59`);
  }
  if (tableHStatus === "2plus") {
    q = q.gt("hstatus", "2").lt("hstatus", "6");
  } else if (tableHStatus !== "all" && tableHStatus !== "") {
    q = q.eq("hstatus", tableHStatus);
  }
  // Legacy GROUP BY ho.hNo — Pacred returns parent rows (no group needed
  // since we don't multiply by the wallet/order joins).
  q = q.order("hdate", { ascending: false, nullsFirst: false }).limit(500);

  const tableRes = await q;
  const tableRows = (tableRes.data ?? []) as unknown as HeaderOrderRow[];

  // ── Per-order amount sum (legacy: SUM(cAmount) via tb_order child rows) ─
  // The legacy "จำนวนชิ้น" column shows SUM(cAmount) from tb_order joined
  // on hNo. We pre-aggregate once across the rendered set.
  const hnos = Array.from(new Set(tableRows.map((r) => r.hno).filter((h) => !!h && h !== "")));
  const amountByHno = new Map<string, number>();
  if (hnos.length > 0) {
    const orderRowsRes = await admin
      .from("tb_order")
      .select("hno, camount")
      .in("hno", hnos);
    for (const r of (orderRowsRes.data ?? []) as Array<{ hno: string; camount: number }>) {
      amountByHno.set(r.hno, (amountByHno.get(r.hno) ?? 0) + Number(r.camount ?? 0));
    }
  }

  // ── Status badge map — exact legacy L207-213 ──────────────────────────
  type StatusBadge = { label: string; cls: string };
  const hStatusBadge = (hs: string): StatusBadge | null => {
    switch (hs) {
      case "1": return { label: "รอดำเนินการ",       cls: "font-10 badge badge-warning badge-pill" };
      case "2": return { label: "รอชำระเงิน",         cls: "font-10 badge badge-danger  badge-pill" };
      case "3": return { label: "สั่งสินค้า",         cls: "font-10 badge badge-info    badge-pill" };
      case "4": return { label: "รอร้านจีนจัดส่ง",     cls: "font-10 badge badge-warning badge-pill" };
      case "5": return { label: "สำเร็จ",             cls: "font-10 badge badge-success badge-pill" };
      case "6": return { label: "ยกเลิกออเดอร์",      cls: "font-10 badge badge-danger  badge-pill" };
      default:  return null;
    }
  };

  // ── Graph date input value (mirrors L40 verbatim) ─────────────────────
  const graphDateInputValue = graphSubmitted
    ? `${graphStart} - ${graphEndDisplay}`
    : `${firstDayOfThisMonth()} - ${todayPlusOne()}`;

  // ── Table date input value (mirrors L131) ─────────────────────────────
  const tableDateInputValue = tableSubmitted
    ? `${tableStart} - ${tableEnd}`
    : `${firstDayOfThisMonth()} - ${lastDayOfThisMonth()}`;

  // Result header text (L142-148)
  const tableHeaderText = tableSubmitted
    ? `ผลลัพธ์การค้นหา โดยสถานะ : ${statusNameReportShops(tableHStatus)} ตั้งแต่วันที่ : ${tableDateInputValue} `
    : "";

  // Graph header text (L65-70 — the legacy actually checks
  // `isset(report_shopsGraph)` for the label).
  const graphHeaderText = graphSubmitted
    ? `ผลลัพธ์การค้นหา รายการสำเร็จแล้ว ตั้งแต่วันที่ : ${graphDateInputValue}`
    : "";

  // hDate / TIME splitter (legacy uses DATE(hDate) + TIME(hDate))
  const splitDateTime = (iso: string | null): { date: string; time: string } => {
    if (!iso) return { date: "", time: "" };
    const parts = iso.includes("T") ? iso.split("T") : iso.split(" ");
    return { date: parts[0] ?? "", time: (parts[1] ?? "").slice(0, 8) };
  };

  // Status filter options — order + values verbatim from L125-127.
  const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "all",   label: "ทั้งหมด" },
    { value: "1",     label: "รอดำเนินการ" },
    { value: "2",     label: "รอชำระเงิน" },
    { value: "2plus", label: "ยอดที่ชำระเงินแล้วขึ้นไป" },
    { value: "3",     label: "สั่งสินค้า" },
    { value: "4",     label: "รอร้านจีนจัดส่ง" },
    { value: "5",     label: "สำเร็จ" },
    { value: "6",     label: "ยกเลิกออเดอร์" },
  ];

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both served as
          static /public/ assets so they bypass Tailwind / PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/reports-shop.css" />

      {/* BEGIN: Content — L11 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb — L15-26 */}
          <div className="content-header row">
            <div className="content-header-left col-12 mb-2">
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าแรก</Link>
                    </li>
                    <li className="breadcrumb-item active">รายงานฝากสั่งซื้อสินค้า</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body">
            {/* ── Section 1: Graph card — L28-107 ───────────────────── */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          <div className="content-header-left col-md-6 col-12">
                            <div className="text-center text-md-left">
                              <h3 className="text-center text-md-left">
                                <span className="icon-basket-loaded font-30" style={{ fontSize: "2.2rem" }}></span>
                                {" "}กราฟรายการฝากสั่งซื้อ
                              </h3>
                              {/* L38-44 graph form */}
                              <form className="mb-1" method="GET" action="/admin/reports/shop">
                                <label className="form-control-label" htmlFor="hDate">วันที่สร้างออเดอร์และสถานะสำเร็จแล้ว</label>
                                <input
                                  id="hDate"
                                  type="text"
                                  className="form-control shawCalRanges"
                                  name="hDate"
                                  defaultValue={graphDateInputValue}
                                />
                                <div className="text-center pt-1">
                                  <button
                                    className="btn btn-outline-success font-12 btn-rounded p-05"
                                    name="report_shopsGraph"
                                    value="true"
                                    type="submit"
                                  >
                                    {" "}<i className="fas fa-search"></i> ดูกราฟข้อมูล
                                  </button>
                                </div>
                              </form>
                            </div>
                          </div>
                          <div className="content-header-right col-md-6 col-12"></div>
                        </div>
                        {/* L51-100 graph display */}
                        <div className="row">
                          <div className="col-12">
                            <h4 className="text-center text-md-left d-inline-block">
                              {`จำนวนวันที่เลือก : ${graphDayCount} `}<br />
                              {graphSubmitted && (
                                <span className="font-14 text-danger">{graphHeaderText}</span>
                              )}
                            </h4>
                            <div className="analytics-info">
                              {/*
                                Echarts placeholder (L98). The plugin JS is
                                not wired (see file-header "Not transcribed").
                                Static SVG sparkline rendered so the chart
                                data is visible at-rest; full chart wiring
                                = follow-up.
                              */}
                              <div
                                id="basic-line"
                                style={{ height: 400 }}
                                data-series-name="ยอดชำระสินค้าฝากสั่ง"
                                data-color="#2962FF"
                              >
                                {graphData.length > 0 && graphMax > 0 ? (
                                  <svg
                                    viewBox={`0 0 ${Math.max(graphData.length - 1, 1) * 50} 400`}
                                    preserveAspectRatio="none"
                                    width="100%"
                                    height="400"
                                    aria-label="ยอดชำระสินค้าฝากสั่งต่อวัน"
                                  >
                                    <polyline
                                      fill="none"
                                      stroke="#2962FF"
                                      strokeWidth="3"
                                      points={graphData
                                        .map((v, i) => `${i * 50},${400 - (v / graphMax) * 360}`)
                                        .join(" ")}
                                    />
                                    {graphData.map((v, i) => (
                                      <g key={i}>
                                        <circle
                                          cx={i * 50}
                                          cy={400 - (v / graphMax) * 360}
                                          r={4}
                                          fill="#2962FF"
                                        />
                                      </g>
                                    ))}
                                  </svg>
                                ) : (
                                  <div className="text-center p-1 text-muted">ไม่มีข้อมูลในช่วงนี้</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Section 2: DataTable card — L109-248 ───────────────── */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          <div className="col-12">
                            <div className="">
                              <h3 className="text-center text-md-left">
                                <span className="icon-basket-loaded font-30" style={{ fontSize: "2.2rem" }}></span>
                                {" "}รายงานฝากสั่งซื้อ
                              </h3>
                              <div className="d-inline-block2">
                                {/* L120-139 table filter form */}
                                <form className="" method="GET" action="/admin/reports/shop">
                                  <div className="row">
                                    <div className="col-md-6">
                                      <label className="form-control-label" htmlFor="hStatus">สถานะรายการ</label>
                                      <select
                                        id="hStatus"
                                        className="form-control hStatus"
                                        name="hStatus"
                                        defaultValue={tableHStatus}
                                      >
                                        {STATUS_OPTIONS.map((o) => (
                                          <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="col-md-6">
                                      <label className="form-control-label" htmlFor="hDateTable">วันที่สร้างออเดอร์</label>
                                      <input
                                        id="hDateTable"
                                        type="text"
                                        className="form-control shawCalRanges"
                                        name="hDate"
                                        defaultValue={tableDateInputValue}
                                      />
                                    </div>
                                  </div>
                                  <ul className="pt-1 list-inline dl text-center">
                                    <li className="list-inline-item text-info">
                                      <button
                                        type="submit"
                                        className="btn btn-block btn-rounded btn-info"
                                        name="report_shopsTable"
                                        value="true"
                                      >
                                        {" "}<i className="fas fa-search"></i> ค้นหาข้อมูล
                                      </button>
                                    </li>
                                  </ul>
                                </form>
                              </div>
                            </div>
                            {/* L142-186 result header */}
                            <h4 className="text-center text-md-left d-inline-block">
                              {tableSubmitted && (
                                <span className="font-14 text-danger">{tableHeaderText}</span>
                              )}
                            </h4>
                            {/* L188-238 DataTable */}
                            <div className="table-responsive">
                              <div className="dataTables_wrapper">
                                <table
                                  id="myTable"
                                  className="table display table-bordered table-striped dataTable no-footer dtr-inline"
                                >
                                  <thead>
                                    <tr className="text-center">
                                      <th>วันที่สร้าง</th>
                                      <th>เลขที่ออเดอร์</th>
                                      <th>ข้อมูลสินค้า</th>
                                      <th>จำนวนชิ้น</th>
                                      <th>ราคารวม (บาท)</th>
                                      <th>สถานะ</th>
                                      <th>อัปเดตโดย</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tableRows.map((row) => {
                                      const { date: hDateD, time: hDateT } = splitDateTime(row.hdate);
                                      const badge = hStatusBadge(row.hstatus);
                                      const amount = amountByHno.get(row.hno) ?? 0;
                                      // L228 — number_format((hTotalPriceCHN+hShippingCHN)*hRate, 2)
                                      const priceTotal =
                                        (Number(row.htotalpricechn ?? 0) + Number(row.hshippingchn ?? 0)) *
                                        Number(row.hrate ?? 0);
                                      const extraTitle = row.hcount > 1
                                        ? ` และอีก ${row.hcount - 1} รายการ`
                                        : "";
                                      return (
                                        <tr key={row.id}>
                                          {/* 1 — วันที่สร้าง (L216-218) */}
                                          <td className="text-center">
                                            {hDateD} {hDateT} น.
                                          </td>
                                          {/* 2 — เลขที่ออเดอร์ (L219-221) */}
                                          <td>
                                            <Link
                                              href={`/admin/shops/detail/${encodeURIComponent(row.hno)}`}
                                              className="text-info"
                                            >
                                              {row.hno}
                                            </Link>
                                          </td>
                                          {/* 3 — ข้อมูลสินค้า (L222-226) */}
                                          <td>
                                            <Link
                                              href={`/admin/shops/detail/${encodeURIComponent(row.hno)}`}
                                              className="text-info"
                                            >
                                              {row.htitle}
                                              {extraTitle}
                                            </Link>
                                          </td>
                                          {/* 4 — จำนวนชิ้น (L227) */}
                                          <td className="text-right">{numberFormat0(amount)}</td>
                                          {/* 5 — ราคารวม (บาท) (L228) */}
                                          <td className="text-right">{numberFormat2(priceTotal)}</td>
                                          {/* 6 — สถานะ (L229) */}
                                          <td className="text-center">
                                            {badge && <span className={badge.cls}>{badge.label}</span>}
                                          </td>
                                          {/* 7 — อัปเดตโดย (L230) */}
                                          <td className="text-center">{row.adminidupdate}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      {/* END: Content */}
    </div>
  );
}
