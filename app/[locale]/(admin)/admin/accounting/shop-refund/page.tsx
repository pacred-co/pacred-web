import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportAccShopRefundAll } from "@/actions/admin/export/acc-shop-refund";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

/**
 * Admin > "คืนเงินฝากสั่ง" — a FAITHFUL 1:1 TRANSCRIPTION of the
 * legacy PCS Cargo admin `pcs-admin/acc-shop-refund.php` default
 * view (L1-350), per D1 / ADR-0017 + the faithful-port transcription
 * runbook (`docs/runbook/faithful-port-transcription.md` §8 — admin
 * pattern).
 *
 * The legacy `acc-shop-refund.php` is the บัญชี (accounting) view of
 * ฝากสั่งซื้อ (shop-order) REFUNDS credited back into the customer's
 * PCS Wallet — every `tb_wallet_hs` row with `type=5` (refund) AND
 * `status=2` (settled). The accounting team uses this view to
 * reconcile the period's shop-order refunds against the wallet
 * ledger. Each refund is joined through the order
 * (`o.ID=wh.refOrder`) up to the shop-order header (`oh.hNo=o.hNo`)
 * so the row can show the order-no + สถานะสินค้า, and to `tb_users`
 * for the customer name.
 *
 * FAITHFUL NOTE — the legacy renders 4 of the money columns as the
 * literal string "ยังระบุไม่ได้" (acc-shop-refund.php L222-225:
 * ลูกค้าจ่ายมา / จ่ายเงินร้านค้า / ร้านคืนให้ PCS หยวน /
 * เรทตอนที่คืนเงินมา are NOT yet derivable in legacy). Replicated
 * verbatim — those cells render "ยังระบุไม่ได้". Only two real
 * values: the refund into Wallet (= wh.amount, L226) and ค่าบริการ
 * (hardcoded 0.00, L227). The totals row therefore sums only the
 * Wallet-refund column (acc-shop-refund.php L196 `.amountAll`) + the
 * order count (L189 `.count-order`).
 *
 * The JSX below is the exact HTML structure `acc-shop-refund.php`
 * renders — same column order, same labels (Thai hardcoded). The
 * visual identity comes from the legacy admin CSS, brought in
 * verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/admin/admin-base.css` (the shared admin chrome)
 * + `public/legacy/pcs/admin/accounting-shop.css` (the shop-family
 * page CSS — same inline `<style>` classes as acc-shop-refund.php
 * L9-43: orange thead, `.bg-color` totals, `.dt-buttons`), both
 * loaded via plain `<link rel="stylesheet">` so they bypass the
 * app's Tailwind v4 / PostCSS pipeline (the rule da4cd79 set).
 *
 * `acc-shop-refund.php` source structure transcribed here:
 *   - Title bar      acc-shop-refund.php L4 (window/page title)
 *   - Auth gate      acc-shop-refund.php L46 (departmentKey in CEO /
 *                    Manager / QAAndQC / Accounting / ITDT)
 *   - Breadcrumb     acc-shop-refund.php L52-62
 *   - Card header    acc-shop-refund.php L71-141 (heading + dual
 *                    date-filter form + "คำอธิบายระบบ" help pill)
 *   - DataTable      acc-shop-refund.php L159-236 (13-column ledger
 *                    with totals row pinned at the top).
 *
 * Data — every `acc-shop-refund.php` mysqli query transcribed 1:1 to
 * the ported legacy `tb_*` schema (Supabase, migration 0081). `tb_*`
 * is RLS-locked to service_role so reads go through the admin client.
 *   - $sql_Table (acc-shop-refund.php L79-105) →
 *        tb_wallet_hs        wh
 *        LEFT JOIN tb_order         o  ON o.ID=wh.refOrder
 *        LEFT JOIN tb_header_order  oh ON oh.hNo=o.hNo
 *        LEFT JOIN tb_users          u ON u.userID=wh.userID
 *        WHERE wh.status=2 AND wh.type=5   [+ DATE(wh.date) range]
 *        GROUP BY wh.ID
 *        ORDER BY wh.date ASC
 *     Replicated as 4 batched map-joins (GROUP BY wh.ID = the wallet
 *     PK → no collapse; each refund is one row).
 *
 * Auth — runbook §3 keeps the Pacred auth chain. The legacy gate
 * (acc-shop-refund.php L46) is "CEO / Manager / QAAndQC / Accounting
 * / ITDT can view". Closest Pacred V3 RBAC = `super` + `accounting`.
 *
 * URL filter (transcribed from acc-shop-refund.php L89-103) — same
 * query-string shape as the legacy URL:
 *   ?date=YYYY-MM-DD%20-%20YYYY-MM-DD   → custom date range
 *   ?dateGroup=true&year=YYYY&month=MM  → year+month chooser
 *   (none)                              → default = current month
 *
 * Rebrand: legacy `PCS Cargo Admin` window title → `PR Cargo Admin`;
 * everything else verbatim Thai. The PCS-scrub stays
 * API-switchover-gated (CLAUDE.md / ADR-0017) — not a faithful-port
 * concern.
 *
 * Not transcribed (deliberate · matches the acc-withdraw pilot):
 *   - The DataTables JS init (acc-shop-refund.php L318-345): the
 *     export-buttons / fixedHeader / no-sort pinned totals — the
 *     totals row is computed server-side + rendered directly; CSV
 *     export is provided via the React `<CsvButton>` instead.
 *   - The daterangepicker JS init (acc-shop-refund.php L274-287) —
 *     the date input renders as a plain `<input type="text">`.
 *   - The (companyType==1 && department==2 && section==2) sales-rep
 *     gate that hides totals + export (L184, L320) — requireAdmin
 *     already narrows to accounting + super, so totals + export are
 *     always shown.
 *   - The "printReceipt.php" submit-form wrapper around the table
 *     (acc-shop-refund.php L157-158) — the `<form>` wrapper is kept
 *     so a later React DataTables shim has a hook point.
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers inlined verbatim — pure formatters lifted from the legacy admin
// includes (mirrors the acc-withdraw pilot).
// ============================================================================

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56" thousand-grouped. */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Legacy `number_format($n, 0)` — used for the "รวม" count cell. */
function numberFormat0(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Legacy literal for the 4 not-yet-derivable money columns
 *  (acc-shop-refund.php L222-225). */
const NOT_YET = "ยังระบุไม่ได้";

/** Legacy `generateYearDropdown($startYear, $selectName = "year")` —
 *  pcs-admin/include/function.php. Renders a year `<select>` from the
 *  CURRENT year down to $startYear inclusive. */
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
// that build the default month range (acc-shop-refund.php L100-101).
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

/**
 * hStatus → readable pill (acc-shop-refund.php L206-213 CASE). The legacy uses
 * Bootstrap `badge badge-* badge-pill`; rendered here as a self-contained
 * Tailwind pill (readable per §0g/§0h, no dependency on the legacy badge CSS
 * being present). "40" (ถึงโกดังจีน) is the owner-added 2026-06-16 MOMO-arrival
 * status legacy predates — kept in sync with the sibling acc-shop page so a
 * "40" header order doesn't fall through to "ไม่พบข้อมูล".
 */
function hStatusPill(s: string | null): { label: string; className: string } {
  switch (s) {
    case "1":
      return { label: "รอดำเนินการ", className: "bg-amber-100 text-amber-700" };
    case "2":
      return { label: "รอชำระเงิน", className: "bg-red-100 text-red-700" };
    case "3":
      return { label: "สั่งสินค้า", className: "bg-sky-100 text-sky-700" };
    case "4":
      return { label: "รอร้านจีนจัดส่ง", className: "bg-amber-100 text-amber-700" };
    case "40":
      return { label: "ถึงโกดังจีน", className: "bg-sky-100 text-sky-700" };
    case "5":
      return { label: "สำเร็จ", className: "bg-emerald-100 text-emerald-700" };
    case "6":
      return { label: "ยกเลิกออเดอร์", className: "bg-red-100 text-red-700" };
    default:
      return { label: "ไม่พบข้อมูล", className: "bg-slate-100 text-slate-600" };
  }
}

// ============================================================================
// Row shape — joined tb_wallet_hs + tb_order + tb_header_order + tb_users
// projection. Mirrors the legacy SELECT at acc-shop-refund.php L79-81.
// ============================================================================

type RefundRow = {
  // tb_wallet_hs
  date: string | null; // wh.date
  id: number; // wh.ID
  amount: number; // wh.amount
  userid: string; // wh.userID
  // joined
  hno: string; // o.hNo (via reforder → tb_order.id)
  hstatus: string | null; // oh.hStatus
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

export default async function AdminAccountingShopRefundPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate (acc-shop-refund.php L46): CEO / Manager / QAAndQC /
  // Accounting / ITDT. Closest V3 RBAC = super + accounting.
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Filter resolution (acc-shop-refund.php L89-103) ─────────────
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

  // ── Pass 1: pull the refund wallet rows ─────────────────────────
  // Legacy WHERE wh.status=2 AND wh.type=5 + date range, ORDER BY date ASC.
  type WalletRaw = {
    id: number;
    date: string | null;
    amount: number | string;
    reforder: string;
    userid: string;
  };
  const walletRes = await admin
    .from("tb_wallet_hs")
    .select("id, date, amount, reforder, userid")
    .eq("type", "5")
    .eq("status", "2")
    .gte("date", `${startDate}T00:00:00`)
    .lte("date", `${endDate}T23:59:59`)
    .order("date", { ascending: true });

  const walletRows = (walletRes.data ?? []) as unknown as WalletRaw[];

  // ── Pass 2: reforder → tb_order.id → hNo map ────────────────────
  // Legacy `LEFT JOIN tb_order AS o ON o.ID=wh.refOrder`.
  const orderIds = Array.from(
    new Set(
      walletRows
        .map((w) => Number(w.reforder))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );
  const hnoByOrderId = new Map<number, string>();
  if (orderIds.length > 0) {
    const ordersRes = await admin
      .from("tb_order")
      .select("id, hno")
      .in("id", orderIds);
    if (ordersRes.error) {
      console.error("[shop-refund tb_order] failed", {
        code: ordersRes.error.code,
        message: ordersRes.error.message,
      });
    }
    for (const o of (ordersRes.data ?? []) as Array<{ id: number; hno: string }>) {
      if (o.hno) hnoByOrderId.set(o.id, o.hno);
    }
  }

  // ── Pass 3: hNo → tb_header_order.hStatus map ───────────────────
  // Legacy `LEFT JOIN tb_header_order AS oh ON oh.hNo=o.hNo`.
  const hnos = Array.from(new Set(Array.from(hnoByOrderId.values())));
  const hstatusByHno = new Map<string, string | null>();
  if (hnos.length > 0) {
    const headersRes = await admin
      .from("tb_header_order")
      .select("hno, hstatus")
      .in("hno", hnos);
    if (headersRes.error) {
      console.error("[shop-refund tb_header_order] failed", {
        code: headersRes.error.code,
        message: headersRes.error.message,
      });
    }
    for (const h of (headersRes.data ?? []) as Array<{
      hno: string;
      hstatus: string | null;
    }>) {
      if (!hstatusByHno.has(h.hno)) hstatusByHno.set(h.hno, h.hstatus);
    }
  }

  // ── Pass 4: tb_users for the customer-name display ──────────────
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
  const corpNames = await fetchCorporateNameMap(admin, userIds);

  // ── Assemble rows in legacy order (wh.date ASC · GROUP BY wh.ID) ─
  const rows: RefundRow[] = walletRows.map((w) => {
    const orderId = Number(w.reforder);
    const hno = Number.isFinite(orderId) ? hnoByOrderId.get(orderId) ?? "" : "";
    const hstatus = hno ? hstatusByHno.get(hno) ?? null : null;
    const u =
      userById.get(w.userid) ??
      { username: "", userlastname: "", usercompany: null };
    return {
      date: w.date,
      id: w.id,
      amount: Number(w.amount),
      userid: w.userid,
      hno,
      hstatus,
      username: u.username,
      userlastname: u.userlastname,
      usercompany: u.usercompany,
    };
  });

  // ── Compute totals row (acc-shop-refund.php L186-199) ───────────
  //   amountAll = SUM(wh.amount) — the Wallet-refund column only.
  let amountAll = 0;
  for (const r of rows) amountAll += r.amount;

  // PERF: client-slice the DISPLAYED ledger (50/page). amountAll is over the
  // full `rows` set — we only window the rows rendered under the totals row.
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // Display banner copy (acc-shop-refund.php L130-132 — always shows the
  // resolved range because legacy unconditionally writes it back into $_GET).
  const filterBanner = `ผลลัพธ์การค้นหา ตั้งแต่วันที่ : ${startDate} - ${endDate}`;
  const dateInputValue = `${startDate} - ${endDate}`;

  // ── Juristic-aware display name ─────────────────────────────────
  const displayName = (row: RefundRow) =>
    resolveBillingIdentity({
      userCompany: row.usercompany,
      userName: row.username,
      userLastName: row.userlastname,
      corp: corpRowFromName(corpNames.get(row.userid)),
    }).name;

  // ── CSV export (owner directive 2026-06-07: accounting reconciliation) ──
  // Columns mirror the on-screen 13-column ledger header order.
  const csvCols: CsvCol[] = [
    { key: "date", label: "วันที่ทำรายการ" },
    { key: "type", label: "ประเภท" },
    { key: "order_no", label: "รายการอ้างอิง" },
    { key: "status", label: "สถานะสินค้า" },
    { key: "refund_id", label: "เลขที่คืนเงิน" },
    { key: "pay_user", label: "ลูกค้าจ่ายมา (บาท)" },
    { key: "pay_shop", label: "จ่ายเงินร้านค้า (บาท)" },
    { key: "shop_refund_yuan", label: "ร้านคืนให้ PCS (หยวน)" },
    { key: "refund_rate", label: "เรทตอนที่คืนเงินมา" },
    { key: "refund_wallet", label: "เงินคืนเข้า PCS Wallet (บาท)" },
    { key: "service_fee", label: "ค่าบริการ" },
    { key: "member_code", label: "รหัสสมาชิก" },
    { key: "customer_name", label: "ชื่อ-นามสกุล" },
  ];
  const csvRows: CsvRow[] = pageRows.map((row) => ({
    date: row.date ?? "",
    type: "ฝากสั่งซื้อ",
    order_no: row.hno,
    status: hStatusPill(row.hstatus).label,
    refund_id: row.id,
    pay_user: NOT_YET,
    pay_shop: NOT_YET,
    shop_refund_yuan: NOT_YET,
    refund_rate: NOT_YET,
    refund_wallet: numberFormat2(row.amount),
    service_fee: numberFormat2(0),
    member_code: row.userid,
    customer_name: displayName(row),
  }));

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + shop-family page CSS — both served as
          static /public/ assets so they bypass Tailwind / PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/accounting-shop.css" />

      {/* BEGIN: Content — acc-shop-refund.php L48 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb — acc-shop-refund.php L52-62 */}
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
                    <li className="breadcrumb-item active">คืนเงินฝากสั่งซื้อ</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body">
            {/* acc-shop-refund.php L64 */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          {/* Heading + filter form — acc-shop-refund.php L72-134 */}
                          <div className="content-header-left col-md-8 col-12">
                            <div className="text-center text-md-left">
                              <h3 className="text-center text-md-left">
                                <span className="font-30 ft-users"></span>{" "}
                                คืนเงินฝากสั่งซื้อ
                              </h3>
                            </div>
                            {/* faithful-look: the legacy filter was bare
                                <br/>-separated controls ("ลอยโล่งๆ"). Framed
                                in a bordered card + styled inputs to match our
                                house-style — same fields/logic, just boxed. */}
                            <form
                              className="pt-1"
                              method="GET"
                              action="/admin/accounting/shop-refund"
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
                                      {/* generateYearDropdown(2021) — acc-shop-refund.php L109 */}
                                      <YearSelect
                                        startYear={2021}
                                        value={sp.year}
                                        className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                      />
                                      {/* Hardcoded month list — acc-shop-refund.php L110-123 */}
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

                          {/* "คำอธิบายระบบ" pill — acc-shop-refund.php L135-139 */}
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
                                filename={`คืนเงินฝากสั่ง-${startDate}_${endDate}.csv`}
                                fetchAll={async () => {
                                  "use server";
                                  return exportAccShopRefundAll({ startDate, endDate });
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Help modal (empty body — verbatim from legacy)
                            acc-shop-refund.php L142-154 */}
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

                        {/* DataTable — acc-shop-refund.php L155-237 */}
                        <div>
                          <div className="table-responsive p-05 font-12 overflow-x-auto scrollbar-x-visible">
                            <form
                              id="frm-example"
                              action="/admin/accounting/shop-refund/print-receipt"
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
                                    <th>ประเภท</th>
                                    <th>รายการอ้างอิง</th>
                                    <th>สถานะสินค้า</th>
                                    <th>เลขที่คืนเงิน</th>
                                    <th>
                                      ลูกค้าจ่ายมา
                                      <br /> (บาท)
                                    </th>
                                    <th>
                                      จ่ายเงินร้านค้า
                                      <br /> (บาท)
                                    </th>
                                    <th>
                                      ร้านคืนให้
                                      <br /> PCS (หยวน)
                                    </th>
                                    <th>
                                      เรทตอนที่
                                      <br />
                                      คืนเงินมา
                                    </th>
                                    <th>
                                      เงินที่คืนลูกค้าเข้า
                                      <br />
                                      PCS Wallet (บาท)
                                    </th>
                                    <th>ค่าบริการ</th>
                                    <th>รหัสสมาชิก</th>
                                    <th>ชื่อ-นามสกุล</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* Totals row pinned at the top
                                      (acc-shop-refund.php L186-199). Legacy
                                      hides this for the sales-rep gate — for
                                      this pilot the row is always shown
                                      (requireAdmin already narrowed to
                                      accounting + super). Only the Wallet-refund
                                      column + count are summed; the 4 literal
                                      placeholder columns stay 0.00. */}
                                  <tr className="font-14 bg-color no-sort">
                                    <td></td>
                                    <td className="text-right">รวม</td>
                                    <td className="text-right count-order">
                                      {numberFormat0(rows.length)}
                                    </td>
                                    <td></td>
                                    <td></td>
                                    <td className="text-right">
                                      {numberFormat2(0)}
                                    </td>
                                    <td className="text-right">
                                      {numberFormat2(0)}
                                    </td>
                                    <td className="text-right">
                                      {numberFormat2(0)}
                                    </td>
                                    <td className="text-right">
                                      {numberFormat2(0)}
                                    </td>
                                    <td className="text-right amountAll">
                                      {numberFormat2(amountAll)}
                                    </td>
                                    <td></td>
                                    <td></td>
                                    <td></td>
                                  </tr>
                                  {pageRows.map((row) => {
                                    const pill = hStatusPill(row.hstatus);
                                    return (
                                      <tr
                                        key={`${row.id}-${row.date ?? ""}`}
                                        className="font-12"
                                      >
                                        {/* 1 — วันที่ทำรายการ (wh.date)
                                            acc-shop-refund.php L217 */}
                                        <td>{row.date ?? ""}</td>
                                        {/* 2 — ประเภท (literal "ฝากสั่งซื้อ")
                                            acc-shop-refund.php L218 */}
                                        <td>ฝากสั่งซื้อ</td>
                                        {/* 3 — รายการอ้างอิง → link to shop
                                            order detail
                                            acc-shop-refund.php L219 */}
                                        <td>
                                          {row.hno ? (
                                            <Link
                                              href={`/admin/service-orders/${row.hno}`}
                                              className="text-info"
                                            >
                                              {row.hno}
                                            </Link>
                                          ) : (
                                            "-"
                                          )}
                                        </td>
                                        {/* 4 — สถานะสินค้า (oh.hStatus)
                                            acc-shop-refund.php L220 */}
                                        <td className="text-center">
                                          <span
                                            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${pill.className}`}
                                          >
                                            {pill.label}
                                          </span>
                                        </td>
                                        {/* 5 — เลขที่คืนเงิน (wh.ID)
                                            acc-shop-refund.php L221 */}
                                        <td>{row.id}</td>
                                        {/* 6-9 — legacy literal placeholders
                                            acc-shop-refund.php L222-225 */}
                                        <td className="text-right">{NOT_YET}</td>
                                        <td className="text-right">{NOT_YET}</td>
                                        <td className="text-right">{NOT_YET}</td>
                                        <td className="text-right">{NOT_YET}</td>
                                        {/* 10 — เงินที่คืนลูกค้าเข้า Wallet
                                            (wh.amount)
                                            acc-shop-refund.php L226 */}
                                        <td className="text-right">
                                          {numberFormat2(row.amount)}
                                        </td>
                                        {/* 11 — ค่าบริการ (hardcoded 0.00)
                                            acc-shop-refund.php L227 */}
                                        <td className="text-right">
                                          {numberFormat2(0)}
                                        </td>
                                        {/* 12 — รหัสสมาชิก → link to profile
                                            acc-shop-refund.php L228 */}
                                        <td>
                                          <Link
                                            href={`/admin/customers/${row.userid}`}
                                            className="text-info"
                                          >
                                            {row.userid}
                                          </Link>
                                        </td>
                                        {/* 13 — ชื่อ-นามสกุล / ชื่อบริษัท
                                            (juristic → company name)
                                            acc-shop-refund.php L229 */}
                                        <td>{displayName(row)}</td>
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
                              basePath="/admin/accounting/shop-refund"
                              params={{
                                date: sp.date,
                                dateGroup: sp.dateGroup,
                                year: sp.year,
                                month: sp.month,
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
      {/* END: Content — acc-shop-refund.php L249 */}
    </div>
  );
}
