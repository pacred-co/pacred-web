import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import { exportAccPaymentAll } from "@/actions/admin/export/acc-payment";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

/**
 * Admin > "รายงานฝากโอนหยวน/ชำระเงิน" — a FAITHFUL 1:1 TRANSCRIPTION
 * of the legacy PCS Cargo admin `pcs-admin/acc-payment.php` default
 * view (L1-354), per D1 / ADR-0017 + the faithful-port transcription
 * runbook (`docs/runbook/faithful-port-transcription.md` §8 — admin
 * pattern).
 *
 * The legacy `acc-payment.php` is the YUAN-TRANSFER REVENUE ledger
 * from the บัญชี (accounting) team's frame — every successful
 * `tb_payment` row that's been written into `tb_wallet_hs` as a
 * `type=6` ("ฝากโอนหยวน fulfilled") event. The columns expose the
 * per-transaction margin: customer rate (`payRate`) - cost rate
 * (`payRateCost`) = service fee, multiplied by yuan amount. The
 * accounting team uses it to reconcile the period's yuan-transfer
 * revenue against the bank slips.
 *
 * Distinct from `/admin/yuan-payments` (the OPS QUEUE for processing
 * transfers in real time) — this view is REPORT-only, filtered to
 * `payStatus=2` (สำเร็จ) records that have already cleared.
 *
 * The JSX below is the exact HTML structure `acc-payment.php`
 * renders — same Bootstrap-4 markup, same elements, same labels
 * (Thai hardcoded), same column order. The visual identity comes
 * from the legacy admin CSS, brought in verbatim as the static
 * `.pcs-legacy`-scoped `public/legacy/pcs/admin/admin-base.css`
 * (the shared admin chrome — established by the admin-table pilot)
 * and `public/legacy/pcs/admin/accounting-payment.css` (the
 * page-specific inline `<style>` block from acc-payment.php L9-43),
 * both loaded via plain `<link rel="stylesheet">` so they bypass
 * the app's Tailwind v4 / PostCSS pipeline (the rule da4cd79 set).
 *
 * `acc-payment.php` source structure transcribed here:
 *   - Title bar      acc-payment.php L4 (window/page title)
 *   - Auth gate      acc-payment.php L46 (departmentKey in CEO /
 *                    Manager / QAAndQC / Accounting / ITDT)
 *   - Breadcrumb     acc-payment.php L53-62
 *   - Card header    acc-payment.php L71-148 (heading + dual date-
 *                    filter form + "คำอธิบายระบบ" help-modal pill)
 *   - DataTable      acc-payment.php L162-242 (12-column ledger
 *                    with totals row pinned at the top).
 *
 * Data — every `acc-payment.php` mysqli query transcribed 1:1 to
 * the ported legacy `tb_*` schema (Supabase, migration 0081 —
 * tb_payment L3611-3634, tb_wallet_hs L6159-6185, tb_users L5828+).
 * `tb_*` is RLS-locked to service_role so reads go through the
 * admin client.
 *   - $sql_Table   → tb_wallet_hs wh
 *                    LEFT JOIN tb_payment p ON p.ID=wh.refOrder AND wh.type=6
 *                    LEFT JOIN tb_users   u ON p.userID=u.userID
 *                    WHERE p.payStatus=2  [+ DATE(wh.date) BETWEEN s AND e]
 *                    ORDER BY wh.date ASC
 *                    (acc-payment.php L77-112)
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate (acc-payment.php L46) is "CEO / Manager / QAAndQC /
 * Accounting / ITDT can view". The closest Pacred V3 RBAC roles
 * are `super` (mgmt + IT) + `accounting` (finance) — `super` is
 * always universal via requireAdmin.
 *
 * URL filter (transcribed from acc-payment.php L96-110) — exposed
 * as search params on this Next.js route with the same query-string
 * shape as the legacy URL:
 *   ?date=YYYY-MM-DD%20-%20YYYY-MM-DD   → custom date range
 *   ?dateGroup=true&year=YYYY&month=MM  → year+month chooser
 *                                          (year, month echoed
 *                                           back into <select>s)
 *   (none)                              → default = current month
 *                                          (first day → last day)
 *
 * Rebrand: legacy `PCS Cargo Admin` window title → `PR Cargo Admin`;
 * the column label "ต้นทุน PCS (บาท)" stays literal (legacy company
 * brand name in the report header — PCS scrub is API-switchover-
 * gated per CLAUDE.md / ADR-0017, NOT a faithful-port concern;
 * "branding text + member codes only" rule applies — and a column
 * label inside a back-office report is internal-only). Everything
 * else is verbatim Thai.
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - The DataTables JS init (acc-payment.php L323-350): pageLength,
 *     export-buttons (copy / csv / excel / print), fixedHeader, the
 *     "no-sort" pinned totals row. The static markup keeps the
 *     `#myTable` / `.dataTables_wrapper` / `dt-buttons` classes so
 *     the CSS looks identical at rest; functional sort/filter +
 *     export is a follow-up (likely a small React DataTables shim).
 *     The totals row is computed here on the server and rendered
 *     directly (not deferred to fnDrawCallback).
 *   - The daterangepicker JS init (acc-payment.php L279-292) —
 *     the date input renders as a plain `<input type="text">` for
 *     the static pilot; functional picker is a follow-up. The
 *     vendor jQuery+Bootstrap-4 bundle is staged by the (admin)
 *     layout but daterangepicker requires moment.js too — wired
 *     in a follow-up.
 *   - The (companyType==1 && department==2 && section==2)
 *     conditional that hides totals + export buttons (legacy
 *     L193, L325) — those are sales-rep-specific gates that depend
 *     on legacy session globals not yet wired through V3 RBAC.
 *     For this pilot the totals row + the export buttons are
 *     ALWAYS visible (the requireAdmin gate already narrows to
 *     accounting + super, both of which see the totals in the
 *     legacy too).
 *   - The "คำอธิบายระบบ" inline help modal body (acc-payment.php
 *     L149-161) — the legacy modal-body is empty too; markup
 *     preserved so the open/close hooks remain.
 *   - The "printReceipt.php" submit-form wrapper around the table
 *     (acc-payment.php L164-165) — the legacy `<form>` carries
 *     DataTables-selected `id[]=` values into a bulk-print page;
 *     the static markup keeps the `<form>` wrapper so a later
 *     React DataTables shim has a hook point.
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers inlined verbatim — pure formatters/parsers lifted from the legacy
// admin includes. Kept inline (not extracted to lib/) because this is a pilot;
// the lift-to-`lib/` happens after a few admin pilots show the repeated
// callers.
// ============================================================================

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56" thousand-grouped.
 *  Used throughout acc-payment.php (L224-229 cells + L274-278 totals). */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Legacy `number_format($n, 0)` — used for the "รวม" count cell at L274. */
function numberFormat0(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Legacy `generateYearDropdown($startYear = 2023, $selectName = "year")` —
 *  pcs-admin/include/function.php L3607-3625. Renders a year `<select>`
 *  from the CURRENT year down to $startYear inclusive. */
function YearSelect({
  startYear,
  value,
  name = "year",
}: {
  startYear: number;
  value?: string;
  name?: string;
}) {
  const currentYear = new Date().getFullYear();
  // Legacy clamp: if $startYear > currentYear, set $startYear = currentYear
  const minYear = startYear > currentYear ? currentYear : startYear;
  const years: number[] = [];
  for (let y = currentYear; y >= minYear; y--) years.push(y);
  return (
    <select name={name} id={name} defaultValue={value ?? String(currentYear)}>
      {years.map((y) => (
        <option key={y} value={String(y)}>
          {y}
        </option>
      ))}
    </select>
  );
}

// ============================================================================
// Date helpers — verbatim ports of the legacy `date()` / `strtotime()` calls
// that build the default month range (acc-payment.php L107-108).
// ============================================================================

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Legacy `date("Y-m-d", strtotime("first day of this month"))`.
 *  Returns the first day of the CURRENT month as "YYYY-MM-DD". */
function firstDayOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

/** Legacy `date("Y-m-d", strtotime("last day of this month"))` /
 *  `date("Y-m-t", strtotime($startDate))`.
 *  Returns the last calendar day of the month containing `startDate`
 *  (defaults to current month). */
function lastDayOfMonth(startDate?: string): string {
  let y: number;
  let m: number;
  if (startDate) {
    const parts = startDate.split("-");
    y = Number(parts[0]);
    m = Number(parts[1]);
  } else {
    const d = new Date();
    y = d.getFullYear();
    m = d.getMonth() + 1;
  }
  // last day of month = day 0 of next month
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad2(m)}-${pad2(last)}`;
}

// ============================================================================
// Row shape — joined tb_wallet_hs + tb_payment + tb_users projection.
// Mirrors the legacy SELECT at acc-payment.php L79-93.
// ============================================================================

type PaymentRow = {
  // tb_wallet_hs
  date: string | null; // wh.date
  reforder: string; // wh.refOrder (= tb_payment.id as string)
  // tb_payment
  paydate: string | null; // p.payDate
  paystatus: string | null; // p.payStatus
  payyuan: number;
  payratecost: number;
  payrate: number;
  userid: string;
  // tb_users
  username: string;
  userlastname: string;
  usercompany: string | null; // '1' = นิติบุคคล
};

type SP = {
  date?: string;
  dateGroup?: string;
  year?: string;
  month?: string;
  page?: string;
};

// ============================================================================
// Page
// ============================================================================

export default async function AdminAccountingPaymentPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate (acc-payment.php L46): CEO / Manager / QAAndQC /
  // Accounting / ITDT. Closest V3 RBAC = super + accounting; god roles
  // cover the rest via requireAdmin's universal-master semantics.
  const { roles } = await requireAdmin(["super", "accounting"]);
  // Money-internal visibility (owner 2026-06-18): the cost columns —
  // เรทต้นทุน (payratecost), ต้นทุน PCS (payyuan*payratecost), and the
  // derived ค่าบริการ/profit (sumUser - sumCost) — are money internals,
  // visible ONLY to ultra/accounting/pricing, NOT super. When false we
  // skip those cells/columns/totals so the value never reaches the DOM.
  // DERIVED-VALUE TRAP: ค่าบริการ = charge - cost reveals cost, so it is
  // hidden together with the cost column.
  const showCost = canViewCostProfit(roles);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Filter resolution (acc-payment.php L96-110) ─────────────────
  // Three modes:
  //   ?dateGroup=true + ?year=YYYY + ?month=MM
  //                         → use the [year-month-01, year-month-last] range
  //   ?date=YYYY-MM-DD - YYYY-MM-DD
  //                         → custom range from the date input
  //   (none)                → default = first..last day of current month
  let startDate: string;
  let endDate: string;

  if (sp.dateGroup && sp.year && sp.month) {
    startDate = `${sp.year}-${sp.month}-01`;
    endDate = lastDayOfMonth(startDate);
  } else if (sp.date && sp.date.length >= 23) {
    // Legacy substr($_GET['date'],0,10) + substr($_GET['date'],13)
    startDate = sp.date.slice(0, 10);
    endDate = sp.date.slice(13);
  } else {
    startDate = firstDayOfThisMonth();
    endDate = lastDayOfMonth();
  }

  // ── Pass 1: join wallet event ← payment via two reads ────────────
  // The legacy `LEFT JOIN tb_payment AS p ON p.ID=wh.refOrder AND wh.type=6`
  // pulls every type=6 wallet event with its parent tb_payment. PostgREST
  // doesn't expose the legacy FK shape because wh.refOrder is varchar
  // (stores the bigint ID as a string), so we fetch the wallet rows
  // first then look up the payment rows by id-list.
  const walletQ = admin
    .from("tb_wallet_hs")
    .select("date, reforder")
    .eq("type", "6")
    .gte("date", `${startDate}T00:00:00`)
    .lte("date", `${endDate}T23:59:59`)
    .order("date", { ascending: true });

  const walletRes = await walletQ;
  const walletRows = (walletRes.data ?? []) as Array<{
    date: string | null;
    reforder: string;
  }>;

  // Build the parent-payment id list (numeric — refOrder stores the
  // bigint ID as a string).
  const paymentIds = Array.from(
    new Set(
      walletRows
        .map((w) => Number(w.reforder))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );

  // ── Pass 2: tb_payment rows for those ids ───────────────────────
  // Legacy WHERE p.payStatus=2 (สำเร็จ) — applied here.
  type PaymentRaw = {
    id: number;
    paydate: string | null;
    paystatus: string | null;
    payyuan: number | string;
    payrate: number | string;
    payratecost: number | string;
    userid: string;
  };
  const payRowsById = new Map<number, PaymentRaw>();
  if (paymentIds.length > 0) {
    const payRes = await admin
      .from("tb_payment")
      .select("id, paydate, paystatus, payyuan, payrate, payratecost, userid")
      .eq("paystatus", "2")
      .in("id", paymentIds);
    for (const r of (payRes.data ?? []) as unknown as PaymentRaw[]) {
      payRowsById.set(r.id, r);
    }
  }

  // ── Pass 3: tb_users for the cargo-customer name display ────────
  // Legacy `LEFT JOIN tb_users AS u ON p.userID=u.userID` — pulls
  // userName / userLastName for the rightmost cell.
  const userIds = Array.from(
    new Set(
      Array.from(payRowsById.values())
        .map((p) => p.userid)
        .filter(Boolean),
    ),
  );
  const userById = new Map<
    string,
    { username: string; userlastname: string; usercompany: string | null }
  >();
  if (userIds.length > 0) {
    const usersRes = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userCompany")
      .in("userID", userIds);
    for (const u of (usersRes.data ?? []) as Array<{
      userID: string;
      userName: string;
      userLastName: string;
      userCompany: string | null;
    }>) {
      userById.set(u.userID, {
        username: u.userName,
        userlastname: u.userLastName,
        usercompany: u.userCompany,
      });
    }
  }

  // ── Pass 4: tb_corporate → company-name map (batched, N+1-free) ──
  // Juristic (นิติบุคคล) customers must display the COMPANY name, not the
  // contact person. ONE `.in()` query via the shared helper.
  const corpNames = await fetchCorporateNameMap(admin, userIds);

  // ── Assemble rows in legacy order (wh.date ASC) ─────────────────
  // The legacy LEFT JOIN keeps wallet rows whose payment is NOT
  // payStatus=2 (with NULL payment fields) — but acc-payment.php
  // L94 also filters WHERE p.payStatus=2 in the WHERE clause, so
  // unmatched events drop. We reproduce by skipping wallet rows
  // whose matched tb_payment.payStatus != 2.
  const rows: PaymentRow[] = [];
  for (const w of walletRows) {
    const pid = Number(w.reforder);
    const p = payRowsById.get(pid);
    if (!p) continue;
    const u =
      userById.get(p.userid) ??
      { username: "", userlastname: "", usercompany: null };
    rows.push({
      date: w.date,
      reforder: w.reforder,
      paydate: p.paydate,
      paystatus: p.paystatus,
      payyuan: Number(p.payyuan),
      payratecost: Number(p.payratecost),
      payrate: Number(p.payrate),
      userid: p.userid,
      username: u.username,
      userlastname: u.userlastname,
      usercompany: u.usercompany,
    });
  }

  // ── Compute totals row (acc-payment.php L186-217) ────────────────
  //   payYuanAll = SUM(p.payYuan)
  //   sumUserAll = SUM(p.payYuan * p.payRate)
  //   sumCostAll = SUM(p.payYuan * p.payRateCost)
  //   profitAll  = sumUserAll - sumCostAll
  let payYuanAll = 0;
  let sumUserAll = 0;
  let sumCostAll = 0;
  for (const r of rows) {
    payYuanAll += r.payyuan;
    sumUserAll += r.payyuan * r.payrate;
    sumCostAll += r.payyuan * r.payratecost;
  }
  const profitAll = sumUserAll - sumCostAll;

  // PERF (2026-06-03): client-slice the DISPLAYED ledger (50/page). Totals
  // above are computed over the full `rows` set — we only window the rows
  // rendered in the <tbody> below the pinned totals row.
  const page     = parsePage(sp.page);
  const offset   = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // Display-only banner copy (acc-payment.php L137-139 — always shows
  // "ผลลัพธ์การค้นหา ตั้งแต่วันที่ : <start> - <end>", because the legacy
  // unconditionally writes `$_GET['date'] = $startDate." - ".$endDate`
  // back into the same key).
  const filterBanner = `ผลลัพธ์การค้นหา ตั้งแต่วันที่ : ${startDate} - ${endDate}`;

  // Re-render the input value verbatim from the resolved range
  // (matches the legacy <input ... value="<?= startDate ?> - <?= endDate ?>">).
  const dateInputValue = `${startDate} - ${endDate}`;

  // Status-label decoder for column 4 (acc-payment.php L80-85 CASE).
  // The legacy CASE only emits status names; we re-decode here for
  // the (currently) single retained status 2 = "สำเร็จ".
  function payStatusName(s: string | null): string {
    switch (s) {
      case "1": return "รอดำเนินการ";
      case "2": return "สำเร็จ";
      case "3": return "ไม่สำเร็จ";
      default:  return "ไม่ระบุ";
    }
  }

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both served as
          static /public/ assets so they bypass Tailwind / PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/accounting-payment.css" />

      {/* BEGIN: Content — acc-payment.php L48 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb — acc-payment.php L52-62 */}
          <div className="content-header row">
            <div className="content-header-left col-12">
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">
                        <span className="menu-home">หน้าแรก</span>
                      </Link>
                    </li>
                    <li className="breadcrumb-item active">
                      รายงานฝากโอนหยวน/ชำระเงิน
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body">
            {/* acc-payment.php L64 */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          {/* Heading + filter form — acc-payment.php L72-142 */}
                          <div className="content-header-left col-md-8 col-12">
                            <div className="text-center text-md-left">
                              <h3 className="text-center text-md-left">
                                <span className="font-30 ft-users"></span>{" "}
                                รายงานฝากโอนหยวน/ชำระเงิน
                              </h3>
                            </div>
                            <form
                              className="pt-1"
                              method="GET"
                              action="/admin/accounting/payment"
                            >
                              <label
                                className="form-control-label"
                                htmlFor="dateGroup"
                              >
                                วันที่ชำระเงินแบบรายเดือน
                              </label>
                              {/* generateYearDropdown(2021) — start year is 2021
                                  per acc-payment.php L116 */}
                              <YearSelect startYear={2021} value={sp.year} />
                              {/* Hardcoded month list — acc-payment.php L117-130 */}
                              <select
                                name="month"
                                id="month"
                                defaultValue={sp.month ?? "01"}
                              >
                                <option value="01">01</option>
                                <option value="02">02</option>
                                <option value="03">03</option>
                                <option value="04">04</option>
                                <option value="05">05</option>
                                <option value="06">06</option>
                                <option value="07">07</option>
                                <option value="08">08</option>
                                <option value="09">09</option>
                                <option value="10">10</option>
                                <option value="11">11</option>
                                <option value="12">12</option>
                              </select>
                              <button
                                className="btn btn-outline-success btn-sm btn-rounded"
                                name="dateGroup"
                                value="true"
                                type="submit"
                              >
                                <i className="fas fa-search"></i> ค้นหาข้อมูลด้วยปีและเดือน
                              </button>
                              <br />
                              <label
                                className="form-control-label"
                                htmlFor="date"
                              >
                                วันที่ชำระเงิน
                              </label>
                              <input
                                type="text"
                                className="form-control2 shawCalRanges"
                                name="date"
                                defaultValue={dateInputValue}
                              />
                              <button
                                className="btn btn-outline-success btn-sm btn-rounded"
                                type="submit"
                              >
                                <i className="fas fa-search"></i> ค้นหาข้อมูล
                              </button>
                              <br />
                              <span className="font-14 text-danger">
                                {filterBanner}
                              </span>
                            </form>
                          </div>

                          {/* "คำอธิบายระบบ" pill — acc-payment.php L143-147 +
                              CSV export (owner directive 2026-06-07 —
                              accounting wants this reconciliation ledger in a
                              spreadsheet). The full export re-runs the same
                              date-range query unpaginated + is audited. */}
                          <div className="content-header-right col-md-4 col-12">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <CsvButton
                                rows={pageRows.map((row): CsvRow => {
                                  const sumUser = row.payyuan * row.payrate;
                                  const sumCost = row.payyuan * row.payratecost;
                                  const identity = resolveBillingIdentity({
                                    userCompany: row.usercompany,
                                    userName: row.username,
                                    userLastName: row.userlastname,
                                    corp: corpRowFromName(corpNames.get(row.userid)),
                                  });
                                  return {
                                    paid_date: row.date ?? "",
                                    created_date: row.paydate ?? "",
                                    order_no: row.reforder,
                                    status: payStatusName(row.paystatus),
                                    yuan: numberFormat2(row.payyuan),
                                    // Money-internal cost / derived ค่าบริการ —
                                    // omitted entirely unless allowed.
                                    ...(showCost
                                      ? {
                                          rate_cost: numberFormat2(row.payratecost),
                                        }
                                      : {}),
                                    rate_customer: numberFormat2(row.payrate),
                                    charge_customer: numberFormat2(sumUser),
                                    ...(showCost
                                      ? {
                                          cost_pcs: numberFormat2(sumCost),
                                          service_fee: numberFormat2(sumUser - sumCost),
                                        }
                                      : {}),
                                    member_code: row.userid,
                                    customer_name: identity.name,
                                  };
                                })}
                                fetchAll={async () => {
                                  "use server";
                                  // Export the FULL date-filtered ledger (all
                                  // pages) — audited via admin_export_log
                                  // (customer names · owner directive). The
                                  // action re-resolves roles + omits cost keys.
                                  return exportAccPaymentAll({ startDate, endDate });
                                }}
                                cols={[
                                  { key: "paid_date",       label: "วันที่ชำระเงิน" },
                                  { key: "created_date",    label: "วันที่สร้างรายการ" },
                                  { key: "order_no",        label: "เลขออเดอร์" },
                                  { key: "status",          label: "สถานะรายการ" },
                                  { key: "yuan",            label: "จำนวนหยวน" },
                                  ...(showCost
                                    ? [{ key: "rate_cost", label: "เรทต้นทุน" }]
                                    : []),
                                  { key: "rate_customer",   label: "เรทลูกค้า" },
                                  { key: "charge_customer", label: "เรียกเก็บเงิน ลูกค้า (บาท)" },
                                  ...(showCost
                                    ? [
                                        { key: "cost_pcs",    label: "ต้นทุน PCS (บาท)" },
                                        { key: "service_fee", label: "ค่าบริการ" },
                                      ]
                                    : []),
                                  { key: "member_code",     label: "รหัสสมาชิก" },
                                  { key: "customer_name",   label: "ชื่อ-นามสกุล" },
                                ]}
                                filename={`รายงานฝากโอนหยวน-${startDate}-ถึง-${endDate}.csv`}
                              />
                              <span
                                className="btn btn-sm bg-color-select box-shadow-2 cursor-pointer"
                                data-toggle="modal"
                                data-target="#recom"
                              >
                                คำอธิบายระบบ
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Help modal (empty body — verbatim from legacy)
                            acc-payment.php L149-161 */}
                        <div
                          id="recom"
                          className="modal fade in"
                          tabIndex={-1}
                          role="dialog"
                          aria-hidden="true"
                        >
                          <div className="modal-dialog modal-md">
                            <div className="modal-content header-from">
                              <div className="modal-header">
                                <h4 className="modal-title">
                                  คำอธิบายความเป็นมาของข้อมูลต่าง ๆ{" "}
                                </h4>
                                <button
                                  type="button"
                                  className="close"
                                  data-dismiss="modal"
                                  aria-hidden="true"
                                >
                                  <i className="la la-close"> </i>
                                </button>
                              </div>
                              <div className="modal-body header-from"></div>
                            </div>
                          </div>
                        </div>

                        {/* DataTable — acc-payment.php L162-242 */}
                        <div>
                          <div className="table-responsive p-05 font-12">
                            {/* The legacy <form> carries DataTables-selected
                                id[]= values into printReceipt.php on submit.
                                Static render — kept as a plain wrapper since
                                no JS executes the bulk-print flow yet. */}
                            <form
                              id="frm-example"
                              action="/admin/accounting/payment/print-receipt"
                              method="GET"
                            >
                              <input type="hidden" name="id" id="arrID" />
                              <table
                                id="myTable"
                                className="table display table-bordered table-striped dataTable no-footer dtr-inline header-fixed border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60"
                              >
                                <thead>
                                  <tr className="text-center">
                                    <th>วันที่ชำระเงิน</th>
                                    <th>วันที่สร้างรายการ</th>
                                    <th>เลขออเดอร์</th>
                                    <th>สถานะรายการ</th>
                                    <th>จำนวนหยวน</th>
                                    {/* Money-internal cost columns — ultra/accounting/pricing only */}
                                    {showCost ? <th>เรทต้นทุน</th> : null}
                                    <th>เรทลูกค้า</th>
                                    <th>เรียกเก็บเงิน ลูกค้า (บาท)</th>
                                    {showCost ? <th>ต้นทุน PCS (บาท)</th> : null}
                                    {showCost ? <th>ค่าบริการ</th> : null}
                                    <th>รหัสสมาชิก</th>
                                    <th>ชื่อ-นามสกุล</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* Totals row pinned at the top
                                      (acc-payment.php L195-208).
                                      Legacy hides this for the
                                      (companyType==1 && department==2 &&
                                       section==2) sales-rep gate — for
                                      this pilot the row is always shown
                                      (requireAdmin already narrowed to
                                      accounting + super). */}
                                  <tr className="font-14 bg-color no-sort">
                                    <td></td>
                                    <td className="text-right">รวม</td>
                                    <td className="text-right count-order">
                                      {numberFormat0(rows.length)}
                                    </td>
                                    <td></td>
                                    <td className="text-right payYuanAll">
                                      {numberFormat2(payYuanAll)}
                                    </td>
                                    {/* เรทต้นทุน placeholder — money column */}
                                    {showCost ? <td></td> : null}
                                    <td></td>
                                    <td className="text-right sumUserAll">
                                      {numberFormat2(sumUserAll)}
                                    </td>
                                    {/* ต้นทุน PCS total — money-internal */}
                                    {showCost ? (
                                      <td className="text-right sumCostAll">
                                        {numberFormat2(sumCostAll)}
                                      </td>
                                    ) : null}
                                    {/* ค่าบริการ/profit total — derived from cost */}
                                    {showCost ? (
                                      <td className="text-right profitAll">
                                        {numberFormat2(profitAll)}
                                      </td>
                                    ) : null}
                                    <td></td>
                                    <td></td>
                                  </tr>
                                  {pageRows.map((row) => {
                                    const sumUser = row.payyuan * row.payrate;
                                    const sumCost =
                                      row.payyuan * row.payratecost;
                                    const profit = sumUser - sumCost;
                                    return (
                                      <tr
                                        key={`${row.reforder}-${row.date}`}
                                        className="font-12"
                                      >
                                        {/* 1 — วันที่ชำระเงิน (wh.date)
                                            acc-payment.php L220 */}
                                        <td>{row.date ?? ""}</td>
                                        {/* 2 — วันที่สร้างรายการ (p.payDate)
                                            acc-payment.php L221 */}
                                        <td>{row.paydate ?? ""}</td>
                                        {/* 3 — เลขออเดอร์ → link to legacy
                                            payment/update/<id>/ which maps to
                                            /admin/yuan-payments/<id>
                                            acc-payment.php L222 */}
                                        <td>
                                          <Link
                                            href={`/admin/yuan-payments/${row.reforder}`}
                                            className="text-info"
                                          >
                                            {row.reforder}
                                          </Link>
                                        </td>
                                        {/* 4 — สถานะรายการ
                                            acc-payment.php L223 */}
                                        <td className="text-center">
                                          {payStatusName(row.paystatus)}
                                        </td>
                                        {/* 5 — จำนวนหยวน
                                            acc-payment.php L224 */}
                                        <td className="text-right">
                                          {numberFormat2(row.payyuan)}
                                        </td>
                                        {/* 6 — เรทต้นทุน (money-internal — hidden from super)
                                            acc-payment.php L225 */}
                                        {showCost ? (
                                          <td className="text-right">
                                            {numberFormat2(row.payratecost)}
                                          </td>
                                        ) : null}
                                        {/* 7 — เรทลูกค้า
                                            acc-payment.php L226 */}
                                        <td className="text-right">
                                          {numberFormat2(row.payrate)}
                                        </td>
                                        {/* 8 — เรียกเก็บเงิน ลูกค้า (บาท)
                                            acc-payment.php L227 */}
                                        <td className="text-right">
                                          {numberFormat2(sumUser)}
                                        </td>
                                        {/* 9 — ต้นทุน PCS (บาท) — money-internal
                                            acc-payment.php L228 */}
                                        {showCost ? (
                                          <td className="text-right">
                                            {numberFormat2(sumCost)}
                                          </td>
                                        ) : null}
                                        {/* 10 — ค่าบริการ — derived from cost, hidden together
                                            acc-payment.php L229 */}
                                        {showCost ? (
                                          <td className="text-right">
                                            {numberFormat2(profit)}
                                          </td>
                                        ) : null}
                                        {/* 11 — รหัสสมาชิก — link to legacy
                                            users/profile/<userID>/ which maps
                                            to /admin/users/<id>
                                            acc-payment.php L230 */}
                                        <td>
                                          <CustomerCodeLink code={row.userid} />
                                        </td>
                                        {/* 12 — ชื่อ-นามสกุล/ชื่อบริษัท
                                            (juristic → company name)
                                            acc-payment.php L231 */}
                                        <td>
                                          {
                                            resolveBillingIdentity({
                                              userCompany: row.usercompany,
                                              userName: row.username,
                                              userLastName: row.userlastname,
                                              corp: corpRowFromName(
                                                corpNames.get(row.userid),
                                              ),
                                            }).name
                                          }
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </form>
                            <Pagination
                              page={page}
                              pageSize={DEFAULT_PAGE_SIZE}
                              total={rows.length}
                              basePath="/admin/accounting/payment"
                              params={{
                                date: sp.date, dateGroup: sp.dateGroup,
                                year: sp.year, month: sp.month,
                              }}
                            />
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
      {/* END: Content — acc-payment.php L251 */}
    </div>
  );
}
