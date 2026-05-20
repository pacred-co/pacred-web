import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopMenuReport } from "@/components/admin/top-menu-report";

/**
 * Admin > "รายการเบิกเงินค่าตู้" — a FAITHFUL 1:1 TRANSCRIPTION
 * of the legacy PCS Cargo admin `pcs-admin/cnt-hs.php` DEFAULT
 * view (the `if(!isset($_GET['page']))` branch — L3-484), per
 * D1 / ADR-0017 + the faithful-port transcription runbook
 * (`docs/runbook/faithful-port-transcription.md` §8 — admin pattern).
 *
 * The legacy `cnt-hs.php` is the container-payment (ตู้-ค่าจ่าย)
 * ledger: admin marks containers as paid + uploads a PDF payment
 * slip. Reads `tb_cnt` (the payment header) + `tb_cnt_item`
 * (the cabinet-number fan-out) — one of the high-value flows
 * that handles the ทำตู้-ผ่าน-เงิน lifecycle.
 *
 * The route slug `cnt-hs` is preserved verbatim from the legacy
 * (the staff already know `/pcs-admin/cnt-hs/`) so retraining
 * is zero. ภูม decided 2026-05-20 to retire the rebuilt-style
 * sister page `/admin/accounting/container-payments` and keep
 * ONLY this faithful-port page — sidebar now points here, and
 * the detail/edit flow drops into `/admin/cnt-hs/[id]` (stub
 * pending the full faithful detail pilot of `cnt-hs.php?page=detail`).
 *
 * The JSX below is the exact HTML structure `cnt-hs.php` renders —
 * same Bootstrap-4 markup, same elements, same labels (Thai
 * hardcoded), same column order. The visual identity comes from
 * the legacy admin CSS, brought in verbatim as the static
 * `.pcs-legacy`-scoped `public/legacy/pcs/admin/admin-base.css`
 * (the shared admin chrome — established by the admin-table pilot)
 * and `public/legacy/pcs/admin/cnt-hs.css` (the page-specific
 * inline `<style>` block from cnt-hs.php L110-181), both loaded
 * via plain `<link rel="stylesheet">` so they bypass the app's
 * Tailwind v4 / PostCSS pipeline (the rule da4cd79 set).
 *
 * `cnt-hs.php` source structure transcribed here:
 *   - Title bar      cnt-hs.php L103   (window/page title)
 *   - Auth gate      cnt-hs.php L185   (departmentKey in CEO /
 *                    Manager / QA&QC / Accounting / ITDT)
 *   - Breadcrumb     cnt-hs.php L189-200
 *   - Status tabs    cnt-hs.php L237-259 (ทั้งหมด · รอดำเนินการ · สำเร็จแล้ว)
 *                    with count badges from L222-228.
 *   - DataTables     cnt-hs.php L263-358 (10-column ledger;
 *                    the legacy header `no-sort` row L279-290 is
 *                    a DataTables-only filter chip and is omitted
 *                    here — it's reproduced by the static markup
 *                    classes so the CSS positions hold).
 *
 * Data — every `cnt-hs.php` mysqli query transcribed 1:1 to the
 * ported legacy `tb_*` schema (Supabase, migration 0081). `tb_*`
 * is RLS-locked to service_role, so reads go through the admin
 * client.
 *   - $arrItem      → tb_cnt_item GROUP BY cntid   (cnt-hs.php L202-213)
 *                     → cntID → comma-joined fCabinetNumber list
 *   - $sqlMain      → tb_cnt WHERE cntStatus filter (cnt-hs.php L217-228)
 *   - $sqlMainAll   → tb_cnt no-status (the ทั้งหมด count)
 *   - $sqlMain1     → tb_cnt WHERE cntStatus='1' (the รอดำเนินการ count)
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate (cnt-hs.php L185) is "CEO / Manager / QA&QC / Accounting /
 * ITDT can view; everyone else is denied". The closest Pacred V3
 * RBAC roles are `super` (mgmt + IT) + `ops` (Manager-ish) +
 * `accounting` (finance) — the union mirrors the legacy gate
 * within the V3 role taxonomy.
 *
 * URL filter (transcribed from cnt-hs.php L218-222) — exposed as
 * a search param on this Next.js route with the same query-string
 * shape as the legacy URL:
 *   ?q=1   → cntStatus='1' (รอดำเนินการ)
 *   ?q=2   → cntStatus='2' (สำเร็จแล้ว)
 *   (none) → ทั้งหมด (everything)
 *
 * Mutations (deliberate · documented for the pilot):
 *   The legacy `addPay` POST handler at cnt-hs.php L4-101 will be
 *   re-introduced as a faithful Server Action on the `/admin/cnt-hs/[id]`
 *   detail pilot. The prior `pcs-container-payments.ts` action file
 *   was retired together with the rebuilt-style sister page (ภูม Q3
 *   decision 2026-05-20). This page is READ-only for the current pilot
 *   — staff click "อัปเดตและดูรายละเอียด" to drop into the detail/edit
 *   flow, which is a SEPARATE pilot (`?page=detail` map → future
 *   `/admin/cnt-hs/[id]` route · currently a placeholder stub).
 *
 * Rebrand: legacy `PCS Cargo Admin` window title → `PR Cargo
 * Admin`; everything else is verbatim Thai. The PCS-scrub stays
 * API-switchover-gated (CLAUDE.md / ADR-0017) and is NOT a
 * faithful-port concern; "branding text + member codes only".
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - The `addPay` POST handler (cnt-hs.php L4-101) — will land with
 *     the faithful Bootstrap-4 add-form pilot (sister page that used
 *     to host this action was retired in the ภูม Q3 cleanup 2026-05-20).
 *   - The `?page=detail&id=` sub-route (cnt-hs.php L486+) — future
 *     pilot at `/admin/cnt-hs/[id]/page.tsx`.
 *   - The DataTables JS init (cnt-hs.php L407-468): pageLength,
 *     checkbox column, multi-select, sort by col 1 desc, the
 *     "no-sort" pinned filter row. The static markup keeps the
 *     `.dataTables_wrapper / #myTable / .dt-buttons` classes so
 *     the CSS looks identical at rest; functional sort/filter +
 *     the row-level "select-pay" workflow is a follow-up (likely
 *     a small Pacred-side React DataTables shim).
 *   - `editFile()` modal AJAX (cnt-hs.php L385-394) — the
 *     attach-PDF-after-the-fact flow lands with the detail pilot.
 *   - `select-pay` button + `getListCNTPay.php` AJAX
 *     (cnt-hs.php L469-482) — the multi-row payment composer goes
 *     on the detail pilot.
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Helpers inlined verbatim — pure number/string formatters lifted from
// the legacy admin includes. Kept inline (not extracted to lib/) because
// this is a pilot; the lift-to-`lib/` happens after a few admin pilots
// show the repeated callers.
// ============================================================================

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56" thousand-grouped.
 *  Used at cnt-hs.php L315 for the จำนวนเงิน column. */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================================
// Row shape — the relevant subset of tb_cnt (migration 0081 L1006-1020).
// Lowercased per the legacy schema dump (Postgres collapsed the camelCase
// MySQL names to lowercase on load).
// ============================================================================

type CntRow = {
  id: number;
  cntname: string;       // เลขตู้ — comma-joined list
  cntstatus: string;     // '1' รอจ่าย · '2' จ่ายแล้ว
  cntamount: number;     // จำนวนเงิน
  cntimagesslip: string; // storage path of the China-side slip
  cntfile: string;       // storage path of the optional PDF
  date: string | null;
  adminidcreate: string; // ผู้ทำรายการเบิก
  nameblank: string;     // ธนาคาร
  noblank: string;       // เลขที่
  nameaccount: string;   // ชื่อบัญชี
};

/**
 * Search-param shape:
 *   - q       legacy `cntStatus` filter — '1' รอดำเนินการ · '2' สำเร็จแล้ว.
 *             Kept verbatim from cnt-hs.php L218-222 for URL stability so
 *             existing bookmarks + sidebar links still work. Any non-"1"/"2"
 *             value is treated as the new free-text search keyword.
 *   - search  free-text search across ID / nameBlank / noBlank (spec Part B
 *             req #6). Added by ภูม 2026-05-20 ค่ำ — operators kept asking
 *             how to find "the payment to Krungsri 1234567890" without
 *             scrolling 200 rows. ILIKE across `id::text`, `nameblank`,
 *             `noblank` (case-insensitive contains match).
 *   - offset  pagination offset (spec req #7) — 200 rows / page. `?offset=200`
 *             jumps to the 201st most-recent payment. Default 0.
 */
type SP = { q?: string; search?: string; offset?: string };

/** Page size — 200 rows max per the spec. */
const PAGE_SIZE = 200;

export default async function CntHsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Legacy gate (cnt-hs.php L185): CEO / Manager / QA&QC / Accounting /
  // ITDT. Closest V3 RBAC union = super + ops + accounting. requireAdmin
  // treats `super` as the "can-do-anything" master, so listing the
  // narrower roles + super covers the legacy intent.
  await requireAdmin(["super", "ops", "accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // ── tb_cnt_item fan-out (cnt-hs.php L202-213) ───────────────────
  //   SELECT cntID, fCabinetNumber FROM tb_cnt_item
  // The legacy PHP groups by cntID and comma-joins the cabinet-number
  // strings — same shape here.
  const itemsRes = await admin
    .from("tb_cnt_item")
    .select("cntid, fcabinetnumber");
  const arrItem = new Map<number, string[]>();
  for (const r of (itemsRes.data ?? []) as Array<{ cntid: number; fcabinetnumber: string }>) {
    const arr = arrItem.get(r.cntid);
    if (arr) arr.push(r.fcabinetnumber);
    else arrItem.set(r.cntid, [r.fcabinetnumber]);
  }

  // ── tb_cnt filtered query (cnt-hs.php L217-228) ────────────────
  //   $sqlMain = "SELECT * FROM tb_cnt WHERE 1"
  //   if ?q=N : $sqlMain.= " AND cntStatus='N' "
  // Default order matches DataTables `order: [[1, 'desc']]` →
  // column 1 = วันที่ทำรายการ desc (cnt-hs.php L423).
  //
  // Pagination: LIMIT 200, OFFSET = `?offset=` (spec Part B req #7).
  // Negative / NaN offsets fall back to 0 so a malformed URL doesn't
  // 500 the route.
  const offsetRaw = Number(sp.offset ?? 0);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0
    ? Math.floor(offsetRaw)
    : 0;
  // Free-text search keyword. Comes from `?search=` first; if absent,
  // we treat `?q=` as a search term IF its value isn't the legacy
  // status code "1"/"2". This preserves URL stability for `?q=1`/`?q=2`
  // while giving the operator a single-field search.
  const searchTerm = (sp.search ?? "").trim();
  const qIsStatus = sp.q === "1" || sp.q === "2";
  const qAsSearch = !qIsStatus ? (sp.q ?? "").trim() : "";
  const search = searchTerm || qAsSearch;

  let q = admin
    .from("tb_cnt")
    .select(
      "id, cntname, cntstatus, cntamount, cntimagesslip, cntfile, date, " +
        "adminidcreate, nameblank, noblank, nameaccount",
      { count: "exact" },
    )
    .order("date", { ascending: false, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (qIsStatus) q = q.eq("cntstatus", sp.q!);

  if (search) {
    // ILIKE across id::text / nameblank / noblank — the three legacy
    // identifiers operators reach for. PostgREST `.or()` strings each
    // condition together with commas; we escape any embedded comma/
    // paren in the keyword to avoid breaking the filter syntax.
    const safe = search.replace(/[(),]/g, " ");
    const pattern = `%${safe}%`;
    q = q.or(
      `id::text.ilike.${pattern},nameblank.ilike.${pattern},noblank.ilike.${pattern}`,
    );
  }

  // ── Status overview counts (cnt-hs.php L222-228) ───────────────
  //   $countAll = COUNT(SELECT * FROM tb_cnt)
  //   $count1   = COUNT(SELECT * FROM tb_cnt WHERE cntStatus='1')
  //   $count2   = $countAll - $count1  (the "สำเร็จแล้ว" tab)
  const [tableRes, countAllRes, count1Res] = await Promise.all([
    q,
    admin.from("tb_cnt").select("id", { count: "exact", head: true }),
    admin.from("tb_cnt").select("id", { count: "exact", head: true }).eq("cntstatus", "1"),
  ]);

  const rows: CntRow[] = (tableRes.data ?? []) as unknown as CntRow[];
  const countAll = countAllRes.count ?? 0;
  const count1 = count1Res.count ?? 0;
  const count2 = countAll - count1;
  // Result-set total (for paginator). When no filters apply this equals
  // countAll; with status/search filters PostgREST returns the filtered
  // count via the `count: exact` option on the main query.
  const resultTotal = tableRes.count ?? rows.length;

  // Active-tab marker for the .active CSS class (cnt-hs.php L398-404 +
  // L237-258 wrapping `nav-link cnt-1/cnt-2/cnt-all`).
  const activeTab: "all" | "1" | "2" =
    sp.q === "1" ? "1" : sp.q === "2" ? "2" : "all";

  // Pagination boundary calculations.
  const hasPrev = offset > 0;
  const hasNext = offset + rows.length < resultTotal;
  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;
  // Build a query string that preserves the active filter set when
  // hopping pages. Keep `q` (legacy status) + `search` keys intact.
  const buildPageHref = (newOffset: number): string => {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (searchTerm) params.set("search", searchTerm);
    if (newOffset > 0) params.set("offset", String(newOffset));
    const qs = params.toString();
    return qs ? `/admin/cnt-hs?${qs}` : "/admin/cnt-hs";
  };

  // Storage base paths for slip + file links — mirror the legacy
  // `basePath.'storage/slip/'` / `basePath.'storage/file/'`
  // (cnt-hs.php L323, L328). The Supabase Storage bucket `slips`
  // holds the uploaded slip under `pcs-container-pay/<filename>`;
  // the DB column stores the relative path. For private-bucket reads
  // the detail page issues a signed URL — link drops into the
  // faithful `/admin/cnt-hs/[id]` detail (currently a stub awaiting
  // the full `cnt-hs.php?page=detail` pilot).
  const slipDetailHref = (id: number) => `/admin/cnt-hs/${id}`;

  return (
    <>
      {/* 11-button warehouse/container audit menu — shared across the
          /admin/report-cnt + /admin/cnt-hs cluster (see TopMenuReport
          comment). Lives OUTSIDE the `.pcs-legacy` scope so it renders
          in the Pacred admin chrome rather than legacy Bootstrap. */}
      <TopMenuReport activeHref="/admin/cnt-hs" />

      <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both served as
          static /public/ assets so they bypass Tailwind / PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/cnt-hs.css" />

      {/* BEGIN: Content — cnt-hs.php L187 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        {/* Breadcrumb — cnt-hs.php L189-200 */}
        <div className="content-header row p-05">
          <div className="content-header-left col-12">
            <div className="row breadcrumbs-top">
              <div className="breadcrumb-wrapper col-12">
                <ol className="breadcrumb">
                  <li className="breadcrumb-item">
                    <Link href="/admin">
                      <span className="menu-home">หน้าแรก</span>
                    </Link>
                  </li>
                  <li className="breadcrumb-item active">รายการเบิกเงินค่าตู้</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* ── Status tabs + DataTable card — cnt-hs.php L230-367 ── */}
        <section>
          <div className="card">
            <div className="card-content">
              <div className="card-body p-0">
                <div className="row">
                  <div className="col-12">
                    {/* Status tabs (cnt-hs.php L237-259) */}
                    <div className="p-1">
                      <ul className="nav nav-tabs nav-underline pcs-tabs no-hover-bg">
                        <li className="nav-item cnt-all">
                          <Link
                            href="/admin/cnt-hs"
                            className={`nav-link cnt-all pcs-text-menu pcs-menu-link${activeTab === "all" ? " active" : ""}`}
                          >
                            ทั้งหมด
                            {countAll > 0 && (
                              <div className="pcs-badge badge-danger pcs-badge-pill font-12">
                                {countAll}
                              </div>
                            )}
                          </Link>
                        </li>
                        <li className="nav-item cnt-1">
                          <Link
                            href={{ pathname: "/admin/cnt-hs", query: { q: "1" } }}
                            className={`nav-link cnt-1 pcs-text-menu pcs-menu-link${activeTab === "1" ? " active" : ""}`}
                          >
                            รอดำเนินการ
                            {count1 > 0 && (
                              <div className="pcs-badge badge-danger pcs-badge-pill font-12">
                                {count1}
                              </div>
                            )}
                          </Link>
                        </li>
                        <li className="nav-item cnt-2">
                          <Link
                            href={{ pathname: "/admin/cnt-hs", query: { q: "2" } }}
                            className={`nav-link cnt-2 pcs-text-menu pcs-menu-link${activeTab === "2" ? " active" : ""}`}
                          >
                            สำเร็จแล้ว
                            {count2 > 0 && (
                              <div className="pcs-badge badge-danger pcs-badge-pill font-12">
                                {count2}
                              </div>
                            )}
                          </Link>
                        </li>
                      </ul>
                    </div>

                    {/* Search bar — Pacred addition (spec Part B req #6).
                        Submits a GET to /admin/cnt-hs?search=<keyword> +
                        preserves the active status tab via the hidden
                        `q` input. Server-side filter is ILIKE across
                        id::text / nameblank / noblank. */}
                    <div className="p-1 px-2">
                      <form action="/admin/cnt-hs" method="GET" className="d-flex" style={{ gap: 8 }}>
                        {sp.q && (
                          <input type="hidden" name="q" value={sp.q} />
                        )}
                        <input
                          type="text"
                          name="search"
                          defaultValue={searchTerm}
                          placeholder="ค้นหา ID / ธนาคาร / เลขที่บัญชี"
                          className="form-control form-control-sm"
                          style={{ maxWidth: 320 }}
                        />
                        <button
                          type="submit"
                          className="btn btn-sm btn-primary"
                        >
                          ค้นหา
                        </button>
                        {searchTerm && (
                          <Link
                            href={sp.q ? `/admin/cnt-hs?q=${sp.q}` : "/admin/cnt-hs"}
                            className="btn btn-sm btn-outline-secondary"
                          >
                            ล้าง
                          </Link>
                        )}
                        <span className="ml-2 align-self-center" style={{ fontSize: 12, color: "#888" }}>
                          พบ {resultTotal.toLocaleString()} รายการ
                          {resultTotal > PAGE_SIZE &&
                            ` · แสดง ${(offset + 1).toLocaleString()}–${Math.min(offset + rows.length, resultTotal).toLocaleString()}`}
                        </span>
                      </form>
                    </div>

                    {/* DataTable wrapper (cnt-hs.php L261-359) */}
                    <div className="table-responsive p-2">
                      {/* The legacy uses <form id="frm-example" method="GET">
                          to carry DataTables multi-select state into the
                          submit. Static render — kept as a plain wrapper
                          since no JS executes the select-pay flow yet. */}
                      <form className="" id="frm-example" action="" method="GET">
                        <table
                          id="myTable"
                          className="table display table-bordered table-striped dataTable no-footer dtr-inline"
                        >
                          <thead>
                            <tr className="text-center">
                              <th>ID</th>
                              <th>วันที่ทำรายการ</th>
                              <th>หมายเลขตู้</th>
                              <th>จำนวนเงิน</th>
                              <th>ข้อมูลเพิ่มเติม</th>
                              <th>สลิปรายการ</th>
                              <th>หลักฐานผู้เบิกเงิน</th>
                              <th>ผู้ทำรายการเบิก</th>
                              <th>สถานะ</th>
                              <th>ตัวเลือก</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* The legacy `no-sort` filter row (cnt-hs.php
                                L279-290) is a DataTables placeholder that
                                JS later promotes into a per-column filter
                                strip. Without the DataTables init this row
                                is just blank chrome; faithful-port keeps
                                it so the CSS hooks (`.bg-color` row) hold. */}
                            <tr className="bg-color no-sort">
                              <td className="t1"></td>
                              <td className="t2"></td>
                              <td className="t3"></td>
                              <td className="t4"></td>
                              <td className="t5"></td>
                              <td className="t6"></td>
                              <td className="t7"></td>
                              <td className="t8"></td>
                              <td className="t9"></td>
                              <td className="t10"></td>
                            </tr>
                            {rows.map((row) => {
                              const cabinets = arrItem.get(row.id) ?? [];
                              const cabinetList = cabinets.join(", ");
                              return (
                                <tr key={row.id} className=" font-13 ">
                                  {/* 1 — ID (cnt-hs.php L299) */}
                                  <td className="cursor-pointer">{row.id}</td>
                                  {/* 2 — วันที่ทำรายการ (cnt-hs.php L300) */}
                                  <td>{row.date ?? ""}</td>
                                  {/* 3 — หมายเลขตู้ — <details> summary
                                      with full cabinet list inside
                                      (cnt-hs.php L301-314) */}
                                  <td>
                                    <details>
                                      <summary className="short-text max-text">
                                        {row.cntname}
                                      </summary>
                                      <div className="content2">
                                        <span>
                                          {cabinetList && (
                                            <span
                                              className="text-primary"
                                              style={{ fontSize: "12px" }}
                                            >
                                              {cabinetList}
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                    </details>
                                  </td>
                                  {/* 4 — จำนวนเงิน (cnt-hs.php L315) */}
                                  <td className="text-right">
                                    {numberFormat2(row.cntamount)}
                                  </td>
                                  {/* 5 — ข้อมูลเพิ่มเติม
                                      (ธนาคาร / เลขที่ / ชื่อ — cnt-hs.php L316-320) */}
                                  <td>
                                    ธนาคาร : {row.nameblank}
                                    เลขที่ : {row.noblank}
                                    ชื่อ : {row.nameaccount}
                                  </td>
                                  {/* 6 — สลิปรายการ (cnt-hs.php L321-325) */}
                                  <td className="text-center">
                                    {row.cntimagesslip ? (
                                      <a
                                        className="image-popup-vertical-fit el-link"
                                        href={slipDetailHref(row.id)}
                                      >
                                        ดูสลิป
                                      </a>
                                    ) : (
                                      ""
                                    )}
                                  </td>
                                  {/* 7 — หลักฐานผู้เบิกเงิน
                                      (cnt-hs.php L326-333) — link to the
                                      attach-file detail; the legacy inline
                                      `editFile()` modal is a follow-up. */}
                                  <td className="text-center">
                                    {row.cntfile ? (
                                      <a href={slipDetailHref(row.id)} target="_blank" rel="noreferrer">
                                        ดูไฟล์
                                      </a>
                                    ) : (
                                      <>
                                        ยังไม่แนบเอกสาร{" "}
                                        <Link
                                          href={`/admin/cnt-hs/${row.id}`}
                                          className="font-12 text-info cursor-pointer"
                                        >
                                          เพิ่มไฟล์
                                        </Link>
                                      </>
                                    )}
                                  </td>
                                  {/* 8 — ผู้ทำรายการเบิก (cnt-hs.php L334) */}
                                  <td className="text-center">{row.adminidcreate}</td>
                                  {/* 9 — สถานะ (cnt-hs.php L335-343) */}
                                  <td className="text-center">
                                    {row.cntstatus === "2" ? (
                                      <span className="font-13 badge badge-success badge-pill">
                                        สำเร็จ
                                      </span>
                                    ) : (
                                      <span className="font-13 badge badge-warning badge-pill">
                                        รอดำเนินการ
                                      </span>
                                    )}
                                  </td>
                                  {/* 10 — ตัวเลือก (cnt-hs.php L345-349)
                                      The legacy "อัปเดตและดูรายละเอียด"
                                      button drops into cnt-hs.php?page=detail
                                      → maps to `/admin/cnt-hs/[id]`
                                      (currently a stub; full faithful
                                      detail pilot is a follow-up). */}
                                  <td className="text-center">
                                    <Link href={`/admin/cnt-hs/${row.id}`}>
                                      <span className="btn font-12 btn-sm btn-warning btn-rounded">
                                        {" "}อัปเดตและดูรายละเอียด{" "}
                                      </span>
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </form>
                    </div>
                    {/* Pagination — Pacred addition (spec Part B req #7).
                        200 rows per page, prev/next via `?offset=`. */}
                    {(hasPrev || hasNext) && (
                      <div
                        className="d-flex justify-content-between align-items-center p-2"
                        style={{ borderTop: "1px solid #eee" }}
                      >
                        <span style={{ fontSize: 12, color: "#666" }}>
                          หน้า {Math.floor(offset / PAGE_SIZE) + 1} จาก{" "}
                          {Math.max(1, Math.ceil(resultTotal / PAGE_SIZE))}
                        </span>
                        <div style={{ display: "flex", gap: 8 }}>
                          {hasPrev ? (
                            <Link
                              href={buildPageHref(prevOffset)}
                              className="btn btn-sm btn-outline-secondary"
                            >
                              ก่อนหน้า
                            </Link>
                          ) : (
                            <span
                              className="btn btn-sm btn-outline-secondary disabled"
                              style={{ pointerEvents: "none", opacity: 0.45 }}
                            >
                              ก่อนหน้า
                            </span>
                          )}
                          {hasNext ? (
                            <Link
                              href={buildPageHref(nextOffset)}
                              className="btn btn-sm btn-outline-secondary"
                            >
                              ถัดไป
                            </Link>
                          ) : (
                            <span
                              className="btn btn-sm btn-outline-secondary disabled"
                              style={{ pointerEvents: "none", opacity: 0.45 }}
                            >
                              ถัดไป
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Empty fixed bottom-button slot (cnt-hs.php L360) */}
                    <div className="btn-group" style={{ position: "fixed", bottom: 20 }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      {/* Legacy modal injection slots (cnt-hs.php L369-370) — kept so
          a later AJAX shim could mount the multi-row select-pay /
          attach-file modals here. */}
      <div id="list-forwarder-data"></div>
      <div id="get-form-edit-file"></div>
      {/* END: Content */}
      </div>
    </>
  );
}
