import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { exportAccShopAll } from "@/actions/admin/export/acc-shop";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

/**
 * Admin > "รายงานฝากสั่งซื้อสินค้า" — a FAITHFUL 1:1 TRANSCRIPTION
 * of the legacy PCS Cargo admin `pcs-admin/acc-shop.php` default
 * view (L1-381), per D1 / ADR-0017 + the faithful-port transcription
 * runbook (`docs/runbook/faithful-port-transcription.md` §8 — admin
 * pattern).
 *
 * The legacy `acc-shop.php` is the SHOP-ORDER REVENUE / AR view from
 * the บัญชี (accounting) team's frame — every successful
 * `tb_header_order` (shop-order header) whose payment has cleared
 * into `tb_wallet_hs` for the period, joined with a refund-lookup
 * map (type=5 refunds back into the same `hNo`). The columns expose
 * the per-order margin: customer paid (`payUser` = wh.amount) net
 * of refunds = (`priceUser` = (hTotalPriceCHN + hShippingCHN) *
 * hRate) recognised revenue against (`pricePCS` = hRateCost *
 * hCostAll) China-side cost, giving the service fee ("ค่าบริการ").
 * The accounting team reconciles the period's shop-order revenue
 * against bank slips through this view.
 *
 * Distinct from `/admin/reports/shop` (the OPS-side throughput
 * report) — this view is the FINANCE cut filtered to cleared
 * (`wh.status='2'`) wallet events.
 *
 * The JSX below is the exact HTML structure `acc-shop.php` renders
 * — same Bootstrap-4 markup, same elements, same labels (Thai
 * hardcoded), same column order. The visual identity comes from the
 * legacy admin CSS, brought in verbatim as the static
 * `.pcs-legacy`-scoped `public/legacy/pcs/admin/admin-base.css`
 * (the shared admin chrome — established by the admin-table pilot)
 * and `public/legacy/pcs/admin/accounting-shop.css` (the
 * page-specific inline `<style>` block from acc-shop.php L9-43),
 * both loaded via plain `<link rel="stylesheet">` so they bypass
 * the app's Tailwind v4 / PostCSS pipeline (the rule da4cd79 set).
 *
 * `acc-shop.php` source structure transcribed here:
 *   - Title bar      acc-shop.php L4 (window/page title)
 *   - Auth gate      acc-shop.php L46 (departmentKey in CEO /
 *                    Manager / QAAndQC / Accounting / ITDT)
 *   - Breadcrumb     acc-shop.php L53-62
 *   - Card header    acc-shop.php L71-156 (heading + dual date-
 *                    filter form + "คำอธิบายระบบ" help-modal pill)
 *   - DataTable      acc-shop.php L171-269 (11-column ledger with
 *                    totals row pinned at the top).
 *
 * Data — every `acc-shop.php` mysqli query transcribed 1:1 to the
 * ported legacy `tb_*` schema (Supabase, migration 0081 —
 * tb_header_order L2506-2562, tb_order L3096-3120, tb_wallet_hs
 * L6159-6185, tb_users L5828+). `tb_*` is RLS-locked to service_role
 * so reads go through the admin client.
 *   - $sql_reWallet (acc-shop.php L78-85) →
 *        tb_wallet_hs wh
 *        LEFT JOIN tb_order        o  ON o.ID=wh.refOrder
 *        LEFT JOIN tb_header_order ho ON ho.hNo=o.hNo
 *        WHERE wh.type=5 AND wh.status='2'   [+ date range]
 *        GROUP BY ho.hNo
 *        → arrReW[hNo] = SUM(wh.amount)
 *     (refund lookup map; the legacy comment notes the
 *     `$sql_reWallet.= $sql_date` was commented out — refunds
 *     are pulled across all dates, not just the filter range; we
 *     mirror exactly).
 *   - $sql_Table   (acc-shop.php L87-110) →
 *        tb_wallet_hs wh
 *        LEFT JOIN tb_header_order ho ON ho.hNo=wh.refOrder
 *        LEFT JOIN tb_users         u ON ho.userID=u.userID
 *        WHERE wh.status='2' AND ho.hNo<>''  [+ date range]
 *        GROUP BY ho.hNo
 *        ORDER BY wh.date ASC
 *     (the main ledger query — every successful wallet event tied
 *     to a non-empty header order, GROUPed so each hNo collapses to
 *     a single row even if it cleared in multiple wallet events).
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate (acc-shop.php L46) is "CEO / Manager / QAAndQC / Accounting
 * / ITDT can view". The closest Pacred V3 RBAC roles are `super`
 * (mgmt + IT) + `accounting` (finance) — `super` is always
 * universal via requireAdmin.
 *
 * URL filter (transcribed from acc-shop.php L94-108) — exposed as
 * search params on this Next.js route with the same query-string
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
 * faithful-port concern; "branding text + member codes only" rule
 * applies. Note: the cost column ("ต้นทุน (บาท)") and the customer-
 * pays column ("ลูกค้าจ่ายมา (บาท)") are not legacy-brand-prefixed
 * here — they're agnostic labels in acc-shop.php (sibling
 * acc-payment.php column "ต้นทุน PCS (บาท)" is more brand-loaded).
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - The DataTables JS init (acc-shop.php L352-377): pageLength,
 *     export-buttons (copy / csv / excel / print), fixedHeader, the
 *     "no-sort" pinned totals row. The static markup keeps the
 *     `#myTable` / `.dataTables_wrapper` / `dt-buttons` classes so
 *     the CSS looks identical at rest; functional sort/filter +
 *     export is a follow-up (likely a small React DataTables shim).
 *     The totals row is computed here on the server and rendered
 *     directly (not deferred to fnDrawCallback).
 *   - The daterangepicker JS init (acc-shop.php L308-321) — the
 *     date input renders as a plain `<input type="text">` for the
 *     static pilot; functional picker is a follow-up (needs
 *     moment.js + plugin wired up).
 *   - The (companyType==1 && department==2 && section==2)
 *     conditional that hides totals + export buttons (legacy L203,
 *     L354) — those are sales-rep-specific gates that depend on
 *     legacy session globals not yet wired through V3 RBAC. For
 *     this pilot the totals row + export buttons are ALWAYS visible
 *     (the requireAdmin gate already narrows to accounting + super,
 *     both of which see the totals in the legacy too).
 *   - The "คำอธิบายระบบ" inline help modal body (acc-shop.php
 *     L158-170) — the legacy modal-body is empty too; markup
 *     preserved so the open/close hooks remain.
 *   - The "printReceipt.php" submit-form wrapper around the table
 *     (acc-shop.php L173-174) — the legacy `<form>` carries
 *     DataTables-selected `id[]=` values into a bulk-print page;
 *     the static markup keeps the `<form>` wrapper so a later React
 *     DataTables shim has a hook point. mPDF/printReceipt itself →
 *     @react-pdf/renderer follow-up.
 *   - Cross-page badge counts → defer (no equivalent in legacy
 *     here either; legacy header chrome handles that separately).
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers inlined verbatim — pure formatters/parsers lifted from the legacy
// admin includes. Kept inline (not extracted to lib/) because this is the
// third caller of the same shape — runbook §8 promotes to `lib/` on the
// third caller, which is now; a follow-up extraction pass can lift these
// helpers (numberFormat0/2, firstDayOfThisMonth/lastDayOfMonth, YearSelect)
// to `lib/legacy/format.ts` + `lib/legacy/dates.ts` + `components/legacy/
// YearSelect.tsx` across acc-payment / acc-withdraw / acc-shop / acc-forwarder.
// Keeping inline here to land the transcription change in isolation; the
// extraction is the next refactor.
// ============================================================================

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56" thousand-grouped.
 *  Used throughout acc-shop.php (L253-257 cells + L303-307 totals JS). */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Legacy `number_format($n, 0)` — used for the "รวม" count cell at L302. */
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
// that build the default month range (acc-shop.php L105-107).
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
  // last day of month = day 0 of next month
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad2(m)}-${pad2(last)}`;
}

// ============================================================================
// Row shape — joined tb_wallet_hs + tb_header_order + tb_users projection.
// Mirrors the legacy SELECT at acc-shop.php L87-91.
// ============================================================================

type ShopRow = {
  // tb_wallet_hs
  date: string | null; // wh.date
  amount: number; // wh.amount (= "ลูกค้าจ่ายมา (บาท)" / payUser)
  reforder: string; // wh.refOrder (= ho.hNo)
  // tb_header_order
  hdate: string | null; // ho.hDate
  hno: string; // ho.hNo
  hstatus: string | null; // ho.hStatus
  htotalpricechn: number;
  hshippingchn: number;
  hrate: number;
  hratecost: number;
  hcostall: number;
  userid: string; // ho.userID
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

export default async function AdminAccountingShopPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate (acc-shop.php L46): CEO / Manager / QAAndQC /
  // Accounting / ITDT. Closest V3 RBAC = super + accounting; super
  // is always universal via requireAdmin.
  const { roles } = await requireAdmin(["super", "accounting"]);
  // Money-internal: ต้นทุน (cost) + ค่าบริการ (profit = sell − cost) are
  // visible only to ultra/accounting/pricing (NOT super · owner 2026-06-18).
  // When false we OMIT those two columns + their totals + CSV keys at the DATA
  // layer. Revenue-side columns (ลูกค้าจ่ายมา · คืนเงิน · ราคาขาย) stay visible
  // to all admins (selling, not money-internal). DERIVED-VALUE GUARD: ค่าบริการ
  // = ราคาขาย − ต้นทุน, so it is hidden together with ต้นทุน.
  const showMoney = canViewCostProfit(roles);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Filter resolution (acc-shop.php L94-108) ─────────────────────
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

  // ── Pass 1: refund-lookup map ($sql_reWallet) ───────────────────
  // Legacy: tb_wallet_hs wh LEFT JOIN tb_order o ON o.ID=wh.refOrder
  //   LEFT JOIN tb_header_order ho ON ho.hNo=o.hNo
  //   WHERE wh.type=5 AND wh.status='2' GROUP BY ho.hNo.
  // The legacy `$sql_date` IS NOT appended here (acc-shop.php L112-113
  // — explicitly commented out) so refunds are pulled across all dates
  // and matched in by hNo, NOT by date range. We reproduce verbatim.
  //
  // PostgREST exposes the FK relations one-step but tb_wallet_hs.refOrder
  // is varchar storing tb_order.id as a string — so we fetch the
  // type=5 wallet rows, join to tb_order by id-list, then to
  // tb_header_order by hno-list, summing amount per hno.
  type WalletRefundRaw = {
    amount: number | string;
    reforder: string;
  };
  const refundWalletRes = await admin
    .from("tb_wallet_hs")
    .select("amount, reforder")
    .eq("type", "5")
    .eq("status", "2");
  const refundWalletRows = (refundWalletRes.data ?? []) as unknown as WalletRefundRaw[];

  // type=5 refunds carry the tb_order.id (numeric) in refOrder — look
  // those ids up to recover the parent hno.
  const refundOrderIds = Array.from(
    new Set(
      refundWalletRows
        .map((w) => Number(w.reforder))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );
  const orderHnoById = new Map<number, string>();
  if (refundOrderIds.length > 0) {
    const orderRes = await admin
      .from("tb_order")
      .select("id, hno")
      .in("id", refundOrderIds);
    for (const o of (orderRes.data ?? []) as Array<{
      id: number;
      hno: string;
    }>) {
      if (o.hno) orderHnoById.set(o.id, o.hno);
    }
  }

  // Aggregate refund amount per hno (legacy GROUP BY ho.hNo).
  const refundByHno = new Map<string, number>();
  for (const w of refundWalletRows) {
    const orderId = Number(w.reforder);
    if (!Number.isFinite(orderId)) continue;
    const hno = orderHnoById.get(orderId);
    if (!hno) continue;
    const prev = refundByHno.get(hno) ?? 0;
    refundByHno.set(hno, prev + Number(w.amount));
  }

  // ── Pass 2: main ledger ($sql_Table) ────────────────────────────
  // Legacy: tb_wallet_hs wh LEFT JOIN tb_header_order ho ON ho.hNo=wh.refOrder
  //   LEFT JOIN tb_users u ON ho.userID=u.userID
  //   WHERE wh.status='2' AND ho.hNo<>'' [+ DATE(wh.date) BETWEEN s AND e]
  //   GROUP BY ho.hNo (so each hno collapses to one row).
  //
  // Three reads (wh → ho by hno-list → users by userid-list).
  type WalletShopRaw = {
    date: string | null;
    amount: number | string;
    reforder: string;
  };
  const walletRes = await admin
    .from("tb_wallet_hs")
    .select("date, amount, reforder")
    .eq("status", "2")
    .not("reforder", "is", null)
    .neq("reforder", "")
    .gte("date", `${startDate}T00:00:00`)
    .lte("date", `${endDate}T23:59:59`)
    .order("date", { ascending: true });
  const walletRows = (walletRes.data ?? []) as unknown as WalletShopRaw[];

  // The legacy WHERE filters wh.refOrder<>'' indirectly via the JOIN
  // (`ho.hNo<>''` means matched ho has a non-empty hNo — when status
  // is the only WHERE on wh and we then GROUP BY ho.hNo, NULL/empty
  // join hits drop). Apply the equivalent: keep only wallet rows
  // whose refOrder is a non-empty hno-shaped string.
  const candidateHnos = Array.from(
    new Set(walletRows.map((w) => w.reforder).filter((s) => !!s && s !== "")),
  );

  // ── Pass 2a: tb_header_order rows for those hnos ────────────────
  type HeaderRaw = {
    hno: string;
    hdate: string | null;
    hstatus: string | null;
    htotalpricechn: number | string;
    hshippingchn: number | string;
    hrate: number | string;
    hratecost: number | string;
    hcostall: number | string;
    userid: string;
  };
  const headerByHno = new Map<string, HeaderRaw>();
  if (candidateHnos.length > 0) {
    const headerRes = await admin
      .from("tb_header_order")
      .select(
        "hno, hdate, hstatus, htotalpricechn, hshippingchn, hrate, hratecost, hcostall, userid",
      )
      .in("hno", candidateHnos);
    for (const h of (headerRes.data ?? []) as unknown as HeaderRaw[]) {
      // Legacy GROUP BY ho.hNo means each hno appears at most once.
      // tb_header_order.hno is NOT a primary key but the migration
      // guarantees one row per hno via the legacy unique index.
      if (!headerByHno.has(h.hno)) headerByHno.set(h.hno, h);
    }
  }

  // ── Pass 2b: tb_users for the customer-name display ─────────────
  // Legacy `LEFT JOIN tb_users AS u ON ho.userID=u.userID`.
  const userIds = Array.from(
    new Set(
      Array.from(headerByHno.values())
        .map((h) => h.userid)
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

  // ── Juristic → company-name map (batched, N+1-free) ─────────────
  // นิติบุคคล customers show the COMPANY name, not the contact person.
  const corpNames = await fetchCorporateNameMap(admin, userIds);

  // ── Assemble rows in legacy order ───────────────────────────────
  // Legacy GROUP BY ho.hNo + ORDER BY wh.date ASC: collapse wallet
  // rows so each hno emits at most one ledger row, keeping the
  // chronologically first wallet date in case there were multiple
  // partial wallet hits per hno (rare under wh.status='2').
  const seenHnos = new Set<string>();
  const rows: ShopRow[] = [];
  for (const w of walletRows) {
    const hno = w.reforder;
    if (!hno || seenHnos.has(hno)) continue;
    const h = headerByHno.get(hno);
    if (!h) continue; // legacy `ho.hNo<>''` drops unjoined rows
    seenHnos.add(hno);
    const u =
      userById.get(h.userid) ??
      { username: "", userlastname: "", usercompany: null };
    rows.push({
      date: w.date,
      amount: Number(w.amount),
      reforder: hno,
      hdate: h.hdate,
      hno: h.hno,
      hstatus: h.hstatus,
      htotalpricechn: Number(h.htotalpricechn),
      hshippingchn: Number(h.hshippingchn),
      hrate: Number(h.hrate),
      hratecost: Number(h.hratecost),
      hcostall: Number(h.hcostall),
      userid: h.userid,
      username: u.username,
      userlastname: u.userlastname,
      usercompany: u.usercompany,
    });
  }

  // ── Compute totals row (acc-shop.php L194-246) ──────────────────
  //   no             = count(rows)
  //   payUserAll     = SUM(wh.amount)
  //   returnWalletAll= SUM(arrReW[hNo] ?? 0)
  //   priceUserAll   = SUM((hTotalPriceCHN+hShippingCHN)*hRate)
  //   pricePCSAll    = SUM(hRateCost*hCostAll)
  //   profitAll      = SUM(profit)  // profit=0 when hStatus=='6'
  let payUserAll = 0;
  let returnWalletAll = 0;
  let priceUserAll = 0;
  let pricePCSAll = 0;
  let profitAll = 0;
  for (const r of rows) {
    const priceUser = (r.htotalpricechn + r.hshippingchn) * r.hrate;
    const pricePCS = r.hratecost * r.hcostall;
    const returnWallet = refundByHno.get(r.hno) ?? 0;
    const profit = r.hstatus === "6" ? 0 : priceUser - pricePCS;
    payUserAll += r.amount;
    returnWalletAll += returnWallet;
    priceUserAll += priceUser;
    pricePCSAll += pricePCS;
    profitAll += profit;
  }

  // PERF (2026-06-03): client-slice the DISPLAYED ledger (50/page). All
  // totals above are computed over the full `rows` set — we only window the
  // rows rendered in the <tbody> below the pinned totals row.
  const page     = parsePage(sp.page);
  const offset   = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // ── CSV export (owner directive 2026-06-07 — accounting wants the
  //    reconciliation lists in a spreadsheet) ───────────────────────────────
  // Columns mirror the 11 on-screen <thead> columns 1:1 (same order, same Thai
  // labels, money pre-formatted via numberFormat2 like the cells). `csvCols`
  // keys MUST match the keys the page-row mapper + the exportAccShopAll action
  // emit. The "⬇ CSV หน้านี้" button uses these displayed pageRows; the
  // "⬇ CSV ทั้งหมด" button calls the drift-free server action over the SAME
  // resolved [startDate, endDate] filter, unpaginated + audited.
  const csvCols = [
    { key: "pay_date", label: "วันที่ชำระเงิน" },
    { key: "create_date", label: "วันที่สร้าง" },
    { key: "order_no", label: "เลขออเดอร์" },
    { key: "status", label: "สถานะสินค้า" },
    { key: "pay_user", label: "ลูกค้าจ่ายมา (บาท)" },
    { key: "return_wallet", label: "คืนเงินลูกค้า (บาท)" },
    { key: "price_sell", label: "ราคาขาย (บาท)" },
    ...(showMoney
      ? [
          { key: "cost", label: "ต้นทุน (บาท)" },
          { key: "service_fee", label: "ค่าบริการ (บาท)" },
        ]
      : []),
    { key: "member_code", label: "รหัสสมาชิก" },
    { key: "customer_name", label: "ชื่อ-นามสกุล" },
  ];
  const csvRows: CsvRow[] = pageRows.map((row) => {
    const priceUser = (row.htotalpricechn + row.hshippingchn) * row.hrate;
    const pricePCS = row.hratecost * row.hcostall;
    const returnWallet = refundByHno.get(row.hno) ?? 0;
    const profit = row.hstatus === "6" ? 0 : priceUser - pricePCS;
    return {
      pay_date: row.date ?? "",
      create_date: row.hdate ?? "",
      order_no: row.reforder,
      status: hStatusBadge(row.hstatus).label,
      pay_user: numberFormat2(row.amount),
      return_wallet: numberFormat2(returnWallet),
      price_sell: numberFormat2(priceUser),
      ...(showMoney
        ? {
            cost: numberFormat2(pricePCS),
            service_fee: numberFormat2(profit),
          }
        : {}),
      member_code: row.userid,
      customer_name: resolveBillingIdentity({
        userCompany: row.usercompany,
        userName: row.username,
        userLastName: row.userlastname,
        corp: corpRowFromName(corpNames.get(row.userid)),
      }).name,
    };
  });

  // Display-only banner copy (acc-shop.php L146-148 — always shows
  // "ผลลัพธ์การค้นหา ตั้งแต่วันที่ : <start> - <end>", because the legacy
  // unconditionally writes `$_GET['date'] = $startDate." - ".$endDate`
  // back into the same key).
  const filterBanner = `ผลลัพธ์การค้นหา ตั้งแต่วันที่ : ${startDate} - ${endDate}`;

  // Re-render the input value verbatim from the resolved range
  // (matches the legacy <input ... value="<?= startDate ?> - <?= endDate ?>">).
  const dateInputValue = `${startDate} - ${endDate}`;

  // hStatus → badge HTML decoder (acc-shop.php L225-232 CASE).
  // Returns the className + label; the rendering site composes the
  // <span class="font-10 badge badge-* badge-pill"> exactly as the
  // legacy <span> does.
  function hStatusBadge(s: string | null): {
    className: string;
    label: string;
  } {
    switch (s) {
      case "1":
        return { className: "badge badge-warning badge-pill", label: "รอดำเนินการ" };
      case "2":
        return { className: "badge badge-danger badge-pill", label: "รอชำระเงิน" };
      case "3":
        return { className: "badge badge-info badge-pill", label: "สั่งสินค้า" };
      case "4":
        return { className: "badge badge-warning badge-pill", label: "รอร้านจีนจัดส่ง" };
      case "40":
        return { className: "badge badge-info badge-pill", label: "ถึงโกดังจีน" };
      case "5":
        return { className: "badge badge-success badge-pill", label: "สำเร็จ" };
      case "6":
        return { className: "badge badge-danger badge-pill", label: "ยกเลิกออเดอร์" };
      default:
        return { className: "badge badge-secondary badge-pill", label: "ไม่พบข้อมูล" };
    }
  }

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both served as
          static /public/ assets so they bypass Tailwind / PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/accounting-shop.css" />

      {/* BEGIN: Content — acc-shop.php L48 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb — acc-shop.php L52-62 */}
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
                      รายงานฝากสั่งซื้อสินค้า
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body">
            {/* acc-shop.php L64 */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          {/* Heading + filter form — acc-shop.php L72-151 */}
                          <div className="content-header-left col-md-8 col-12">
                            <div className="text-center text-md-left">
                              <h3 className="text-center text-md-left">
                                <span className="font-30 ft-users"></span>{" "}
                                รายงานฝากสั่งซื้อสินค้า
                              </h3>
                            </div>
                            <form
                              className="pt-1"
                              method="GET"
                              action="/admin/accounting/shop"
                            >
                              <label
                                className="form-control-label"
                                htmlFor="dateGroup"
                              >
                                วันที่ชำระเงินแบบรายเดือน
                              </label>
                              {/* generateYearDropdown(2021) — start year is 2021
                                  per acc-shop.php L125 */}
                              <YearSelect startYear={2021} value={sp.year} />
                              {/* Hardcoded month list — acc-shop.php L126-139 */}
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

                          {/* "คำอธิบายระบบ" pill — acc-shop.php L152-156
                              + CSV export (owner directive 2026-06-07 —
                              accounting wants this reconciliation list in a
                              spreadsheet). The page export uses the displayed
                              page rows; the "ทั้งหมด" export re-runs the SAME
                              [startDate, endDate] filter unpaginated + audited. */}
                          <div className="content-header-right col-md-4 col-12">
                            <div className="d-flex justify-content-end align-items-center flex-wrap gap-2">
                              <CsvButton
                                rows={csvRows}
                                cols={csvCols}
                                filename={`รายงานฝากสั่งซื้อ-${startDate}-ถึง-${endDate}.csv`}
                                fetchAll={async () => {
                                  "use server";
                                  return exportAccShopAll({ startDate, endDate });
                                }}
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
                            acc-shop.php L158-170 */}
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

                        {/* DataTable — acc-shop.php L171-269 */}
                        <div>
                          <div className="table-responsive p-05 font-12">
                            {/* The legacy <form> carries DataTables-selected
                                id[]= values into printReceipt.php on submit.
                                Static render — kept as a plain wrapper since
                                no JS executes the bulk-print flow yet. */}
                            <form
                              id="frm-example"
                              action="/admin/accounting/shop/print-receipt"
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
                                    <th>วันที่สร้าง</th>
                                    <th>เลขออเดอร์</th>
                                    <th>สถานะสินค้า</th>
                                    <th title="ยอดเงินยังไม่ได้หักคืนเงิน">
                                      ลูกค้าจ่ายมา (บาท)
                                    </th>
                                    <th title="จำนวนเงินที่คืนลูกค้าในเดือนนั้น ๆ ยัง">
                                      คืนเงินลูกค้า (บาท)
                                    </th>
                                    <th title="เป็นยอดที่หักรายการคืนเงินแล้ว">
                                      ราคาขาย (บาท)
                                    </th>
                                    {showMoney && (
                                      <th title="เป็นยอดที่หักรายการคืนเงินแล้ว">
                                        ต้นทุน (บาท)
                                      </th>
                                    )}
                                    {showMoney && (
                                      <th title="ส่วนต่างคงเหลือนำยอดราคาขาย-ต้นทุน ที่มีการหักรายการคืนเงินไปแล้ว">
                                        ค่าบริการ (บาท)
                                      </th>
                                    )}
                                    <th>รหัสสมาชิก</th>
                                    <th>ชื่อ-นามสกุล</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* Totals row pinned at the top
                                      (acc-shop.php L205-217).
                                      Legacy hides this for the
                                      (companyType==1 && department==2 &&
                                       section==2) sales-rep gate — for
                                      this pilot the row is always shown
                                      (requireAdmin already narrowed to
                                      accounting + super). */}
                                  <tr className="font-14 bg-color no-sort">
                                    <td className="text-right"></td>
                                    <td className="text-right">รวม</td>
                                    <td className="text-right count-order">
                                      {numberFormat0(rows.length)}
                                    </td>
                                    <td className="text-right"></td>
                                    <td className="text-right payUserAll">
                                      {numberFormat2(payUserAll)}
                                    </td>
                                    <td className="text-right returnWalletAll">
                                      {numberFormat2(returnWalletAll)}
                                    </td>
                                    <td className="text-right priceUserAll">
                                      {numberFormat2(priceUserAll)}
                                    </td>
                                    {showMoney && (
                                      <td className="text-right pricePCSAll">
                                        {numberFormat2(pricePCSAll)}
                                      </td>
                                    )}
                                    {showMoney && (
                                      <td className="text-right profitAll">
                                        {numberFormat2(profitAll)}
                                      </td>
                                    )}
                                    <td className="text-right"></td>
                                    <td></td>
                                  </tr>
                                  {pageRows.map((row) => {
                                    const priceUser =
                                      (row.htotalpricechn + row.hshippingchn) *
                                      row.hrate;
                                    const pricePCS = row.hratecost * row.hcostall;
                                    const returnWallet =
                                      refundByHno.get(row.hno) ?? 0;
                                    const profit =
                                      row.hstatus === "6"
                                        ? 0
                                        : priceUser - pricePCS;
                                    const badge = hStatusBadge(row.hstatus);
                                    return (
                                      <tr
                                        key={`${row.hno}-${row.date ?? ""}`}
                                        className="font-12"
                                      >
                                        {/* 1 — วันที่ชำระเงิน (wh.date)
                                            acc-shop.php L249 */}
                                        <td>{row.date ?? ""}</td>
                                        {/* 2 — วันที่สร้าง (ho.hDate)
                                            acc-shop.php L250 */}
                                        <td>{row.hdate ?? ""}</td>
                                        {/* 3 — เลขออเดอร์ → link to legacy
                                            shops/detail/<refOrder>/ which maps
                                            to /admin/service-orders/<hNo>
                                            acc-shop.php L251 */}
                                        <td>
                                          <Link
                                            href={`/admin/service-orders/${row.reforder}`}
                                            className="text-info"
                                          >
                                            {row.reforder}
                                          </Link>
                                        </td>
                                        {/* 4 — สถานะสินค้า (font-10 + badge classes)
                                            acc-shop.php L252 */}
                                        <td className="text-center">
                                          <span
                                            className={`font-10 ${badge.className}`}
                                          >
                                            {badge.label}
                                          </span>
                                        </td>
                                        {/* 5 — ลูกค้าจ่ายมา (wh.amount)
                                            acc-shop.php L253 */}
                                        <td className="text-right">
                                          {numberFormat2(row.amount)}
                                        </td>
                                        {/* 6 — คืนเงินลูกค้า (arrReW[hNo])
                                            acc-shop.php L254 */}
                                        <td className="text-right">
                                          {numberFormat2(returnWallet)}
                                        </td>
                                        {/* 7 — ราคาขาย
                                            acc-shop.php L255 */}
                                        <td className="text-right">
                                          {numberFormat2(priceUser)}
                                        </td>
                                        {/* 8 — ต้นทุน (money-internal · hidden from non-cost roles)
                                            acc-shop.php L256 */}
                                        {showMoney && (
                                          <td className="text-right">
                                            {numberFormat2(pricePCS)}
                                          </td>
                                        )}
                                        {/* 9 — ค่าบริการ (profit · money-internal)
                                            acc-shop.php L257 */}
                                        {showMoney && (
                                          <td className="text-right">
                                            {numberFormat2(profit)}
                                          </td>
                                        )}
                                        {/* 10 — รหัสสมาชิก → link to legacy
                                            users/profile/<userID>/ which maps
                                            to /admin/customers/<id>
                                            acc-shop.php L258 */}
                                        <td>
                                          <Link
                                            href={`/admin/customers/${row.userid}`}
                                            className="text-info"
                                          >
                                            {row.userid}
                                          </Link>
                                        </td>
                                        {/* 11 — ชื่อ-นามสกุล/ชื่อบริษัท
                                            (juristic → company name)
                                            acc-shop.php L259 */}
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
                              basePath="/admin/accounting/shop"
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
      {/* END: Content — acc-shop.php L279 */}
    </div>
  );
}
