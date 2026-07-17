import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportAccWithdrawAll } from "@/actions/admin/export/acc-withdraw";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

/**
 * Admin > "ถอนเงิน โอนโดยตรง" — a FAITHFUL 1:1 TRANSCRIPTION of
 * the legacy PCS Cargo admin `pcs-admin/acc-withdraw.php` default
 * view (L1-329), per D1 / ADR-0017 + the faithful-port transcription
 * runbook (`docs/runbook/faithful-port-transcription.md` §8 — admin
 * pattern).
 *
 * The legacy `acc-withdraw.php` is the ACCOUNTING view of direct-
 * transfer wallet withdrawals — every `tb_wallet_hs` row with
 * `type=3` (withdrawal) AND `status=2` (succeeded). The accounting
 * team uses this view to reconcile the period's outbound bank
 * transfers against the wallet ledger. It is the finance-side cut
 * of the same withdrawal records that the ops team works in their
 * queue (`/admin/wallet?kind=withdraw`).
 *
 * The two views are NOT duplicates — they have different filters,
 * different status semantics, and different downstream artefacts
 * (the accounting view drives the GL posting; the ops view drives
 * the bank-transfer execution).
 *
 * The JSX below is the exact HTML structure `acc-withdraw.php`
 * renders — same Bootstrap-4 markup, same elements, same labels
 * (Thai hardcoded), same column order. The visual identity comes
 * from the legacy admin CSS, brought in verbatim as the static
 * `.pcs-legacy`-scoped `public/legacy/pcs/admin/admin-base.css`
 * (the shared admin chrome — established by the admin-table pilot)
 * and `public/legacy/pcs/admin/accounting-withdraw.css` (the
 * page-specific inline `<style>` block from acc-withdraw.php L9-43),
 * both loaded via plain `<link rel="stylesheet">` so they bypass
 * the app's Tailwind v4 / PostCSS pipeline (the rule da4cd79 set).
 *
 * `acc-withdraw.php` source structure transcribed here:
 *   - Title bar      acc-withdraw.php L4 (window/page title)
 *   - Auth gate      acc-withdraw.php L46 (departmentKey in CEO /
 *                    Manager / QAAndQC / Accounting / ITDT)
 *   - Breadcrumb     acc-withdraw.php L53-62
 *   - Card header    acc-withdraw.php L71-144 (heading + dual date-
 *                    filter form + "คำอธิบายระบบ" help-modal pill)
 *   - DataTable      acc-withdraw.php L158-220 (9-column ledger
 *                    with totals row pinned at the top).
 *
 * Data — every `acc-withdraw.php` mysqli query transcribed 1:1 to
 * the ported legacy `tb_*` schema (Supabase, migration 0081 —
 * tb_wallet_hs L6159-6185, tb_users L5828+). `tb_*` is RLS-locked
 * to service_role so reads go through the admin client.
 *   - $sql_Table → tb_wallet_hs wh
 *                  LEFT JOIN tb_users u ON u.userID=wh.userID
 *                  WHERE wh.type=3 AND wh.status=2
 *                       [+ DATE(wh.date) BETWEEN s AND e]
 *                  ORDER BY wh.date ASC
 *                  (acc-withdraw.php L78-108)
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate (acc-withdraw.php L46) is "CEO / Manager / QAAndQC /
 * Accounting / ITDT can view". The closest Pacred V3 RBAC roles
 * are `super` (mgmt + IT) + `accounting` (finance) — `super` is
 * always universal via requireAdmin.
 *
 * URL filter (transcribed from acc-withdraw.php L92-106) — exposed
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
 * everything else is verbatim Thai. The PCS-scrub stays
 * API-switchover-gated (CLAUDE.md / ADR-0017) and is NOT a
 * faithful-port concern; "branding text + member codes only".
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - The DataTables JS init (acc-withdraw.php L300-324): pageLength,
 *     export-buttons (copy / csv / excel / print), fixedHeader, the
 *     "no-sort" pinned totals row. The static markup keeps the
 *     `#myTable` / `.dataTables_wrapper` / `dt-buttons` classes so
 *     the CSS looks identical at rest; functional sort/filter +
 *     export is a follow-up (likely a small React DataTables shim).
 *     The totals row is computed here on the server and rendered
 *     directly (not deferred to fnDrawCallback).
 *   - The daterangepicker JS init (acc-withdraw.php L256-269) —
 *     the date input renders as a plain `<input type="text">` for
 *     the static pilot; functional picker is a follow-up.
 *   - The (companyType==1 && department==2 && section==2)
 *     conditional that hides totals + export buttons (legacy
 *     L183, L302) — those are sales-rep-specific gates that depend
 *     on legacy session globals not yet wired through V3 RBAC.
 *     For this pilot the totals row + the export buttons are
 *     ALWAYS visible (the requireAdmin gate already narrows to
 *     accounting + super).
 *   - The "คำอธิบายระบบ" inline help modal body (acc-withdraw.php
 *     L145-157) — the legacy modal-body is empty too; markup
 *     preserved so the open/close hooks remain.
 *   - The "printReceipt.php" submit-form wrapper around the table
 *     (acc-withdraw.php L160-161) — the legacy `<form>` carries
 *     DataTables-selected `id[]=` values into a bulk-print page;
 *     the static markup keeps the `<form>` wrapper so a later
 *     React DataTables shim has a hook point.
 *   - The "ค่าบริการ" column rendering hardcoded "0.00"
 *     (acc-withdraw.php L192, L209) — the legacy faithfully renders
 *     the column even though direct-transfer withdrawals waive the
 *     service fee. Preserved verbatim.
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers inlined verbatim — pure formatters lifted from the legacy admin
// includes. Kept inline (not extracted to lib/) because this is a pilot.
// ============================================================================

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56" thousand-grouped.
 *  Used throughout acc-withdraw.php (L207-209 cells + L255 totals JS). */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Legacy `number_format($n, 0)` — used for the "รวม" count cell at L254. */
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
  className,
}: {
  startYear: number;
  value?: string;
  name?: string;
  className?: string;
}) {
  const currentYear = new Date().getFullYear();
  // Legacy clamp: if $startYear > currentYear, set $startYear = currentYear
  const minYear = startYear > currentYear ? currentYear : startYear;
  const years: number[] = [];
  for (let y = currentYear; y >= minYear; y--) years.push(y);
  return (
    <select name={name} id={name} defaultValue={value ?? String(currentYear)} className={className}>
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
// that build the default month range (acc-withdraw.php L103-104).
// ============================================================================

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Legacy `date("Y-m-d", strtotime("first day of this month"))`. */
function firstDayOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

/** Legacy `date("Y-m-d", strtotime("last day of this month"))` /
 *  `date("Y-m-t", strtotime($startDate))`. */
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
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad2(m)}-${pad2(last)}`;
}

// ============================================================================
// Row shape — joined tb_wallet_hs + tb_users projection. Mirrors the legacy
// SELECT at acc-withdraw.php L79-91.
// ============================================================================

type WithdrawRow = {
  // tb_wallet_hs
  date: string | null; // wh.date
  dateslip: string | null; // wh.dateSlip
  id: number; // wh.ID
  status: string | null; // wh.status (CASE-decoded for column 4)
  amount: number; // wh.amount
  userid: string; // wh.userID
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

export default async function AdminAccountingWithdrawPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate (acc-withdraw.php L46): CEO / Manager / QAAndQC /
  // Accounting / ITDT. Closest V3 RBAC = super + accounting; super
  // is always universal via requireAdmin.
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Filter resolution (acc-withdraw.php L92-106) ────────────────
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

  // ── Pass 1: pull the withdrawal wallet rows ─────────────────────
  // Legacy WHERE wh.type=3 AND wh.status=2 + date range, ORDER BY date ASC.
  type WalletRaw = {
    id: number;
    date: string | null;
    dateslip: string | null;
    amount: number | string;
    status: string | null;
    userid: string;
  };
  const walletRes = await admin
    .from("tb_wallet_hs")
    .select("id, date, dateslip, amount, status, userid")
    .eq("type", "3")
    .eq("status", "2")
    .gte("date", `${startDate}T00:00:00`)
    .lte("date", `${endDate}T23:59:59`)
    .order("date", { ascending: true });

  const walletRows = (walletRes.data ?? []) as unknown as WalletRaw[];

  // ── Pass 2: tb_users for the customer-name display ──────────────
  // Legacy `LEFT JOIN tb_users AS u ON u.userID=wh.userID`.
  const userIds = Array.from(
    new Set(walletRows.map((w) => w.userid).filter(Boolean)),
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

  // ── Juristic → company-name map (batched, N+1-free) ─────────────
  // นิติบุคคล customers show the COMPANY name, not the contact person.
  const corpNames = await fetchCorporateNameMap(admin, userIds);

  // ── Assemble rows in legacy order (wh.date ASC) ─────────────────
  const rows: WithdrawRow[] = walletRows.map((w) => {
    const u =
      userById.get(w.userid) ??
      { username: "", userlastname: "", usercompany: null };
    return {
      date: w.date,
      dateslip: w.dateslip,
      id: w.id,
      status: w.status,
      amount: Number(w.amount),
      userid: w.userid,
      username: u.username,
      userlastname: u.userlastname,
      usercompany: u.usercompany,
    };
  });

  // ── Compute totals row (acc-withdraw.php L181-200) ──────────────
  //   amountAll = SUM(wh.amount) — used twice (columns 5 + 6).
  let amountAll = 0;
  for (const r of rows) amountAll += r.amount;

  // PERF (2026-06-03): client-slice the DISPLAYED ledger (50/page). The
  // amountAll total above is computed over the full `rows` set — we only
  // window the rows rendered in the <tbody> below the pinned totals row.
  const page     = parsePage(sp.page);
  const offset   = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // Display banner copy (acc-withdraw.php L133-135 — always shows
  // "ผลลัพธ์การค้นหา ตั้งแต่วันที่ : <start> - <end>", because the legacy
  // unconditionally writes `$_GET['date'] = $startDate." - ".$endDate`
  // back into the same key).
  const filterBanner = `ผลลัพธ์การค้นหา ตั้งแต่วันที่ : ${startDate} - ${endDate}`;

  // Re-render the input value verbatim from the resolved range.
  const dateInputValue = `${startDate} - ${endDate}`;

  // Status-label decoder for column 4 (acc-withdraw.php L80-85 CASE).
  // Status filter pre-narrows to '2' = สำเร็จ, but the CASE handles
  // all three states for parity with the legacy CASE output.
  function statusName(s: string | null): string {
    switch (s) {
      case "1": return "รอดำเนินการ";
      case "2": return "สำเร็จ";
      case "3": return "ไม่สำเร็จ";
      default:  return "ไม่ระบุ";
    }
  }

  // ── CSV export (owner directive 2026-06-07: accounting reconciliation) ──
  // Columns mirror the on-screen 9-column ledger header order. "⬇ CSV หน้านี้"
  // exports the displayed page; "⬇ CSV ทั้งหมด" re-runs the same filtered query
  // for the WHOLE date range (capped + audited) via the co-located action.
  const csvCols: CsvCol[] = [
    { key: "date",            label: "วันที่ทำรายการ" },
    { key: "dateslip",        label: "วันที่โอนคืน" },
    { key: "id",              label: "เลขออเดอร์" },
    { key: "status",          label: "สถานะรายการ" },
    { key: "amount",          label: "ยอดเงินที่ถอน" },
    { key: "amount_refunded", label: "เงินที่โอนคืน" },
    { key: "service_fee",     label: "ค่าบริการ" },
    { key: "userid",          label: "รหัสสมาชิก" },
    { key: "customer",        label: "ชื่อ-นามสกุล" },
  ];
  // Juristic (นิติบุคคล) customers show the COMPANY name, not the contact person.
  const displayName = (row: WithdrawRow) =>
    resolveBillingIdentity({
      userCompany: row.usercompany,
      userName: row.username,
      userLastName: row.userlastname,
      corp: corpRowFromName(corpNames.get(row.userid)),
    }).name;
  const csvRows: CsvRow[] = pageRows.map((row) => ({
    date: row.date ?? "",
    dateslip: row.dateslip ?? "",
    id: row.id,
    status: statusName(row.status),
    amount: numberFormat2(row.amount),
    amount_refunded: numberFormat2(row.amount),
    service_fee: numberFormat2(0),
    userid: row.userid,
    customer: displayName(row),
  }));

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both served as
          static /public/ assets so they bypass Tailwind / PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link
        rel="stylesheet"
        href="/legacy/pcs/admin/accounting-withdraw.css"
      />

      {/* BEGIN: Content — acc-withdraw.php L48 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb — acc-withdraw.php L52-62 */}
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
                      ถอนเงิน โอนโดยตรง
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body">
            {/* acc-withdraw.php L64 */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          {/* Heading + filter form — acc-withdraw.php L72-138 */}
                          <div className="content-header-left col-md-8 col-12">
                            <div className="text-center text-md-left">
                              <h3 className="text-center text-md-left">
                                <span className="font-30 ft-users"></span>{" "}
                                ถอนเงิน โอนโดยตรง
                              </h3>
                            </div>
                            {/* faithful-look 2026-07-09 (ภูม): the legacy filter
                                was bare <br/>-separated controls ("ลอยโล่งๆ").
                                Framed in a bordered card + styled inputs to match
                                our house-style — same fields/logic, just boxed. */}
                            <form
                              className="pt-1"
                              method="GET"
                              action="/admin/accounting/withdraw"
                            >
                              <div className="mt-2 max-w-xl space-y-3 rounded-xl border border-border bg-surface-alt/30 p-3.5">
                                {/* row 1 — month/year */}
                                <div className="flex flex-wrap items-end gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label
                                      className="text-xs font-medium text-foreground"
                                      htmlFor="dateGroup"
                                    >
                                      วันที่ชำระเงินแบบรายเดือน
                                    </label>
                                    <div className="flex gap-1.5">
                                      {/* generateYearDropdown(2021) — acc-withdraw.php L112 */}
                                      <YearSelect
                                        startYear={2021}
                                        value={sp.year}
                                        className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                      />
                                      {/* Hardcoded month list — acc-withdraw.php L113-126 */}
                                      <select
                                        name="month"
                                        id="month"
                                        defaultValue={sp.month ?? "01"}
                                        className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                                    </div>
                                  </div>
                                  <button
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                    name="dateGroup"
                                    value="true"
                                    type="submit"
                                  >
                                    <i className="fas fa-search"></i> ค้นหาข้อมูลด้วยปีและเดือน
                                  </button>
                                </div>

                                {/* row 2 — date range */}
                                <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
                                  <div className="flex flex-col gap-1">
                                    <label
                                      className="text-xs font-medium text-foreground"
                                      htmlFor="date"
                                    >
                                      วันที่ชำระเงิน
                                    </label>
                                    <input
                                      type="text"
                                      className="form-control2 shawCalRanges min-w-[240px] rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                      name="date"
                                      defaultValue={dateInputValue}
                                    />
                                  </div>
                                  <button
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                                    type="submit"
                                  >
                                    <i className="fas fa-search"></i> ค้นหาข้อมูล
                                  </button>
                                </div>

                                <span className="block text-xs font-medium text-danger">
                                  {filterBanner}
                                </span>
                              </div>
                            </form>
                          </div>

                          {/* "คำอธิบายระบบ" pill — acc-withdraw.php L139-143 */}
                          <div className="content-header-right col-md-4 col-12">
                            <div className="text-right">
                              <span
                                className="btn btn-sm bg-color-select box-shadow-2 cursor-pointer"
                                data-toggle="modal"
                                data-target="#recom"
                              >
                                คำอธิบายระบบ
                              </span>
                            </div>
                            {/* CSV export (owner directive 2026-06-07) — page +
                                whole-range. Drift-free server action reuses the
                                same filtered query (audited) for "ทั้งหมด". */}
                            <div className="mt-2 flex justify-end">
                              <CsvButton
                                rows={csvRows}
                                cols={csvCols}
                                filename={`ถอนเงินโอนโดยตรง-${startDate}_${endDate}.csv`}
                                fetchAll={async () => {
                                  "use server";
                                  return exportAccWithdrawAll({ startDate, endDate });
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Help modal (empty body — verbatim from legacy)
                            acc-withdraw.php L145-157 */}
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

                        {/* DataTable — acc-withdraw.php L158-220 */}
                        <div>
                          <div className="table-responsive p-05 font-12">
                            <form
                              id="frm-example"
                              action="/admin/accounting/withdraw/print-receipt"
                              method="GET"
                            >
                              <input type="hidden" name="id" id="arrID" />
                              <table
                                id="myTable"
                                className="table display table-bordered table-striped dataTable no-footer dtr-inline header-fixed border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-orange-400/50 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60"
                              >
                                <thead className="bg-orange-500 text-white">
                                  <tr className="text-center">
                                    <th>วันที่ทำรายการ</th>
                                    <th>วันที่โอนคืน</th>
                                    <th>เลขออเดอร์</th>
                                    <th>สถานะรายการ</th>
                                    <th>ยอดเงินที่ถอน</th>
                                    <th>เงินที่โอนคืน</th>
                                    <th>ค่าบริการ</th>
                                    <th>รหัสสมาชิก</th>
                                    <th>ชื่อ-นามสกุล</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* Totals row pinned at the top
                                      (acc-withdraw.php L185-195).
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
                                    <td className="text-right amountAll">
                                      {numberFormat2(amountAll)}
                                    </td>
                                    <td className="text-right amountAll">
                                      {numberFormat2(amountAll)}
                                    </td>
                                    <td className="text-right">
                                      {numberFormat2(0)}
                                    </td>
                                    <td></td>
                                    <td></td>
                                  </tr>
                                  {pageRows.map((row) => (
                                    <tr
                                      key={`${row.id}-${row.date ?? ""}`}
                                      className="font-12"
                                    >
                                      {/* 1 — วันที่ทำรายการ (wh.date)
                                          acc-withdraw.php L203 */}
                                      <td>{row.date ?? ""}</td>
                                      {/* 2 — วันที่โอนคืน (wh.dateSlip)
                                          acc-withdraw.php L204 */}
                                      <td>{row.dateslip ?? ""}</td>
                                      {/* 3 — เลขออเดอร์ → link to legacy
                                          wallet/withdraw/<ID>/ which maps to
                                          /admin/wallet/withdraw/<id>
                                          acc-withdraw.php L205 */}
                                      <td>
                                        <Link
                                          href={`/admin/wallet/withdraw/${row.id}`}
                                          className="text-info"
                                        >
                                          {row.id}
                                        </Link>
                                      </td>
                                      {/* 4 — สถานะรายการ
                                          acc-withdraw.php L206 */}
                                      <td className="text-center">
                                        {statusName(row.status)}
                                      </td>
                                      {/* 5 — ยอดเงินที่ถอน
                                          acc-withdraw.php L207 */}
                                      <td className="text-right">
                                        {numberFormat2(row.amount)}
                                      </td>
                                      {/* 6 — เงินที่โอนคืน (= ยอดเงินที่ถอน;
                                          legacy renders the same value twice
                                          because direct-transfer waives fees)
                                          acc-withdraw.php L208 */}
                                      <td className="text-right">
                                        {numberFormat2(row.amount)}
                                      </td>
                                      {/* 7 — ค่าบริการ (hardcoded 0.00 in
                                          legacy — direct-transfer is fee-free)
                                          acc-withdraw.php L209 */}
                                      <td className="text-right">
                                        {numberFormat2(0)}
                                      </td>
                                      {/* 8 — รหัสสมาชิก → link to legacy
                                          users/profile/<userID>/
                                          acc-withdraw.php L210 */}
                                      <td>
                                        <CustomerCodeLink code={row.userid} />
                                      </td>
                                      {/* 9 — ชื่อ-นามสกุล/ชื่อบริษัท
                                          (juristic → company name)
                                          acc-withdraw.php L211 */}
                                      <td>{displayName(row)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </form>
                            <Pagination
                              page={page}
                              pageSize={DEFAULT_PAGE_SIZE}
                              total={rows.length}
                              basePath="/admin/accounting/withdraw"
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
      {/* END: Content — acc-withdraw.php L231 */}
    </div>
  );
}
