import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { MapPin, Plus, Inbox } from "lucide-react";
import { addAddressAction } from "./add-address-action";

/**
 * Customer Thai delivery-address screen — ported from the legacy PCS Cargo
 * `member/address.php` (D1 / ADR-0017 · faithful-port workstream · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * ── Tailwind rebuild (2026-05-30 · ปอน) ──
 * The page's WORKFLOW is the legacy address.php list (same data fields,
 * same address list, same "เพิ่มที่อยู่" → add-address modal, same per-row
 * ลบ/แก้ไข/ตั้งเป็นที่อยู่หลัก buttons, same add-address <form> POSTing to
 * `addAddressAction`); the CHROME is now our own Tailwind, mobile-first
 * design (per AGENTS.md §0a — "we copy the working system, polish the look
 * ourselves"). Same approach already shipped on /service-payment +
 * /service-import: list = responsive cards on phone, table on desktop. NO
 * data / relation / query / href / form contract changed — pure
 * presentation. `.pcs-legacy` + address.css are kept for any layout-scope
 * globals; the Bootstrap-4 chrome + #myTable DataTables grid are gone.
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
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred. Nothing else changed.
 *
 * NOT reproduced (deliberate · flagged for the integrator):
 *   - jQuery DataTables (#myTable search/sort/paginate), jQuery.Thailand
 *     subdistrict→zipcode autocomplete (#demo1), and the Google Maps
 *     pin-drop (#map) are legacy jQuery plugins not present in the app.
 *     The #demo1 fields + #map div are rendered (so the add form keeps the
 *     same fields) but those interactions are inert.
 *   - editAddress / deleteAddress / setMainAddress are legacy AJAX calls
 *     (page.address.js → include/pages/address/*.php). The three row
 *     buttons are rendered; their legacy `onclick` payloads are preserved
 *     as `data-legacy-onclick` so the integrator can re-wire them when the
 *     endpoints are ported.
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

export default async function AddressesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  // The legacy "เพิ่มที่อยู่" button links to `/addresses?page=1`, and the
  // legacy jQuery's URL-rewrite handler then opens the add-address modal
  // via `$('#add-address').modal('show')`. We replicate by reading the
  // searchParam server-side + rendering the modal with `show` class +
  // inline `display: block` + a `.modal-backdrop` div so it shows on
  // load without any JS.
  const sp = await searchParams;
  const isAddModalOpen = sp?.page === "1" || sp?.page === "add";

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
      .select("userName, userLastName, userTel")
      .eq("userID", userID)
      .maybeSingle<{
        userName: string | null;
        userLastName: string | null;
        userTel: string | null;
      }>(),
    admin
      .from("tb_address_main")
      .select("addressid")
      .eq("userid", userID)
      .maybeSingle<{ addressid: number | null }>(),
  ]);

  const addresses = (addressRes.data ?? []) as AddressRow[];

  // $_SESSION['userName'] / userLastName / userTel — the add-form prefill.
  const userName = userRowRes.data?.userName ?? "";
  const userLastName = userRowRes.data?.userLastName ?? "";
  const userTel = userRowRes.data?.userTel ?? "";

  // address.php L601-608 — the addressID that is the customer's main
  // address; the matching row swaps its "ตั้งเป็นที่อยู่หลัก" button
  // for a static "ที่อยู่หลัก" button.
  const mainAddressID = mainRes.data?.addressid ?? null;

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — kept for layout-scope globals (.pcs-content-pad
          padding etc.). The visible surface below is Tailwind. */}
      <link rel="stylesheet" href="/legacy/pcs/address.css" />

      {/* address.php <title> L127 (Next.js owns <head> — kept here as a
          comment for the fidelity record):
          ที่อยู่จัดส่งสินค้าในไทย | Pacred */}

      <div className="pcs-content-pad w-full px-3 md:px-6 pt-3 pb-24 md:py-6">
        <section className="bg-white dark:bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          {/* ── Header: title + ที่อยู่โกดังจีน link + เพิ่มที่อยู่ CTA ──
              Pacred-fidelity addition (d1-fidelity-customer.md §9.2): legacy
              customers reach "ที่อยู่โกดังจีน" from the top-bar dropdown.
              Surface the same link here — the most common follow-up action
              for a customer who just shipped from a Thai address. */}
          <div className="flex flex-col gap-2.5 border-b border-border px-3 py-3 md:flex-row md:items-center md:justify-between md:px-5 md:py-4">
            <h1 className="flex items-center gap-2 text-base md:text-xl font-bold text-foreground">
              <MapPin className="h-5 w-5 md:h-6 md:w-6 shrink-0 text-primary-600" />
              <span>ที่อยู่จัดส่งสินค้าในไทย</span>
            </h1>
            <div className="flex items-center gap-3">
              {/* Pacred fidelity-addition link — routes to the existing
                  /china-address page. */}
              <Link
                href="/china-address"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
              >
                <MapPin className="h-4 w-4" />
                <span>ที่อยู่โกดังจีน</span>
              </Link>
              {/* address.php L429 — the legacy <a> points at `address/add`,
                  a URL-rewrite alias of THIS same screen with the add-modal
                  pre-opened. The link stays on /addresses, carrying the
                  legacy `?page` flag that the modal-open logic keys off. */}
              <Link
                href="/addresses?page=1"
                className="inline-flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 py-2 pl-2 pr-4 text-sm font-semibold text-white shadow-sm transition-colors"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/25">
                  <Plus className="h-4 w-4" />
                </span>
                เพิ่มที่อยู่
              </Link>
            </div>
          </div>

          {/* ── The address list ── */}
          <div className="px-3 py-3 md:px-5 md:py-4">
            {addresses.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Inbox className="h-10 w-10 text-muted/50" />
                <p className="text-sm text-muted">ยังไม่มีที่อยู่จัดส่ง</p>
                <Link
                  href="/addresses?page=1"
                  className="mt-1 text-sm font-semibold text-emerald-600 hover:underline"
                >
                  + เพิ่มที่อยู่แรก
                </Link>
              </div>
            ) : (
              <>
                {/* ── Mobile: stacked cards (no horizontal scroll) ── */}
                <div className="space-y-3 md:hidden">
                  {addresses.map((row, idx) => {
                    const no = idx + 1;
                    // fullAddress — the legacy CONCAT (address.php L455),
                    // with <br>:
                    const fullAddress =
                      `คุณ${row.addressname ?? ""} ${row.addresslastname ?? ""}<br>` +
                      `${row.addressno ?? ""} ตำบล/แขวง ${row.addresssubdistrict ?? ""}<br>` +
                      ` อำเภอ/เขต ${row.addressdistrict ?? ""} จังหวัด ${row.addressprovince ?? ""} ${row.addresszipcode ?? ""}<br>` +
                      `โทร. ${row.addresstel ?? ""}, ${row.addresstel2 ?? ""}`;
                    // fullAddress2 — the onclick CONCAT (address.php L455),
                    // no <br>:
                    const fullAddress2 =
                      `คุณ${row.addressname ?? ""} ${row.addresslastname ?? ""} ` +
                      `${row.addressno ?? ""} ตำบล/แขวง ${row.addresssubdistrict ?? ""} ` +
                      `อำเภอ/เขต ${row.addressdistrict ?? ""} จังหวัด ${row.addressprovince ?? ""} ${row.addresszipcode ?? ""}`;
                    const isMain = mainAddressID === row.addressid;
                    return (
                      <div
                        key={row.addressid}
                        className="rounded-xl border border-border bg-white dark:bg-surface p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-muted">
                            ลำดับ {no}
                          </span>
                          {isMain && (
                            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">
                              ที่อยู่หลัก
                            </span>
                          )}
                        </div>
                        <p
                          className="mt-1.5 text-sm leading-relaxed text-foreground"
                          dangerouslySetInnerHTML={{ __html: fullAddress }}
                        />
                        {row.addressnote && (
                          <p className="mt-1.5 border-t border-dashed border-border pt-1.5 text-xs text-muted">
                            หมายเหตุ: {row.addressnote}
                          </p>
                        )}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-2.5">
                          <button
                            type="button"
                            className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            data-address-id={row.addressid}
                            data-full-address={fullAddress2}
                            data-legacy-onclick={`deleteAddress('${row.addressid}','${fullAddress2}')`}
                            title="ลบข้อมูล"
                          >
                            ลบที่อยู่
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-amber-300 px-3 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50"
                            data-address-id={row.addressid}
                            data-legacy-onclick={`editAddress('${row.addressid}')`}
                            title="แก้ไขข้อมูล"
                          >
                            แก้ไขที่อยู่
                          </button>
                          <div
                            id={`btnAddressMain${row.addressid}`}
                            className="inline-block"
                          >
                            {isMain ? (
                              // address.php L605 — the main address shows a
                              // static "ที่อยู่หลัก" button.
                              <button className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600">
                                ที่อยู่หลัก
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="rounded-full border border-sky-300 px-3 py-1 text-xs font-medium text-sky-600 hover:bg-sky-50"
                                data-address-id={row.addressid}
                                data-full-address={fullAddress2}
                                data-legacy-onclick={`setMainAddress('${row.addressid}','${fullAddress2}')`}
                              >
                                ตั้งเป็นที่อยู่หลัก
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Desktop: table. Wrapper carries hidden/block so the
                    legacy `.dataTable` display cascade (address.css) cannot
                    override it. ── */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
                  <table
                    id="myTable"
                    className="dataTable w-full text-sm"
                  >
                    <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-4 py-3 font-medium">ลำดับ</th>
                        <th className="px-4 py-3 font-medium">ชื่อสถานที่</th>
                        <th className="px-4 py-3 font-medium">หมายเหตุ</th>
                        <th className="px-4 py-3 text-center font-medium">ตัวเลือก</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* address.php L454-480 — one <tr> per tb_address row.
                          The legacy builds `fullAddress` (with <br>) + the
                          onclick payload `fullAddress2` in SQL CONCAT;
                          reproduced identically. The three row buttons carry
                          legacy `onclick` payloads as `data-legacy-onclick`
                          (page.address.js) so the integrator can re-wire them
                          when the endpoints are ported. */}
                      {addresses.map((row, idx) => {
                        const no = idx + 1;
                        const fullAddress =
                          `คุณ${row.addressname ?? ""} ${row.addresslastname ?? ""}<br>` +
                          `${row.addressno ?? ""} ตำบล/แขวง ${row.addresssubdistrict ?? ""}<br>` +
                          ` อำเภอ/เขต ${row.addressdistrict ?? ""} จังหวัด ${row.addressprovince ?? ""} ${row.addresszipcode ?? ""}<br>` +
                          `โทร. ${row.addresstel ?? ""}, ${row.addresstel2 ?? ""}`;
                        const fullAddress2 =
                          `คุณ${row.addressname ?? ""} ${row.addresslastname ?? ""} ` +
                          `${row.addressno ?? ""} ตำบล/แขวง ${row.addresssubdistrict ?? ""} ` +
                          `อำเภอ/เขต ${row.addressdistrict ?? ""} จังหวัด ${row.addressprovince ?? ""} ${row.addresszipcode ?? ""}`;
                        const isMain = mainAddressID === row.addressid;
                        return (
                          <tr
                            key={row.addressid}
                            className="border-t border-border align-top hover:bg-surface-alt/30"
                          >
                            <td className="px-4 py-3 text-xs text-muted">{no}</td>
                            <td
                              className="px-4 py-3 text-sm leading-relaxed text-foreground"
                              dangerouslySetInnerHTML={{ __html: fullAddress }}
                            ></td>
                            <td className="px-4 py-3 text-xs text-muted">
                              {row.addressnote}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                                  data-address-id={row.addressid}
                                  data-full-address={fullAddress2}
                                  data-legacy-onclick={`deleteAddress('${row.addressid}','${fullAddress2}')`}
                                  title="ลบข้อมูล"
                                >
                                  ลบที่อยู่
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full border border-amber-300 px-3 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50"
                                  data-address-id={row.addressid}
                                  data-legacy-onclick={`editAddress('${row.addressid}')`}
                                  title="แก้ไขข้อมูล"
                                >
                                  แก้ไขที่อยู่
                                </button>
                                <div
                                  id={`btnAddressMain${row.addressid}`}
                                  className="inline-block"
                                >
                                  {isMain ? (
                                    // address.php L605 — the main address
                                    // shows a static "ที่อยู่หลัก" button.
                                    <button className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600">
                                      ที่อยู่หลัก
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="rounded-full border border-sky-300 px-3 py-1 text-xs font-medium text-sky-600 hover:bg-sky-50"
                                      data-address-id={row.addressid}
                                      data-full-address={fullAddress2}
                                      data-legacy-onclick={`setMainAddress('${row.addressid}','${fullAddress2}')`}
                                    >
                                      ตั้งเป็นที่อยู่หลัก
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {/* ── The add-address modal. Restyled to a clean Tailwind dialog, but
          the `id="add-address"` + `modal fade` classes + `data-dismiss`
          attrs + the `isAddModalOpen` show logic are KEPT verbatim so the
          legacy Bootstrap-4 jQuery (`.modal('show')` via ?page=1) still
          opens/closes it. The <form action={addAddressAction}> contract +
          every input name/id/type/defaultValue/pattern/required + the hidden
          lat/long + #demo1 + #map are preserved 1:1. ── */}
      {isAddModalOpen && (
        <div className="modal-backdrop fixed inset-0 z-[1040] bg-black/50" />
      )}
      <div
        id="add-address"
        className={`modal fade ${isAddModalOpen ? "in show" : "in"} ${
          isAddModalOpen
            ? "fixed inset-0 z-[1050] flex items-start justify-center overflow-y-auto p-3 md:p-6"
            : ""
        }`}
        tabIndex={-1}
        role="dialog"
        aria-hidden={!isAddModalOpen}
        style={isAddModalOpen ? { display: "block" } : undefined}
      >
        <div className="modal-dialog mx-auto w-full max-w-[640px]">
          <div className="modal-content header-from rounded-2xl border border-border bg-white dark:bg-surface shadow-xl">
            <div className="modal-header flex items-center justify-between border-b border-border px-4 py-3 md:px-5 md:py-4">
              <h4 className="modal-title text-base md:text-lg font-bold text-foreground">
                เพิ่มที่อยู่จัดส่งสินค้า
              </h4>
              <button
                type="button"
                className="close inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-foreground"
                data-dismiss="modal"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
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
            <div className="modal-body header-from px-4 py-4 md:px-5">
              {/* address.php L497 — the legacy form POSTs to address/; here
                  it submits to the addAddressAction Server Action. */}
              <form
                className="form-horizontal"
                action={addAddressAction}
                autoComplete="off"
              >
                <input type="hidden" name="latitude" id="latitude" />
                <input type="hidden" name="longitude" id="longitude" />
                <div className="form-group space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        className="block text-xs font-medium text-muted mb-1"
                        htmlFor="addressName"
                      >
                        ชื่อจริง
                      </label>
                      <input
                        className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                        name="addressName"
                        type="text"
                        defaultValue={userName}
                        placeholder="ชื่อจริง"
                        maxLength={200}
                        required
                      />
                    </div>
                    <div>
                      <label
                        className="block text-xs font-medium text-muted mb-1"
                        htmlFor="addressLastname"
                      >
                        นามสกุล
                      </label>
                      <input
                        className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                        name="addressLastname"
                        type="text"
                        defaultValue={userLastName}
                        placeholder="นามสกุล"
                        maxLength={200}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        className="block text-xs font-medium text-muted mb-1"
                        htmlFor="addressTel"
                      >
                        เบอร์โทรศัพท์ (สำหรับแจ้งส่งพัสดุ)
                      </label>
                      <input
                        className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
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
                    <div>
                      <label
                        className="block text-xs font-medium text-muted mb-1"
                        htmlFor="addressTel2"
                      >
                        เบอร์โทรศัพท์สำรอง (ไม่จำเป็น)
                      </label>
                      <input
                        className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                        name="addressTel2"
                        type="tel"
                        pattern="\d*"
                        placeholder="เบอร์โทร"
                        minLength={10}
                        maxLength={10}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      className="block text-xs font-medium text-muted mb-1"
                      htmlFor="addressNo"
                    >
                      ทึ่อยู่{" "}
                      <span className="text-red-600">ชื่อหมู่บ้านและหมู่ที่*</span>
                    </label>
                    <input
                      className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                      name="addressNo"
                      type="text"
                      placeholder="บ้านเลขที่ ถนน ซอย ชื่อหมู่บ้านและหมู่ที่*"
                      maxLength={200}
                      required
                    />
                    <div className="input-info mt-1 text-xs text-muted">
                      {" "}
                      กรุณากรอกบ้านเลขที่ ถนน ซอย ชื่อหมู่บ้านและหมู่ที่
                    </div>
                  </div>
                  <div id="demo1" className="demo space-y-3" style={{ display: "none" }}>
                    <div>
                      <label
                        className="block text-xs font-medium text-muted mb-1"
                        htmlFor="district"
                      >
                        ตำบล/แขวง
                      </label>
                      <input
                        id="district"
                        className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                        name="district"
                        type="text"
                        placeholder="ตำบล/แขวง"
                        required
                      />
                    </div>
                    <div>
                      <label
                        className="block text-xs font-medium text-muted mb-1"
                        htmlFor="amphoe"
                      >
                        อำเภอ/เขต
                      </label>
                      <input
                        id="amphoe"
                        className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                        name="amphoe"
                        type="text"
                        placeholder="อำเภอ/เขต"
                        required
                      />
                    </div>
                    <div>
                      <label
                        className="block text-xs font-medium text-muted mb-1"
                        htmlFor="province"
                      >
                        จังหวัด
                      </label>
                      <input
                        id="province"
                        className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                        name="province"
                        type="text"
                        placeholder="จังหวัด"
                        required
                      />
                    </div>
                    <div>
                      <label
                        className="block text-xs font-medium text-muted mb-1"
                        htmlFor="zipcode"
                      >
                        รหัสไปรษณีย์
                      </label>
                      <input
                        id="zipcode"
                        className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                        name="zipcode"
                        type="text"
                        pattern="\d*"
                        placeholder="รหัสไปรษณีย์"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <div className="bg-danger2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                      <h5 className="text-sm font-bold text-red-700">
                        ปักหมุดตำแหน่งของคุณ
                      </h5>
                      เราจะจัดส่งสินค้าไปยังตำแหน่งที่ปักหมุดไว้
                      กรุณาตรวจสอบตำแหน่งของคุณ หากปักหมุดไม่ตรง
                      กรุณาคลิกที่หมุดเพื่อแก้ไข
                    </div>
                    <div
                      id="map"
                      className="gmaps mt-2 rounded-lg border border-border"
                      style={{ height: "350px" }}
                    ></div>
                  </div>
                  <div>
                    <label
                      className="block text-xs font-medium text-muted mb-1"
                      htmlFor="addressNote"
                    >
                      หมายเหตุ (ไม่จำเป็น)
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                      rows={3}
                      name="addressNote"
                      placeholder="หมายเหตุ"
                      maxLength={500}
                    ></textarea>
                  </div>

                  <div className="modal-footer flex items-center justify-end gap-2 border-t border-border pt-3">
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-alt"
                      data-dismiss="modal"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      name="add"
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700"
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

      {/* address.php L577-578 — jQuery AJAX targets (kept verbatim). */}
      <div id="edit-Address"></div>
      <div className="message"></div>
    </div>
  );
}
