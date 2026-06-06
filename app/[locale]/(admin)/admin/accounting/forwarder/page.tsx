import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { exportAccForwarderAll } from "@/actions/admin/export/acc-forwarder";

/**
 * Admin > "รายงานฝากนำเข้า" — a FAITHFUL 1:1 TRANSCRIPTION of the
 * legacy PCS Cargo admin `pcs-admin/acc-forwarder.php` default view
 * (L1-481), per D1 / ADR-0017 + the faithful-port transcription
 * runbook (`docs/runbook/faithful-port-transcription.md` §8 — admin
 * pattern).
 *
 * The legacy `acc-forwarder.php` is the FORWARDER (ฝากนำเข้า) REVENUE
 * view from the บัญชี (accounting) team's frame — every successful
 * `tb_forwarder` (forwarder-import) row whose payment has cleared
 * into `tb_wallet_hs` as a `type=4` ("รายการชำระเงินฝากนำเข้า")
 * event, joined with:
 *   • `tb_corporate` — to flag นิติบุคคล payers (1% หัก ณ ที่จ่าย)
 *   • `tb_receipt_item` — to pull the tax-invoice number (`rID`)
 *   • `tb_cash_back_hs` — to add cash-back amounts the customer
 *     paid through (cbhStatus=2 only).
 * The columns expose the per-order margin: ต้นทุน (transport-CHN +
 * transport-TH + service-50 + crate + other + price-update +
 * transport-CHN-THB) → ราคาจริง (incl. all add-ons, no discount)
 * → มูลค่าสินค้า (after discount) → ลค จ่าย (after the 1% WHT for
 * นิติบุคคล) → ค่าบริการ (gross margin = paid − cost).
 *
 * Distinct from `/admin/reports/forwarder-volume` (the OPS-side
 * throughput report) — this view is the FINANCE cut filtered to
 * cleared (`wh.status NOT IN ('1','3')`) wallet events.
 *
 * The JSX below is the exact HTML structure `acc-forwarder.php`
 * renders — same Bootstrap-4 markup, same elements, same labels
 * (Thai hardcoded), same column order. The visual identity comes
 * from the legacy admin CSS, brought in verbatim as the static
 * `.pcs-legacy`-scoped `public/legacy/pcs/admin/admin-base.css`
 * (the shared admin chrome — established by the admin-table pilot)
 * and `public/legacy/pcs/admin/accounting-forwarder.css` (the
 * page-specific inline `<style>` block from acc-forwarder.php L9-43),
 * both loaded via plain `<link rel="stylesheet">` so they bypass
 * the app's Tailwind v4 / PostCSS pipeline (the rule da4cd79 set).
 *
 * `acc-forwarder.php` source structure transcribed here:
 *   - Title bar      acc-forwarder.php L4 (window/page title)
 *   - Auth gate      acc-forwarder.php L46 (departmentKey in CEO /
 *                    Manager / QAAndQC / Accounting / ITDT)
 *   - Breadcrumb     acc-forwarder.php L53-62
 *   - Card header    acc-forwarder.php L71-162 (heading + dual
 *                    date-filter + userType chooser + help-modal pill)
 *   - Help modal     acc-forwarder.php L164-195 — actual body content
 *                    (numbered cost-build explanation) verbatim
 *   - DataTable      acc-forwarder.php L196-353 (16-column ledger
 *                    with totals row pinned at the top, and a
 *                    bg-danger conditional class on the "ลค จ่าย"
 *                    cell when the wallet payment does not match
 *                    the expected fTotalPrice / price1Per amount).
 *
 * Data — every `acc-forwarder.php` mysqli query transcribed 1:1 to
 * the ported legacy `tb_*` schema (Supabase, migration 0081 —
 * tb_forwarder L1598-1709, tb_wallet_hs L6159-6185, tb_users L5828+,
 * tb_corporate L1264-1274, tb_receipt_item L4275-4279, tb_cash_back_hs
 * L934-941). `tb_*` is RLS-locked to service_role so reads go through
 * the admin client.
 *   - $sql_Table (acc-forwarder.php L77-110) →
 *        tb_wallet_hs wh
 *        LEFT JOIN tb_forwarder    f  ON f.ID=wh.refOrder
 *        LEFT JOIN tb_users        u  ON f.userID=u.userID
 *        LEFT JOIN tb_corporate   cp  ON u.userID=cp.userID
 *        LEFT JOIN tb_receipt_item ri ON ri.fID=f.ID
 *        LEFT JOIN tb_cash_back_hs cbhs
 *                  ON cbhs.cbhRefID=f.ID AND cbhStatus=2
 *        WHERE wh.type=4 AND wh.status NOT IN ('1','3')
 *              [+ DATE(wh.date) BETWEEN s AND e]
 *              [+ cp.userID IS NULL  (userType=1: ทั่วไป)]
 *              [+ cp.userID IS NOT NULL  (userType=2: นิติบุคคล)]
 *        GROUP BY f.ID
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate (acc-forwarder.php L46) is "CEO / Manager / QAAndQC /
 * Accounting / ITDT can view". The closest Pacred V3 RBAC roles
 * are `super` (mgmt + IT) + `accounting` (finance) — `super` is
 * always universal via requireAdmin.
 *
 * URL filter (transcribed from acc-forwarder.php L87-109) — exposed
 * as search params on this Next.js route with the same query-string
 * shape as the legacy URL:
 *   ?date=YYYY-MM-DD%20-%20YYYY-MM-DD   → custom date range
 *   ?dateGroup=true&year=YYYY&month=MM  → year+month chooser
 *                                          (year, month echoed back
 *                                           into <select>s)
 *   ?userType=all|1|2                   → ทั้งหมด / ลูกค้าทั่วไป /
 *                                          ลูกค้านิติบุคคล
 *   (none)                              → default = current month,
 *                                          ทั้งหมด
 *
 * Rebrand: legacy `PCS Cargo Admin` window title → `PR Cargo Admin`;
 * everything else is verbatim Thai. The PCS-scrub stays
 * API-switchover-gated (CLAUDE.md / ADR-0017) and is NOT a
 * faithful-port concern; "branding text + member codes only".
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - The DataTables JS init (acc-forwarder.php L443-477): pageLength,
 *     export-buttons (copy / csv / excel / print), fixedHeader, the
 *     "no-sort" pinned totals row. The static markup keeps the
 *     `#myTable` / `.dataTables_wrapper` / `dt-buttons` classes so
 *     the CSS looks identical at rest; functional sort/filter +
 *     export is a follow-up (likely a small React DataTables shim).
 *     The totals row is computed here on the server and rendered
 *     directly (not deferred to fnDrawCallback).
 *   - The daterangepicker JS init (acc-forwarder.php L385-398) —
 *     the date input renders as a plain `<input type="text">` for
 *     the static pilot; functional picker is a follow-up.
 *   - The (companyType==1 && department==2 && section==2)
 *     conditional that hides totals + export buttons (legacy L427,
 *     L446) — those are sales-rep-specific gates that depend on
 *     legacy session globals not yet wired through V3 RBAC. For
 *     this pilot the totals row + export buttons are ALWAYS visible
 *     (the requireAdmin gate already narrows to accounting + super,
 *     both of which see the totals in the legacy too).
 *   - The "printReceipt.php" submit-form wrapper around the table
 *     (acc-forwarder.php L198-199) — the legacy `<form>` carries
 *     DataTables-selected `id[]=` values into a bulk-print page;
 *     the static markup keeps the `<form>` wrapper so a later React
 *     DataTables shim has a hook point. mPDF/printReceipt itself →
 *     @react-pdf/renderer follow-up.
 *   - Cross-page badge counts → defer.
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers inlined verbatim — pure formatters/parsers lifted from the legacy
// admin includes. Kept inline (not extracted to lib/) for this transcription;
// the runbook §8 promotes to `lib/` on the third caller and this is the
// fourth — the lift-to-lib pass is the next refactor (acc-payment,
// acc-withdraw, acc-shop, acc-forwarder all share numberFormat0/2,
// firstDayOfThisMonth/lastDayOfMonth, YearSelect).
// ============================================================================

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56" thousand-grouped.
 *  Used throughout acc-forwarder.php cells + totals JS. */
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

/** Legacy `number_format($n, 0, '.', '')` — used in the wallet/payment
 *  parity check at acc-forwarder.php L304-305: bg-danger highlight when
 *  the wallet amount does not equal the expected price (after WHT for
 *  นิติบุคคล). Returns the integer string without grouping. */
function numberFormatPlain0(n: number): string {
  return String(Math.round(n));
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
// that build the default month range (acc-forwarder.php L98-100).
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
// Row shape — joined tb_wallet_hs + tb_forwarder + tb_users + tb_corporate +
// tb_receipt_item + tb_cash_back_hs projection. Mirrors the legacy SELECT at
// acc-forwarder.php L77-79.
// ============================================================================

type ForwarderRow = {
  // tb_wallet_hs
  date: string | null; // wh.date
  amount: number; // wh.amount (legacy reads but unused in totals math)
  // tb_forwarder
  fid: number; // f.ID
  fdate: string | null; // f.fDate
  ftrackingchn: string; // f.fTrackingCHN
  fcabinetnumber: string; // f.fCabinetNumber
  fcosttotalprice: number;
  ftotalprice: number;
  ftransportprice: number;
  fpriceupdate: number;
  fshippingservice: number;
  pricecrate: number;
  ftransportpricechnthb: number;
  priceother: number;
  fdiscount: number;
  fusercompany: string | null; // 1 = นิติบุคคล (1% WHT applies)
  userid: string;
  // tb_corporate (LEFT JOIN — may be null)
  corporatenumber: string | null;
  corporatename: string | null;
  corporateaddress: string | null;
  // tb_users
  username: string;
  userlastname: string;
  // tb_receipt_item.rID
  rid: string | null;
  // tb_cash_back_hs.cbhAmount (cbhStatus=2 only)
  cbhamount: number;
};

type SP = {
  date?: string;
  dateGroup?: string;
  year?: string;
  month?: string;
  userType?: string;
  page?: string;
};

// ============================================================================
// Page
// ============================================================================

export default async function AdminAccountingForwarderPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate (acc-forwarder.php L46): CEO / Manager / QAAndQC /
  // Accounting / ITDT. Closest V3 RBAC = super + accounting; super
  // is always universal via requireAdmin.
  await requireAdmin(["super", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Filter resolution (acc-forwarder.php L87-109) ────────────────
  // Three modes for the date range + a separate userType selector.
  let startDate: string;
  let endDate: string;

  if (sp.dateGroup && sp.year && sp.month) {
    startDate = `${sp.year}-${sp.month}-01`;
    endDate = lastDayOfMonth(startDate);
  } else if (sp.date && sp.date.length >= 23) {
    startDate = sp.date.slice(0, 10);
    endDate = sp.date.slice(13);
  } else {
    startDate = firstDayOfThisMonth();
    endDate = lastDayOfMonth();
  }
  const userType = sp.userType ?? "all"; // all / "1" / "2"

  // ── Pass 1: pull the type=4 (ฝากนำเข้า) wallet events ───────────
  // Legacy WHERE wh.type=4 AND wh.status NOT IN ('1','3') + date range.
  // tb_wallet_hs.refOrder is varchar storing tb_forwarder.ID as a string.
  type WalletForwarderRaw = {
    date: string | null;
    amount: number | string;
    reforder: string;
  };
  const walletRes = await admin
    .from("tb_wallet_hs")
    .select("date, amount, reforder")
    .eq("type", "4")
    .not("status", "in", "(1,3)")
    .gte("date", `${startDate}T00:00:00`)
    .lte("date", `${endDate}T23:59:59`)
    .order("date", { ascending: true });
  const walletRows = (walletRes.data ?? []) as unknown as WalletForwarderRaw[];

  // Build the parent-forwarder id list (numeric — refOrder stores the
  // bigint ID as a string).
  const forwarderIds = Array.from(
    new Set(
      walletRows
        .map((w) => Number(w.reforder))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );

  // ── Pass 2: tb_forwarder rows for those ids ─────────────────────
  type ForwarderRaw = {
    id: number;
    fdate: string | null;
    ftrackingchn: string;
    fcabinetnumber: string;
    fcosttotalprice: number | string;
    ftotalprice: number | string;
    ftransportprice: number | string;
    fpriceupdate: number | string;
    fshippingservice: number | string | null;
    pricecrate: number | string;
    ftransportpricechnthb: number | string;
    priceother: number | string;
    fdiscount: number | string;
    fusercompany: string | null;
    userid: string;
  };
  const forwarderById = new Map<number, ForwarderRaw>();
  if (forwarderIds.length > 0) {
    const fRes = await admin
      .from("tb_forwarder")
      .select(
        "id, fdate, ftrackingchn, fcabinetnumber, fcosttotalprice, ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany, userid",
      )
      .in("id", forwarderIds);
    for (const f of (fRes.data ?? []) as unknown as ForwarderRaw[]) {
      forwarderById.set(f.id, f);
    }
  }

  // ── Pass 3: tb_users for the customer-name display ──────────────
  // Legacy `LEFT JOIN tb_users AS u ON f.userID=u.userID`.
  const userIds = Array.from(
    new Set(
      Array.from(forwarderById.values())
        .map((f) => f.userid)
        .filter(Boolean),
    ),
  );
  const userById = new Map<
    string,
    { username: string; userlastname: string }
  >();
  if (userIds.length > 0) {
    const usersRes = await admin
      .from("tb_users")
      .select("userID, userName, userLastName")
      .in("userID", userIds);
    for (const u of (usersRes.data ?? []) as Array<{
      userID: string;
      userName: string;
      userLastName: string;
    }>) {
      userById.set(u.userID, {
        username: u.userName,
        userlastname: u.userLastName,
      });
    }
  }

  // ── Pass 4: tb_corporate (LEFT JOIN by userid) — flags นิติบุคคล ──
  // Legacy `LEFT JOIN tb_corporate AS cp ON u.userID=cp.userID`.
  // Also the legacy userType filter applies at the JOIN level:
  //   userType=1 → AND cp.userID IS NULL
  //   userType=2 → AND cp.userID IS NOT NULL
  // We apply the filter post-fetch since LEFT JOIN gating is awkward
  // in PostgREST without a view.
  const corporateByUserId = new Map<
    string,
    { corporatenumber: string; corporatename: string; corporateaddress: string }
  >();
  if (userIds.length > 0) {
    const cpRes = await admin
      .from("tb_corporate")
      .select("userid, corporatenumber, corporatename, corporateaddress")
      .in("userid", userIds);
    for (const c of (cpRes.data ?? []) as Array<{
      userid: string;
      corporatenumber: string;
      corporatename: string;
      corporateaddress: string;
    }>) {
      // Legacy LEFT JOIN: if multiple corporate rows per user exist,
      // the result row keeps the first reachable; PostgREST returns
      // them as separate rows. Take the first.
      if (!corporateByUserId.has(c.userid)) {
        corporateByUserId.set(c.userid, {
          corporatenumber: c.corporatenumber,
          corporatename: c.corporatename,
          corporateaddress: c.corporateaddress,
        });
      }
    }
  }

  // ── Pass 5: tb_receipt_item — tax-invoice number per fid ────────
  // Legacy `LEFT JOIN tb_receipt_item AS ri ON ri.fID=f.ID`. fid maps
  // many-to-one (one receipt per forwarder); take the first match per
  // forwarder id.
  const ridByFid = new Map<number, string>();
  if (forwarderIds.length > 0) {
    const riRes = await admin
      .from("tb_receipt_item")
      .select("fid, rid")
      .in("fid", forwarderIds);
    for (const r of (riRes.data ?? []) as Array<{
      fid: number;
      rid: string;
    }>) {
      if (!ridByFid.has(r.fid)) ridByFid.set(r.fid, r.rid);
    }
  }

  // ── Pass 6: tb_cash_back_hs — sum cbhAmount per fid where cbhStatus=2 ─
  // Legacy `LEFT JOIN tb_cash_back_hs AS cbhs ON cbhs.cbhRefID=f.ID AND
  //   cbhStatus=2`. The legacy GROUP BY f.ID collapses multiple rows
  // implicitly via mysqli's tolerant grouping (it picks an arbitrary
  // cbhAmount); the totals accumulator reads cbhAmount per result row
  // (acc-forwarder.php L268). We faithfully sum since the legacy
  // mysqli behaviour with GROUP BY + non-aggregated cbhAmount is
  // effectively "pick one" — for parity we take the first matched
  // amount per fid (the dominant case is 0/1 cashback row per
  // forwarder).
  const cbhByFid = new Map<number, number>();
  if (forwarderIds.length > 0) {
    const cbhRes = await admin
      .from("tb_cash_back_hs")
      .select("cbhrefid, cbhamount, cbhstatus")
      .eq("cbhstatus", "2")
      .in("cbhrefid", forwarderIds.map((n) => String(n)));
    for (const c of (cbhRes.data ?? []) as Array<{
      cbhrefid: string;
      cbhamount: number | string;
    }>) {
      const fid = Number(c.cbhrefid);
      if (!Number.isFinite(fid)) continue;
      if (!cbhByFid.has(fid)) cbhByFid.set(fid, Number(c.cbhamount));
    }
  }

  // ── Assemble rows in legacy order (wh.date ASC) ─────────────────
  // Legacy GROUP BY f.ID → each forwarder emits at most one row even
  // if multiple type=4 wallet events reference it. Keep the first
  // (chronologically earliest) wallet hit per fid.
  const seenFids = new Set<number>();
  const rows: ForwarderRow[] = [];
  for (const w of walletRows) {
    const fid = Number(w.reforder);
    if (!Number.isFinite(fid) || fid <= 0) continue;
    if (seenFids.has(fid)) continue;
    const f = forwarderById.get(fid);
    if (!f) continue;

    // Apply legacy userType filter (acc-forwarder.php L103-109):
    //   userType=1 → cp.userID IS NULL (ลูกค้าทั่วไป)
    //   userType=2 → cp.userID IS NOT NULL (ลูกค้านิติบุคคล)
    const cp = corporateByUserId.get(f.userid);
    if (userType === "1" && cp) continue;
    if (userType === "2" && !cp) continue;

    seenFids.add(fid);
    const u = userById.get(f.userid) ?? { username: "", userlastname: "" };
    rows.push({
      date: w.date,
      amount: Number(w.amount),
      fid: f.id,
      fdate: f.fdate,
      ftrackingchn: f.ftrackingchn,
      fcabinetnumber: f.fcabinetnumber,
      fcosttotalprice: Number(f.fcosttotalprice),
      ftotalprice: Number(f.ftotalprice),
      ftransportprice: Number(f.ftransportprice),
      fpriceupdate: Number(f.fpriceupdate),
      fshippingservice: Number(f.fshippingservice ?? 0),
      pricecrate: Number(f.pricecrate),
      ftransportpricechnthb: Number(f.ftransportpricechnthb),
      priceother: Number(f.priceother),
      fdiscount: Number(f.fdiscount),
      fusercompany: f.fusercompany,
      userid: f.userid,
      corporatenumber: cp?.corporatenumber ?? null,
      corporatename: cp?.corporatename ?? null,
      corporateaddress: cp?.corporateaddress ?? null,
      username: u.username,
      userlastname: u.userlastname,
      rid: ridByFid.get(f.id) ?? null,
      cbhamount: cbhByFid.get(f.id) ?? 0,
    });
  }

  // ── Compute totals row (acc-forwarder.php L224-278) ──────────────
  //   fCostTotalPriceAll = SUM(fCostTotalPrice + fTransportPrice +
  //                            fShippingService + priceCrate + priceOther +
  //                            fPriceUpdate + fTransportPriceCHNTHB)
  //   fTotalPriceNotDisAll = SUM(fTotalPrice + fTransportPrice +
  //                              fPriceUpdate + fShippingService +
  //                              priceCrate + fTransportPriceCHNTHB +
  //                              priceOther)
  //   fTotalPriceAll       = fTotalPriceNotDisAll - SUM(fDiscount)
  //   discountAll          = SUM(fDiscount)
  //   userPayAll           = SUM(walletPayUser)   // post-WHT
  //   Per1All              = SUM(fTotalPrice*0.01)  (นิติบุคคล only)
  //   profitAll            = userPayAll - fCostTotalPriceAll
  //   amountAll            = SUM(wh.amount)  // legacy tracks but unused
  //   cashBackAll          = SUM(cbhAmount)  // legacy tracks but unused
  let fCostTotalPriceAll = 0;
  let fTotalPriceNotDisAll = 0;
  let fTotalPriceAll = 0;
  let discountAll = 0;
  let userPayAll = 0;
  let Per1All = 0;
  for (const r of rows) {
    const fCostTotalPrice =
      r.fcosttotalprice +
      r.ftransportprice +
      r.fshippingservice +
      r.pricecrate +
      r.priceother +
      r.fpriceupdate +
      r.ftransportpricechnthb;
    const fTotalPriceNotDis =
      r.ftotalprice +
      r.ftransportprice +
      r.fpriceupdate +
      r.fshippingservice +
      r.pricecrate +
      r.ftransportpricechnthb +
      r.priceother;
    const fTotalPrice = fTotalPriceNotDis - r.fdiscount;
    const walletPayUser =
      r.fusercompany === "1" ? fTotalPrice - fTotalPrice * 0.01 : fTotalPrice;
    fCostTotalPriceAll += fCostTotalPrice;
    fTotalPriceNotDisAll += fTotalPriceNotDis;
    fTotalPriceAll += fTotalPrice;
    discountAll += r.fdiscount;
    userPayAll += walletPayUser;
    if (r.fusercompany === "1") Per1All += fTotalPrice * 0.01;
  }
  const profitAll = userPayAll - fCostTotalPriceAll;

  // PERF (2026-06-03): client-slice the DISPLAYED ledger (50/page). All
  // totals above are computed over the full `rows` set — we only window the
  // rows rendered in the <tbody> below the pinned totals row.
  const page     = parsePage(sp.page);
  const offset   = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // CSV export rows — mirror the on-screen ledger columns for the page's
  // currently-displayed rows. The "ทั้งหมด" button (fetchAll) re-runs the
  // exact same filtered query unpaginated + writes the admin_export_log audit
  // (exportAccForwarderAll). Money values are the already-formatted strings so
  // the spreadsheet matches the rendered cells exactly.
  const csvRows: CsvRow[] = pageRows.map((r): CsvRow => {
    const fCostTotalPrice =
      r.fcosttotalprice +
      r.ftransportprice +
      r.fshippingservice +
      r.pricecrate +
      r.priceother +
      r.fpriceupdate +
      r.ftransportpricechnthb;
    const fTotalPriceNotDis =
      r.ftotalprice +
      r.ftransportprice +
      r.fpriceupdate +
      r.fshippingservice +
      r.pricecrate +
      r.ftransportpricechnthb +
      r.priceother;
    const fTotalPrice = fTotalPriceNotDis - r.fdiscount;
    const isCompany = r.fusercompany === "1";
    const walletPayUser = isCompany ? fTotalPrice - fTotalPrice * 0.01 : fTotalPrice;
    const corpNumber =
      r.corporatenumber && r.corporatenumber !== "" ? r.corporatenumber : "";
    return {
      pay_date: r.date ? String(r.date).slice(0, 10) : "",
      create_date: r.fdate ? String(r.fdate).slice(0, 10) : "",
      order_id: r.fid,
      tracking: r.ftrackingchn ?? "",
      cabinet: r.fcabinetnumber ?? "",
      cost: numberFormat2(fCostTotalPrice),
      real_price: numberFormat2(fTotalPriceNotDis),
      discount: numberFormat2(r.fdiscount),
      goods_value: numberFormat2(fTotalPrice),
      customer_pay: numberFormat2(walletPayUser),
      wht: isCompany ? numberFormat2(fTotalPrice * 0.01) : "-",
      service_fee: numberFormat2(walletPayUser - fCostTotalPrice),
      member_code: r.userid,
      tax_id: corpNumber || "-",
      name: corpNumber
        ? r.corporatename ?? ""
        : `${r.username} ${r.userlastname}`.trim(),
      receipt_no: r.rid ?? "",
    };
  });

  const csvCols = [
    { key: "pay_date", label: "วันที่ชำระเงิน" },
    { key: "create_date", label: "วันที่สร้าง" },
    { key: "order_id", label: "ออเดอร์" },
    { key: "tracking", label: "แทรคกิ้ง" },
    { key: "cabinet", label: "เลขตู้" },
    { key: "cost", label: "ต้นทุน" },
    { key: "real_price", label: "ราคาจริง" },
    { key: "discount", label: "ส่วนลด" },
    { key: "goods_value", label: "มูลค่าสินค้า" },
    { key: "customer_pay", label: "ลค จ่าย" },
    { key: "wht", label: "หัก ณ ที่จ่าย" },
    { key: "service_fee", label: "ค่าบริการ" },
    { key: "member_code", label: "รหัสสมาชิก" },
    { key: "tax_id", label: "เลขผู้เสียภาษี" },
    { key: "name", label: "ชื่อ-นามสกุล/ชื่อบริษัท" },
    { key: "receipt_no", label: "เลขใบเสร็จ" },
  ];

  // Display-only banner copy (acc-forwarder.php L141-154 — always
  // emits "ผลลัพธ์การค้นหา ตั้งแต่วันที่ : <start> - <end>" + the
  // user-type label, because the legacy unconditionally writes
  // `$_GET['date'] = $startDate." - ".$endDate` back into the same key).
  const filterBanner = `ผลลัพธ์การค้นหา ตั้งแต่วันที่ : ${startDate} - ${endDate}`;
  const userTypeLabel =
    userType === "1"
      ? " ประเภทลูกค้า : ทั่วไป"
      : userType === "2"
        ? " ประเภทลูกค้า : นิติบุคคล"
        : " ประเภทลูกค้า : ทั้งหมด";

  // Re-render the input value verbatim from the resolved range.
  const dateInputValue = `${startDate} - ${endDate}`;

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both served as
          static /public/ assets so they bypass Tailwind / PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link
        rel="stylesheet"
        href="/legacy/pcs/admin/accounting-forwarder.css"
      />

      {/* BEGIN: Content — acc-forwarder.php L48 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb — acc-forwarder.php L52-62 */}
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
                    <li className="breadcrumb-item active">รายงานฝากนำเข้า</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body">
            {/* acc-forwarder.php L64 */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          {/* Heading + filter form — acc-forwarder.php L72-157 */}
                          <div className="content-header-left col-md-8 col-12">
                            <div className="text-center text-md-left">
                              <h3 className="text-center text-md-left">
                                <span className="font-30 ft-users"></span>{" "}
                                รายงานฝากนำเข้า
                              </h3>
                            </div>
                            <form
                              className="pt-1"
                              method="GET"
                              action="/admin/accounting/forwarder"
                            >
                              <label
                                className="form-control-label"
                                htmlFor="dateGroup"
                              >
                                วันที่ชำระเงินแบบรายเดือน
                              </label>
                              {/* generateYearDropdown(2021) — start year is 2021
                                  per acc-forwarder.php L114 */}
                              <YearSelect startYear={2021} value={sp.year} />
                              {/* Hardcoded month list — acc-forwarder.php L115-128 */}
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
                              <label className="form-control-label">
                                {" "}
                                ประเภทลูกค้า
                              </label>
                              {/* userType <select> — acc-forwarder.php L134-138 */}
                              <select
                                name="userType"
                                className="userType"
                                defaultValue={userType}
                              >
                                <option value="all">ทั้งหมด</option>
                                <option value="1">ลูกค้าทั่วไป</option>
                                <option value="2">ลูกค้านิติบุคคล</option>
                              </select>
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
                              <span className="font-14 text-danger">
                                {userTypeLabel}
                              </span>
                            </form>
                          </div>

                          {/* "คำอธิบายระบบ" pill — acc-forwarder.php L158-162 —
                              plus the Pacred CSV export (owner directive
                              2026-06-07: accounting exports this reconciliation
                              list to spreadsheet). The legacy DataTables export
                              buttons were deliberately not transcribed; this is
                              the Pacred equivalent (page rows + audited "ทั้งหมด"). */}
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
                            <div className="d-flex justify-content-end mt-1">
                              <CsvButton
                                rows={csvRows}
                                cols={csvCols}
                                filename={`acc-forwarder-${startDate}_${endDate}${
                                  userType !== "all" ? `-type${userType}` : ""
                                }-page${page}.csv`}
                                fetchAll={async () => {
                                  "use server";
                                  // Export the FULL filtered รายงานฝากนำเข้า list
                                  // (all rows, capped) — audited via
                                  // admin_export_log (name + tax-ID are PII).
                                  return exportAccForwarderAll({
                                    startDate,
                                    endDate,
                                    userType,
                                  });
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Help modal — body with content (verbatim from
                            acc-forwarder.php L164-195) */}
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
                              <div className="modal-body header-from">
                                1. ราคาต้นทุน มาจากข้อมูลต่าง ๆ ต่อไปนี้
                                <br />
                                1.1 ต้นทุนนำเข้าจีน-ไทย ที่ระบบคำนวณ
                                {" "}มาจากการตั้งราคาต้นทุนกับปริมาณซึ่งอาจจะไม่ได้ตรง
                                {" "}เพราะขนาดที่แสงคือมีผลต่างเรื่องจำนวนทศนิยมที่ใช้
                                {" "}*แต่เราสามารถแก้ไขได้จากหน้าหน้างานตู้ตรงข้อมูล
                                {" "}ต้นทุนที่เป็นต้ว P ในหน้ารายงานตู้นั้นๆ
                                <br />
                                1.2 ต้นทุนค่าขนส่งในไทย
                                {" "}*ตรงนี้่จะไม่มองว่ามีกำไรเกิดขึ้น
                                {" "}ราคาค่าขนส่งในไทยจะเท่ากับราคาต้นทุนที่เกิดขึ้นจริง
                                <br />
                                1.3 ค่าบริการ 50 บาท *ค่าเมื่อก่อนตอนทำระบบใหม่ๆ
                                {" "}อาจจะมีหลงเหลือ แต่ไม่กระทบกับข้อมูลใหม่
                                <br />
                                1.4 ค่าตีลังไม้ *ตรงนี้่จะไม่มองว่ามีกำไรเกิดขึ้น
                                {" "}ราคาจะเท่ากับราคาต้นทุนที่เกิดขึ้นจริง
                                <br />
                                1.5 ค่าอื่นๆ *ตรงนี้่จะไม่มองว่ามีกำไรเกิดขึ้น
                                {" "}ราคาจะเท่ากับราคาต้นทุนที่เกิดขึ้นจริง
                                <br />
                                1.4 ค่าราคา เพิ่ม/ลด ที่มาจากฝากสั่งซื้อ
                                {" "}*ตรงนี้่จะไม่มองว่ามีกำไรเกิดขึ้น
                                {" "}ราคาจะเท่ากับราคาต้นทุนที่เกิดขึ้นจริง
                                <hr />
                                2. ราคาจริง
                                {" "}ราคาที่ยังไม่ได้รวมส่วนลดหรือการหัก ณ ที่จ่าย 1%
                                <hr />
                                3. ส่วนลด
                                <hr />
                                4. ราคารวม
                                <hr />
                                5. 1% คือ ยอดราคารวมที่รวมกับส่วนลดแล้ว
                                <hr />
                                6. ลค จ่าย wallet
                                <hr />
                                7. ลค จ่าย cash back
                                <hr />
                                8. ลค จ่ายรวม
                                <hr />
                                9. ค่าบริการ คือ ส่วนต่างที่นำเอาต้นทุนในข้อ
                                {" "}((ลค จ่าย wallet + ลค จ่าย cash back)- ราคาต้นทุน)
                                <hr />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* DataTable — acc-forwarder.php L196-353 */}
                        <div>
                          <div className="table-responsive p-05 font-12">
                            <form
                              id="frm-example"
                              action="/admin/accounting/forwarder/print-receipt"
                              method="GET"
                            >
                              <input type="hidden" name="id" id="arrID" />
                              <table
                                id="myTable"
                                className="table display table-bordered table-striped dataTable no-footer dtr-inline header-fixed"
                              >
                                <thead>
                                  <tr className="text-center">
                                    <th>วันที่ชำระเงิน</th>
                                    <th>วันที่สร้าง</th>
                                    <th>ออเดอร์</th>
                                    <th>แทรคกิ้ง</th>
                                    <th>..เลขตู้..</th>
                                    <th title="ต้นทุนนำเข้าจีน-ไทย+ต้นทุนค่าขนส่งในไทย+ค่าบริการ 50 บาท+ค่าตีลังไม้+ค่าอื่นๆ+ค่าราคาเพิ่ม/ลด ฝากสั่งซื้อ">
                                      ต้นทุน
                                    </th>
                                    <th title="ราคาจริง ราคาที่ยังไม่ได้รวมส่วนลดหรือการหัก ณ ที่จ่าย 1%">
                                      ราคาจริง
                                    </th>
                                    <th title="">ส่วนลด</th>
                                    <th title="">มูลค่าสินค้า</th>
                                    <th title="">ลค จ่าย</th>
                                    <th title="">หัก ณ ที่จ่าย</th>
                                    <th title="ค่าบริการ คือ ส่วนต่างที่นำเอาต้นทุนในข้อ ((ลค จ่าย wallet + ลค จ่าย cash back)- ราคาต้นทุน)">
                                      ค่าบริการ
                                    </th>
                                    <th>รหัสสมาชิก</th>
                                    <th>เลขผู้เสียภาษี</th>
                                    <th>ชื่อ-นามสกุล/ชื่อบริษัท</th>
                                    <th>เลขใบเสร็จ</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* Totals row pinned at the top
                                      (acc-forwarder.php L237-254).
                                      Legacy hides this for the
                                      (companyType==1 && department==2 &&
                                       section==2) sales-rep gate — for
                                      this pilot the row is always shown
                                      (requireAdmin already narrowed to
                                      accounting + super). */}
                                  <tr className="font-14 bg-color no-sort">
                                    <td className="text-right"></td>
                                    <td className="text-right"></td>
                                    <td className="text-right"></td>
                                    <td className="text-right"></td>
                                    <td className="text-right">รวม</td>
                                    <td className="text-right fCostTotalPriceAll">
                                      {numberFormat2(fCostTotalPriceAll)}
                                    </td>
                                    <td className="text-right fTotalPriceNotDisAll">
                                      {numberFormat2(fTotalPriceNotDisAll)}
                                    </td>
                                    <td className="text-right discountAll">
                                      {numberFormat2(discountAll)}
                                    </td>
                                    <td className="text-right fTotalPriceAll">
                                      {numberFormat2(fTotalPriceAll)}
                                    </td>
                                    <td className="text-right userPayAll">
                                      {numberFormat2(userPayAll)}
                                    </td>
                                    <td className="text-right Per1All">
                                      {numberFormat2(Per1All)}
                                    </td>
                                    <td className="text-right profitAll">
                                      {numberFormat2(profitAll)}
                                    </td>
                                    <td className="text-right"></td>
                                    <td className="text-right"></td>
                                    <td className="text-right"></td>
                                    <td className="text-right"></td>
                                  </tr>
                                  {pageRows.map((row) => {
                                    const fCostTotalPrice =
                                      row.fcosttotalprice +
                                      row.ftransportprice +
                                      row.fshippingservice +
                                      row.pricecrate +
                                      row.priceother +
                                      row.fpriceupdate +
                                      row.ftransportpricechnthb;
                                    const fTotalPriceNotDis =
                                      row.ftotalprice +
                                      row.ftransportprice +
                                      row.fpriceupdate +
                                      row.fshippingservice +
                                      row.pricecrate +
                                      row.ftransportpricechnthb +
                                      row.priceother;
                                    const fTotalPrice =
                                      fTotalPriceNotDis - row.fdiscount;
                                    const isCompany = row.fusercompany === "1";
                                    const walletPayUser = isCompany
                                      ? fTotalPrice - fTotalPrice * 0.01
                                      : fTotalPrice;
                                    const price1Per = walletPayUser;
                                    // Legacy bg-danger highlight on column 10
                                    // (acc-forwarder.php L304-305):
                                    // (corporateNumber=='' && number_format(walletPayUser,0,'.','')
                                    //   != number_format(fTotalPrice,0,'.',''))
                                    // OR
                                    // (corporateNumber!='' && number_format(walletPayUser,0,'.','')
                                    //   != number_format(price1Per,0,'.',''))
                                    const corpEmpty =
                                      !row.corporatenumber ||
                                      row.corporatenumber === "";
                                    const walletPlain =
                                      numberFormatPlain0(walletPayUser);
                                    const totalPlain =
                                      numberFormatPlain0(fTotalPrice);
                                    const onePerPlain =
                                      numberFormatPlain0(price1Per);
                                    const showMismatchHighlight =
                                      (corpEmpty &&
                                        walletPlain !== totalPlain) ||
                                      (!corpEmpty &&
                                        walletPlain !== onePerPlain);
                                    return (
                                      <tr
                                        key={`${row.fid}-${row.date ?? ""}`}
                                        className="font-12"
                                      >
                                        {/* 1 — วันที่ชำระเงิน (wh.date)
                                            acc-forwarder.php L280 */}
                                        <td>{row.date ?? ""}</td>
                                        {/* 2 — วันที่สร้าง (f.fDate)
                                            acc-forwarder.php L281 */}
                                        <td>{row.fdate ?? ""}</td>
                                        {/* 3 — ออเดอร์ (f.ID) → link to legacy
                                            forwarder/detail/<fID>/ which maps
                                            to /admin/forwarders/<fNo>
                                            acc-forwarder.php L282-284 */}
                                        <td>
                                          <Link
                                            className="text-info"
                                            target="_blank"
                                            href={`/admin/forwarders/${row.fid}`}
                                          >
                                            {row.fid}
                                          </Link>
                                        </td>
                                        {/* 4 — แทรคกิ้ง (f.fTrackingCHN)
                                            acc-forwarder.php L285-287 */}
                                        <td>
                                          <Link
                                            className="text-info"
                                            target="_blank"
                                            href={`/admin/forwarders/${row.fid}`}
                                          >
                                            {row.ftrackingchn}
                                          </Link>
                                        </td>
                                        {/* 5 — ..เลขตู้.. (f.fCabinetNumber) →
                                            link to legacy report-cnt.php?id=…
                                            which maps to /admin/cnt-hs/<id>
                                            acc-forwarder.php L288-290 */}
                                        <td>
                                          <Link
                                            className="text-info"
                                            target="_blank"
                                            href={`/admin/cnt-hs/${row.fcabinetnumber}`}
                                          >
                                            {row.fcabinetnumber}
                                          </Link>
                                        </td>
                                        {/* 6 — ต้นทุน
                                            acc-forwarder.php L291 */}
                                        <td className="text-right">
                                          {numberFormat2(fCostTotalPrice)}
                                        </td>
                                        {/* 7 — ราคาจริง (no discount)
                                            acc-forwarder.php L292 */}
                                        <td className="text-right">
                                          {numberFormat2(fTotalPriceNotDis)}
                                        </td>
                                        {/* 8 — ส่วนลด
                                            acc-forwarder.php L293 */}
                                        <td className="text-right">
                                          {numberFormat2(row.fdiscount)}
                                        </td>
                                        {/* 9 — มูลค่าสินค้า (post-discount)
                                            acc-forwarder.php L294-296 */}
                                        <td className="text-right">
                                          {numberFormat2(fTotalPrice)}
                                        </td>
                                        {/* 10 — ลค จ่าย (with conditional
                                            bg-danger when wallet ≠ expected)
                                            acc-forwarder.php L304-307 */}
                                        <td
                                          className={`text-right ${
                                            showMismatchHighlight
                                              ? "bg-danger text-white"
                                              : ""
                                          }`}
                                        >
                                          {numberFormat2(walletPayUser)}
                                        </td>
                                        {/* 11 — หัก ณ ที่จ่าย (1% for นิติบุคคล,
                                                  "-" for ทั่วไป)
                                            acc-forwarder.php L308-317 */}
                                        <td className="text-right">
                                          {isCompany
                                            ? numberFormat2(fTotalPrice * 0.01)
                                            : "-"}
                                        </td>
                                        {/* 12 — ค่าบริการ (walletPayUser − ต้นทุน)
                                            acc-forwarder.php L318 */}
                                        <td className="text-right">
                                          {numberFormat2(
                                            walletPayUser - fCostTotalPrice,
                                          )}
                                        </td>
                                        {/* 13 — รหัสสมาชิก → link to
                                            /admin/customers/<userID>
                                            acc-forwarder.php L319-321 */}
                                        <td>
                                          <Link
                                            className="text-info"
                                            target="_blank"
                                            href={`/admin/customers/${row.userid}`}
                                          >
                                            {row.userid}
                                          </Link>
                                        </td>
                                        {/* 14 — เลขผู้เสียภาษี
                                                  (corporateNumber or "-")
                                            acc-forwarder.php L322-330 */}
                                        <td>
                                          {row.corporatenumber &&
                                          row.corporatenumber !== ""
                                            ? row.corporatenumber
                                            : "-"}
                                        </td>
                                        {/* 15 — ชื่อ-นามสกุล/ชื่อบริษัท
                                            acc-forwarder.php L331-338 */}
                                        <td>
                                          {row.corporatenumber &&
                                          row.corporatenumber !== ""
                                            ? row.corporatename ?? ""
                                            : `${row.username} ${row.userlastname}`}
                                        </td>
                                        {/* 16 — เลขใบเสร็จ (rID) → link to
                                            legacy printReceipt.php?id=<rID>
                                            mapped to /admin/tax-invoices/<rID>
                                            acc-forwarder.php L339-342 */}
                                        <td>
                                          {row.rid ? (
                                            <Link
                                              className="text-info"
                                              href={`/admin/tax-invoices/${row.rid}`}
                                            >
                                              {row.rid}
                                            </Link>
                                          ) : null}
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
                              basePath="/admin/accounting/forwarder"
                              params={{
                                date: sp.date, dateGroup: sp.dateGroup,
                                year: sp.year, month: sp.month, userType: sp.userType,
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
      {/* END: Content — acc-forwarder.php L362 */}
    </div>
  );
}
