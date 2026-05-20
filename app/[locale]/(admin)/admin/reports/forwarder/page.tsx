import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin > "รายงานฝากนำเข้าสินค้า" — a FAITHFUL 1:1 TRANSCRIPTION
 * of the legacy PCS Cargo admin `pcs-admin/report-forwarder.php`
 * (L1-389), per D1 / ADR-0017 + the faithful-port transcription
 * runbook (`docs/runbook/faithful-port-transcription.md` §8 —
 * admin pattern). Upgraded from P0.5 v1 stub.
 *
 * The legacy `report-forwarder.php` is the GENERAL report for the
 * ฝากนำเข้า (forwarder) service. It renders TWO sections:
 *   1. "กราฟรายการฝากนำเข้าสินค้า" (L29-105) — a daily revenue line
 *      chart over a user-chosen date range. Each day's value =
 *      SUM(fTotalPrice + fTransportPrice + fPriceUpdate - fDiscount)
 *      from `tb_forwarder` rows with `fStatus=7` (ส่งแล้ว) on that
 *      date. Default range = first day of this month → today+1.
 *   2. "รายงานฝากนำเข้าสินค้า" (L109-225) — a filtered ledger of
 *      forwarder orders, filterable by `fStatus` + `fDate` range.
 *      Default range = first → last day of this month.
 *
 * The JSX below is the exact HTML structure `report-forwarder.php`
 * renders — same Bootstrap-4 markup, same elements, same labels
 * (Thai hardcoded), same column order. Visual identity comes from
 * the shared admin chrome (`admin-base.css`) plus a small
 * page-specific stylesheet (`reports-forwarder.css`) carrying the
 * chart-fallback wrapper styling, both loaded via plain
 * `<link rel="stylesheet">` so they bypass the app's Tailwind v4 /
 * PostCSS pipeline (the rule da4cd79 set).
 *
 * `report-forwarder.php` source structure transcribed here:
 *   - Title bar      L4
 *   - Breadcrumb     L15-25
 *   - Section 1      L28-107 — date-range chart card
 *                    · form L38-44 (date input + "ดูกราฟข้อมูล" CTA)
 *                    · per-day revenue SQL L76-94
 *                    · `#basic-line` echarts canvas L98 (→ fallback)
 *   - Section 2      L109-224 — filtered ledger card
 *                    · form L120-141 (status + date filter + CTA)
 *                    · ledger SQL L144-171
 *                    · 6-column DataTable L173-214 (date / detail /
 *                      tracking-chn / tracking-th / status / admin)
 *
 * Data — every `report-forwarder.php` mysqli query transcribed 1:1
 * to the ported legacy `tb_*` schema (Supabase, migration 0081).
 * `tb_*` is RLS-locked to service_role so reads go through the
 * admin client.
 *
 *   Section 1 — Per-day revenue (legacy L76-94 — one wide SQL with
 *     one subquery per day in the range). Postgres / PostgREST has
 *     no equivalent multi-subquery shape, so we transcribe the
 *     INTENT identically: fetch all `fStatus=7` rows in the range,
 *     bucket per-day on the JS side, sum the same four columns.
 *   Section 2 — Filtered ledger (legacy L144-171). PostgREST
 *     replaces the BETWEEN / equality concat with chained
 *     .gte()/.lte()/.eq().
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate is implicit (any logged-in admin can view); the
 * export-buttons CTA L250-255 limits CSV/Excel/print to CEO /
 * Manager / QA&QC / Accounting / ITDT. The closest Pacred V3 RBAC
 * roles are `super` (universal) + `accounting`; matching the
 * sister `/admin/reports/payment` and `/admin/reports/shop` gate.
 *
 * URL filters (transcribed from L40-44, L120-141) — exposed as
 * search params with the same query-string shape as the legacy:
 *   ?report_forwarderGraph=1&fDate=YYYY-MM-DD - YYYY-MM-DD
 *                                  → Section 1 chart range
 *   ?report_forwarderTable=1&fStatus=…&fDate=YYYY-MM-DD - YYYY-MM-DD
 *                                  → Section 2 ledger filter
 *   (none)                         → defaults: Section 1 = month-to-now,
 *                                              Section 2 = full month
 *
 * Method conversion — legacy uses `method="POST"` on both forms.
 * Pacred Server Components can't render conditional content from a
 * POST without a client island, so we swap to `method="GET"` —
 * preserves identical filter semantics via search params, and the
 * runbook §3 explicitly allows method conversion for this reason
 * (faithful screen, Server Component compatible).
 *
 * Rebrand: legacy `PCS Cargo Admin` window title → admin chrome
 * already drops the "Cargo" suffix; everything else verbatim Thai.
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - echarts chart (L283-386) — Pacred doesn't ship echarts. The
 *     `<div id="basic-line">` canvas is replaced by a static
 *     `<table>` fallback showing the same per-day values inside a
 *     same-sized wrapper. Functional chart is a follow-up (likely a
 *     small Chart.js / Recharts client island).
 *   - daterangepicker JS init (L268-282) — the date input renders
 *     as a plain `<input type="text">`. Date typed manually in the
 *     "YYYY-MM-DD - YYYY-MM-DD" shape works against the parser.
 *   - DataTables JS init + export buttons (L249-259) — the static
 *     markup keeps the wrapper classes; functional sort / export
 *     is a follow-up.
 *   - The `<select class="fStatus">` JS that re-selects the
 *     POSTed value on reload (L262-267) — handled at the JSX
 *     level via `defaultValue` (no client island needed).
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers inlined verbatim — pure formatters/parsers lifted from the
// legacy admin includes. Kept inline (not extracted to lib/) because
// this is a pilot; the lift-to-`lib/` happens after a few admin
// pilots show the repeated callers.
// ============================================================================

/** Legacy `getDatesFromRange($start, $end)` — function.php L1135-1150.
 *  Returns an array of every YYYY-MM-DD between start and end inclusive.
 *  (Used by report-forwarder.php L63 to build the per-day chart x-axis.) */
function getDatesFromRange(start: string, end: string): string[] {
  const arr: string[] = [];
  const startD = new Date(start);
  const endD = new Date(end);
  if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) return arr;
  const cur = new Date(startD);
  while (cur <= endD) {
    arr.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`,
    );
    cur.setDate(cur.getDate() + 1);
  }
  return arr;
}

/** Legacy `statusNameReportForwarder($int)` — function.php L1177-1192.
 *  Returns the Thai label for the fStatus filter value (used in the
 *  filter banner copy L147). */
function statusNameReportForwarder(s: string): string {
  switch (s) {
    case "all": return "ทั้งหมด";
    case "1":   return "รอสินค้าเข้าโกดังจีน";
    case "2":   return "สินค้าถึงโกดังจีนแล้ว";
    case "3":   return "กำลังส่งมาประเทศไทย";
    case "4":   return "สินค้าถึงประเทศไทยแล้ว";
    case "5":   return "รอชำระเงิน";
    case "5plus": return "ยอดที่ชำระเงินแล้วขึ้นไป";
    case "6":   return "เตรียมส่ง";
    case "7":   return "ส่งแล้ว";
    default:    return "ไม่พบข้อมูล";
  }
}

/** Render the row status badge — mirrors report-forwarder.php L191-198. */
function StatusBadge({ s }: { s: string | null }) {
  switch (s) {
    case "1": return <span className="font-12 badge badge-danger badge-pill">รอสินค้าเข้าโกดังจีน</span>;
    case "2": return <span className="font-12 badge badge-warning badge-pill">สินค้าถึงโกดังจีนแล้ว</span>;
    case "3": return <span className="font-12 badge badge-warning badge-pill">กำลังส่งมาประเทศไทย</span>;
    case "4": return <span className="font-12 badge badge-info badge-pill">สินค้าถึงประเทศไทยแล้ว</span>;
    case "5": return <span className="font-12 badge badge-danger badge-pill">รอชำระเงิน</span>;
    case "6": return <span className="font-12 badge badge-info badge-pill">เตรียมส่ง</span>;
    case "7": return <span className="font-12 badge badge-success badge-pill">ส่งแล้ว</span>;
    default:  return null;
  }
}

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56" grouped. */
function numberFormat2(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** `YYYY-MM-DD` formatter for a JS Date (legacy `date("Y-m-d", ...)`). */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Legacy `date("Y-m-d", strtotime("first day of this month"))` (L60). */
function firstDayOfThisMonth(): string {
  const d = new Date();
  d.setDate(1);
  return isoDate(d);
}

/** Legacy `date("Y-m-d", strtotime("last day of this month"))` (L165). */
function lastDayOfThisMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  return isoDate(d);
}

/** Legacy `date('Y-m-d', strtotime(date('Y-m-d'). ' + 1 days'))` (L40, L61). */
function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

/** Legacy date-range parser — daterangepicker emits "YYYY-MM-DD - YYYY-MM-DD"
 *  and report-forwarder.php L56-57 / L150-151 reads it via substr slicing. */
function parseDateRange(raw: string | undefined): { start: string; end: string } | null {
  if (!raw) return null;
  if (raw.length < 23) return null;
  const start = raw.slice(0, 10);
  const end = raw.slice(13);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end))   return null;
  return { start, end };
}

// ============================================================================
// Row shapes — relevant subsets of tb_forwarder. Lowercased per the legacy
// schema dump (migration 0081).
// ============================================================================

type RevenueRow = {
  fdate: string | null;
  ftotalprice: number | null;
  ftransportprice: number | null;
  fpriceupdate: number | null;
  fdiscount: number | null;
};

type LedgerRow = {
  id: number;
  fdate: string | null;
  fstatus: string | null;
  fdetail: string | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  adminidupdate: string | null;
};

type SP = {
  report_forwarderGraph?: string;
  report_forwarderTable?: string;
  fDate?: string;
  fStatus?: string;
};

// ============================================================================
// Page
// ============================================================================

export default async function ReportForwarderPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate is implicit (any logged-in admin can view); the export
  // chip restricts to CEO/Manager/QA/Accounting/ITDT (L250). Pacred V3
  // narrows the view to super + accounting — the report consumers.
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Section 1 — Chart range resolution (L54-95) ──────────────
  //   if report_forwarderGraph set    → use ?fDate
  //   else                            → first day of month → tomorrow
  let graphStart: string;
  let graphEnd: string;
  let graphSubmitted = false;
  if (sp.report_forwarderGraph !== undefined) {
    graphSubmitted = true;
    const range = parseDateRange(sp.fDate);
    if (range) {
      graphStart = range.start;
      // Legacy at L58 adds +1 day to the end so the BETWEEN includes the
      // last day's rows (mysqli's DATE() comparison is inclusive but the
      // PHP $period DatePeriod is exclusive of the end). We keep the
      // identical +1 here.
      const e = new Date(range.end);
      e.setDate(e.getDate() + 1);
      graphEnd = isoDate(e);
    } else {
      graphStart = firstDayOfThisMonth();
      graphEnd = tomorrow();
    }
  } else {
    // Legacy L60-62 default uses today+2 in the period; we match that
    // by using tomorrow() (the DatePeriod is end-exclusive at the +1
    // day mark).
    graphStart = firstDayOfThisMonth();
    const e = new Date();
    e.setDate(e.getDate() + 2);
    graphEnd = isoDate(e);
  }

  // Legacy `getDatesFromRange($startDate, $endDate)` (L63) — builds the
  // x-axis labels. The legacy then uses `count($Date)-1` as the day
  // count (because end is exclusive in their DatePeriod).
  const periodDates = getDatesFromRange(graphStart, graphEnd);
  const dayCount = Math.max(0, periodDates.length - 1);

  // Pre-build the input default value — legacy L40 either echoes the
  // POSTed range or the default "first-of-month - tomorrow".
  const graphInputDefault = sp.fDate
    ? sp.fDate
    : `${firstDayOfThisMonth()} - ${tomorrow()}`;

  // ── Section 1 — Per-day revenue rows (L76-94) ────────────────
  //   Fetch all tb_forwarder rows with fstatus='7' in the range,
  //   then sum (ftotalprice + ftransportprice + fpriceupdate -
  //   fdiscount) bucketed per day in JS. Mirrors the legacy intent
  //   one subquery per day, just in a single Postgres-friendly fetch.
  const { data: revData } = await admin
    .from("tb_forwarder")
    .select("fdate, ftotalprice, ftransportprice, fpriceupdate, fdiscount")
    .eq("fstatus", "7")
    .gte("fdate", `${graphStart}T00:00:00`)
    .lt("fdate", `${graphEnd}T00:00:00`);
  const revRows = (revData ?? []) as unknown as RevenueRow[];

  // Build the date-keyed revenue map (legacy `$dataArr`).
  const revenueByDate = new Map<string, number>();
  for (const lbl of periodDates) revenueByDate.set(lbl, 0);
  for (const r of revRows) {
    if (!r.fdate) continue;
    const lbl = r.fdate.slice(0, 10);
    const sum =
      (Number(r.ftotalprice) || 0) +
      (Number(r.ftransportprice) || 0) +
      (Number(r.fpriceupdate) || 0) -
      (Number(r.fdiscount) || 0);
    revenueByDate.set(lbl, (revenueByDate.get(lbl) ?? 0) + sum);
  }
  // Legacy iterates the period EXCLUSIVE-of-end (DatePeriod) — so we
  // build the display list using the first `dayCount` keys, mirroring
  // the legacy `$Date` array semantics.
  const chartLabels = periodDates.slice(0, dayCount);

  // ── Section 2 — Ledger filter resolution (L144-171) ──────────
  //   if report_forwarderTable set    → use ?fStatus + ?fDate
  //   else                            → first → last day of THIS month
  let ledgerStart: string;
  let ledgerEnd: string;
  let ledgerStatus: string = "";
  let ledgerSubmitted = false;
  if (sp.report_forwarderTable !== undefined) {
    ledgerSubmitted = true;
    const range = parseDateRange(sp.fDate);
    ledgerStart = range ? range.start : firstDayOfThisMonth();
    ledgerEnd = range ? range.end : lastDayOfThisMonth();
    ledgerStatus = sp.fStatus ?? "all";
  } else {
    ledgerStart = firstDayOfThisMonth();
    ledgerEnd = lastDayOfThisMonth();
  }

  // ── Section 2 — Ledger query (L152-170) ──────────────────────
  let ledgerQ = admin
    .from("tb_forwarder")
    .select(
      "id, fdate, fstatus, fdetail, ftrackingchn, ftrackingth, adminidupdate",
    );
  if (ledgerStart === ledgerEnd) {
    // legacy L158-159 — equality fall-through when start == end
    ledgerQ = ledgerQ
      .gte("fdate", `${ledgerStart}T00:00:00`)
      .lte("fdate", `${ledgerStart}T23:59:59`);
  } else {
    ledgerQ = ledgerQ
      .gte("fdate", `${ledgerStart}T00:00:00`)
      .lte("fdate", `${ledgerEnd}T23:59:59`);
  }
  if (ledgerStatus && ledgerStatus !== "all" && ledgerStatus !== "") {
    ledgerQ = ledgerQ.eq("fstatus", ledgerStatus);
  }
  // Legacy DataTables init defaults to col-0 desc (fdate desc, L290-291);
  // mirror server-side.
  ledgerQ = ledgerQ.order("fdate", { ascending: false, nullsFirst: false });

  const { data: ledgerData } = await ledgerQ;
  const ledgerRows = (ledgerData ?? []) as unknown as LedgerRow[];

  // Pre-build the ledger input default value — legacy L132 echoes the
  // POSTed range or "first-of-month - last-of-month".
  const ledgerInputDefault = ledgerSubmitted && sp.fDate
    ? sp.fDate
    : `${firstDayOfThisMonth()} - ${lastDayOfThisMonth()}`;

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both static assets so
          they bypass Tailwind / PostCSS (the rule da4cd79 set). */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/reports-forwarder.css" />

      {/* BEGIN: Content — report-forwarder.php L11-228 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb — report-forwarder.php L15-25 */}
          <div className="content-header row">
            <div className="content-header-left col-12 mb-2">
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าแรก</Link>
                    </li>
                    <li className="breadcrumb-item active">รายงานฝากนำเข้าสินค้า</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body">
            {/* ────────────────────────────────────────────────────────────
                SECTION 1 — Chart card — report-forwarder.php L28-107
            ──────────────────────────────────────────────────────────── */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          {/* Heading + chart-range filter form — L34-46 */}
                          <div className="content-header-left col-md-6 col-12">
                            <div className="text-center text-md-left">
                              <h3 className="text-center text-md-left">
                                <span
                                  className="ft-box font-30"
                                  style={{ fontSize: "2.2rem" }}
                                ></span>{" "}
                                กราฟรายการฝากนำเข้าสินค้า
                              </h3>
                              {/* Method swap POST → GET (Server Component
                                  compatibility — see header note). */}
                              <form
                                className="mb-1"
                                method="GET"
                                action="/admin/reports/forwarder"
                              >
                                <label className="form-control-label" htmlFor="fDate">
                                  วันที่สร้างออเดอร์และสถานะเป็นสำเร็จ
                                </label>
                                <input
                                  type="text"
                                  className="form-control shawCalRanges"
                                  name="fDate"
                                  defaultValue={graphInputDefault}
                                />
                                <div className="text-center pt-1">
                                  <button
                                    className="btn btn-outline-success font-12 btn-rounded p-05"
                                    name="report_forwarderGraph"
                                    value="1"
                                    type="submit"
                                  >
                                    {" "}
                                    <i className="fas fa-search"></i> ดูกราฟข้อมูล
                                  </button>
                                </div>
                              </form>
                            </div>
                          </div>
                          {/* Right column (intentionally empty in legacy
                              L47-49 — keeps layout grid). */}
                          <div className="content-header-right col-md-6 col-12"></div>
                        </div>

                        {/* Chart caption + canvas — L51-100 */}
                        <div className="row">
                          <div className="col-12">
                            <h4 className="text-center text-md-left d-inline-block">
                              จำนวนวันที่เลือก : {dayCount} <br />
                              {graphSubmitted && (
                                <span className="font-14 text-danger">
                                  ผลลัพธ์การค้นหา รายการสำเร็จแล้ว ตั้งแต่วันที่ :{" "}
                                  {sp.fDate ?? ""}
                                </span>
                              )}
                            </h4>
                            {/* Chart canvas L98 → static fallback table
                                showing the same per-day revenue series.
                                Wrapper sized identically (400px min-height
                                via .report-chart-fallback). */}
                            <div className="analytics-info">
                              <div
                                id="basic-line"
                                className="report-chart-fallback"
                                style={{ height: 400 }}
                              >
                                <table>
                                  <thead>
                                    <tr>
                                      <th>วันที่</th>
                                      <th className="chart-color">ยอดชำระสินค้านำเข้า (บาท)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {chartLabels.length === 0 && (
                                      <tr>
                                        <td colSpan={2}>ไม่พบข้อมูล</td>
                                      </tr>
                                    )}
                                    {chartLabels.map((lbl) => (
                                      <tr key={lbl}>
                                        <td>{lbl}</td>
                                        <td>{numberFormat2(revenueByDate.get(lbl) ?? 0)}</td>
                                      </tr>
                                    ))}
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

            {/* ────────────────────────────────────────────────────────────
                SECTION 2 — Filtered ledger — report-forwarder.php L109-224
            ──────────────────────────────────────────────────────────── */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          <div className="col-12">
                            <div>
                              <h3 className="text-center text-md-left">
                                <span
                                  className="ft-box font-30"
                                  style={{ fontSize: "2.2rem" }}
                                ></span>{" "}
                                รายงานฝากนำเข้าสินค้า
                              </h3>
                              <div className="d-inline-block2">
                                <form
                                  method="GET"
                                  action="/admin/reports/forwarder"
                                >
                                  <div className="row">
                                    {/* status filter — L122-129 */}
                                    <div className="col-md-6">
                                      <label className="form-control-label" htmlFor="fStatus">
                                        สถานะรายการ
                                      </label>
                                      <select
                                        className="form-control fStatus"
                                        name="fStatus"
                                        defaultValue={ledgerSubmitted ? (sp.fStatus ?? "all") : "all"}
                                      >
                                        <option value="all">ทั้งหมด</option>
                                        <option value="1">รอสินค้าเข้าโกดัง</option>
                                        <option value="2">สินค้าถึงโกดังจีนแล้ว</option>
                                        <option value="3">กำลังส่งมาประเทศไทย</option>
                                        <option value="4">สินค้าถึงประเทศไทยแล้ว</option>
                                        <option value="5">รอชำระเงิน</option>
                                        <option value="6">เตรียมส่ง</option>
                                        <option value="7">ส่งแล้ว</option>
                                      </select>
                                    </div>
                                    {/* date filter — L130-133 */}
                                    <div className="col-md-6">
                                      <label className="form-control-label" htmlFor="fDate">
                                        วันที่สร้างออเดอร์
                                      </label>
                                      <input
                                        type="text"
                                        className="form-control shawCalRanges"
                                        name="fDate"
                                        defaultValue={ledgerInputDefault}
                                      />
                                    </div>
                                  </div>
                                  <ul className="pt-1 list-inline dl text-center">
                                    <li className="list-inline-item text-info">
                                      <button
                                        type="submit"
                                        className="btn btn-block btn-rounded btn-info"
                                        name="report_forwarderTable"
                                        value="1"
                                      >
                                        {" "}
                                        <i className="fas fa-search"></i> ค้นหาข้อมูล
                                      </button>
                                    </li>
                                  </ul>
                                </form>
                              </div>
                            </div>

                            {/* Filter banner — L143-150 */}
                            <h4 className="text-center text-md-left d-inline-block">
                              {ledgerSubmitted && (
                                <span className="font-14 text-danger">
                                  ผลลัพธ์การค้นหา โดยสถานะ :{" "}
                                  {statusNameReportForwarder(ledgerStatus || "all")} ตั้งแต่วันที่
                                  : {sp.fDate ?? ""}
                                </span>
                              )}
                            </h4>

                            {/* DataTable — L173-214 */}
                            <div className="table-responsive">
                              <table
                                id="myTable"
                                className="table report-table display table-bordered table-striped dataTable no-footer dtr-inline"
                              >
                                <thead>
                                  <tr className="text-center">
                                    <th>วันที่สร้าง</th>
                                    <th>รายละเอียด</th>
                                    <th>เลขพัสดุ (จีน)</th>
                                    <th>เลขพัสดุ (ไทย)</th>
                                    <th>สถานะ</th>
                                    <th
                                      data-toggle="tooltip"
                                      data-placement="top"
                                      title="Username Admin ที่อัปเดตสถานะรายการ"
                                    >
                                      อัปเดต
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ledgerRows.map((row) => {
                                    // Legacy L201 — DATE + TIME components.
                                    const fdate = row.fdate ?? "";
                                    const datePart = fdate.slice(0, 10);
                                    const timePart = fdate.slice(11, 19);
                                    return (
                                      <tr key={row.id}>
                                        <td className="text-center font-12">
                                          {datePart} {timePart} น.
                                        </td>
                                        <td>
                                          <Link
                                            className="text-info"
                                            href={`/admin/forwarders/${row.id}`}
                                          >
                                            {row.fdetail ?? ""}
                                          </Link>
                                        </td>
                                        <td>{row.ftrackingchn ?? ""}</td>
                                        <td>{row.ftrackingth ?? ""} </td>
                                        <td className="text-center">
                                          <StatusBadge s={row.fstatus} />
                                        </td>
                                        <td className="font-14 text-center">
                                          {row.adminidupdate ?? ""}
                                        </td>
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
            </section>
          </div>
        </div>
      </div>
      {/* END: Content */}
    </div>
  );
}
