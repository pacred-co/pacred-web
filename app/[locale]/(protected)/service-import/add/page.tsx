import Script from "next/script";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceImportAddForm } from "./service-import-add-form";

/**
 * Customer "เพิ่มรายการนำเข้า" (forwarder add) screen — a FAITHFUL 1:1
 * TRANSCRIPTION of the legacy PCS Cargo `member/forwarder.php`
 * `?page=add` branch (D1 / ADR-0017 · faithful-port transcription ·
 * runbook `docs/runbook/faithful-port-transcription.md`).
 *
 * ── Legacy mapping ──
 * The legacy `.htaccess` (member/.htaccess) rewrites:
 *   `forwarder/<page>/` → `forwarder.php?page=<page>`
 *
 * `forwarder.php` has THREE branches keyed off `?page`:
 *   - `?page` unset OR `?page=='add'`  (L10-1070) → the LIST view, and
 *     when `?page=='add'` an extra `<script>` at L1061-1069 auto-opens
 *     the `#add-forwarder` modal so the form is the first thing the
 *     user sees. That auto-show JS is the ENTIRE difference between
 *     `/forwarder/` and `/forwarder/add/` — both render the same body.
 *   - `?page=='detail'` (L1584+) → the order-detail screen (separate
 *     `/service-import/[fNo]/page.tsx`).
 *
 * The Pacred menu links the "เพิ่มรายการนำเข้า" CTA at `/service-import/add/`
 * specifically to land the user inside the add-modal. This page transcribes
 * the LIST body + the `#add-forwarder` modal markup, with the modal opened
 * by default (the legacy auto-show side-effect baked into the rendered
 * markup, since this is the add-only landing URL).
 *
 * ── Page structure (forwarder.php L430-1058) ──
 * .app-content > .content-wrapper
 *   1. breadcrumb header
 *   2. .content-body.pr110 — list view body (same as `/service-import`)
 *   3. #add-forwarder modal (L881-1039) — the new-order form:
 *        เลข Tracking · รายละเอียด · รูปสินค้า · จำนวนกล่อง
 *        + รูปแบบขนส่งจีน-ไทย (รถ / เรือ)
 *        + การตีลังไม้ (ไม่ตี / ตี)
 *        + ที่อยู่ในการจัดส่ง (<select> + รับเองโกดัง PCS กทม)
 *        + selectShipBy (AJAX-populated)
 *        + โปรโมชัน "PCS เหมาๆ" checkbox
 *        + submit "สร้างออเดอร์"
 *   4. #pro-maomao modal (L1041-1058) — promo popup
 *   5. auto-show <script> for `?page=='add'` (L1061-1069)
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred.
 *
 * ── FLAGGED — not strictly 1:1 (documented, never silently diverged) ──
 *  1. forwarder.php L9-427 is a large POST handler — `save` (INSERT
 *     tb_forwarder + image upload via move_uploaded_file + LINE Notify)
 *     + `paymentForwarderNew` (multi-bill INSERT tb_wallet_hs + UPDATE
 *     tb_forwarder). Server Components MUST stay pure → these render-
 *     time writes are NOT reproduced. The `save` branch (the form on
 *     this page) is wired via the <ServiceImportAddForm> Client
 *     Component → createLegacyForwarder Server Action; the legacy
 *     image upload (`fCover`) and LINE-Notify side-effect are
 *     intentionally NOT ported (admin attaches photos in back-office).
 *     `paymentForwarderNew` lives on /service-import (the list view).
 *  2. The full LIST view body that the legacy renders BEHIND the modal
 *     is the screen at `/service-import` — not re-rendered here to avoid
 *     duplication; this page is the modal itself. The legacy effectively
 *     shows the same — the auto-show fires within milliseconds, leaving
 *     the LIST never visible. A "← กลับสู่รายการ" link maps the user back
 *     to `/service-import` if they dismiss the modal.
 *  3. forwarder.php L976-997 populates the address <select> from
 *     tb_address ⋈ tb_address_main — transcribed via createAdminClient()
 *     below; the legacy "PCS เหมาๆ" eligibility check + the
 *     getShipBy() AJAX into #selectShipBy stay UNWIRED (TODO(server-action)).
 *  4. The Bootstrap-4 `.modal('show')` open behaviour comes from the
 *     vendor JS bundle in (protected)/layout.tsx — staged globally; the
 *     legacy `<script>` at L1061-1069 is reproduced as a tiny inline
 *     `<script>` that fires the same `.modal('show')` call once jQuery
 *     resolves. The dropify file input + jQuery slide-up/down for the
 *     "PCS เหมาๆ" upsell, the SweetAlert result popups, deleteForwarder(),
 *     and the DataTables grid all need client JS not present here.
 *  5. forwarder.php L2 `require_once('include/header.php')` resolves
 *     the customer + redirects guests. Pacred's `(protected)` layout
 *     + `getCurrentUserWithProfile()` is the equivalent auth gate.
 */

// Server Components reading cookies/auth under a layout must be dynamic.
export const dynamic = "force-dynamic";

type AddressRow = {
  addressid: number;
  addressname: string | null;
  addresslastname: string | null;
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
};

// Legacy CONCAT('คุณ',addressName,…) — function.php uses a "คุณ" prefix
// when building the option label. forwarder.php L976 doesn't prefix the
// FIRST <option>, but the inner SQL on L979-980 also drops the "คุณ"
// prefix — kept faithful (no prefix here, matching that exact branch).
function addressFull(a: AddressRow): string {
  return [
    a.addressname ?? "",
    a.addresslastname ?? "",
    a.addressno ?? "",
    "ตำบล/แขวง",
    a.addresssubdistrict ?? "",
    "อำเภอ/เขต",
    a.addressdistrict ?? "",
    "จังหวัด",
    a.addressprovince ?? "",
    a.addresszipcode ?? "",
  ]
    .filter((s) => s !== "")
    .join(" ");
}

export default async function ServiceImportAddPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // ── forwarder.php L976-997 — address <select> options ──
  // SELECT a.addressID, CONCAT(…) AS fullAddress FROM tb_address a
  //   LEFT JOIN tb_address_main am ON a.addressID=am.addressID
  //   WHERE a.userID=… AND a.userID=am.userID;
  //
  // The first matching row in the inner join is the "primary" / main
  // address (`[ที่อยู่หลัก]` label); the remaining tb_address rows for
  // the same user (addressStatus=1, excluding the main) follow.
  const { data: mainAddrRow, error: mainAddrRowErr } = await admin
    .from("tb_address_main")
    .select("addressid")
    .eq("userid", memberCode)
    .maybeSingle<{ addressid: number | string | null }>();
  if (mainAddrRowErr) {
    console.error(`[tb_address_main list] failed`, { code: mainAddrRowErr.code, message: mainAddrRowErr.message });
  }
  const mainAddressId = mainAddrRow?.addressid ?? null;

  const { data: allAddrs, error: allAddrsErr } = await admin
    .from("tb_address")
    .select(
      "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
    )
    .eq("userid", memberCode)
    .eq("addressstatus", "1");
  if (allAddrsErr) {
    console.error(`[tb_address list] failed`, { code: allAddrsErr.code, message: allAddrsErr.message });
  }
  const addrs = ((allAddrs ?? []) as AddressRow[]).slice();
  // Sort: main first, then the rest by addressid.
  let mainAddr: AddressRow | undefined;
  const others: AddressRow[] = [];
  for (const a of addrs) {
    if (mainAddressId != null && String(a.addressid) === String(mainAddressId)) {
      mainAddr = a;
    } else {
      others.push(a);
    }
  }
  others.sort((a, b) => Number(a.addressid) - Number(b.addressid));

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme — same stylesheet the LIST + DETAIL pages load. */}
      <link rel="stylesheet" href="/legacy/pcs/service-import.css" />

      {/* BEGIN: Content — forwarder.php L432 (the L432-L879 list-body is the
          same screen as /service-import; the legacy keeps it rendered behind
          the modal so dismissing the modal lands on the list. Here we link
          back to the list explicitly — the modal owns this URL). */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb header — mirrors forwarder.php L437-446 + DETAIL L1707-1719. */}
          <div className="content-header row">
            <div className="content-header-left col-12 mb-2">
              <div className="row breadcrumbs-top ">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/dashboard">
                        <span className="menu-home">หน้าแรก</span>
                      </Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/service-import">รายการฝากนำเข้าสินค้า</Link>
                    </li>
                    <li className="breadcrumb-item active">เพิ่มรายการนำเข้า</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body pr110">
            {/* The legacy keeps the LIST body rendered here behind the modal;
                Pacred ships it as a separate route — the link offers an
                explicit dismiss back-to-list. */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12 p-05">
                  <div className="card border-black">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="text-center text-md-right">
                          <Link href="/service-import">
                            <button
                              type="button"
                              className="btn btn-block btn-rounded btn-warning"
                            >
                              <i className="fas fa-arrow-left"></i> กลับสู่รายการ
                            </button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ── #add-forwarder modal ── forwarder.php L881-1039 ──
              Transcribed 1:1 — same markup, same Thai labels, same Bootstrap-4
              classes. The Bootstrap-4 vendor JS in (protected)/layout.tsx
              opens the modal on the inline <script> below (mirrors
              forwarder.php L1061-1069). Form submit wired via
              <ServiceImportAddForm> Client Component → createLegacyForwarder
              Server Action (forwarder.php L9-160 `save` POST). Image upload
              (legacy L102-144 `fCover`) is NOT yet ported — submit ignores
              the file field; admin can attach photos via back-office. */}
          <div
            id="add-forwarder"
            className="modal fade in"
            tabIndex={-1}
            role="dialog"
            aria-hidden="true"
          >
            <div className="modal-dialog">
              <div className="modal-content header-from">
                <div className="modal-header">
                  <h4 className="modal-title">สร้างออเดอร์ฝากนำเข้าสินค้า</h4>
                  <div className="float-right text-right">
                    <a
                      href="/china-address"
                      target="_blank"
                      rel="noreferrer"
                      className="p-05 text-white badge badge-sale badge-pill font-1rem"
                    >
                      ที่อยู่โกดังจีน
                    </a>
                    <a
                      href="/services/import-china"
                      target="_blank"
                      rel="noreferrer"
                      className="p-05 text-white badge badge-warning badge-pill font-1rem"
                    >
                      เช็คเรทนำเข้า
                    </a>
                  </div>
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
                  <ServiceImportAddForm>
                    <div className="form-group mb-0">
                      {/* L895-922 — ข้อมูลการฝากนำเข้า */}
                      <div className="ele-forwarder-detail">
                        <h5 className="text-center">
                          <b>ข้อมูลการฝากนำเข้า</b>
                        </h5>
                        <div className="mb-05">
                          <label
                            className="form-control-label"
                            htmlFor="fTrackingCHN"
                          >
                            เลข Tracking
                          </label>
                          <input
                            className="form-control form-control-lg"
                            name="fTrackingCHN"
                            id="fTrackingCHN"
                            type="text"
                            placeholder="เลข Tracking"
                            maxLength={50}
                            required
                          />
                          <div id="message"></div>
                        </div>
                        <div className="row pr-1 pl-1 mb-05">
                          <div className="col-md-6 p-05">
                            <div className="">
                              <label
                                className="form-control-label"
                                htmlFor="fDetail"
                              >
                                รายละเอียด
                              </label>
                              <textarea
                                className="form-control"
                                rows={5}
                                name="fDetail"
                                placeholder="รายละเอียด"
                                maxLength={500}
                                required
                              ></textarea>
                            </div>
                          </div>
                          <div className="col-md-6 p-05">
                            <div className="">
                              <label
                                className="form-control-label"
                                htmlFor="fCover"
                              >
                                รูปสินค้า (ไม่บังคับ)
                              </label>
                              <div className="fallback">
                                <input
                                  type="file"
                                  name="fCover"
                                  className="dropify"
                                  accept="image/*"
                                  data-max-file-size="9M"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="mb-1">
                          <label className="form-control-label" htmlFor="fAmount">
                            จำนวนกล่อง
                          </label>
                          <input
                            className="form-control form-control-lg"
                            name="fAmount"
                            type="number"
                            min="1"
                            max="10000"
                            step="1"
                            pattern="\d*"
                            defaultValue="1"
                            required
                          />
                        </div>
                      </div>

                      {/* L924-970 — การขนส่งจากจีนมาไทย */}
                      <div className="mt-2 ele-forwarder-china-thai">
                        <h5 className="text-center">
                          <b>
                            การขนส่งจากจีนมาไทย{" "}
                            <i className="flag-icon flag-icon-ch"></i>
                          </b>
                        </h5>
                        <div className="row">
                          <div className="col-md-12">
                            <label
                              className="form-control-label mb-0"
                              htmlFor="hTransportType"
                            >
                              รูปแบบการขนส่งจีน-ไทย
                            </label>
                            <div className="row pr-1 pl-1">
                              <div className="col-md-6 p-05">
                                <fieldset
                                  className="border-checkbox-transportType border-checkbox cursor-pointer"
                                  // legacy `for="transportType-ek"` — preserved
                                  // verbatim even though <fieldset> doesn't use it
                                  data-for="transportType-ek"
                                >
                                  <input
                                    type="radio"
                                    className="radio-custom radio-custom-transportType cursor-pointer"
                                    name="hTransportType"
                                    value="1"
                                    id="transportType-ek"
                                  />
                                  <label
                                    htmlFor="transportType-ek"
                                    className="cursor-pointer radio-custom-label"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      data-for="input-ek"
                                      className="img-fluid"
                                      src="/legacy/pcs/assets/images/theme/transport-car-v3.png"
                                      style={{ maxHeight: "35px" }}
                                      alt=""
                                    />
                                    รถ (EK) 5-7 วัน
                                  </label>
                                </fieldset>
                              </div>
                              <div className="col-md-6 p-05">
                                <fieldset
                                  className="border-checkbox-transportType border-checkbox cursor-pointer"
                                  data-for="transportType-sea"
                                >
                                  <input
                                    type="radio"
                                    className="radio-custom radio-custom-transportType cursor-pointer"
                                    name="hTransportType"
                                    value="2"
                                    id="transportType-sea"
                                    defaultChecked
                                  />
                                  <label
                                    htmlFor="transportType-sea"
                                    className="cursor-pointer radio-custom-label"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      data-for="input-sea"
                                      className="img-fluid"
                                      src="/legacy/pcs/assets/images/theme/transport-sea-v3.png"
                                      style={{ maxHeight: "35px" }}
                                      alt=""
                                    />
                                    เรือ (SEA) 12-16 วัน
                                  </label>
                                </fieldset>
                              </div>
                            </div>
                          </div>
                          <div className="col-md-12">
                            <label
                              className="pt-05 form-control-label mb-0"
                              htmlFor="hTransportType"
                            >
                              การตีลังไม้สินค้า
                            </label>
                            <div className="row pr-1 pl-1">
                              <div className="col-md-6 p-05">
                                <fieldset
                                  className="border-checkbox-crate border-checkbox cursor-pointer active box-shadow"
                                  data-for="crate-1"
                                >
                                  <input
                                    type="radio"
                                    className="radio-custom radio-custom-crate cursor-pointer"
                                    name="crate"
                                    value="2"
                                    id="crate-1"
                                    defaultChecked
                                  />
                                  <label
                                    htmlFor="crate-1"
                                    className="cursor-pointer radio-custom-label"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      data-for="crate-1"
                                      className="img-fluid"
                                      src="/legacy/pcs/assets/images/theme/uncrate-v3.png"
                                      style={{ maxHeight: "35px" }}
                                      alt=""
                                    />
                                    ไม่ตีลังไม้
                                  </label>
                                </fieldset>
                              </div>
                              <div className="col-md-6 p-05">
                                <fieldset
                                  className="border-checkbox-crate border-checkbox cursor-pointer"
                                  data-for="crate-2"
                                >
                                  <input
                                    type="radio"
                                    className="radio-custom radio-custom-crate cursor-pointer"
                                    name="crate"
                                    value="1"
                                    id="crate-2"
                                  />
                                  <label
                                    htmlFor="crate-2"
                                    className="cursor-pointer radio-custom-label"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      data-for="crate-2"
                                      className="img-fluid"
                                      src="/legacy/pcs/assets/images/theme/crate-v3.png"
                                      style={{ maxHeight: "35px" }}
                                      alt=""
                                    />
                                    ตีลังไม้ (มีค่าบริการ)
                                  </label>
                                </fieldset>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* L972-1005 — ที่อยู่ในการจัดส่งในไทย */}
                      <div className="mt-2 ele-forwarder-thai">
                        <h5 className="text-center mb-05">
                          <b>
                            ที่อยู่ในการจัดส่งในไทย{" "}
                            <i className="flag-icon flag-icon-th"></i>
                          </b>{" "}
                          <Link
                            href="/addresses/add"
                            target="_blank"
                            className="text-info font-0_85rem"
                          >
                            เพิ่มที่อยู่ใหม่ <i className="fa fa-plus"></i>
                          </Link>
                        </h5>
                        <select
                          className="form-control"
                          name="addressID"
                          id="addressID"
                          required
                          defaultValue=""
                        >
                          <option value="">
                            กรุณาเลือกที่อยู่ในการจัดส่ง
                          </option>
                          {mainAddr && (
                            <option value={mainAddr.addressid}>
                              [ที่อยู่หลัก] {addressFull(mainAddr)}
                            </option>
                          )}
                          {others.map((a) => (
                            <option key={a.addressid} value={a.addressid}>
                              {addressFull(a)}
                            </option>
                          ))}
                          {(mainAddr || others.length > 0) && (
                            <option value="PCS">
                              รับเองหน้าโกดัง Pacred กทม
                            </option>
                          )}
                          {!mainAddr && others.length === 0 && (
                            <option value="PCS">
                              รับเองหน้าโกดัง Pacred กทม
                            </option>
                          )}
                        </select>
                        <div className="shipBy-select pt-1 mb-05">
                          {/* TODO(server-action): populate via getShipBy() AJAX
                              (forwarder.php L1095-1116). */}
                          <div id="selectShipBy"></div>
                        </div>
                        <div className="text-danger font-0_85rem">
                          หมายเหตุ : หากพื้นที่นอกเขตขนส่งของ Pacred
                          ทางบริษัทจะเก็บเงินปลายทางเท่านั้น ยกเว้น แฟลช
                          เอ็กซ์เพรส และ เจแอนด์ที เอ็กซ์เพรส
                          ที่เก็บต้นทางเท่านั้น{" "}
                          <a
                            href="/services/import-china"
                            target="_blank"
                            rel="noreferrer"
                          >
                            (เช็คพื้นที่ได้ที่นี่)
                          </a>
                        </div>
                      </div>

                      {/* L1007-1024 — โปรโมชันสำหรับคุณ */}
                      <div className="mt-2 ele-forwarder-pro">
                        <h5 className="text-center text-danger mb-05">
                          <b>โปรโมชันสำหรับคุณ</b>
                        </h5>
                        <div className="row">
                          <div className="col-12 col-md-6 maomao">
                            <fieldset className="border-main12-de cursor-pointer">
                              <div className="">
                                <input
                                  type="checkbox"
                                  className="checkboxes-color"
                                  style={{ display: "block" }}
                                  name="pro"
                                  id="input-12"
                                  value="f"
                                />
                              </div>
                              <label htmlFor="input-12" className="text-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  data-for="input-12"
                                  className="img-fluid cursor-pointer card-promotion"
                                  src="/legacy/pcs/theme/free50-3.png"
                                  alt=""
                                />
                                <br />
                                <a
                                  href="/services/import-china"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <span className="text-info">
                                    ดูพื้นที่จัดส่งและรายละเอียด
                                  </span>
                                </a>
                              </label>
                            </fieldset>
                          </div>
                        </div>
                        <div className="" style={{}}>
                          <span className="text-danger font-0_85rem">
                            *หากสินค้ามีขนาดเล็ก บริษัทแนะนำให้เลือกขนส่ง Flash
                            Express (เริ่มต้น 30 บ.)
                            <br />
                          </span>
                        </div>
                      </div>

                      {/* L1030-1033 — modal footer */}
                      <div className="mt-2 modal-footer">
                        <button
                          type="reset"
                          className="btn btn-outline-secondary round waves-effect"
                          data-dismiss="modal"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="submit"
                          className="btn btn-color-main round waves-effect"
                          name="save"
                          id="btnSubmit"
                        >
                          สร้างออเดอร์
                        </button>
                      </div>
                    </div>
                  </ServiceImportAddForm>
                </div>
              </div>
            </div>
          </div>

          {/* forwarder.php L1040 — pay-modal target div (kept for parity) */}
          <div id="list-forwarder-data"></div>

          {/* ── #pro-maomao modal ── forwarder.php L1041-1058 ── */}
          <div
            id="pro-maomao"
            className="modal fade in"
            tabIndex={-1}
            role="dialog"
            aria-hidden="true"
          >
            <div className="pcs-notify modal-dialog modal-sm">
              <div
                className="modal-content modal-content-pcs"
                style={{ backgroundColor: "unset" }}
              >
                <div className="modal-header">
                  <span className="text-white font-1_7rem">
                    คุณได้รับสิทธิ์ร่วมโปรโมชัน Pacred เหมา ๆ{" "}
                  </span>
                  <button
                    type="button"
                    className="close text-white"
                    data-dismiss="modal"
                    aria-hidden="true"
                    style={{
                      opacity: 1,
                      border: "2px solid",
                      borderRadius: "20px",
                    }}
                  >
                    <i
                      className="la la-close text-white"
                      style={{ fontSize: "1.5rem" }}
                    ></i>
                  </button>
                </div>
                <div className="modal-body">
                  <div className="bg-pro-valentine">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/legacy/pcs/theme/free50-3.png"
                      className="img-fluid"
                      alt=""
                    />
                  </div>
                  <div
                    className="modal-footer text-center"
                    style={{ display: "inherit" }}
                  >
                    <span
                      className="btn btn-main round btn-min-width animate__animated animate__infinite animate__headShake cursor-pointer"
                      id="btn-getMaoMao"
                    >
                      รับโปรโมชัน เหมา ๆ
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* forwarder.php L1061-1069 — the `?page=='add'` auto-show <script>.
          Re-emitted verbatim so the modal opens once Bootstrap-4 + jQuery
          (staged globally by (protected)/layout.tsx) have resolved. */}
      <Script
        id="service-import-add-auto-open"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `if (window.jQuery) { window.jQuery(function ($) { $("#add-forwarder").modal("show"); }); } else { document.addEventListener("DOMContentLoaded", function () { if (window.jQuery) window.jQuery("#add-forwarder").modal("show"); }); }`,
        }}
      />
      {/* END: Content */}
    </div>
  );
}
