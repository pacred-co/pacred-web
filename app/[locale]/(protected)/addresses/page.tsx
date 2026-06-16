import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Inbox } from "lucide-react";
import { AddAddressModal } from "./add-address-modal";
import { EditAddressModal } from "./edit-address-modal";
import { DeleteAddressButton } from "./delete-address-button";
import { SetMainAddressButton } from "./set-main-address-button";
import { AddressBook, type Warehouse } from "./address-book";
import { AddressFlash } from "./address-flash";
import { Link } from "@/i18n/navigation";

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
 * ── Add-address popup + China-warehouse popup (2026-05-30 · ปอน) ──
 * The "เพิ่มที่อยู่" CTA is now a real client-side popup
 * (`<AddAddressModal>`), not a `?page=1` full-navigation server modal; the
 * add-address <form> body moved into that client component (form contract
 * unchanged → addAddressAction). The 4 location fields (district / amphoe /
 * province / zipcode) that the legacy hid inside `#demo1 {display:none}`
 * are now visible inputs so the save actually passes the required-field
 * guard. The "ที่อยู่โกดังจีน" link is now `<ChinaWarehouseModal>` — a popup
 * showing both China warehouses (data sourced from the protected
 * /service-import/warehouse-addresses page).
 *
 * NOT reproduced (deliberate · flagged for the integrator):
 *   - jQuery DataTables (#myTable search/sort/paginate) is a legacy jQuery
 *     plugin not present in the app. The legacy jQuery.Thailand
 *     subdistrict→zipcode autocomplete (#demo1) + Google Maps pin-drop
 *     (#map) were dropped — the 4 location fields are now plain inputs.
 *   - jQuery DataTables search/sort/paginate (#myTable) — not reproduced.
 *
 * WIRED (M-1 · 2026-06-01/02): editAddress / deleteAddress / setMainAddress
 * were legacy AJAX calls (page.address.js → include/pages/address/*.php). The
 * three row buttons are now real server-action submits — <EditAddressModal>
 * (editAddressAction), <DeleteAddressButton> (deleteAddressAction · soft-delete
 * + confirm), <SetMainAddressButton> (setMainAddressAction). The legacy
 * SweetAlert success/error popups are reproduced as <AddressFlash> (reads the
 * ?saved=1 / ?error= redirect flag). No `data-legacy-onclick` markers remain.
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
  // Carried through to <EditAddressModal> so an edit round-trips the stored
  // map pin instead of zeroing it (the edit form has no map-pin UI).
  latitude: number | null;
  longitude: number | null;
};

export default async function AddressesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const t = await getTranslations("addressPage");
  // Feedback flags set by add/edit/delete/set-main actions (?saved=1 / ?error=…).
  const { saved, error } = await searchParams;
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
        "addressid, addressname, addresslastname, addresstel, addresstel2, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote, latitude, longitude",
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

  const addresses = (addressRes.data ?? []) as unknown as AddressRow[];

  // $_SESSION['userName'] / userLastName / userTel — the add-form prefill.
  const userName = userRowRes.data?.userName ?? "";
  const userLastName = userRowRes.data?.userLastName ?? "";
  const userTel = userRowRes.data?.userTel ?? "";

  // address.php L601-608 — the addressID that is the customer's main
  // address; the matching row swaps its "ตั้งเป็นที่อยู่หลัก" button
  // for a static "ที่อยู่หลัก" button.
  const mainAddressID = mainRes.data?.addressid ?? null;

  // China receiving-warehouse data for the "ที่อยู่โกดังจีน" popup — sourced
  // 1:1 from the protected /service-import/warehouse-addresses page (same
  // route group · same member-code suffix convention). The member code
  // (PR<n>) is substituted into the address strings server-side here; the
  // client modal is purely presentational. Falls back to a PR_____
  // placeholder when the profile has no member_code yet (same as that page).
  const memberCode = userID || "PR_____";
  const warehouses: Warehouse[] = [
    {
      slug: "yiwu",
      cityTh: "อี้อู",
      cityEn: "Yiwu",
      province: "มณฑลเจ้อเจียง (Zhejiang)",
      flag: "🇨🇳",
      blurb:
        "ศูนย์กลางค้าส่งสินค้าจิปาถะใหญ่ที่สุดของจีน — รองรับ 1688, Taobao, Yiwu Market",
      fields: [
        { key: "shipping-mark", label: "Shipping Mark", value: `${memberCode} by EK`, hint: "วางข้างกล่อง" },
        { key: "receiver", label: "收件人 (ผู้รับ)", value: `${memberCode} (รถ EK / เรือ SEA)` },
        { key: "address", label: "ที่อยู่ (中文)", value: "义乌市江东街道山口小区69栋3单元1楼YY仓322000" },
        { key: "phone", label: "电话 (โทร)", value: "孙先生19213995519" },
      ],
    },
    {
      slug: "guangzhou",
      cityTh: "กวางโจว",
      cityEn: "Guangzhou",
      province: "มณฑลกวางตุ้ง (Guangdong)",
      flag: "🇨🇳",
      blurb:
        "พื้นที่ขนส่งหลักของกวางโจว — รองรับสินค้าจาก 1688, Taobao, Tmall, Alibaba และโรงงานจีนโดยตรง",
      fields: [
        { key: "receiver", label: "收货人姓名 (ผู้รับ)", value: `${memberCode} / EK = รถ / SEA = เรือ`, hint: "เลือก EK หรือ SEA ตามรูปแบบขนส่ง" },
        { key: "address", label: "详细地址 (ที่อยู่)", value: `广东省广州市白云区江高镇沙溪东路18号3-1号仓库, (${memberCode}/EK) 仓库` },
        { key: "zipcode", label: "邮政编码 (ไปรษณีย์)", value: "510000" },
        { key: "phone", label: "手机号码 (โทร)", value: "+13168385163" },
      ],
    },
  ];

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — kept for layout-scope globals (.pcs-content-pad
          padding etc.). The visible surface below is Tailwind. */}
      <link rel="stylesheet" href="/legacy/pcs/address.css" />

      {/* address.php <title> L127 (Next.js owns <head> — kept here as a
          comment for the fidelity record):
          ที่อยู่จัดส่งสินค้าในไทย | Pacred */}

      <div className="pcs-content-pad w-full px-3 md:px-6 pt-3 pb-24 md:py-6">
        {/* Success/error feedback for the add/edit/delete/set-main actions
            (the faithful stand-in for the legacy SweetAlert popups). */}
        <AddressFlash saved={saved === "1"} error={error} />

        {/* /map (legacy address.php Google-Maps pin) — reachable utility link
            (§0d · was orphan). The legacy address-add pin-drop was dropped in
            the port; this exposes the standalone map tool for finding coords. */}
        <div className="mb-3">
          <Link
            href="/map"
            className="inline-flex items-center gap-1.5 text-[13px] text-primary-600 hover:text-primary-700 hover:underline"
          >
            📍 เปิดแผนที่ค้นหาพิกัด
          </Link>
        </div>

        {/* Tab switcher: "ที่อยู่จัดส่งในไทย" (the list below, passed as
            children) ↔ "ที่อยู่โกดังจีน" (the China warehouse table). The
            "เพิ่มที่อยู่" popup trigger shows on the Thai tab. ปอน 2026-05-30:
            "สลับไปเป็นรายการที่อยู่โกดังจีน ไม่ใช่ pop up". */}
        <AddressBook
          warehouses={warehouses}
          addButton={
            <AddAddressModal
              userName={userName}
              userLastName={userLastName}
              userTel={userTel}
            />
          }
        >
            {addresses.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Inbox className="h-10 w-10 text-muted/50" />
                <p className="text-sm text-muted">{t("emptyList")}</p>
                <AddAddressModal
                  userName={userName}
                  userLastName={userLastName}
                  userTel={userTel}
                />
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
                    // (legacy `fullAddress2` onclick-CONCAT removed with the inert
                    // delete/set-main buttons — now wired via the action components.)
                    const isMain = mainAddressID === row.addressid;
                    return (
                      <div
                        key={row.addressid}
                        className="rounded-xl border border-border bg-white dark:bg-surface p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-muted">
                            {t("itemNo", { no })}
                          </span>
                          {isMain && (
                            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">
                              {t("mainAddress")}
                            </span>
                          )}
                        </div>
                        <p
                          className="mt-1.5 text-sm leading-relaxed text-foreground"
                          dangerouslySetInnerHTML={{ __html: fullAddress }}
                        />
                        {row.addressnote && (
                          <p className="mt-1.5 border-t border-dashed border-border pt-1.5 text-xs text-muted">
                            {t("note")}: {row.addressnote}
                          </p>
                        )}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-2.5">
                          <DeleteAddressButton addressId={row.addressid} />
                          <EditAddressModal address={row} />
                          <div
                            id={`btnAddressMain${row.addressid}`}
                            className="inline-block"
                          >
                            {isMain ? (
                              // address.php L605 — the main address shows a
                              // static "ที่อยู่หลัก" button.
                              <button className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600">
                                {t("mainAddress")}
                              </button>
                            ) : (
                              <SetMainAddressButton addressId={row.addressid} />
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
                        <th className="px-4 py-3 font-medium">{t("colNo")}</th>
                        <th className="px-4 py-3 font-medium">{t("colPlace")}</th>
                        <th className="px-4 py-3 font-medium">{t("note")}</th>
                        <th className="px-4 py-3 text-center font-medium">{t("colOptions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* address.php L454-480 — one <tr> per tb_address row.
                          The legacy builds `fullAddress` (with <br>) in SQL
                          CONCAT; reproduced identically. The three row buttons
                          are real server-action submits (M-1 · wired): ลบ →
                          <DeleteAddressButton>, แก้ไข → <EditAddressModal>,
                          ตั้งเป็นที่อยู่หลัก → <SetMainAddressButton>. */}
                      {addresses.map((row, idx) => {
                        const no = idx + 1;
                        const fullAddress =
                          `คุณ${row.addressname ?? ""} ${row.addresslastname ?? ""}<br>` +
                          `${row.addressno ?? ""} ตำบล/แขวง ${row.addresssubdistrict ?? ""}<br>` +
                          ` อำเภอ/เขต ${row.addressdistrict ?? ""} จังหวัด ${row.addressprovince ?? ""} ${row.addresszipcode ?? ""}<br>` +
                          `โทร. ${row.addresstel ?? ""}, ${row.addresstel2 ?? ""}`;
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
                                <DeleteAddressButton addressId={row.addressid} />
                                <EditAddressModal address={row} />
                                <div
                                  id={`btnAddressMain${row.addressid}`}
                                  className="inline-block"
                                >
                                  {isMain ? (
                                    // address.php L605 — the main address
                                    // shows a static "ที่อยู่หลัก" button.
                                    <button className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600">
                                      {t("mainAddress")}
                                    </button>
                                  ) : (
                                    <SetMainAddressButton addressId={row.addressid} />
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
        </AddressBook>
      </div>

      {/* address.php L577-578 — jQuery AJAX targets (kept verbatim). */}
      <div id="edit-Address"></div>
      <div className="message"></div>
    </div>
  );
}
