import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { addAddressAction } from "./add-address-action";

/**
 * Customer Thai delivery-address screen — a FAITHFUL 1:1 TRANSCRIPTION
 * of the legacy PCS Cargo `member/address.php` (D1 / ADR-0017 · the
 * faithful-port transcription workstream · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is the
 * exact HTML markup `address.php` renders — same elements, same
 * Bootstrap-4 class names, same structure, same labels, same order,
 * same Thai text. The visual identity comes from the legacy CSS,
 * brought in verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/address.css`, loaded via a plain `<link>` so it
 * bypasses the app's Tailwind v4 / PostCSS pipeline.
 *
 * `address.php` source structure transcribed here (lines 410-584):
 *   .app-content > .content-wrapper > .content-body.pr110
 *     > section#basic-carousel > .row > .col-md-12 > .card.p-1
 *       1. .row — header: <h3> "ที่อยู่จัดส่งสินค้าในไทย"
 *          + the green circle "เพิ่มที่อยู่" button (links address/add)
 *       2. .card-content > .card-body > .row > .col-12
 *          > .table-responsive > table#myTable — the address LIST
 *          (DataTable; 4 columns: ลำดับ / ชื่อสถานที่ / หมายเหตุ / ตัวเลือก)
 *       3. #add-address .modal — the add-address <form> (POST)
 *       4. #edit-Address (empty — jQuery AJAX target) + .message
 *
 * Like the menu.php pilot, only the legacy `.app-content` content body
 * is transcribed — the legacy navbar / left-menu / footer chrome is the
 * Pacred protected-area app shell (the (protected) layout), not part of
 * this screen.
 *
 * Data — every `address.php` mysqli query transcribed 1:1 to the ported
 * legacy `tb_*` schema (Supabase). `tb_*` is RLS-locked to service_role,
 * so reads go through the admin client; the join key is
 * `tb_address.userid === profile.member_code` (the customer's "PR<n>"
 * code — the legacy varchar(10) `userID`).
 *   - the address list      → tb_address WHERE userID=… AND
 *                             addressStatus='1' ORDER BY addressID DESC
 *                             (address.php L455-456)
 *   - the main-address mark → tb_address_main WHERE userID=…
 *                             (address.php L601-608)
 *   - the prefilled name/tel on the add form → $_SESSION userName /
 *     userLastName / userTel, which header.php fills from tb_users
 *     (header.php L21-24) — read here from tb_users.
 *
 * Form handling: the add-address <form> POST handler (address.php
 * L5-77 — INSERT INTO tb_address + conditional INSERT INTO
 * tb_address_main) is transcribed 1:1 into the Server Action
 * `addAddressAction` (`./add-address-action.ts`).
 *
 * Rebrand: legacy `PCS<n>` → `PR<n>` (member codes) + "PCS Cargo" →
 * "PR Cargo" branding text only. Nothing else changed.
 *
 * Not strictly 1:1 — documented, never silently diverged:
 *   - jQuery DataTables (#myTable search/sort/paginate), jQuery.Thailand
 *     subdistrict→zipcode autocomplete (#demo1), and the Google Maps
 *     pin-drop (#map) are legacy jQuery plugins not present in the app.
 *     The markup is rendered 1:1 (so it is visually identical) but those
 *     interactions are inert — the table is a plain Bootstrap-4 table,
 *     the #demo1 fields stay visible (legacy hides them until the
 *     plugin's onLoad fires), and the #map div is an empty placeholder.
 *   - The add-address modal opens via a jQuery `.modal('show')` in the
 *     legacy. Here the modal markup is transcribed 1:1; with no jQuery
 *     it stays at its CSS default (hidden) — matching the legacy
 *     pre-trigger state. The "เพิ่มที่อยู่" button links to address/add
 *     exactly as the legacy <a href> does.
 *   - editAddress / deleteAddress / setMainAddress are legacy AJAX
 *     calls (page.address.js → include/pages/address/*.php). The three
 *     row buttons are rendered 1:1 but their onclick handlers are not
 *     wired — porting those endpoints is a separate screen/action.
 *   - The success/error SweetAlert popups (address.php L686-724) are the
 *     jQuery SweetAlert2 plugin — not reproduced.
 */

// address.php list-row query (L455) builds two CONCAT strings in SQL.
// PostgREST cannot express a CONCAT in select(), so the exact same
// strings are assembled here from the raw tb_address columns — the
// output is byte-identical to the legacy `fullAddress` / `fullAddress2`.
type AddressRow = {
  addressid: number;
  addressname: string | null;
  addresslastname: string | null;
  addresstel: string | null;
  addresstel2: string | null;
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
  addressnote: string | null;
};

export default async function AddressesPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const userID = profile.member_code ?? "";

  // ── Transcribed queries ──────────────────────────────────────
  // address.php L455-456 — the address list:
  //   SELECT … FROM tb_address WHERE userID='$userID'
  //   AND addressStatus='1' ORDER BY addressID DESC
  // header.php L21-24 — $_SESSION userName/userLastName/userTel that
  //   the add form prefills, sourced from tb_users.
  // address.php L601 — the main address mark:
  //   SELECT CONCAT('btnAddressMain',addressID) FROM tb_address_main
  //   WHERE userID='$userID'
  const [addressRes, userRowRes, mainRes] = await Promise.all([
    admin
      .from("tb_address")
      .select(
        "addressid, addressname, addresslastname, addresstel, addresstel2, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote",
      )
      .eq("userid", userID)
      .eq("addressstatus", "1")
      .order("addressid", { ascending: false }),
    admin
      .from("tb_users")
      .select("username, userlastname, usertel")
      .eq("userid", userID)
      .maybeSingle<{
        username: string | null;
        userlastname: string | null;
        usertel: string | null;
      }>(),
    admin
      .from("tb_address_main")
      .select("addressid")
      .eq("userid", userID)
      .maybeSingle<{ addressid: number | null }>(),
  ]);

  const addresses = (addressRes.data ?? []) as AddressRow[];

  // $_SESSION['userName'] / userLastName / userTel — the add-form prefill.
  const userName = userRowRes.data?.username ?? "";
  const userLastName = userRowRes.data?.userlastname ?? "";
  const userTel = userRowRes.data?.usertel ?? "";

  // address.php L601-608 — the addressID that is the customer's main
  // address; the matching row swaps its "ตั้งเป็นที่อยู่หลัก" button
  // for a static "ที่อยู่หลัก" button.
  const mainAddressID = mainRes.data?.addressid ?? null;

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS stylesheet — static public/ asset, loaded via a plain
          <link> so it bypasses the app's Tailwind/PostCSS pipeline. */}
      <link rel="stylesheet" href="/legacy/pcs/address.css" />

      {/* address.php <title> L127 (Next.js owns <head> — kept here as a
          comment for the fidelity record):
          ที่อยู่จัดส่งสินค้าในไทย | PR Cargo */}

      {/* BEGIN: Content — address.php L410 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-body pr110">
            {/* Basic Carousel start — address.php L415 */}
            <section id="basic-carousel">
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card p-1">
                    {/* L420-438 — header: title + add-address button */}
                    <div className="row">
                      <div className="content-header-left col-md-6 col-12">
                        <div className="text-center text-md-left">
                          <h3 className="">ที่อยู่จัดส่งสินค้าในไทย</h3>
                        </div>
                      </div>
                      <div className="content-header-right col-md-6 col-12">
                        <div className="float-md-right">
                          <div className="text-center text-md-right">
                            {/* address.php L429 — the legacy <a> points at
                                `address/add`, a URL-rewrite alias of THIS
                                same address.php screen with the add-modal
                                pre-opened (the `isset($_GET["page"])` branch,
                                L590-598). There is no separate add page —
                                so the link stays on /addresses, carrying the
                                legacy `?page` flag that the modal-open JS
                                keyed off. */}
                            <Link href="/addresses?page=1">
                              <button className="btn btn-sm btn-circle btn-success text-white">
                                <i className="ft-plus"></i>
                              </button>
                              <span className="font-normal text-dark">เพิ่มที่อยู่</span>
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* L439-487 — the address list table */}
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          <div className="col-12">
                            <div className="table-responsive ml--10">
                              <table
                                id="myTable"
                                className="table display table-bordered table-striped no-wrap dataTable no-footer dtr-inline"
                              >
                                <thead>
                                  <tr className="text-center">
                                    <th>ลำดับ</th>
                                    <th>ชื่อสถานที่</th>
                                    <th>หมายเหตุ</th>
                                    <th>ตัวเลือก</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* address.php L454-480 — one <tr> per
                                      tb_address row. The legacy builds
                                      `fullAddress` (with <br>) + the
                                      onclick payload `fullAddress2` in
                                      SQL CONCAT; reproduced identically. */}
                                  {/* The three row buttons carry legacy
                                      `onclick="deleteAddress(…)/editAddress(…)/
                                      setMainAddress(…)"` HTML attributes that
                                      invoke jQuery AJAX (page.address.js).
                                      Those handlers are NOT ported — the
                                      buttons are rendered 1:1 visually; the
                                      inert `onclick` string is omitted (a
                                      string is not a valid React handler and
                                      would not run anyway). The `data-*`
                                      onclick payload is kept on a `data-`
                                      attribute so the integrator can re-wire
                                      it when the endpoints are ported. */}
                                  {addresses.map((row, idx) => {
                                    const no = idx + 1;
                                    // fullAddress — the legacy CONCAT
                                    // (address.php L455), with <br>:
                                    const fullAddress =
                                      `คุณ${row.addressname ?? ""} ${row.addresslastname ?? ""}<br>` +
                                      `${row.addressno ?? ""} ตำบล/แขวง ${row.addresssubdistrict ?? ""}<br>` +
                                      ` อำเภอ/เขต ${row.addressdistrict ?? ""} จังหวัด ${row.addressprovince ?? ""} ${row.addresszipcode ?? ""}<br>` +
                                      `โทร. ${row.addresstel ?? ""}, ${row.addresstel2 ?? ""}`;
                                    // fullAddress2 — the onclick CONCAT
                                    // (address.php L455), no <br>:
                                    const fullAddress2 =
                                      `คุณ${row.addressname ?? ""} ${row.addresslastname ?? ""} ` +
                                      `${row.addressno ?? ""} ตำบล/แขวง ${row.addresssubdistrict ?? ""} ` +
                                      `อำเภอ/เขต ${row.addressdistrict ?? ""} จังหวัด ${row.addressprovince ?? ""} ${row.addresszipcode ?? ""}`;
                                    const isMain = mainAddressID === row.addressid;
                                    return (
                                      <tr key={row.addressid}>
                                        <td>{no}</td>
                                        <td
                                          dangerouslySetInnerHTML={{ __html: fullAddress }}
                                        ></td>
                                        <td>{row.addressnote}</td>
                                        <td className="text-center">
                                          <button
                                            type="button"
                                            className="mb-1 btn btn-outline-danger btn-rounded btn-sm waves-effect waves-light"
                                            data-address-id={row.addressid}
                                            data-full-address={fullAddress2}
                                            data-legacy-onclick={`deleteAddress('${row.addressid}','${fullAddress2}')`}
                                            title="ลบข้อมูล"
                                          >
                                            ลบที่อยู่
                                          </button>
                                          <button
                                            type="button"
                                            className="mb-1 btn btn-outline-warning btn-rounded btn-sm waves-effect waves-light"
                                            data-address-id={row.addressid}
                                            data-legacy-onclick={`editAddress('${row.addressid}')`}
                                            title="แก้ไขข้อมูล"
                                          >
                                            {" "}
                                            แก้ไขที่อยู่{" "}
                                          </button>
                                          <div
                                            id={`btnAddressMain${row.addressid}`}
                                            style={{ display: "inline-block" }}
                                          >
                                            {isMain ? (
                                              // address.php L605 — the main
                                              // address shows a static
                                              // "ที่อยู่หลัก" button.
                                              <button className=" mb-1 btn btn-sm waves-effect waves-light btn-outline-danger btn-rounded">
                                                ที่อยู่หลัก
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                className="mb-1 btn btn-sm waves-effect waves-light btn-outline-info btn-rounded"
                                                data-address-id={row.addressid}
                                                data-full-address={fullAddress2}
                                                data-legacy-onclick={`setMainAddress('${row.addressid}','${fullAddress2}')`}
                                              >
                                                ตั้งเป็นที่อยู่หลัก
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* L489-573 — the add-address modal. Transcribed 1:1;
                        with no jQuery `.modal('show')` it stays hidden at
                        its CSS default (the legacy pre-trigger state). */}
                    <div
                      id="add-address"
                      className="modal fade in"
                      tabIndex={-1}
                      role="dialog"
                      aria-hidden="true"
                    >
                      <div className="modal-dialog">
                        <div className="modal-content header-from">
                          <div className="modal-header">
                            <h4 className="modal-title">เพิ่มที่อยู่จัดส่งสินค้า</h4>
                            <button
                              type="button"
                              className="close"
                              data-dismiss="modal"
                              aria-hidden="true"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                width="24"
                                height="24"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="css-i6dzq1"
                              >
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                            </button>
                          </div>
                          <div className="modal-body header-from">
                            {/* address.php L497 — the legacy form POSTs
                                to address/; here it submits to the
                                addAddressAction Server Action. */}
                            <form
                              className="form-horizontal"
                              action={addAddressAction}
                              autoComplete="off"
                            >
                              <input type="hidden" name="latitude" id="latitude" />
                              <input type="hidden" name="longitude" id="longitude" />
                              <div className="form-group">
                                <div className="row">
                                  <div className="col-6">
                                    <div className="mb-1">
                                      <label className="form-control-label" htmlFor="addressName">
                                        ชื่อจริง
                                      </label>
                                      <input
                                        className="form-control "
                                        name="addressName"
                                        type="text"
                                        defaultValue={userName}
                                        placeholder="ชื่อจริง"
                                        maxLength={200}
                                        required
                                      />
                                    </div>
                                  </div>
                                  <div className="col-6">
                                    <div className="mb-1">
                                      <label
                                        className="form-control-label"
                                        htmlFor="addressLastname"
                                      >
                                        นามสกุล
                                      </label>
                                      <input
                                        className="form-control "
                                        name="addressLastname"
                                        type="text"
                                        defaultValue={userLastName}
                                        placeholder="นามสกุล"
                                        maxLength={200}
                                        required
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div className="row">
                                  <div className="col-6">
                                    <div className="mb-1">
                                      <label className="form-control-label" htmlFor="addressTel">
                                        เบอร์โทรศัพท์ (สำหรับแจ้งส่งพัสดุ)
                                      </label>
                                      <input
                                        className="form-control "
                                        name="addressTel"
                                        type="tel"
                                        pattern="\d*"
                                        defaultValue={userTel}
                                        placeholder="เบอร์โทร"
                                        minLength={10}
                                        maxLength={10}
                                        required
                                      />
                                    </div>
                                  </div>
                                  <div className="col-6">
                                    <div className="mb-1">
                                      <label className="form-control-label" htmlFor="addressTel2">
                                        เบอร์โทรศัพท์สำรอง (ไม่จำเป็น)
                                      </label>
                                      <input
                                        className="form-control "
                                        name="addressTel2"
                                        type="tel"
                                        pattern="\d*"
                                        placeholder="เบอร์โทร"
                                        minLength={10}
                                        maxLength={10}
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div className="mb-1">
                                  <label className="form-control-label" htmlFor="addressNo">
                                    ทึ่อยู่{" "}
                                    <span className="text-danger">
                                      ชื่อหมู่บ้านและหมู่ที่*
                                    </span>
                                  </label>
                                  <input
                                    className="form-control "
                                    name="addressNo"
                                    type="text"
                                    placeholder="บ้านเลขที่ ถนน ซอย ชื่อหมู่บ้านและหมู่ที่*"
                                    maxLength={200}
                                    required
                                  />
                                  <div className="input-info">
                                    {" "}
                                    กรุณากรอกบ้านเลขที่ ถนน ซอย ชื่อหมู่บ้านและหมู่ที่
                                  </div>
                                </div>
                                <div
                                  id="demo1"
                                  className="demo"
                                  style={{ display: "none" }}
                                >
                                  <div className="mb-1">
                                    <label className="form-control-label" htmlFor="district">
                                      ตำบล/แขวง
                                    </label>
                                    <input
                                      id="district"
                                      className="form-control "
                                      name="district"
                                      type="text"
                                      placeholder="ตำบล/แขวง"
                                      required
                                    />
                                  </div>
                                  <div className="mb-1">
                                    <label className="form-control-label" htmlFor="amphoe">
                                      อำเภอ/เขต
                                    </label>
                                    <input
                                      id="amphoe"
                                      className="form-control "
                                      name="amphoe"
                                      type="text"
                                      placeholder="อำเภอ/เขต"
                                      required
                                    />
                                  </div>
                                  <div className="mb-1">
                                    <label className="form-control-label" htmlFor="province">
                                      จังหวัด
                                    </label>
                                    <input
                                      id="province"
                                      className="form-control "
                                      name="province"
                                      type="text"
                                      placeholder="จังหวัด"
                                      required
                                    />
                                  </div>
                                  <div className="mb-1">
                                    <label className="form-control-label" htmlFor="zipcode">
                                      รหัสไปรษณีย์
                                    </label>
                                    <input
                                      id="zipcode"
                                      className="form-control "
                                      name="zipcode"
                                      type="text"
                                      pattern="\d*"
                                      placeholder="รหัสไปรษณีย์"
                                      required
                                    />
                                  </div>
                                </div>
                                <div>
                                  <div className="bg-danger2 p-05">
                                    <h5>ปักหมุดตำแหน่งของคุณ</h5>
                                    เราจะจัดส่งสินค้าไปยังตำแหน่งที่ปักหมุดไว้
                                    กรุณาตรวจสอบตำแหน่งของคุณ หากปักหมุดไม่ตรง
                                    กรุณาคลิกที่หมุดเพื่อแก้ไข
                                  </div>
                                  <div id="map" className="gmaps" style={{ height: "350px" }}></div>
                                </div>
                                <div className="mb-1">
                                  <label className="form-control-label" htmlFor="addressNote">
                                    หมายเหตุ (ไม่จำเป็น)
                                  </label>
                                  <textarea
                                    className="form-control"
                                    rows={3}
                                    name="addressNote"
                                    placeholder="หมายเหตุ"
                                    maxLength={500}
                                  ></textarea>
                                </div>

                                <div className="modal-footer">
                                  <button
                                    type="button"
                                    className="btn btn-outline-secondary round btn-min-width waves-effect"
                                    data-dismiss="modal"
                                  >
                                    ยกเลิก
                                  </button>
                                  <button
                                    type="submit"
                                    name="add"
                                    className="btn btn-outline-info round btn-min-width waves-effect"
                                  >
                                    บันทึก
                                  </button>
                                </div>
                              </div>
                            </form>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* address.php L577-578 — jQuery AJAX targets */}
              <div id="edit-Address"></div>
              <div className="message"></div>
            </section>
            {/* Basic Carousel end — address.php L580 */}
          </div>
        </div>
      </div>
      {/* END: Content — address.php L584 */}
    </div>
  );
}
