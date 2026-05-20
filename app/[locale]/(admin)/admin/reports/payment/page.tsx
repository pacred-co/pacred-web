import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin > "รายงานฝากชำระเงิน" — a FAITHFUL 1:1 TRANSCRIPTION of
 * the legacy PCS Cargo admin `pcs-admin/report-payments.php`
 * (390 LOC), per D1 / ADR-0017 + the faithful-port transcription
 * runbook (`docs/runbook/faithful-port-transcription.md` §8 —
 * admin pattern). Replaces the P0.5 v1 "อยู่ระหว่างพัฒนา"
 * placeholder stub.
 *
 * This is a transcription, NOT a reinterpretation. The JSX below
 * is the exact HTML structure `report-payments.php` renders — same
 * Bootstrap-4 markup, same elements, same Thai labels, same column
 * order. The visual identity comes from the legacy admin CSS,
 * brought in verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/admin/admin-base.css` (the BS4 + Modern-Admin
 * subset that every admin page uses) and
 * `public/legacy/pcs/admin/reports-payment.css` (the DataTables /
 * daterangepicker / echarts wrappers — `report-payments.php`
 * itself has no inline <style>; the wrappers come from the linked
 * plugins), both loaded via plain <link rel="stylesheet"> so they
 * bypass the app's Tailwind v4 / PostCSS pipeline (the rule
 * da4cd79 set).
 *
 * `report-payments.php` source structure transcribed here:
 *   - Title bar      L4
 *   - Breadcrumb     L17-25  ("หน้าแรก" → "รายงานฝากชำระเงิน")
 *   - Graph card     L28-107
 *      · L36-46 — daterange picker form (sub-graph)
 *      · L54-94 — server-side aggregation: builds one
 *        `tb_payment` SELECT per day inside the range, each
 *        SUM(payTHB) where payStatus=2 (สำเร็จ) on that day
 *      · L98       — <div id="basic-line" height:400> placeholder
 *      · echarts JS  L284-388 — line chart configured from that
 *        per-day array (red `#ff4961` series — payment-page accent)
 *   - DataTable card L109-225
 *      · L120-138 — filter form (payStatus + date range)
 *      · L142-167 — single SQL build for the table; same shape
 *        regardless of mode (range vs single-day)
 *      · L170-215 — 8-column DataTable: เวลาทำรายการ / รหัส /
 *        ชื่อ-นามสกุล / รายละเอียด / ประเภท / จำนวนเงิน / สถานะ /
 *        อัปเดต
 *   - Datatables JS  L249-258 — copy/csv/excel/print buttons for
 *     CEO / Manager / QAAndQC / Accounting / ITDT (the payment
 *     report's button list does NOT include Marketing — see the
 *     difference with report-shops.php L274)
 *
 * Data — every `report-payments.php` mysqli query transcribed to
 * the ported legacy `tb_*` schema (Supabase, migration 0081).
 * `tb_*` is RLS-locked to service_role, so reads go through the
 * admin client.
 *   - Graph aggregation (L77-82) → tb_payment grouped by
 *     DATE(payDate), filtered payStatus=2. Same pivot-can't-be-
 *     done-in-PostgREST handling as the shop report — pull all
 *     status=2 rows in the window and bin by day server-side.
 *     Visually identical chart data; query shape close to legacy
 *     intent. The full echarts wiring is a follow-up (see
 *     "Not transcribed" below).
 *   - Table query (L150-167) → tb_payment LEFT JOIN tb_users.
 *     Reproduced by two flat queries + a JS-side merge keyed on
 *     userid (the runbook + warehouse-history pattern — keeps
 *     PostgREST types light).
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate is "any logged-in admin can view; only CEO/Manager/QAAndQC/
 * Accounting/ITDT see export buttons". Closest Pacred V3 RBAC
 * roles for a payment report = `accounting` + `super` (implicit
 * via requireAdmin); per the spec's "likely `["super", "accounting"]`
 * for reports" instruction.
 *
 * URL filters (transcribed from L120-138, L143-166) — exposed as
 * GET search params on this Next.js route (the legacy POSTs to
 * `/report-payments/` but a GET-driven URL is more linkable in
 * Pacred; the form switches `method="POST"` → `method="GET"`,
 * fields keep their names):
 *   ?report_paymentGraph=true&payDate=YYYY-MM-DD%20-%20YYYY-MM-DD
 *                          → graph window (default = first day of
 *                            this month → today+1)
 *   ?report_paymentTable=true&payStatus=…&payDate=YYYY-MM-DD%20-%20YYYY-MM-DD
 *                          → table filter (default = month-to-date,
 *                            no status filter)
 *   payStatus ∈ all | 1 | 2 | 3
 *
 * Rebrand: legacy `PCS Cargo Admin` window title → `PR Cargo Admin`;
 * everything else is verbatim Thai. The PCS-scrub stays
 * API-switchover-gated (CLAUDE.md / ADR-0017) and is NOT a
 * faithful-port concern.
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - The echarts line-chart JS init (L284-388) — echarts is not in
 *     the Pacred dependency tree. The `#basic-line` placeholder div
 *     stays so the markup looks identical; wiring a React chart
 *     library (likely `recharts`) is a follow-up. The aggregated
 *     `dataArr` is still computed server-side so the follow-up can
 *     pass it straight to a chart. A small static SVG sparkline is
 *     rendered now to show the data lives even before the full
 *     chart follow-up — same visual footprint (400px high). The
 *     payment-page series colour is the legacy red `#ff4961` (L311)
 *     to match.
 *   - The DataTables JS init + export buttons (L249-260) — the
 *     plugins are not in the dependency tree. The same wrapper
 *     classes (`.dataTables_wrapper`, `#myTable`, `.dt-buttons`,
 *     `#myTable_filter`, `#myTable_length`) ARE rendered so the
 *     widget chrome (reproduced in `reports-payment.css`) looks
 *     identical at rest. Functional sort/filter/copy/csv/excel/
 *     print is a follow-up — likely a small DataTables shim or
 *     `<DataTable>` import.
 *   - The daterangepicker JS init (L261-283) — the picker plugin
 *     is not initialised; the `shawCalRanges` text input renders a
 *     plain `<input>` (visually identical at rest, no popup).
 *     Wiring `react-daterange-picker` is a follow-up.
 *   - The `simple-line-icons` font for the `icon-wallet` glyph
 *     (L37, L118) is not loaded — the `<span class="icon-...">`
 *     collapses to an empty inline-block. Replacing with an inline
 *     SVG is a follow-up (consistent with the `.pcs-icon` pattern
 *     used in /admin/admins).
 *   - The `payment/update/<ID>/` and `users/profile/<userID>/`
 *     deep-link destinations — those admin routes themselves are
 *     siblings in the P0.5 port batch; the <a> targets are
 *     rendered with their legacy hrefs in this page so when those
 *     sibling pages land the navigation already works.
 *   - L180 tooltip text — `data-toggle="tooltip"` requires the
 *     Bootstrap-4 tooltip JS plugin; the attribute is preserved on
 *     the <th> but the popup chrome is a follow-up. The visible
 *     "อัปเดต" header text is identical.
 *   - L65-69 — the legacy graph result-label is buggy in source
 *     (checks `report_forwarderGraph` instead of `report_paymentGraph`
 *     and echoes `$_POST['fDate']`). Pacred replicates the WORKING
 *     intent (label correctly bound to the payment graph submit) —
 *     this is a faithful-port "fix-obvious-typo" exception under the
 *     CLAUDE.md anti-pattern rule (don't ship broken legacy bugs
 *     without flagging). Documented here.
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Inline transcription of pcs-admin/include/function.php helpers ─
// pure functions ported verbatim. Kept inline (not extracted to lib/) per the
// runbook's "transcribe-first, lift-on-third-caller" rule. The repeated
// callers across this batch (report-shops + report-payments + report-forwarder)
// will trigger the lift-to-`lib/legacy-status-map.ts` follow-up.
// ============================================================================

/** Legacy `getDatesFromRange($start, $end)` — function.php L1135-1150. */
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

/** Legacy `statusNameReportPayment($s)` — pcs-admin/include/function.php
 *  L1166-1176. Maps the payStatus filter selector value to its Thai label. */
function statusNameReportPayment(s: string): string {
  switch (s) {
    case "all": return "ทั้งหมด";
    case "1":   return "รอดำเนินการ";
    case "2":   return "สำเร็จ";
    case "3":   return "ไม่สำเร็จ";
    default:    return "ไม่พบข้อมูล";
  }
}

/** Legacy `countText($text, $num)` — pcs-admin/include/function.php L94-104.
 *  Truncates a multibyte string to `num` characters (Thai-safe). */
function countText(text: string | null | undefined, num: number): string {
  const t = text ?? "";
  return t.length > num ? `${t.slice(0, num)}...` : t;
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

function firstDayOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastDayOfThisMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}
function todayPlusOne(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ============================================================================
// Row shape — joined tb_payment + tb_users CONCAT('คุณ', name, ' ', lastname).
// ============================================================================

type PaymentRow = {
  id: number;
  paydate: string | null;
  paystatus: string;
  paytype: string;
  paydetail: string;
  paythb: number | string;
  userid: string;
  adminidupdate: string;
};

type SP = {
  report_paymentGraph?: string;
  report_paymentTable?: string;
  payStatus?: string;
  payDate?: string;
};

// ============================================================================
// Page
// ============================================================================

export default async function AdminReportPaymentPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate is "any logged-in admin can view; export buttons gated to
  // CEO/Manager/QAAndQC/Accounting/ITDT". Pacred V3 narrows to the
  // payment-report roles per the P0.5 batch spec.
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Graph date-range resolution (L40, L54-62) ──────────────────────────
  let graphStart: string;
  let graphEnd: string;     // the +1d-extended end (DatePeriod cap)
  let graphEndDisplay: string;
  const graphSubmitted = sp.report_paymentGraph === "true";
  if (graphSubmitted) {
    const raw = sp.payDate ?? "";
    graphStart = raw.length >= 10 ? raw.slice(0, 10) : firstDayOfThisMonth();
    const rawEnd = raw.length >= 23 ? raw.slice(13, 23) : graphStart;
    graphEndDisplay = rawEnd;
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
  const graphDates = getDatesFromRange(graphStart, graphEnd);
  const graphLabels = graphDates.slice(0, -1);
  const graphDayCount = graphLabels.length;

  // ── Graph data: SUM(payTHB) per day where payStatus=2 ─────────────────
  const successRowsRes = await admin
    .from("tb_payment")
    .select("paydate, paythb")
    .eq("paystatus", "2")
    .gte("paydate", `${graphStart} 00:00:00`)
    .lt("paydate", `${graphEnd} 00:00:00`);
  const successRows = (successRowsRes.data ?? []) as Array<{
    paydate: string | null;
    paythb: number | string;
  }>;
  const dailyTotals = new Map<string, number>();
  for (const r of successRows) {
    if (!r.paydate) continue;
    const day = r.paydate.slice(0, 10);
    dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + Number(r.paythb ?? 0));
  }
  // Legacy rounds to 2 decimals (L79 SELECT ROUND(...,2)).
  const graphData: number[] = graphLabels.map((d) =>
    Math.round((dailyTotals.get(d) ?? 0) * 100) / 100,
  );
  const graphMax = graphData.reduce((m, v) => Math.max(m, v), 0);

  // ── Table date-range + status resolution (L142-166) ───────────────────
  const tableSubmitted = sp.report_paymentTable === "true";
  let tableStart: string;
  let tableEnd: string;
  let tablePayStatus: string;
  if (tableSubmitted) {
    const raw = sp.payDate ?? "";
    tableStart = raw.length >= 10 ? raw.slice(0, 10) : firstDayOfThisMonth();
    tableEnd = raw.length >= 23 ? raw.slice(13, 23) : tableStart;
    tablePayStatus = sp.payStatus ?? "all";
  } else {
    tableStart = firstDayOfThisMonth();
    tableEnd = lastDayOfThisMonth();
    tablePayStatus = "all";
  }

  // Build the tb_payment query.
  // Legacy SELECT (L150-151, L163-164):
  //   u.userID, CONCAT('คุณ',u.userName,' ',u.userLastName) AS userFullname,
  //   p.ID, DATE(p.payDate), TIME(p.payDate), p.payStatus, p.payType,
  //   p.payDetail, p.payTHB, p.adminIDUpdate
  let q = admin
    .from("tb_payment")
    .select(
      "id, paydate, paystatus, paytype, paydetail, paythb, " +
        "userid, adminidupdate",
    );

  // Legacy WHERE block (L152-159):
  //   if startDate != endDate → DATE(payDate) BETWEEN start AND end
  //   else                    → DATE(payDate) = startDate
  if (tableStart !== tableEnd) {
    q = q.gte("paydate", `${tableStart} 00:00:00`).lte("paydate", `${tableEnd} 23:59:59`);
  } else {
    q = q.gte("paydate", `${tableStart} 00:00:00`).lte("paydate", `${tableStart} 23:59:59`);
  }
  if (tablePayStatus !== "all" && tablePayStatus !== "") {
    q = q.eq("paystatus", tablePayStatus);
  }
  // Legacy default ORDER BY p.payDate DESC (L165).
  q = q.order("paydate", { ascending: false, nullsFirst: false }).limit(500);

  const tableRes = await q;
  const tableRows = (tableRes.data ?? []) as unknown as PaymentRow[];

  // ── User join: CONCAT('คุณ', userName, ' ', userLastName) (L150-151) ──
  const userIds = Array.from(new Set(tableRows.map((r) => r.userid).filter((u) => !!u && u !== "")));
  const fullnameByUserId = new Map<string, string>();
  if (userIds.length > 0) {
    const usersRes = await admin
      .from("tb_users")
      .select("userid, username, userlastname")
      .in("userid", userIds);
    for (const u of (usersRes.data ?? []) as Array<{
      userid: string;
      username: string | null;
      userlastname: string | null;
    }>) {
      fullnameByUserId.set(u.userid, `คุณ${u.username ?? ""} ${u.userlastname ?? ""}`);
    }
  }

  // ── payType + payStatus badge maps — exact legacy L188-197 ────────────
  type Badge = { label: string; cls: string };
  const payTypeBadge = (pt: string): Badge | null => {
    switch (pt) {
      case "1": return { label: "จ่ายผ่านเว็บไซต์จีน",      cls: "badge badge-primary badge-pill" };
      case "2": return { label: "โอนเข้าบัญชี Alipay ร้านค้าจีน", cls: "badge badge-info    badge-pill" };
      case "3": return { label: " อื่นๆ ",                cls: "badge badge-dark    badge-pill" };
      default:  return null;
    }
  };
  const payStatusBadge = (ps: string): Badge | null => {
    switch (ps) {
      case "1": return { label: "รอดำเนินการ",  cls: "badge badge-warning badge-pill" };
      case "2": return { label: "สำเร็จ",      cls: "badge badge-info    badge-pill" };
      case "3": return { label: " ไม่สำเร็จ ", cls: "badge badge-danger  badge-pill" };
      default:  return null;
    }
  };

  // ── Graph + table date input values (mirror legacy L40, L130) ─────────
  const graphDateInputValue = graphSubmitted
    ? `${graphStart} - ${graphEndDisplay}`
    : `${firstDayOfThisMonth()} - ${todayPlusOne()}`;
  const tableDateInputValue = tableSubmitted
    ? `${tableStart} - ${tableEnd}`
    : `${firstDayOfThisMonth()} - ${lastDayOfThisMonth()}`;

  // Result header text (L143-148)
  const tableHeaderText = tableSubmitted
    ? `ผลลัพธ์การค้นหา โดยสถานะ : ${statusNameReportPayment(tablePayStatus)} ตั้งแต่วันที่ : ${tableDateInputValue} `
    : "";

  // Graph header — see file-header note on the legacy L65-69 bug; Pacred
  // binds the label correctly to the payment-graph submit.
  const graphHeaderText = graphSubmitted
    ? `ผลลัพธ์การค้นหา รายการสำเร็จแล้ว ตั้งแต่วันที่ : ${graphDateInputValue}`
    : "";

  // payDate / TIME splitter (legacy uses DATE(p.payDate) + TIME(p.payDate))
  const splitDateTime = (iso: string | null): { date: string; time: string } => {
    if (!iso) return { date: "", time: "" };
    const parts = iso.includes("T") ? iso.split("T") : iso.split(" ");
    return { date: parts[0] ?? "", time: (parts[1] ?? "").slice(0, 8) };
  };

  // Status filter options — order + values verbatim from L125 select.
  const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "all", label: "ทั้งหมด" },
    { value: "1",   label: "รอดำเนินการ" },
    { value: "2",   label: "สำเร็จ" },
    { value: "3",   label: "ไม่สำเร็จ" },
  ];

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both served as
          static /public/ assets so they bypass Tailwind / PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/reports-payment.css" />

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
                    <li className="breadcrumb-item active">รายงานฝากชำระเงิน</li>
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
                                <span className="icon-wallet font-30" style={{ fontSize: "2.2rem" }}></span>
                                {" "}กราฟรายการฝากชำระเงิน
                              </h3>
                              {/* L38-44 graph form */}
                              <form className="mb-1" method="GET" action="/admin/reports/payment">
                                <label className="form-control-label" htmlFor="payDate">วันที่สร้างออเดอร์และมีการชำระเงิน</label>
                                <input
                                  id="payDate"
                                  type="text"
                                  className="form-control shawCalRanges"
                                  name="payDate"
                                  defaultValue={graphDateInputValue}
                                />
                                <div className="text-center pt-1">
                                  <button
                                    className="btn btn-outline-success font-12 btn-rounded p-05"
                                    name="report_paymentGraph"
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
                                = follow-up. Series colour matches legacy
                                L311 (red `#ff4961`).
                              */}
                              <div
                                id="basic-line"
                                style={{ height: 400 }}
                                data-series-name="ยอดชำระสินค้า"
                                data-color="#ff4961"
                              >
                                {graphData.length > 0 && graphMax > 0 ? (
                                  <svg
                                    viewBox={`0 0 ${Math.max(graphData.length - 1, 1) * 50} 400`}
                                    preserveAspectRatio="none"
                                    width="100%"
                                    height="400"
                                    aria-label="ยอดชำระสินค้าต่อวัน"
                                  >
                                    <polyline
                                      fill="none"
                                      stroke="#ff4961"
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
                                          fill="#ff4961"
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

            {/* ── Section 2: DataTable card — L109-225 ───────────────── */}
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
                                <span className="icon-wallet font-30" style={{ fontSize: "2.2rem" }}></span>
                                {" "}รายงานฝากสั่งซื้อ
                              </h3>
                              <div className="d-inline-block2">
                                {/* L120-138 table filter form */}
                                <form className="" method="GET" action="/admin/reports/payment">
                                  <div className="row">
                                    <div className="col-md-6">
                                      <label className="form-control-label" htmlFor="payStatus">สถานะรายการ</label>
                                      <select
                                        id="payStatus"
                                        className="form-control payStatus"
                                        name="payStatus"
                                        defaultValue={tablePayStatus}
                                      >
                                        {STATUS_OPTIONS.map((o) => (
                                          <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="col-md-6">
                                      <label className="form-control-label" htmlFor="payDateTable">วันที่สร้างออเดอร์</label>
                                      <input
                                        id="payDateTable"
                                        type="text"
                                        className="form-control shawCalRanges"
                                        name="payDate"
                                        defaultValue={tableDateInputValue}
                                      />
                                    </div>
                                  </div>
                                  <ul className="pt-1 list-inline dl text-center">
                                    <li className="list-inline-item text-info">
                                      <button
                                        type="submit"
                                        className="btn btn-block btn-rounded btn-info"
                                        name="report_paymentTable"
                                        value="true"
                                      >
                                        {" "}<i className="fas fa-search"></i> ค้นหาข้อมูล
                                      </button>
                                    </li>
                                  </ul>
                                </form>
                              </div>
                            </div>
                            {/* L141-167 result header */}
                            <h4 className="text-center text-md-left d-inline-block">
                              {tableSubmitted && (
                                <span className="font-14 text-danger">{tableHeaderText}</span>
                              )}
                            </h4>
                            {/* L169-216 DataTable */}
                            <div className="table-responsive">
                              <div className="dataTables_wrapper">
                                <table
                                  id="myTable"
                                  className="table display table-bordered table-striped dataTable no-footer dtr-inline"
                                >
                                  <thead>
                                    <tr className="text-center">
                                      <th>เวลาทำรายการ</th>
                                      <th>รหัส</th>
                                      <th>ชื่อ-นามสกุล</th>
                                      <th>รายละเอียด</th>
                                      <th>ประเภท</th>
                                      <th>จำนวนเงิน</th>
                                      <th>สถานะ</th>
                                      <th data-toggle="tooltip" data-placement="top" title="Username Admin ที่อัปเดตสถานะรายการ">อัปเดต</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tableRows.map((row) => {
                                      const { date: payDate, time: payTime } = splitDateTime(row.paydate);
                                      const typeBadge = payTypeBadge(row.paytype);
                                      const statusBadge = payStatusBadge(row.paystatus);
                                      const fullname = fullnameByUserId.get(row.userid) ?? "";
                                      return (
                                        <tr key={row.id}>
                                          {/* 1 — เวลาทำรายการ (L200) */}
                                          <td className="text-center font-12">
                                            {payDate} {payTime} น.
                                          </td>
                                          {/* 2 — รหัส (L201) */}
                                          <td>
                                            <a
                                              href={`/admin/payment/update/${row.id}`}
                                              className="text-info"
                                              target="_blank"
                                              rel="noreferrer"
                                            >
                                              {row.id}
                                            </a>
                                          </td>
                                          {/* 3 — ชื่อ-นามสกุล (L202) */}
                                          <td>
                                            <a
                                              href={`/admin/users/profile/${encodeURIComponent(row.userid)}`}
                                              className="text-info"
                                              target="_blank"
                                              rel="noreferrer"
                                            >
                                              [{row.userid}] {fullname}
                                            </a>
                                          </td>
                                          {/* 4 — รายละเอียด (L203 — countText 50) */}
                                          <td>{countText(row.paydetail, 50)}</td>
                                          {/* 5 — ประเภท (L204) */}
                                          <td className="text-center">
                                            {typeBadge && <span className={typeBadge.cls}>{typeBadge.label}</span>}
                                          </td>
                                          {/* 6 — จำนวนเงิน (L205, with leading "-") */}
                                          <td className="text-right text-danger">
                                            <b>-{numberFormat2(row.paythb)}</b>
                                          </td>
                                          {/* 7 — สถานะ (L206) */}
                                          <td className="text-center">
                                            {statusBadge && <span className={statusBadge.cls}>{statusBadge.label}</span>}
                                          </td>
                                          {/* 8 — อัปเดต (L207) */}
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
