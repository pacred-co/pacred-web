import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * Admin > "ประวัติการออกใบแจ้งหนี้ ฝากนำเข้า" — a FAITHFUL 1:1
 * TRANSCRIPTION of the legacy PCS Cargo admin
 * `pcs-admin/hs-forwarder-invoice.php` DEFAULT view
 * (`include/pages/hs-forwarder-invoice/home.php` L1-88), per
 * D1 / ADR-0017 + the faithful-port transcription runbook
 * (`docs/runbook/faithful-port-transcription.md` §8 — admin pattern).
 *
 * The legacy `hs-forwarder-invoice.php` (30 LOC wrapper) is a
 * `switch($_GET['page'])` router that branches into three views:
 *   - (default)  → include/pages/hs-forwarder-invoice/home.php   (this file)
 *   - ?page=add  → include/pages/hs-forwarder-invoice/add.php    (future pilot)
 *   - ?page=detail&id=X → include/pages/hs-forwarder-invoice/detail.php (future pilot)
 *
 * This file transcribes ONLY the default (home.php) view = the LIST
 * shell that wraps a help modal + the "เพิ่มรายการใหม่" CTA. The
 * actual issued-invoice list, the create-invoice form, and the
 * per-invoice detail/print flow land as SIBLING pilots:
 *   - /admin/accounting/forwarder-invoice/add     (the ?page=add form)
 *   - /admin/accounting/forwarder-invoice/[id]    (the ?page=detail&id=X view)
 *
 * The legacy home.php intentionally renders an empty list-shell —
 * it shows the page heading, the help modal, the "เพิ่มรายการใหม่"
 * CTA, then a centred subheading. There is no DataTable on the
 * default view — the per-customer invoice listing lives behind the
 * "ดูรายละเอียด" workflow (per `member/pcs-admin/include/pages/
 * hs-forwarder-invoice/home.php`). This pilot reproduces that
 * shell faithfully — same Bootstrap-4 markup, same labels (Thai
 * hardcoded), same modal contents.
 *
 * The JSX below is the exact HTML structure home.php renders —
 * same Bootstrap-4 markup, same elements, same labels, same order.
 * The visual identity comes from the legacy admin CSS, brought in
 * verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/admin/admin-base.css` (the shared admin chrome
 * — established by the admin-table pilot) and
 * `public/legacy/pcs/admin/accounting-forwarder-invoice.css` (the
 * page-specific overrides — the orange `bg-color-recom` modal CTA
 * gradient + the Bootstrap-4 modal chrome the help dialog needs).
 * Both loaded via plain `<link rel="stylesheet">` so they bypass
 * the app's Tailwind v4 / PostCSS pipeline (the rule da4cd79 set).
 *
 * `home.php` source structure transcribed here:
 *   - Title bar      home.php L1 (window/page title)
 *   - Breadcrumb     home.php L11 → breadcrumbAdmin() helper in
 *                    pcs-admin/include/function.php L2976-2996.
 *                    The legacy passes a one-element array (the
 *                    section heading) — reproduced here.
 *   - Card header    home.php L13-77 (heading + help-modal + CTA)
 *   - Page heading   home.php L70-74 (centred "PCS-red" subheading)
 *
 * Data — home.php has NO SQL. The default home view is a
 * header-shell only; the per-customer invoice listing is wired
 * inside the `add` and `detail` sub-pilots. Nothing fetched here.
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * gate is implicit (header.php require — any logged-in admin can
 * land here); but the page IS in the บัญชี Cargo workspace, so the
 * closest Pacred V3 RBAC roles are `super + accounting`.
 * requireAdmin treats `super` as universal.
 *
 * Sub-page router pattern (legacy `?page=` branch table) —
 * mirrors the admin-table + combine-bill pilots:
 * | Legacy                                | Pacred route |
 * |---|---|
 * | (default) header-shell + help modal   | `/admin/accounting/forwarder-invoice`        (this file) |
 * | `?page=add`                           | `/admin/accounting/forwarder-invoice/add`    (future pilot) |
 * | `?page=detail&id=X`                   | `/admin/accounting/forwarder-invoice/[id]`   (future pilot) |
 *
 * Rebrand: legacy `PCS Cargo Admin` window title → `PR Cargo
 * Admin`; everything else is verbatim Thai. The PCS-scrub stays
 * API-switchover-gated (CLAUDE.md / ADR-0017) and is NOT a
 * faithful-port concern; "branding text + member codes only".
 *
 * Not transcribed (deliberate · documented for the pilot):
 *   - The `?page=add` sub-route (legacy switch `case 'add'`,
 *     home.php L17-22). The "เพิ่มรายการใหม่" CTA is rendered
 *     faithfully (link `/admin/accounting/forwarder-invoice/add`)
 *     but the actual create-invoice form lives in a sibling pilot.
 *   - The `?page=detail&id=X` sub-route (legacy switch `case 'detail'`,
 *     home.php L5-15) — sibling pilot at `[id]/page.tsx`.
 *   - The Bootstrap-4 modal opens via `data-toggle="modal"` /
 *     `data-target="#recom"` — the (admin) layout loads the
 *     vendor jQuery+Bootstrap-4 bundle so the modal works without
 *     React state.
 */

export const dynamic = "force-dynamic";

export default async function AccountingForwarderInvoicePage() {
  // Legacy gate (home.php inherits header.php auth — any admin can
  // view; the accounting / sales / CEO roles are the legitimate
  // users). Pacred V3 narrows to super + accounting; super is
  // always included by requireAdmin semantics.
  await requireAdmin(["super", "accounting"]);

  // home.php L11 — title = ประวัติการออกใบแจ้งหนี้ ฝากนำเข้า
  const sectionName = "ประวัติการออกใบแจ้งหนี้ ฝากนำเข้า";

  return (
    <div className="pcs-legacy">
      {/* Legacy admin chrome + page-specific CSS — both served as
          static /public/ assets so they bypass Tailwind / PostCSS. */}
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link
        rel="stylesheet"
        href="/legacy/pcs/admin/accounting-forwarder-invoice.css"
      />

      {/* BEGIN: Content — home.php L7 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb — home.php L11 → breadcrumbAdmin([{name:
              'ประวัติการออกใบแจ้งหนี้ ฝากนำเข้า'}]).
              The legacy helper renders: หน้าแรก / {sectionName}. */}
          <div className="content-header row">
            <div className="content-header-left col-12">
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าแรก</Link>
                    </li>
                    <li className="breadcrumb-item active">{sectionName}</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body">
            {/* home.php L13 */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          {/* Section heading — home.php L20-24 */}
                          <div className="content-header-left col-md-6 col-12">
                            <div className="text-center text-md-left">
                              <h3 className="text-center text-md-left">
                                {sectionName}
                              </h3>
                            </div>
                          </div>

                          {/* Right column — help modal + "เพิ่มรายการใหม่" CTA
                              home.php L25-67 */}
                          <div className="content-header-right col-md-6 col-12">
                            <div className="float-md-right">
                              <div className="text-center text-md-right">
                                {/* "คำแนะนำการใช้งาน" pill that opens the
                                    help modal via Bootstrap-4 data-toggle —
                                    home.php L28-30 */}
                                <span
                                  className="btn btn-sm bg-color-recom box-shadow-2 mr-1 cursor-pointer"
                                  data-toggle="modal"
                                  data-target="#recom"
                                >
                                  คำแนะนำการใช้งาน
                                </span>

                                {/* Help modal — home.php L31-59.
                                    Renders the "การใช้งานระบบออกใบแจ้งหนี้
                                    รายการฝากนำเข้าสินค้า" panel verbatim;
                                    the (admin) layout's jQuery+Bootstrap-4
                                    bundle wires the show/hide. */}
                                <div
                                  id="recom"
                                  className="text-left modal fade in"
                                  tabIndex={-1}
                                  role="dialog"
                                  aria-hidden="true"
                                >
                                  <div className="modal-dialog modal-xl">
                                    <div className="modal-content header-from">
                                      <div className="modal-header">
                                        <h4 className="modal-title">
                                          การใช้งานระบบออกใบแจ้งหนี้รายการฝากนำเข้าสินค้า
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
                                        <ol>
                                          <li>
                                            {" "}เงื่อนไขที่จะออกใบแจ้งหนี้ได้
                                            <ol>
                                              <li>
                                                {" "}หากต้องการออกใบแจ้งหนี้พร้อมกันหลายรายการต้องมาทำที่ระบบสร้างใบแจ้งหนี้{" "}
                                              </li>
                                              <li>
                                                {" "}รายการฝากนำเข้านั้นต้องอยู่ในสถานะรอชำระเงินแล้ว{" "}
                                              </li>
                                              <li>
                                                {" "}ต้องเป็นลูกค้าในรหัสสมาชิกเดียวกันเท่านั้น{" "}
                                              </li>
                                              <li>
                                                {" "}ต้องระบุวันที่ครบกำหนดชำระ{" "}
                                              </li>
                                            </ol>
                                          </li>
                                          <li>
                                            {" "}ขั้นตอนการสร้างใบแจ้งหนี้
                                            <ol>
                                              <li>
                                                {" "}กรอกรหัสสมาชิกของลูกค้า{" "}
                                              </li>
                                              <li>
                                                {" "}เลือกรายการที่ต้องการ
                                              </li>
                                              <li>
                                                {" "}ลูกค้าบางคนสามารถอนุมัติเครดิตไปได้เลยด้วย
                                              </li>
                                            </ol>
                                          </li>
                                        </ol>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* "เพิ่มรายการใหม่" CTA — home.php L60-65.
                                    Drops into the legacy
                                    hs-forwarder-invoice.php?page=add =
                                    Pacred /admin/accounting/forwarder-invoice/add
                                    (future sibling pilot). */}
                                <Link href="/admin/accounting/forwarder-invoice/add">
                                  <button
                                    className="btn btn-sm btn-circle btn-success text-white"
                                    type="button"
                                    title="เพิ่มรายการใหม่"
                                  >
                                    {/* Inline SVG of the legacy ft-plus icon
                                        (matches the .pcs-icon admin-base.css
                                        pattern from combine-bill). */}
                                    <svg className="pcs-icon" viewBox="0 0 24 24">
                                      <line x1="12" y1="5" x2="12" y2="19" />
                                      <line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                  </button>
                                  <span className="font-normal text-dark">
                                    เพิ่มรายการใหม่
                                  </span>
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Centred "PCS-red" subheading — home.php L70-74 */}
                        <div className="row">
                          <div className="col-12 text-center">
                            <h2 className="text-color-main">{sectionName}</h2>
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
      {/* END: Content — home.php L84 */}
    </div>
  );
}
