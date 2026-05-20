import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCombineBillPrintHref } from "@/lib/admin/combine-bill-urls";
import { CombineBillRowActions } from "./combine-bill-row-actions";

/**
 * Admin > "ประวัติรายการรวมบิล" — a FAITHFUL 1:1 TRANSCRIPTION
 * of the legacy PCS Cargo admin `pcs-admin/forwarder-bill.php`
 * DEFAULT view (the `if(!isset($_GET["page"]))` branch — L1-391),
 * per D1 / ADR-0017 + the faithful-port transcription runbook
 * (`docs/runbook/faithful-port-transcription.md` §8 — admin pattern).
 *
 * The legacy `forwarder-bill.php` is the warehouse + sales daily
 * "combine-bill" tool: multi-select forwarder rows for the SAME
 * customer, combine them into ONE printed shipping bill (cuts
 * per-bill delivery cost when several imports arrive together).
 * Data lives in `tb_bill` (the header — one bill per combine) +
 * `tb_bill_item` (the fan-out — one row per forwarder ID).
 *
 * The route slug `forwarders/combine-bill` is preserved verbatim
 * from the legacy `pcs-admin/forwarder-bill/` URL so retraining is
 * zero. The legacy sub-routes branch on `?page=`; in Pacred the
 * sub-pilots will land as sibling routes (see "Sub-page router"
 * below).
 *
 * The JSX below is the exact HTML structure `forwarder-bill.php`
 * renders for the default view — same Bootstrap-4 markup, same
 * elements, same labels (Thai hardcoded), same column order. The
 * visual identity comes from the legacy admin CSS, brought in
 * verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/admin/admin-base.css` (the shared admin
 * chrome — established by the admin-table pilot) and
 * `public/legacy/pcs/admin/combine-bill.css` (the page-specific
 * inline `<style>` blocks from forwarder-bill.php L400-445 +
 * L667-703 + the small handful of utility classes the default
 * view references), both loaded via plain `<link rel="stylesheet">`
 * so they bypass the app's Tailwind v4 / PostCSS pipeline (the
 * rule da4cd79 set).
 *
 * `forwarder-bill.php` source structure transcribed here:
 *   - Title bar      forwarder-bill.php L47
 *   - Breadcrumb     forwarder-bill.php L60-71
 *   - Card header    forwarder-bill.php L74-108
 *                    (heading + date-range filter + "สร้างบิลรวม"
 *                    CTA — visible only to CEO / Manager / QA&QC /
 *                    Accounting / ITDT)
 *   - Filter banner  forwarder-bill.php L109-114
 *                    (red-text summary of current filter)
 *   - DataTable      forwarder-bill.php L170-221
 *                    (6-column ledger — billID / เลขที่รวมบิล /
 *                    รายละเอียด (forwarder ID links) / ผู้รวมบิล /
 *                    เวลา / ตัวเลือก (delete + print)).
 *
 * Data — every `forwarder-bill.php` mysqli query transcribed 1:1
 * to the ported legacy `tb_*` schema (Supabase, migration 0081 —
 * tb_bill L816-821, tb_bill_item L847-851). `tb_*` is RLS-locked
 * to service_role so reads go through the admin client.
 *   - $sql_Table     → tb_bill WHERE date filter
 *                      (forwarder-bill.php L116-132)
 *   - $sql_Table_all → tb_bill_item LEFT JOIN tb_bill WHERE
 *                      same date filter — gives the (billID, fID)
 *                      pairs that populate the "รายละเอียด" cell
 *                      (forwarder-bill.php L133-146).
 *   - The legacy `search($arrAll, $search_items)` helper
 *                      (forwarder-bill.php L147-168) filters the
 *                      flat (billID, fID) array down to entries
 *                      matching a given billID — re-implemented as
 *                      a Map<billID, fID[]> here for O(1) lookup.
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate (forwarder-bill.php L94) for the "สร้างบิลรวม" mutate CTA
 * is "CEO / Manager / QA&QC / Accounting / ITDT". The closest
 * Pacred V3 RBAC role for "can mutate" is `super`; the view gate
 * matches the cnt-hs pilot — `super + ops + accounting + warehouse`
 * (the spec listed `warehouse` because this IS a warehouse tool).
 *
 * URL filter (transcribed from forwarder-bill.php L84-91 +
 * L116-132) — exposed as search params on this Next.js route with
 * the same query-string shape as the legacy URL:
 *   ?historyTable=true&date=YYYY-MM-DD%20-%20YYYY-MM-DD
 *                                          → custom date range
 *   ?historyTableAll=true                  → ทั้งหมด (no filter)
 *   (none)                                 → last 90 days (default)
 *
 * Sub-page router pattern (legacy `?page=` branch table) —
 * mirrors the admin-table pilot:
 * | Legacy                                | Pacred route |
 * |---|---|
 * | (default) history list                | `/admin/forwarders/combine-bill`            (this file) |
 * | `?page=add`                           | `/admin/forwarders/combine-bill/add`        (future pilot) |
 * | `?page=detail&id=X` (legacy mismatch) | `/admin/forwarders/combine-bill/[id]`       (future pilot) |
 * | `printBill.php?id[]=…&id[]=…`         | `/admin/forwarders/combine-bill/print`      (future pilot — @react-pdf) |
 *
 * mPDF -> @react-pdf strategy: legacy uses mPDF + THSarabunNew
 * to render the combine-bill PDF (legacy `printBill.php` — a
 * separate file outside the 1277 LOC source). Pacred's PDF path
 * is `@react-pdf/renderer` per the `components/pdf/` convention.
 * The button on each row links to a stub print route; the actual
 * PDF generation is a deferred follow-up.
 *
 * Mutations (deliberate · documented for the pilot):
 *   The legacy `add` POST handler (forwarder-bill.php L6-45) lives
 *   on the SAME URL: it accepts a comma-separated ID payload from
 *   the `?page=add` form, inserts one `tb_bill` row + N
 *   `tb_bill_item` rows, then re-renders the list with a
 *   SweetAlert banner. The faithful re-implementation will land
 *   as a Server Action wired to the `/admin/forwarders/combine-bill/add`
 *   pilot (future).
 *
 *   Per-row "ลบรายการ" (delete) calls the legacy
 *   `include/pages/forwarder-bill/deleteForwarder.php` via jQuery
 *   AJAX (forwarder-bill.php L319-351). The faithful
 *   re-implementation will be a Server Action; the button keeps
 *   its visual identity here and the handler is a follow-up.
 *
 *   Multi-select checkbox interactivity (DataTables checkboxes
 *   plug-in, forwarder-bill.php L249-282) is NOT ported — it
 *   requires jQuery + DataTables + checkboxes-extension. The
 *   markup keeps the `.dataTables_wrapper / #myTable / column-0
 *   checkbox cell` shape so the CSS hooks hold; functional
 *   row-selection lands with the `combine-bill-selector` client
 *   component (a future sibling file under this directory).
 *
 * Rebrand: legacy `PCS Cargo Admin` window title → `PR Cargo Admin`;
 * everything else is verbatim Thai. PCS-scrub stays API-switchover-
 * gated (CLAUDE.md / ADR-0017) and is NOT a faithful-port concern;
 * "branding text + member codes only".
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - The `add` POST handler (forwarder-bill.php L6-45) — Server
 *     Action follow-up.
 *   - The `?page=add` simple form sub-route (forwarder-bill.php
 *     L393-541) — sibling pilot at `add/page.tsx`.
 *   - The `?page=detail&id=` sub-route (forwarder-bill.php L543-1267)
 *     — this is actually a `tb_forwarder_driver` detail page (legacy
 *     mismatch — the router branches into a Google-Maps-routing
 *     screen here, not a combine-bill detail). Future pilot at
 *     `[id]/page.tsx`.
 *   - The DataTables JS init (forwarder-bill.php L246-298): sortable
 *     headers, checkboxes-multi-select, per-page length, fixed
 *     header. The static markup keeps the wrapper classes so the
 *     CSS looks identical at rest; functional sort/filter +
 *     row-level select is a follow-up.
 *   - The daterangepicker JS init (forwarder-bill.php L300-317) —
 *     the date input renders as a plain `<input type="text">` for
 *     the static pilot; functional picker is a follow-up.
 *   - The SweetAlert sweet-alert popup after add/delete
 *     (forwarder-bill.php L353-390) — deferred with the add Server
 *     Action.
 *   - The mPDF `printBill.php` PDF generation — @react-pdf
 *     follow-up (see strategy note above).
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers inlined verbatim — pure formatters/parsers lifted from the
// legacy admin includes. Kept inline (not extracted to lib/) because
// this is a pilot; the lift-to-`lib/` happens after a few admin pilots
// show the repeated callers.
// ============================================================================

/** Legacy PHP `date("Y-m-d", strtotime("-90 days", strtotime(date("Y-m-d"))))`
 *  forwarder-bill.php L86 + L129. Returns today minus N days as YYYY-MM-DD. */
function dateMinusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Legacy `date("Y-m-d")` — today as YYYY-MM-DD. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Legacy date-range parser — the daterangepicker emits the value as
 *  "YYYY-MM-DD - YYYY-MM-DD" and forwarder-bill.php L86 / L119-120
 *  reads it via substring slicing. Returns null for non-conformant
 *  input so the caller can fall back to the default-range. */
function parseDateRange(raw: string | undefined): { start: string; end: string } | null {
  if (!raw) return null;
  // legacy uses substr($_GET['date'],0,10) and substr($_GET['date'],13)
  if (raw.length < 23) return null;
  const start = raw.slice(0, 10);
  const end = raw.slice(13);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end))   return null;
  return { start, end };
}

// ============================================================================
// SQL — admin client, RLS-locked to service_role.
// ============================================================================

type BillRow = {
  billid: number;
  date: string | null;
  printstatus: string;
  adminid: string;
};

type BillItemRow = {
  id: number;
  billid: number;
  fid: number;
};

type SP = {
  historyTable?: string;
  historyTableAll?: string;
  date?: string;
};

export default async function CombineBillPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate (forwarder-bill.php L94 + the underlying header.php
  // admin gate). The "สร้างบิลรวม" CTA + the delete buttons are
  // CEO / Manager / QA&QC / Accounting / ITDT only; the view is open
  // to any logged-in admin. The runbook §8 pattern maps the legacy
  // departmentKey gate onto the V3 `super` role for mutations, and
  // the view union includes the cargo-flow roles that legitimately
  // need this screen (warehouse + ops + accounting).
  const { roles } = await requireAdmin(["super", "ops", "warehouse", "accounting"]);
  // requireAdmin already short-circuits "no admin" -> notFound, and
  // treats `super` as universal. canMutate mirrors the legacy "can
  // create / delete a combined bill" gate.
  const canMutate = roles.includes("super");

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── Filter resolution (forwarder-bill.php L115-132) ──────────
  //   if ?historyTable=true  : custom date range from ?date
  //   if ?historyTableAll    : no filter (everything)
  //   else                   : default = last 90 days
  // The legacy concatenates SQL like " AND (DATE(date) BETWEEN
  // '$startDate' AND '$endDate') ". Postgrest doesn't have a
  // BETWEEN, so we use .gte() + .lte() with the day-end timestamp.
  let filterStart: string | null = null;
  let filterEnd: string | null = null;
  let filterMode: "range" | "all" | "default" = "default";

  if (sp.historyTable === "true") {
    const range = parseDateRange(sp.date);
    if (range) {
      filterStart = range.start;
      filterEnd = range.end;
      filterMode = "range";
    } else {
      // bad ?date payload — fall back to the 90-day default behaviour
      filterStart = dateMinusDaysISO(90);
      filterEnd = todayISO();
    }
  } else if (sp.historyTableAll === "true") {
    filterMode = "all";
  } else {
    filterStart = dateMinusDaysISO(90);
    filterEnd = todayISO();
  }

  // ── tb_bill filtered query (forwarder-bill.php L116-132) ─────
  //   SELECT * FROM tb_bill WHERE 1=1 [AND DATE(date) BETWEEN s AND e]
  // The legacy doesn't ORDER explicitly — DataTables default is
  // column 1 (the billID column) desc, L262 `'order': [[1, 'desc']]`.
  // We replicate by ordering on billid desc server-side.
  let billsQ = admin
    .from("tb_bill")
    .select("billid, date, printstatus, adminid")
    .order("billid", { ascending: false });

  if (filterStart && filterEnd) {
    billsQ = billsQ
      .gte("date", `${filterStart}T00:00:00`)
      .lte("date", `${filterEnd}T23:59:59`);
  }

  // ── tb_bill_item LEFT JOIN tb_bill (forwarder-bill.php L133-146) ──
  //   SELECT bi.ID, bi.billID, bi.fID FROM tb_bill_item AS bi
  //     LEFT JOIN tb_bill AS b ON b.billID = bi.billID
  //     WHERE 1=1 [same date filter]
  // PostgREST: read the items with an inner join on tb_bill so the
  // date filter applies. The legacy then builds a flat array and
  // filters via the `search()` helper at L147-168 — we collapse
  // that into a Map<billID, fID[]> here.
  let itemsQ = admin
    .from("tb_bill_item")
    .select("id, billid, fid, tb_bill!inner(date)");

  if (filterStart && filterEnd) {
    itemsQ = itemsQ
      .gte("tb_bill.date", `${filterStart}T00:00:00`)
      .lte("tb_bill.date", `${filterEnd}T23:59:59`);
  }

  const [billsRes, itemsRes] = await Promise.all([billsQ, itemsQ]);
  const bills: BillRow[] = (billsRes.data ?? []) as unknown as BillRow[];
  const rawItems = (itemsRes.data ?? []) as unknown as BillItemRow[];

  // Build the (billID -> fID[]) Map — the equivalent of the legacy
  // `search($arrAll, ['billid' => $row['billID']])` call inside the
  // table loop (forwarder-bill.php L197-204).
  const itemsByBill = new Map<number, number[]>();
  for (const r of rawItems) {
    const arr = itemsByBill.get(r.billid);
    if (arr) arr.push(r.fid);
    else itemsByBill.set(r.billid, [r.fid]);
  }

  // ── Filter banner copy (forwarder-bill.php L111-114) ─────────
  //   if ?historyTable    : "ผลลัพธ์การค้นหา ตั้งแต่วันที่ : <date>"
  //   if ?historyTableAll : "ผลลัพธ์การค้นหา ทั้งหมด"
  //   else                : "ผลลัพธ์การค้นหา 90 วันที่ผ่านมา"
  const filterBanner =
    filterMode === "range"
      ? `ผลลัพธ์การค้นหา ตั้งแต่วันที่ : ${sp.date ?? ""}`
      : filterMode === "all"
        ? "ผลลัพธ์การค้นหา ทั้งหมด "
        : "ผลลัพธ์การค้นหา 90 วันที่ผ่านมา";

  // Default value for the date input — legacy at L86 either echoes
  // "-90 days - today" or the URL-supplied date range.
  const dateInputDefault =
    filterMode === "range" && sp.date
      ? sp.date
      : `${dateMinusDaysISO(90)} - ${todayISO()}`;

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both served as
          static /public/ assets so they bypass Tailwind / PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/combine-bill.css" />

      {/* BEGIN: Content — forwarder-bill.php L57 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb — forwarder-bill.php L60-71 */}
          <div className="content-header row">
            <div className="content-header-left col-12">
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าแรก</Link>
                    </li>
                    <li className="breadcrumb-item active">
                      ประวัติรายการรวมบิล
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body">
            {/* start — forwarder-bill.php L73 */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body p-05">
                        {/* ── Card header (heading + filter form + CTA)
                            forwarder-bill.php L80-108 ────────────────── */}
                        <div className="row">
                          {/* Heading + date-range filter form
                              forwarder-bill.php L81-93 */}
                          <div className="content-header-left col-md-6 col-12">
                            <div className="text-center text-md-left">
                              <h3 className="text-center text-md-left">
                                <span
                                  className="ft-printer font-30"
                                  style={{ fontSize: "2.2rem" }}
                                ></span>{" "}
                                ประวัติรายการรวมบิล
                              </h3>
                              <form
                                className="mb-1"
                                method="GET"
                                action="/admin/forwarders/combine-bill"
                              >
                                <label
                                  className="form-control-label"
                                  htmlFor="date"
                                >
                                  วันที่บันทึกรายการ
                                </label>
                                {/* The legacy `.shawCalRanges` daterangepicker
                                    wraps a plain text input. Pilot renders it
                                    statically; the functional picker is a
                                    follow-up. */}
                                <input
                                  type="text"
                                  className="form-control shawCalRanges"
                                  name="date"
                                  defaultValue={dateInputDefault}
                                />
                                <div className="text-center pt-1">
                                  <button
                                    className="btn btn-outline-success font-12 btn-rounded p-05"
                                    name="historyTable"
                                    value="true"
                                    type="submit"
                                  >
                                    {" "}
                                    <i className="fas fa-search"></i>{" "}
                                    ค้นหาข้อมูล
                                  </button>{" "}
                                  <button
                                    className="btn btn-outline-info font-12 btn-rounded p-05"
                                    name="historyTableAll"
                                    value="true"
                                    type="submit"
                                  >
                                    {" "}
                                    <i className="fas fa-search"></i>{" "}
                                    ค้นหาข้อมูลทั้งหมด
                                  </button>
                                </div>
                              </form>
                            </div>
                          </div>

                          {/* "สร้างบิลรวม" CTA — mutate-gated
                              forwarder-bill.php L94-107 */}
                          {canMutate && (
                            <div className="content-header-right col-md-6 col-12">
                              <div className="float-md-right">
                                <div className="text-center text-md-right">
                                  <Link href="/admin/forwarders/combine-bill/add">
                                    <button
                                      className="btn btn-sm btn-circle btn-success text-white"
                                      type="button"
                                      title="สร้างบิลรวม"
                                    >
                                      <svg
                                        className="pcs-icon"
                                        viewBox="0 0 24 24"
                                      >
                                        <line x1="12" y1="5" x2="12" y2="19" />
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                      </svg>
                                    </button>{" "}
                                    <span className="font-normal text-dark">
                                      สร้างบิลรวม
                                    </span>
                                  </Link>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ── Filter banner — forwarder-bill.php L109-114 ── */}
                        <div className="row">
                          <div className="col-12">
                            <span className="font-14 text-danger">
                              {filterBanner}
                            </span>

                            {/* ── DataTable form wrapper — forwarder-bill.php
                                L170-221.  The legacy `<form>` is the carrier
                                for the DataTables checkboxes plug-in selected
                                rows on submit to `printAll/`. Static render —
                                kept as a plain wrapper since no JS executes
                                the bulk-print flow yet. */}
                            <form
                              id="frm-example"
                              action="/admin/forwarders/combine-bill/print-all"
                              method="GET"
                            >
                              <div className="table-responsive pt-1">
                                <table
                                  id="myTable"
                                  className="table display table-bordered table-striped dataTable no-footer dtr-inline"
                                >
                                  <thead>
                                    <tr className="text-center">
                                      <th>billID</th>
                                      <th>เลขที่รวมบิล</th>
                                      <th>รายละเอียด</th>
                                      <th>ผู้รวมบิล</th>
                                      <th>เวลา</th>
                                      <th>ตัวเลือก</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {bills.map((row) => {
                                      const fids =
                                        itemsByBill.get(row.billid) ?? [];
                                      // Legacy at L202 builds an
                                      // `id[]=…&amp;id[]=…` query string for
                                      // the print link. Preserve the same
                                      // shape so the future print pilot can
                                      // consume it directly. The builder lives
                                      // alongside the Server Action so the
                                      // shape stays single-sourced.
                                      const printHref =
                                        buildCombineBillPrintHref(fids);

                                      return (
                                        <tr key={row.billid}>
                                          {/* 1 — billID
                                              forwarder-bill.php L192 */}
                                          <td>{row.billid}</td>
                                          {/* 2 — เลขที่รวมบิล (duplicate of
                                              col 1 — legacy renders billID
                                              twice on purpose for the
                                              DataTables checkboxes column
                                              fallback)
                                              forwarder-bill.php L193 */}
                                          <td>{row.billid}</td>
                                          {/* 3 — รายละเอียด — comma-separated
                                              list of linked forwarder IDs
                                              forwarder-bill.php L194-205 */}
                                          <td>
                                            เลขที่รายการฝากนำเข้า :{" "}
                                            {fids.map((fid, i) => (
                                              <span key={fid}>
                                                <Link
                                                  href={`/admin/forwarders/${fid}`}
                                                  target="_blank"
                                                >
                                                  {fid}
                                                </Link>
                                                {i < fids.length - 1
                                                  ? ", "
                                                  : ", "}
                                              </span>
                                            ))}
                                          </td>
                                          {/* 4 — ผู้รวมบิล (adminID)
                                              forwarder-bill.php L206 */}
                                          <td>{row.adminid}</td>
                                          {/* 5 — เวลา (date)
                                              forwarder-bill.php L207 */}
                                          <td>{row.date ?? ""}</td>
                                          {/* 6 — ตัวเลือก (delete + print)
                                              forwarder-bill.php L208-210.
                                              The interactive bits (delete
                                              confirm + Server Action) live
                                              in `combine-bill-row-actions.tsx`;
                                              the markup it emits keeps the
                                              legacy data attribute payload +
                                              same button classes so the CSS
                                              hooks hold. */}
                                          <td>
                                            <CombineBillRowActions
                                              billId={row.billid}
                                              printHref={printHref}
                                            />
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              <hr />
                              {/* Legacy DataTables export console
                                  forwarder-bill.php L220 — empty container
                                  the plug-in mounts into. Kept so the
                                  CSS hooks hold. */}
                              <div id="example-console-rows"></div>
                            </form>
                            {/* Legacy AJAX modal injection slot
                                forwarder-bill.php L222 — kept so a later
                                AJAX shim could mount the delete
                                confirmation here. */}
                            <div id="list-forwarder-data"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            {/* end — forwarder-bill.php L231 */}
          </div>
        </div>
      </div>
      {/* END: Content */}
    </div>
  );
}
