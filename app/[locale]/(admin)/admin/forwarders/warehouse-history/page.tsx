import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin > "ประวัติเข้าโกดังไทย" — a FAITHFUL 1:1 TRANSCRIPTION of
 * the legacy PCS Cargo admin `pcs-admin/forwarder-import-warehouse.php`
 * default view (L1-606), per D1 / ADR-0017 + the faithful-port
 * transcription runbook (`docs/runbook/faithful-port-transcription.md`
 * §8 — admin pattern).
 *
 * This is the warehouse barcode-scan event log — every time a parcel
 * is scanned-in at the Thailand warehouse `tb_forwarder_import2` gets
 * an event row (keyed off the legacy `keysearch` tracking string).
 * The view groups two parts:
 *   1. ORPHAN scans  — rows where the scanner couldn't auto-link to
 *      a parent `tb_forwarder` (fID IS NULL). Warehouse staff click
 *      "ค้นหาและเชื่อมรายการ" to manually attach to a forwarder
 *      record (legacy AJAX, deferred to Server Actions here).
 *   2. MATCHED scans — rows that successfully linked to a forwarder;
 *      the row displays the customer, container, status, address and
 *      box-count delta (เกินมา/ขาดอีก) plus the dupe warning when
 *      the same tracking is on multiple forwarders.
 * Warehouse staff + ops use this to verify a parcel actually got
 * scanned-in (vs lost), to look up the wave/lot a forwarder arrived
 * on, and to investigate scan errors. The sidebar badge
 * `forwarderWhError` (orphan count) is the queue this page clears.
 *
 * The JSX below is the exact HTML structure
 * `forwarder-import-warehouse.php` renders — same Bootstrap-4 markup,
 * same elements, same labels (Thai hardcoded), same column order. The
 * visual identity comes from the legacy admin CSS, brought in
 * verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/admin/admin-base.css` (the shared admin chrome —
 * established by the admin-table pilot) and
 * `public/legacy/pcs/admin/warehouse-history.css` (the page-specific
 * inline `<style>` block from L45-76), both loaded via plain
 * `<link rel="stylesheet">` so they bypass the app's Tailwind v4 /
 * PostCSS pipeline (the rule da4cd79 set).
 *
 * `forwarder-import-warehouse.php` source structure transcribed here:
 *   - Title bar      L39 (window/page title)
 *   - Breadcrumb     L85-94
 *   - Top-menu       L106-108 → include `pcs-admin/include/pages/oop/
 *                                top-menu-report.php` (the 11-link
 *                                report nav — ประวัติเข้าโกดังไทย,
 *                                รายงานตู้, หมายเหตุสั่งซื้อ, …)
 *   - Date filter    L109-123 (form + 3-mode date controls)
 *   - Add CTA        L124-135 ("สแกนรายการเพิ่ม" → barcode-d-import)
 *   - DataTable      L137-351 — two-section table:
 *                       · L182-232 — orphan rows (fID IS NULL)
 *                       · L233-348 — matched rows
 *   - Bottom CTAs    L353-356 — print + คำแนะนำ modal trigger
 *
 * Data — every `forwarder-import-warehouse.php` mysqli query
 * transcribed 1:1 to the ported legacy `tb_*` schema (Supabase,
 * migration 0081). `tb_*` is RLS-locked to service_role, so reads go
 * through the admin client.
 *   - $sql_Table2 → tb_forwarder_import2 LEFT JOIN tb_forwarder
 *                   WHERE fi.fID IS NULL AND DATE(fi2Date) ⋯
 *                   (L183-184 — the ORPHAN section)
 *   - $sql_Table  → tb_forwarder_import2 LEFT JOIN tb_forwarder
 *                   WHERE f.ID=fi.fID AND DATE(fi2Date) ⋯
 *                   (L234-235 — the MATCHED section)
 *   - $sql dupes  → tb_forwarder WHERE fTrackingCHN=? (per row)
 *                   (L248-258 — the "มีรายการซ้ำ" badge query)
 *   - tb_users LEFT JOIN — coid for the badgeVIP2 rendering
 *     (L143-144 of the legacy SELECT)
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate is implicit (any logged-in admin can view) — but the action
 * buttons + the data are warehouse-team material. Closest Pacred V3
 * RBAC roles = `warehouse` (the scanning team) + `ops` (cs/import
 * admin) + `super` (implicit via requireAdmin). Same role set as the
 * sister cargo-ops pages.
 *
 * URL filters (transcribed from L111-121, L147-161) — exposed as
 * search params on this Next.js route, same query-string shape as
 * the legacy URL:
 *   ?historyTable=true&date=YYYY-MM-DD%20-%20YYYY-MM-DD
 *                          → date-range filter
 *   ?historyTableAll=true  → no date filter (all data)
 *   (none)                 → default = today (Y-m-d - Y-m-d)
 *
 * Rebrand: legacy `PCS Cargo Admin` window title → `PR Cargo
 * Admin`; everything else is verbatim Thai. The PCS-scrub stays
 * API-switchover-gated (CLAUDE.md / ADR-0017) and is NOT a
 * faithful-port concern; "branding text + member codes only".
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - The `updateIm` POST handler (L3-37) — manually links an
 *     orphan scan to a `tb_forwarder` row (the staff-side fix-up
 *     for scans that couldn't auto-match). Becomes a Server Action
 *     on a follow-up. The "ค้นหาและเชื่อมรายการ" button is rendered
 *     so the markup looks identical, but the click handler is wired
 *     in a follow-up. Affected the `tb_forwarder.fStatus -> 4`
 *     transition + `fDateStatus4`/`fPallet`/`adminIDUpdate` write.
 *   - The `deleteForwarderIM()` jQuery+AJAX delete (L513-543) —
 *     deferred to a Server Action; the "ลบยิงเข้า" button is in the
 *     markup but the click handler is a follow-up.
 *   - The `searchForwarderIm()` jQuery+AJAX modal opener (L545-554)
 *     — same deferral; same button-only-markup rule.
 *   - The "พิมพ์จากหน้ากล่อง" submit-to-printAll bulk print + the
 *     DataTables row-checkbox column (L353-358, L431-449) — those
 *     plugins (jquery-datatables-checkboxes, dataTables.responsive,
 *     daterangepicker, magnific-popup) are not in the Pacred
 *     dependency tree. The static markup carries the same wrapper
 *     classes (`.dataTables_wrapper`, `#myTable`, `.dt-buttons`)
 *     and the CSS reproduces the filter chrome so the screen looks
 *     identical at rest. Functional sort/filter/bulk-print is a
 *     follow-up (likely a small React DataTables shim).
 *   - The SweetAlert toasts after add/error (L568-605) — wired
 *     together with the Server Actions.
 *   - The "คำแนะนำการใช้งาน" recommendation modal (L371-383) — empty
 *     in the legacy too (modal-body has no content). Markup
 *     preserved so the open/close hooks remain.
 *   - The dupe-aggregation post-loop (L335-346 — count
 *     `tb_forwarder` rows by `fCabinetNumber`) — the legacy builds
 *     `$arrDataIm` but never displays it (commented-out print_r);
 *     skipped here, can be re-introduced together with whatever
 *     report drives it.
 *   - The top-menu badge counts (`countErrorF4`, `countWaiting`,
 *     `countNoteShop`, …) used by `top-menu-report.php` — those
 *     all come from external admin-globals that aren't in scope
 *     for this pilot; rendered with zero counts so the labels show
 *     but no badge. Wiring badges is a follow-up.
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers inlined verbatim — pure functions ported from the legacy admin
// includes (`pcs-admin/include/function.php`). Kept inline (not extracted
// to lib/) because this is a pilot; the lift-to-`lib/` happens after a few
// admin pilots show the repeated callers.
// ============================================================================

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56" thousand-grouped.
 *  Used inside priceWaiting (L301, function.php L875). */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Legacy `priceWaiting($price)` — function.php L871-878.
 *  0 → "รอคำนวณ" · otherwise → "฿" + thousands-formatted. */
function priceWaiting(price: number | string | null | undefined): string {
  const v = typeof price === "string" ? Number(price) : (price ?? 0);
  if (!v || v === 0) return "รอคำนวณ";
  return `฿${numberFormat2(v)}`;
}

/** Legacy `nameProductsType($int)` — function.php L640-650 */
function nameProductsType(t: string | null): string {
  switch (t) {
    case "1": return "ทั่วไป";
    case "2": return "มอก.";
    case "3": return "อย.";
    case "4": return "พิเศษ";
    default:  return "ไม่พบข้อมูล";
  }
}

/** Legacy `nameTransportType2($int)` — function.php L660-668.
 *  Returns the HTML <span> badge string. */
function NameTransportType2({ t }: { t: string | null }) {
  switch (t) {
    case "1": return <span className="badge badge-info badge-pill">ทางรถ</span>;
    case "2": return <span className="badge badge-success badge-pill">ทางเรือ</span>;
    default:  return <>ไม่พบข้อมูล</>;
  }
}

/** Legacy `statusForwarderAll($fStatus)` — function.php L893-904.
 *  Returns the legacy <span> badge + the 40px icon image. The icon
 *  paths are kept absolute to the legacy CDN (pcscargo.co.th/member/
 *  assets/images/icon/forwarder/forwarder-N.png) as the rule (runbook
 *  §9.2) for legacy WordPress / marketing assets — once ปอน's brand
 *  swap lands, those URLs flip to the Pacred CDN. */
function StatusForwarderAll({ s }: { s: string | null }) {
  const map: Record<string, { cls: string; text: string }> = {
    "1": { cls: "badge badge-warning badge-pill", text: "รอสินค้าเข้าโกดังจีน" },
    "2": { cls: "badge badge-info badge-pill",    text: "สินค้าถึงโกดังจีนแล้ว" },
    "3": { cls: "badge badge-pink badge-pill",    text: "กำลังส่งมาประเทศไทย" },
    "4": { cls: "badge badge-brown badge-pill",   text: "สินค้าถึงประเทศไทยแล้ว" },
    "5": { cls: "badge badge-danger badge-pill",  text: "รอชำระเงิน" },
    "6": { cls: "badge badge-primary badge-pill", text: "เตรียมส่ง" },
    "7": { cls: "badge badge-success badge-pill", text: "ส่งแล้ว" },
  };
  const m = s ? map[s] : undefined;
  if (!m) return null;
  return (
    <>
      <span className={m.cls}>{m.text}</span>
      <br />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="img-fluid"
        style={{ maxHeight: 40, padding: 4 }}
        src={`https://pcscargo.co.th/member/assets/images/icon/forwarder/forwarder-${s}.png`}
        alt={`forwarder-${s}`}
      />
    </>
  );
}

/** Legacy `badgeNameWarehouseChina($int)` — function.php L1052-1059 */
function BadgeNameWarehouseChina({ w }: { w: string | null }) {
  switch (w) {
    case "1": return <span className="badge badge-info badge-pill">กวางโจว</span>;
    case "2": return <span className="badge badge-info badge-pill">อี้อู</span>;
    default:  return <>ไม่พบข้อมูล</>;
  }
}

/** Legacy `badgeVIP2($coID,$conn,$userID)` — function.php L567-596.
 *  Renders the customer-tier badge plus optional SVIP/CPS/นิติ flags.
 *  The full version reads 3 extra tables (tb_rate_custom_cbm / tb_users
 *  for userComparison / tb_corporate) — for this pilot we render the
 *  base coID-tier badge only (PCS hides, others show as a vip pill).
 *  The 3 supplementary flags are a follow-up — the additional queries
 *  per row would N+1 — better to pre-aggregate them once. Markup of the
 *  base badge is faithful. */
function BadgeVIP2({ coid }: { coid: string | null }) {
  if (!coid || coid === "PCS") return null;
  switch (coid) {
    case "STAR":    return <span className="badge badge-vip badge-pill">STAR</span>;
    case "DIAMOND": return <span className="badge badge-vip badge-pill">DIAMOND</span>;
    case "CROWN":   return <span className="badge badge-vip badge-pill">CROWN</span>;
    default:        return <span className="badge badge-vip badge-pill">{coid}</span>;
  }
}

// ============================================================================
// Row shapes — the relevant subsets of tb_forwarder_import2 + tb_forwarder.
// Lowercased per the legacy schema dump (Postgres collapsed the camelCase
// MySQL names to lowercase on load — migration 0081).
// ============================================================================

type ImportRow = {
  id: number;                  // tb_forwarder_import2.id (the scan-event ID)
  fid: number | null;          // tb_forwarder.id (NULL = orphan scan)
  keysearch: string;           // the scanned tracking string
  fipallet: string;
  fi2amount: number;           // boxes scanned
  fi2date: string | null;      // scan timestamp
  adminid: string;             // username of the scanner
  // Joined fields from tb_forwarder (NULL when orphan)
  f_id: number | null;
  f_fstatus: string | null;
  f_famount: number | null;
  f_userid: string | null;
  f_ftrackingchn: string | null;
  f_fcabinetnumber: string | null;
  f_fdatecontainerclose: string | null;
  f_fdatestatus2: string | null;
  f_fproductstype: string | null;
  f_ftransporttype: string | null;
  f_fwarehousechina: string | null;
  f_fcover: string | null;
  f_fdetail: string | null;
  f_fidorco: string | null;
  f_reforder: string | null;
  f_adminidcreator: string | null;
  f_adminidkey: string | null;
  f_ftotalprice: number | null;
  f_ftransportprice: number | null;
  f_fpriceupdate: number | null;
  f_fshippingservice: number | null;
  f_fdiscount: number | null;
  f_fweight: number | null;
  f_fvolume: number | null;
  f_printstatus1: string | null;
  f_printstatus2: string | null;
  f_printstatus3: string | null;
  // Joined from tb_users
  u_coid: string | null;
};

type SP = {
  historyTable?: string;
  historyTableAll?: string;
  date?: string;
};

// ============================================================================
// Page
// ============================================================================

export default async function AdminForwardersWarehouseHistoryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate is implicit (any logged-in admin can view). Pacred V3
  // narrows to warehouse + ops + super for this warehouse-scan view.
  await requireAdmin(["super", "ops", "warehouse"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Date-range resolution — L113, L147-161 ──────────────────────
  // Legacy parses the `date` input as "YYYY-MM-DD - YYYY-MM-DD".
  // Three modes:
  //   ?historyTable=true     → use the provided range
  //   ?historyTableAll=true  → no filter
  //   (default)              → today only
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  let startDate: string | null = todayStr;
  let endDate: string | null = todayStr;
  let mode: "today" | "range" | "all" = "today";

  if (sp.historyTable === "true") {
    mode = "range";
    const raw = sp.date ?? "";
    // Legacy substr($_GET['date'],0,10).' - '.substr($_GET['date'],13)
    startDate = raw.length >= 10 ? raw.slice(0, 10) : todayStr;
    endDate   = raw.length >= 23 ? raw.slice(13, 23) : startDate;
  } else if (sp.historyTableAll === "true") {
    mode = "all";
    startDate = null;
    endDate = null;
  }

  // Re-build the displayed input value verbatim — legacy L113:
  //   not set       → today + " - " + today
  //   historyTable  → first10 + " - " + last10  (re-render of provided range)
  //   historyTableAll → still uses the today/today fallback in the input
  //                     because the legacy condition checks historyTable only
  const dateInputValue =
    mode === "range"
      ? `${startDate} - ${endDate}`
      : `${todayStr} - ${todayStr}`;

  // ── Build the two scan-event queries (L140-161, L183-184, L234) ──
  //   SELECT … FROM tb_forwarder_import2 fi
  //   LEFT JOIN tb_forwarder f ON f.ID = fi.fID
  //   LEFT JOIN tb_users     u ON u.userID = f.userID
  //   WHERE … (orphan vs matched)
  //   [+ date filter on fi2Date]
  //   ORDER BY fi2Date DESC
  // Why three sequential queries (scans → forwarders → users) instead
  // of a single PostgREST embed?
  //   The full select string with the nested `tb_forwarder(…u:tb_users)`
  //   embed inflates the PostgREST-generated TypeScript types past the
  //   compiler's "Type instantiation is excessively deep" gate. Three
  //   small flat queries + JS-side merge keeps the SQL identical to the
  //   legacy intent and the types light.
  type ScanRow = {
    id: number;
    fid: number | null;
    keysearch: string;
    fipallet: string;
    fi2amount: number;
    fi2date: string | null;
    adminid: string;
  };

  const scanColumns = "id, fid, keysearch, fipallet, fi2amount, fi2date, adminid";

  // Date-filter bounds — computed once and applied to both queries.
  const dateGte =
    mode === "today"
      ? `${todayStr} 00:00:00`
      : mode === "range" && startDate
        ? `${startDate} 00:00:00`
        : null;
  const dateLte =
    mode === "today"
      ? `${todayStr} 23:59:59`
      : mode === "range" && endDate
        ? `${endDate} 23:59:59`
        : null;

  let matchedScansQ = admin
    .from("tb_forwarder_import2")
    .select(scanColumns)
    .not("fid", "is", null);
  if (dateGte) matchedScansQ = matchedScansQ.gte("fi2date", dateGte);
  if (dateLte) matchedScansQ = matchedScansQ.lte("fi2date", dateLte);
  const matchedScansFinal = matchedScansQ.order("fi2date", { ascending: false, nullsFirst: false });

  let orphanScansQ = admin
    .from("tb_forwarder_import2")
    .select(scanColumns)
    .is("fid", null);
  if (dateGte) orphanScansQ = orphanScansQ.gte("fi2date", dateGte);
  if (dateLte) orphanScansQ = orphanScansQ.lte("fi2date", dateLte);
  const orphanScansFinal = orphanScansQ.order("fi2date", { ascending: false, nullsFirst: false });

  const [matchedScansRes, orphanScansRes] = await Promise.all([matchedScansFinal, orphanScansFinal]);
  const matchedScans = (matchedScansRes.data ?? []) as unknown as ScanRow[];
  const orphanRaw = (orphanScansRes.data ?? []) as unknown as ScanRow[];

  // Look up the parent tb_forwarder rows for the matched scans.
  const fIds = Array.from(
    new Set(matchedScans.map((r) => r.fid).filter((v): v is number => v != null)),
  );
  type ForwarderRow = {
    id: number;
    fstatus: string | null;
    famount: number | null;
    userid: string | null;
    ftrackingchn: string | null;
    fcabinetnumber: string | null;
    fdatecontainerclose: string | null;
    fdatestatus2: string | null;
    fproductstype: string | null;
    ftransporttype: string | null;
    fwarehousechina: string | null;
    fcover: string | null;
    fdetail: string | null;
    fidorco: string | null;
    reforder: string | null;
    adminidcreator: string | null;
    adminidkey: string | null;
    ftotalprice: number | null;
    ftransportprice: number | null;
    fpriceupdate: number | null;
    fshippingservice: number | null;
    fdiscount: number | null;
    fweight: number | null;
    fvolume: number | null;
    printstatus1: string | null;
    printstatus2: string | null;
    printstatus3: string | null;
  };
  const forwardersById = new Map<number, ForwarderRow>();
  if (fIds.length > 0) {
    const forwardersRes = await admin
      .from("tb_forwarder")
      .select(
        "id, fstatus, famount, userid, ftrackingchn, fcabinetnumber, " +
          "fdatecontainerclose, fdatestatus2, fproductstype, ftransporttype, " +
          "fwarehousechina, fcover, fdetail, fidorco, reforder, " +
          "adminidcreator, adminidkey, ftotalprice, ftransportprice, " +
          "fpriceupdate, fshippingservice, fdiscount, fweight, fvolume, " +
          "printstatus1, printstatus2, printstatus3",
      )
      .in("id", fIds);
    for (const r of (forwardersRes.data ?? []) as unknown as ForwarderRow[]) {
      forwardersById.set(r.id, r);
    }
  }

  // Look up tb_users.coid for the badgeVIP2 rendering — one IN clause
  // covering every userID across the matched rows.
  const userIds = Array.from(
    new Set(
      Array.from(forwardersById.values())
        .map((f) => f.userid)
        .filter((v): v is string => !!v && v !== ""),
    ),
  );
  const coidByUserId = new Map<string, string | null>();
  if (userIds.length > 0) {
    const usersRes = await admin.from("tb_users").select("userid, coid").in("userid", userIds);
    for (const r of (usersRes.data ?? []) as Array<{ userid: string; coid: string | null }>) {
      coidByUserId.set(r.userid, r.coid);
    }
  }

  const matchedRows: ImportRow[] = matchedScans.map((r) => {
    const f = r.fid != null ? forwardersById.get(r.fid) : undefined;
    return {
      id: r.id,
      fid: r.fid,
      keysearch: r.keysearch,
      fipallet: r.fipallet,
      fi2amount: r.fi2amount,
      fi2date: r.fi2date,
      adminid: r.adminid,
      f_id: f?.id ?? null,
      f_fstatus: f?.fstatus ?? null,
      f_famount: f?.famount ?? null,
      f_userid: f?.userid ?? null,
      f_ftrackingchn: f?.ftrackingchn ?? null,
      f_fcabinetnumber: f?.fcabinetnumber ?? null,
      f_fdatecontainerclose: f?.fdatecontainerclose ?? null,
      f_fdatestatus2: f?.fdatestatus2 ?? null,
      f_fproductstype: f?.fproductstype ?? null,
      f_ftransporttype: f?.ftransporttype ?? null,
      f_fwarehousechina: f?.fwarehousechina ?? null,
      f_fcover: f?.fcover ?? null,
      f_fdetail: f?.fdetail ?? null,
      f_fidorco: f?.fidorco ?? null,
      f_reforder: f?.reforder ?? null,
      f_adminidcreator: f?.adminidcreator ?? null,
      f_adminidkey: f?.adminidkey ?? null,
      f_ftotalprice: f?.ftotalprice ?? null,
      f_ftransportprice: f?.ftransportprice ?? null,
      f_fpriceupdate: f?.fpriceupdate ?? null,
      f_fshippingservice: f?.fshippingservice ?? null,
      f_fdiscount: f?.fdiscount ?? null,
      f_fweight: f?.fweight ?? null,
      f_fvolume: f?.fvolume ?? null,
      f_printstatus1: f?.printstatus1 ?? null,
      f_printstatus2: f?.printstatus2 ?? null,
      f_printstatus3: f?.printstatus3 ?? null,
      u_coid: f?.userid ? coidByUserId.get(f.userid) ?? null : null,
    };
  });

  // ── Dupe-detection scan (L248-258 inside the matched loop) ──────
  // Legacy runs SELECT ID FROM tb_forwarder WHERE fTrackingCHN=? per
  // row → N+1. Pacred pre-aggregates once: collect all trackingCHN
  // values from the matched rows, query GROUP BY, and the JSX renders
  // a dupe-warning badge for any tracking with count > 1.
  const trackingChnList = Array.from(
    new Set(
      matchedRows
        .map((r) => r.f_ftrackingchn)
        .filter((t): t is string => !!t && t.length > 0)
    )
  );
  const dupeMap = new Map<string, number[]>();
  if (trackingChnList.length > 0) {
    const dupeRes = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn")
      .in("ftrackingchn", trackingChnList);
    for (const r of (dupeRes.data ?? []) as Array<{ id: number; ftrackingchn: string }>) {
      const arr = dupeMap.get(r.ftrackingchn);
      if (arr) arr.push(r.id);
      else dupeMap.set(r.ftrackingchn, [r.id]);
    }
  }

  // ── Counters for the bottom-of-table chips (L480-486) ───────────
  // The legacy injects these as DataTables-length appendees via setTimeout;
  // since the DataTables JS isn't ported, we render them as plain chips
  // above the table so the numbers remain visible.
  let noBoxAll = 0;
  let countBoxLackAll = 0;
  let countBoxOverflowAll = 0;
  let countErrorReAll = 0;
  for (const r of orphanRaw) noBoxAll += r.fi2amount;
  for (const r of matchedRows) {
    noBoxAll += r.fi2amount;
    if (r.f_famount != null) {
      if (r.fi2amount < r.f_famount) countBoxLackAll++;
      if (r.fi2amount > r.f_famount) countBoxOverflowAll++;
    }
    if (r.f_ftrackingchn) {
      const ids = dupeMap.get(r.f_ftrackingchn);
      if (ids && ids.length > 1) countErrorReAll++;
    }
  }
  const noTrackingsAll = orphanRaw.length + matchedRows.length;

  // ── Header banner text for "ผลลัพธ์การค้นหา …" (L116-120) ─────────
  const headerText =
    mode === "range"
      ? `ผลลัพธ์การค้นหา ตั้งแต่วันที่ : ${startDate} - ${endDate}`
      : mode === "all"
      ? "ผลลัพธ์การค้นหา ทั้งหมด "
      : "ผลลัพธ์การค้นหาวันนี้ ";

  // ── Cover-image URL — L283-288 ──────────────────────────────────
  // The legacy resolves three cases: empty → default.png, absolute URL
  // → keep + _150x150.jpg thumbnail, else → basePath + 'images/shops/'.
  const resolveCover = (fCover: string | null): { thumb: string; full: string } => {
    if (!fCover || fCover.trim() === "") {
      return {
        thumb: "https://pcscargo.co.th/member/images/shops/default.png",
        full:  "https://pcscargo.co.th/member/images/shops/default.png",
      };
    }
    if (/https?:/i.test(fCover)) {
      return { thumb: `${fCover}_150x150.jpg`, full: fCover };
    }
    return {
      thumb: `https://pcscargo.co.th/member/images/shops/${fCover}`,
      full:  `https://pcscargo.co.th/member/images/shops/${fCover}`,
    };
  };

  // ── Helpers for the date/time split (L202-203, L263) ────────────
  // Legacy SELECT yields DATE(fi2Date) + TIME(fi2Date). We split the
  // ISO timestamp at runtime to match.
  const splitDateTime = (iso: string | null): { date: string; time: string } => {
    if (!iso) return { date: "", time: "" };
    const parts = iso.includes("T") ? iso.split("T") : iso.split(" ");
    return { date: parts[0] ?? "", time: (parts[1] ?? "").slice(0, 8) };
  };
  const formatDDMMYYYY = (iso: string | null): string => {
    if (!iso) return "";
    const ymd = iso.slice(0, 10);
    const [y, m, d] = ymd.split("-");
    if (!y || !m || !d) return ymd;
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both served as
          static /public/ assets so they bypass Tailwind / PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/warehouse-history.css" />

      {/* BEGIN: Content — L81-386 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb — L85-96 */}
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
                    <li className="breadcrumb-item active">ประวัติสินค้าเข้าโกดัง</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          {/* ── Content body ── L97-369 ── */}
          <div className="content-body">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        {/* Filter + CTA row — L105-136 + L106-108 top-menu include */}
                        <div className="row">
                          {/* The top-menu-report.php include — 11 report
                              links (this page is the active first one).
                              The badge counts come from external admin
                              globals not in scope here — rendered without
                              badges; wiring is a follow-up. */}
                          <div className="col-12 pb-1">
                            <ul className="nav nav-tabs nav-underline pcs-tabs no-hover-bg text-center">
                              <li className="nav-item">
                                <Link
                                  className="nav-link pcs-menu-report active"
                                  href="/admin/forwarders/warehouse-history"
                                >
                                  <h4 className="text-center">ประวัติเข้าโกดังไทย</h4>
                                </Link>
                              </li>
                              <li className="nav-item">
                                <Link className="nav-link pcs-menu-report" href="/admin/cnt/report">
                                  <h4 className="text-center">รายงานตู้</h4>
                                </Link>
                              </li>
                              <li className="nav-item f-noteShop">
                                <Link className="nav-link pcs-menu-report f-noteShop" href={{ pathname: "/admin/forwarders", query: { action: "NoteShop" } }}>
                                  <h4 className="text-center">หมายเหตุสั่งซื้อ</h4>
                                </Link>
                              </li>
                              <li className="nav-item f-note">
                                <Link className="nav-link pcs-menu-report f-note" href="/admin/forwarders/notes">
                                  <h4 className="text-center">หมายเหตุนำเข้า</h4>
                                </Link>
                              </li>
                              <li className="nav-item f-notPhoto">
                                <Link className="nav-link pcs-menu-report f-notPhoto" href={{ pathname: "/admin/forwarders", query: { q: "4", action: "notPhoto" } }}>
                                  <h4 className="text-center">ไม่ได้ถ่ายสินค้า</h4>
                                </Link>
                              </li>
                              <li className="nav-item f-notPortage">
                                <Link className="nav-link pcs-menu-report f-notPortage" href={{ pathname: "/admin/forwarders", query: { q: "4", action: "notPortage" } }}>
                                  <h4 className="text-center">ไม่ใส่ค่าขนส่ง</h4>
                                </Link>
                              </li>
                              <li className="nav-item f-notContainer">
                                <Link className="nav-link pcs-menu-report f-notContainer" href={{ pathname: "/admin/forwarders", query: { q: "2", action: "notContainer" } }}>
                                  <h4 className="text-center">ไม่ใส่เบอร์ตู้</h4>
                                </Link>
                              </li>
                              <li className="nav-item f-NotDateContainerClose">
                                <Link className="nav-link pcs-menu-report f-NotDateContainerClose" href={{ pathname: "/admin/forwarders", query: { q: "2", action: "NotDateContainerClose" } }}>
                                  <h4 className="text-center">ไม่ใส่วันที่ปิดตู้</h4>
                                </Link>
                              </li>
                              <li className="nav-item f-NotShipFree">
                                <Link className="nav-link pcs-menu-report f-NotShipFree" href={{ pathname: "/admin/forwarders", query: { action: "NotShipFree" } }}>
                                  <h4 className="text-center">ไม่เลือกขนส่งฟรี</h4>
                                </Link>
                              </li>
                              <li className="nav-item f-NotShipFreeError">
                                <Link className="nav-link pcs-menu-report f-NotShipFreeError" href={{ pathname: "/admin/forwarders", query: { action: "NotShipFreeError" } }}>
                                  <h4 className="text-center">เลือกขนส่งฟรีผิด</h4>
                                </Link>
                              </li>
                              <li className="nav-item f-CreditError">
                                <Link className="nav-link pcs-menu-report f-CreditError" href={{ pathname: "/admin/forwarders", query: { action: "fCreditError" } }}>
                                  <h4 className="text-center">เครติดเกินกำหนด</h4>
                                </Link>
                              </li>
                            </ul>
                          </div>

                          {/* Date filter form — L109-123 */}
                          <div className="content-header-left col-md-6 col-12">
                            <div className="text-center text-md-left">
                              <form className="mb-1" method="GET" action="/admin/forwarders/warehouse-history">
                                <label className="form-control-label" htmlFor="date">วันที่บันทึกรายการ</label>
                                <input
                                  id="date"
                                  type="text"
                                  className="form-control2 shawCalRanges"
                                  name="date"
                                  defaultValue={dateInputValue}
                                />
                                <button
                                  className="btn btn-outline-success font-12 btn-rounded p-05"
                                  name="historyTable"
                                  value="true"
                                  type="submit"
                                >
                                  <i className="fas fa-search"></i> ค้นหาข้อมูล
                                </button>
                                <button
                                  className="btn btn-outline-info font-12 btn-rounded p-05"
                                  name="historyTableAll"
                                  value="true"
                                  type="submit"
                                >
                                  <i className="fas fa-search"></i> ค้นหาข้อมูลทั้งหมด
                                </button>
                                <span className="font-14 text-danger">{headerText}</span>
                              </form>
                            </div>
                          </div>

                          {/* Add-scan CTA — L124-135 */}
                          <div className="content-header-right col-md-6 col-12">
                            <div className="float-md-right">
                              <div className="text-center text-md-right">
                                <Link href="/admin/barcode-d-import">
                                  <button className="btn btn-sm btn-circle btn-success text-white" type="button">
                                    <i className="ft-plus"></i>
                                  </button>
                                  <span className="font-normal text-dark">สแกนรายการเพิ่ม</span>
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ── Summary chips — legacy renders these via
                            setTimeout into #myTable_length (L480-486).
                            Pacred renders them statically above the table
                            so the numbers remain visible without DataTables. */}
                        <div className="row">
                          <div className="col-12 p-05">
                            <span className="ml-1 btn btn-sm font-12 btn-info btn-rounded">
                              แทรคกิ้งที่ยิง {noTrackingsAll} รายการ
                            </span>{" "}
                            <span className="ml-1 btn btn-sm font-12 btn-warning btn-rounded">
                              กล่องที่ยิง {noBoxAll} รายการ
                            </span>{" "}
                            <span className="ml-1 btn btn-sm font-12 btn-danger btn-rounded">
                              กล่องไม่ครบ {countBoxLackAll} รายการ
                            </span>{" "}
                            <span className="ml-1 btn btn-sm font-12 btn-warning btn-rounded">
                              กล่องเกินมา {countBoxOverflowAll}
                            </span>{" "}
                            <span className="ml-1 btn btn-sm font-12 btn-primary btn-rounded">
                              รายการซ้ำ {countErrorReAll}
                            </span>
                          </div>
                        </div>

                        {/* ── DataTable wrapper — L137-359 ── */}
                        <div className="row">
                          <div className="col-12 font-12">
                            <div id="run">
                              {/* Legacy form submits checkboxes to printAll/.
                                  The checkbox column + the bulk-print
                                  workflow are not in this pilot (no
                                  DataTables JS). Markup kept for parity. */}
                              <form id="frm-example" action="/admin/forwarders/printAll" method="GET">
                                <div className="table-responsive p-05">
                                  <table
                                    id="myTable"
                                    className="myTable table display table-bordered table-striped dataTable no-footer dtr-inline"
                                  >
                                    <thead>
                                      <tr className="text-center">
                                        <th>ID</th>
                                        <th>วันที่บันทึก</th>
                                        <th>ข้อมูลสแกน</th>
                                        <th>รหัสลูกค้า</th>
                                        <th>รายละเอียด</th>
                                        <th>ยอดค้างชำระ</th>
                                        <th>เลขพัสดุ (จีน)</th>
                                        <th>สถานะ</th>
                                        <th title="Username Admin ที่อัปเดตสถานะรายการ">อัปเดต</th>
                                        <th>ตัวเลือก</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {/* ── ORPHAN section (L182-232) ──
                                          Rows where fi.fID IS NULL — no
                                          parent forwarder found. */}
                                      {orphanRaw.map((row) => {
                                        const { date: scanDate, time: scanTime } = splitDateTime(row.fi2date);
                                        return (
                                          <tr key={`orphan-${row.id}`} className="bg-color">
                                            <td className="text-center"></td>
                                            <td className="text-center font-12">
                                              {scanDate}
                                              <br />
                                              {scanTime} น.
                                            </td>
                                            <td>{row.keysearch}</td>
                                            <td>กล่อง : {row.fi2amount}/0</td>
                                            <td>
                                              ไม่พบรายการ กรุณาเลือกเชื่อมรายการ
                                              <a
                                                href="#"
                                                data-action-search={row.id}
                                              >
                                                <p className="btn btn-sm font-12 btn-danger btn-rounded">
                                                  ค้นหาและเชื่อมรายการ
                                                </p>
                                              </a>
                                            </td>
                                            <td className="text-right"></td>
                                            <td></td>
                                            <td className="text-center"></td>
                                            <td className="font-14 text-center">{row.adminid}</td>
                                            <td className="text-center">
                                              <a
                                                href="#"
                                                data-action-delete={row.id}
                                              >
                                                <p className="btn btn-sm font-12 btn-danger btn-rounded">
                                                  ลบยิงเข้า
                                                </p>
                                              </a>
                                            </td>
                                          </tr>
                                        );
                                      })}

                                      {/* ── MATCHED section (L233-348) ──
                                          Rows that linked to a parent
                                          forwarder; full row with customer
                                          + container + status + address. */}
                                      {matchedRows.map((row) => {
                                        const { date: scanDate, time: scanTime } = splitDateTime(row.fi2date);
                                        const lacking = row.f_famount != null && row.fi2amount < row.f_famount;
                                        const over    = row.f_famount != null && row.fi2amount > row.f_famount;
                                        const dupeIds = row.f_ftrackingchn ? (dupeMap.get(row.f_ftrackingchn) ?? []) : [];
                                        const hasDupes = dupeIds.length > 1;
                                        const cover = resolveCover(row.f_fcover);
                                        const sumPrice =
                                          (Number(row.f_ftotalprice ?? 0) +
                                            Number(row.f_ftransportprice ?? 0) +
                                            Number(row.f_fpriceupdate ?? 0) +
                                            Number(row.f_fshippingservice ?? 0)) -
                                          Number(row.f_fdiscount ?? 0);
                                        const volumeTotal =
                                          row.f_fvolume && row.f_famount
                                            ? Number(row.f_fvolume) * Number(row.f_famount)
                                            : null;
                                        const containerCloseDDMMYYYY = formatDDMMYYYY(row.f_fdatecontainerclose);
                                        const rowClass =
                                          `${lacking ? "bg-danger2" : ""} ${hasDupes ? "bg-primary text-white" : ""}`.trim();
                                        return (
                                          <tr key={`matched-${row.id}`} className={rowClass}>
                                            {/* 1 — ID (legacy renders fID) */}
                                            <td className="text-center">{row.f_id ?? ""}</td>
                                            {/* 2 — วันที่บันทึก + print badges (L201-206) */}
                                            <td className="text-center font-12">
                                              {scanDate}
                                              <br />
                                              {scanTime} น.
                                              {row.f_printstatus1 === "1" && (
                                                <>
                                                  <br />
                                                  <span className="font-10 badge badge-primary badge-pill">พิมพ์แล้ว</span>
                                                </>
                                              )}
                                              {row.f_printstatus2 === "1" && (
                                                <>
                                                  <br />
                                                  <span className="font-10 badge badge-info badge-pill">พิมพ์แล้ว</span>
                                                </>
                                              )}
                                              {row.f_printstatus3 === "1" && (
                                                <>
                                                  <br />
                                                  <span className="font-10 badge badge-success badge-pill">พิมพ์แล้ว</span>
                                                </>
                                              )}
                                            </td>
                                            {/* 3 — ข้อมูลสแกน (L267-269) */}
                                            <td>{row.keysearch}</td>
                                            {/* 4 — รหัสลูกค้า + VIP badges + delta (L271-278) */}
                                            <td>
                                              <Link
                                                href={`/admin/users/profile/${encodeURIComponent(row.f_userid ?? "")}`}
                                                className="text-info"
                                              >
                                                {row.f_userid}{" "}
                                                <BadgeVIP2 coid={row.u_coid} />
                                              </Link>
                                              {lacking && row.f_famount != null && (
                                                <>
                                                  <br />
                                                  <span className="text-danger">
                                                    ขาดอีก {row.f_famount - row.fi2amount} กล่อง
                                                  </span>
                                                </>
                                              )}
                                              {over && row.f_famount != null && (
                                                <>
                                                  <br />
                                                  <span className="text-danger">
                                                    เกินมา {row.fi2amount - row.f_famount} กล่อง
                                                  </span>
                                                </>
                                              )}
                                              {" "}กล่อง : {row.fi2amount}/{row.f_famount ?? 0}
                                              {hasDupes && (
                                                <>
                                                  <br />
                                                  <span className="bg-danger text-white">
                                                    มีรายการซ้ำ :{" "}
                                                    {dupeIds.map((dupId) => (
                                                      <Link
                                                        key={dupId}
                                                        href={`/admin/forwarder/detail/${dupId}`}
                                                        target="_blank"
                                                      >
                                                        #{dupId}{" "}
                                                      </Link>
                                                    ))}
                                                  </span>
                                                </>
                                              )}
                                            </td>
                                            {/* 5 — รายละเอียด + cover (L280-299) */}
                                            <td>
                                              <div className="float-right">
                                                <a className="image-popup-vertical-fit el-link" href={cover.full}>
                                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                                  <img src={cover.thumb} alt="cover" width={60} />
                                                </a>
                                              </div>
                                              <Link
                                                className="text-info"
                                                href={`/admin/forwarder/detail/${row.f_id ?? ""}`}
                                              >
                                                <span>เลขที่รายการ #{row.f_id ?? ""}</span>
                                                <div className="short-text max-w">{row.f_fdetail ?? ""}</div>
                                              </Link>
                                              {`ประเภท : ${nameProductsType(row.f_fproductstype)}`}
                                              {row.f_adminidcreator && row.f_adminidcreator !== "" && (!row.f_reforder || row.f_reforder === "") && (
                                                <>
                                                  <br />
                                                  <div className="">
                                                    <span className="font-9 badge badge-warning badge-pill">
                                                      ฝากนำเข้า : {row.f_adminidcreator}
                                                    </span>
                                                  </div>
                                                </>
                                              )}
                                              {(!row.f_adminidcreator || row.f_adminidcreator === "") && (!row.f_reforder || row.f_reforder === "") && (
                                                <>
                                                  <br />
                                                  <div className="">
                                                    <span className="font-9 badge badge-primary badge-pill">
                                                      ฝากนำเข้าจาก : users
                                                    </span>
                                                  </div>
                                                </>
                                              )}
                                              {row.f_reforder && row.f_reforder !== "" && (
                                                <>
                                                  <br />
                                                  <div className="">
                                                    <Link href={`/admin/shops/detail/${row.f_reforder}`}>
                                                      <span className="font-9 badge badge-info badge-pill">
                                                        รายการฝากสั่งซื้อ : {row.f_reforder}
                                                      </span>
                                                    </Link>
                                                  </div>
                                                </>
                                              )}
                                            </td>
                                            {/* 6 — ยอดค้างชำระ + KG/CBM + admin (L300-305) */}
                                            <td className="text-right">
                                              {priceWaiting(sumPrice)}
                                              <br />
                                              <span className="font-12">
                                                {row.f_fweight != null && Number(row.f_fweight) > 0 && (
                                                  <>{row.f_fweight}Kg</>
                                                )}
                                                {volumeTotal != null && Number(volumeTotal) > 0 && (
                                                  <>
                                                    <br />
                                                    {volumeTotal}CBM
                                                  </>
                                                )}
                                              </span>
                                              <br />
                                              <span className="font-12" title="admin ที่วัดขนาด">
                                                {row.f_adminidkey ?? ""}
                                              </span>
                                            </td>
                                            {/* 7 — เลขพัสดุ (จีน) + เลขตู้ + ประเภทขนส่ง + closeDate
                                                + warehouse + fIDorCO (L306-312) */}
                                            <td>
                                              <span className="bg-danger text-white">
                                                {row.f_ftrackingchn ?? ""}
                                              </span>
                                              <br />
                                              เลขตู้ :{" "}
                                              <Link
                                                href={{ pathname: "/admin/cnt/report", query: { id: row.f_fcabinetnumber ?? "" } }}
                                                target="_blank"
                                              >
                                                {" "}{row.f_fcabinetnumber ?? ""}
                                              </Link>{" "}
                                              <NameTransportType2 t={row.f_ftransporttype} />
                                              {containerCloseDDMMYYYY
                                                ? ` : ${containerCloseDDMMYYYY}`
                                                : " : "}
                                              <br />
                                              <BadgeNameWarehouseChina w={row.f_fwarehousechina} />
                                              <span className="bg-danger text-white">
                                                {row.f_fidorco ?? ""}
                                              </span>
                                            </td>
                                            {/* 8 — สถานะ (L313-315) */}
                                            <td className="text-center">
                                              <StatusForwarderAll s={row.f_fstatus} />
                                            </td>
                                            {/* 9 — อัปเดต — admin who scanned + date arrived in China (L316-321) */}
                                            <td className="font-14 text-center">
                                              วันที่สินค้าถึงจีน
                                              <br />
                                              : <span className="">{row.f_fdatestatus2 ?? ""}</span>
                                              <br />
                                              {row.adminid}
                                            </td>
                                            {/* 10 — ตัวเลือก (L322-328) */}
                                            <td className="text-center">
                                              <a
                                                href="#"
                                                data-action-delete={row.id}
                                              >
                                                <p className="btn btn-sm font-12 btn-danger btn-rounded">
                                                  ลบยิงเข้า
                                                </p>
                                              </a>
                                              <Link href={`/admin/forwarder/detail/${row.f_id ?? ""}`}>
                                                <p className="btn btn-sm font-12 btn-outline-success btn-rounded p-05">
                                                  {" "}ดูข้อมูล{" "}
                                                </p>
                                              </Link>
                                              {row.f_fstatus !== "7" && (
                                                <Link href={`/admin/forwarder/update/${row.f_id ?? ""}`}>
                                                  <p className="btn btn-sm font-12 btn-warning btn-rounded p-05">
                                                    {" "}อัปเดต
                                                  </p>
                                                </Link>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                                <hr />
                                {/* Bottom CTAs — L353-356.
                                    Print / recommendation modal trigger.
                                    The bulk-print action is a follow-up. */}
                                <div
                                  className="btn-group"
                                  role="group"
                                  aria-label="Basic example"
                                  style={{ position: "fixed", bottom: 20 }}
                                >
                                  <button
                                    type="submit"
                                    className="btn btn-primary waves-effect round"
                                    name="print"
                                    value="1"
                                  >
                                    <i className="fas fa-box-open"></i> พิมพ์จากหน้ากล่อง
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-info waves-effect round"
                                    data-toggle="modal"
                                    data-target="#recom"
                                  >
                                    {" "}คำแนะนำการใช้งาน
                                  </button>
                                </div>
                                <div id="example-console-rows"></div>
                              </form>
                              <div id="list-forwarder-data"></div>
                              <div id="search-forwarder-data"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Recommendation modal — L371-383 (empty in legacy too) */}
            <div id="recom" className="modal fade in" tabIndex={-1} role="dialog" aria-hidden="true">
              <div className="modal-dialog modal-lg">
                <div className="modal-content header-from">
                  <div className="modal-header">
                    <h4 className="modal-title">การใช้งานระบบบันทึกรายการเข้าโกดัง</h4>
                    <button type="button" className="close" data-dismiss="modal" aria-hidden="true">
                      <i className="la la-close"> </i>
                    </button>
                  </div>
                  <div className="modal-body header-from"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* END: Content */}
    </div>
  );
}
