import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { EditProfileForm } from "./edit-profile-form";

/**
 * Customer profile screen — a FAITHFUL 1:1 TRANSCRIPTION of the legacy
 * PCS Cargo `member/profile.php` (D1 / ADR-0017 · the faithful-port
 * transcription workstream · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is the
 * exact HTML markup `profile.php` renders — same elements, same
 * Bootstrap-4 class names, same structure, same labels, same order. The
 * visual identity comes from the legacy theme CSS, brought in verbatim
 * as the static `.pcs-legacy`-scoped `public/legacy/pcs/profile.css`,
 * loaded via a plain `<link>` so it bypasses the app's Tailwind v4 /
 * PostCSS pipeline.
 *
 * `profile.php` source structure transcribed here (lines 78-403):
 *   .app-content > .content-wrapper
 *     1. .content-header > … > ol.breadcrumb  — "หน้าแรก" / "โปรไฟล์"
 *     2. .content-body.pr110 > section#basic-carousel
 *        a. .row > .col-md-12 > .card.border-black > .card-content
 *           > .card-body
 *             - ul.list-inline.dl — two corner icon buttons
 *               (edit-profile modal trigger · account-settings link)
 *             - #edit-profile modal — the edit-profile <form>
 *               (rendered by <EditProfileForm>)
 *             - .text-center — 150px round avatar + edit-image button
 *               + #edit-img-profile modal + #uploadimageModal modal
 *               + <h2> name + <h5> "รหัสสมาชิก : <PR####>"
 *             - <hr/> + .row — email/phone/FB/LINE (left col) +
 *               main address / birthday / sex (right col)
 *        b. .row.pt-2 — 4 eCommerce stat cards (ฝากสั่งซื้อสินค้า ·
 *           ฝากนำเข้าสินค้า · ฝากชำระเงิน · กระเป๋าสตางค์)
 *
 * Data — every `profile.php` + `include/header.php` mysqli query
 * transcribed 1:1 to the ported legacy `tb_*` schema (Supabase). `tb_*`
 * is RLS-locked to service_role, so reads go through the admin client;
 * the join key is `tb_*.userid === profile.member_code` (the customer's
 * "PR<n>" code). The `tb_*` map is `docs/research/wave-1-fidelity/
 * _SYNTHESIS.md` §7.
 *   - userName/userLastName/userEmail/userTel/userPicture/userSex/
 *     userBirthday/userFacebook/userLineID
 *                          → tb_users          (header.php L12-38 +
 *                            profile.php modal SELECT L144)
 *   - $walletTotal         → tb_wallet.wallettotal      (header.php L86-92)
 *   - $countShops          → COUNT(tb_header_order)     (header.php L105)
 *   - $countForwarder      → COUNT(tb_forwarder)        (header.php L100)
 *   - $countPayment        → COUNT(tb_payment)          (header.php L104)
 *   - $fullAddress         → tb_address ⋈ tb_address_main (header.php L107)
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred.
 *
 * ── Deliberately NOT reproduced (documented for the fidelity record) ──
 *  - profile.php L557 `saveHS(...)` — a render-time visit-log INSERT.
 *    A Server Component render is a PURE READ (runbook §9.4); never
 *    reproduced inside the page. FLAGGED.
 *  - profile.php L405-417 + L457-532 — the image-upload jQuery (dropify
 *    + cropper + croppie + magnific-popup). Those plugins are NOT in
 *    the staged vendor bundle (jQuery + Popper + Bootstrap-4 only). The
 *    #edit-img-profile + #uploadimageModal modal MARKUP is transcribed
 *    1:1 below (so the avatar-edit button opens the legacy modal), but
 *    the crop-and-upload behaviour is UNWIRED — the modal renders, the
 *    file picker accepts a file, but the croppie crop + the
 *    `include/pages/upload.php` POST are not ported. FLAGGED for a
 *    follow-up image-upload screen.
 *  - The eCommerce stat counters legacy `tam-counter` jQuery animation
 *    (the count animates up from 0) is not staged — the final count is
 *    rendered statically (visually identical at rest).
 */

// header.php L107 — the main-address concat the legacy SELECT builds.
// PostgREST cannot express the `WHERE addressID IN (SELECT … FROM
// tb_address_main WHERE userID=…)` sub-select + CONCAT in one call, so
// it is run as the same two-step lookup the PHP effectively does and
// the string is concatenated here.
function buildFullAddress(a: {
  addressname: string | null;
  addresslastname: string | null;
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
}): string {
  return [
    a.addressname ?? "",
    " ",
    a.addresslastname ?? "",
    " ",
    a.addressno ?? "",
    " ตำบล/แขวง ",
    a.addresssubdistrict ?? "",
    " อำเภอ/เขต ",
    a.addressdistrict ?? "",
    " จังหวัด ",
    a.addressprovince ?? "",
    " ",
    a.addresszipcode ?? "",
  ].join("");
}

export default async function ProfilePage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // LINE Notify per-user OAuth panel REMOVED 2026-05-26 — the upstream
  // notify-bot.line.me service ended 2025-03-31. Replacement is LIFF
  // linking (/liff/link, future) + Messaging API push via
  // `lib/notifications/index.ts` `sendNotification()`. The DB columns
  // `profiles.line_notify_token` / `line_notify_connected_at` /
  // `line_notify_channels` are left in place (migration 0101) for the
  // historical-data retention; they're no longer read by the app.

  // ── Transcribed queries ──────────────────────────────────────
  // header.php L12-38 — the customer header row that fills $_SESSION;
  // profile.php reads userName/userLastName/userEmail/userPicture/userID
  // from it. profile.php's modal SELECT (L144) additionally reads
  // userTel/userSex/userBirthday/userFacebook/userLineID — all on the
  // same tb_users row, so one read covers both.
  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select(
      "username, userlastname, useremail, usertel, userpicture, usersex, userbirthday, userfacebook, userlineid",
    )
    .eq("userid", memberCode)
    .maybeSingle<{
      username: string | null;
      userlastname: string | null;
      useremail: string | null;
      usertel: string | null;
      userpicture: string | null;
      usersex: string | null;
      userbirthday: string | null;
      userfacebook: string | null;
      userlineid: string | null;
    }>();

  // header.php L86-92 — SELECT walletTotal FROM tb_wallet WHERE userID=…
  // header.php L100/104/105 — the three stat-card COUNT()s.
  // header.php L107 — the main-address row (via tb_address_main).
  const [walletRes, shopsRes, forwarderRes, paymentRes, addressMainRes] =
    await Promise.all([
      admin
        .from("tb_wallet")
        .select("wallettotal")
        .eq("userid", memberCode)
        .maybeSingle<{ wallettotal: number }>(),
      admin
        .from("tb_header_order")
        .select("id", { count: "exact", head: true })
        .eq("userid", memberCode),
      admin
        .from("tb_forwarder")
        .select("id", { count: "exact", head: true })
        .eq("userid", memberCode),
      admin
        .from("tb_payment")
        .select("id", { count: "exact", head: true })
        .eq("userid", memberCode),
      admin
        .from("tb_address_main")
        .select("addressid")
        .eq("userid", memberCode)
        .maybeSingle<{ addressid: string | number | null }>(),
    ]);

  const walletTotal = Number(walletRes.data?.wallettotal ?? 0);
  const countShops = shopsRes.count ?? 0;
  const countForwarder = forwarderRes.count ?? 0;
  const countPayment = paymentRes.count ?? 0;

  // header.php L107 second step — resolve the main address row.
  let fullAddress = "";
  const mainAddressId = addressMainRes.data?.addressid ?? null;
  if (mainAddressId != null) {
    const { data: addrRow, error: addrRowErr } = await admin
      .from("tb_address")
      .select(
        "addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
      )
      .eq("addressid", mainAddressId)
      .maybeSingle<{
        addressname: string | null;
        addresslastname: string | null;
        addressno: string | null;
        addresssubdistrict: string | null;
        addressdistrict: string | null;
        addressprovince: string | null;
        addresszipcode: string | null;
      }>();
    if (addrRow) fullAddress = buildFullAddress(addrRow);
  }

  // $_SESSION['userName'] . ' ' . $_SESSION['userLastName']
  // (profile.php L253) — prefer the ported tb_users name, fall back to
  // the Pacred profile fields.
  const userName = userRow?.username ?? "";
  const userLastName = userRow?.userlastname ?? "";
  const legacyName = [userName, userLastName]
    .filter((s) => s.trim() !== "")
    .join(" ")
    .trim();
  const profileName = [profile.first_name, profile.last_name]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" ")
    .trim();
  const fullName = legacyName || profileName || profile.company_name || "";

  // $_SESSION['userID'] — the customer's member code (legacy PCS#### is
  // rebranded PR####). profile.php's <title> + the <h5> both print it.
  const userID = profile.member_code ?? "";

  // $_SESSION['userEmail'] (profile.php L262).
  const userEmail = (userRow?.useremail ?? "").toLowerCase();
  // $row['userTel'] / userSex / userBirthday / userFacebook / userLineID
  // — the modal SELECT (profile.php L144) + the detail block below.
  const userTel = userRow?.usertel ?? "";
  const userSex = userRow?.usersex ?? "";
  const userBirthday = userRow?.userbirthday ?? "";
  const userFacebook = userRow?.userfacebook ?? "";
  const userLineID = userRow?.userlineid ?? "";

  // $_SESSION['userPicture'] — legacy: basePath."images/users/".picture
  // (profile.php L197-198). The migrated tb_users.userpicture holds a
  // bare filename → reference it under the legacy images path; prefer
  // the Pacred avatar_url when set. (account-settings.php uses the same
  // resolution.)
  const userPictureFile = userRow?.userpicture ?? "user.jpg";
  const userPicture =
    profile.avatar_url ||
    `/legacy/pcs/images/users/${userPictureFile || "user.jpg"}`;

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — static public/ asset, loaded via a plain
          <link> so it bypasses the app's Tailwind/PostCSS pipeline. The
          four legacy This-Page plugin CSS files (dropify / cropper /
          croppie / magnific-popup — profile.php L69-72) are folded into
          profile.css's no-op placeholder block (those plugins are not
          staged — see the page-doc's "NOT reproduced" note). */}
      <link rel="stylesheet" href="/legacy/pcs/profile.css" />

      {/* profile.php <title> L73 (Next.js owns <head> — kept here as a
          comment for the fidelity record):
          โปรไฟล์ <userID> | Pacred */}

      {/* BEGIN: Content — profile.php L78 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* L82-93 — breadcrumb header */}
          <div className="content-header row">
            <div className="content-header-left col-12">
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/dashboard">
                        <span className="menu-home">หน้าแรก</span>
                      </Link>
                    </li>
                    <li className="breadcrumb-item active">โปรไฟล์</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
          {/* L94 — content-body */}
          <div className="content-body pr110">
            {/* Basic Carousel start — L95-96 */}
            <section id="basic-carousel">
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card border-black">
                    <div className="card-content">
                      <div className="card-body">
                        {/* L102-119 — two corner icon buttons */}
                        <ul className="list-inline dl text-right">
                          <li className="list-inline-item">
                            {/* L104 — legacy opens the #edit-profile
                                modal via data-toggle; the modal markup
                                is rendered by <EditProfileForm> below.
                                Bootstrap-4 vendor JS wires the toggle. */}
                            <a
                              href="#edit-profile"
                              data-toggle="modal"
                              data-target="#edit-profile"
                            >
                              <button
                                className="btn tn-icon btn-pure warning p-0 pull-up"
                                type="button"
                              >
                                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                              </button>
                              <span className="font-normal text-dark d-none d-sm-inline-block d-sm-none">
                                แก้ไขข้อมูล
                              </span>
                            </a>
                          </li>
                          <li className="list-inline-item text-info">
                            {/* L112 — link to the account-settings screen */}
                            <Link href="/account-settings">
                              <button
                                className="btn tn-icon btn-pure warning p-0 pull-up"
                                type="button"
                              >
                                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1">
                                  <circle cx="12" cy="12" r="3"></circle>
                                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                              </button>
                              <span className="font-normal text-dark d-none d-sm-inline-block d-sm-none">
                                ตั้งค่าบัญชีผู้ใช้งาน
                              </span>
                            </Link>
                          </li>
                        </ul>

                        {/* L120-194 — the #edit-profile modal + form.
                            The modal SELECT (L144) reads the same
                            tb_users row already fetched; its values are
                            handed to the client form as props. */}
                        <EditProfileForm
                          fields={{
                            userName,
                            userLastName,
                            userEmail,
                            userTel,
                            userBirthday,
                            userSex,
                            userFacebook,
                            userLineID,
                          }}
                        />

                        {/* L196-255 — avatar + edit-image modals + name */}
                        <div className="text-center">
                          {/* L197-199 — magnific-popup avatar zoom link */}
                          <a
                            className="image-popup-vertical-fit el-link"
                            href={userPicture}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={userPicture}
                              className="rounded-circle"
                              width={150}
                              alt=""
                            />
                          </a>
                          {/* L200-204 — the edit-image button. Opens the
                              #edit-img-profile modal via data-toggle
                              (vendor JS wires it). The crop-and-upload
                              behind it is NOT wired — see the page-doc. */}
                          <div className="edit-img-profile mb--20">
                            <button
                              className="btn rounded-circle btn-xs  btn-dark text-white"
                              type="button"
                              data-toggle="modal"
                              data-target="#edit-img-profile"
                            >
                              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1 svg-15">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                <circle cx="12" cy="13" r="4"></circle>
                              </svg>
                            </button>
                          </div>
                          {/* L205-229 — #edit-img-profile modal (dropify
                              file picker). Markup transcribed 1:1; the
                              dropify plugin + the upload POST are NOT
                              staged — FLAGGED in the page-doc. */}
                          <div
                            id="edit-img-profile"
                            className="modal animated bounce"
                            tabIndex={-1}
                            role="dialog"
                            aria-hidden="true"
                          >
                            <div className="modal-dialog">
                              <div className="modal-content">
                                <div className="modal-header header-from">
                                  <h4 className="modal-title">แก้ไขรูปโปรไฟล์</h4>
                                  <button
                                    type="button"
                                    className="close"
                                    data-dismiss="modal"
                                    aria-hidden="true"
                                  >
                                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1">
                                      <line x1="18" y1="6" x2="6" y2="18"></line>
                                      <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                  </button>
                                </div>
                                <div className="modal-body header-from">
                                  <input
                                    type="hidden"
                                    name="userPictured"
                                    id="userPictured"
                                    value={userPicture}
                                  />
                                  <div className="form-group">
                                    <div className="mb-1">
                                      <div className="fallback">
                                        <input
                                          type="file"
                                          className="dropify"
                                          accept="image/*"
                                          name="userPicture"
                                          id="upload_image"
                                          {...(userPictureFile !== "user.jpg"
                                            ? { "data-default-file": userPicture }
                                            : {})}
                                          required
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-center">
                                    <span>
                                      ลากหรือคลิกที่ภาพและวางไฟล์เพื่อแทนที่
                                    </span>
                                  </div>
                                </div>
                                <div id="uploaded_image"></div>
                              </div>
                            </div>
                          </div>
                          {/* L230-252 — #uploadimageModal modal (croppie
                              crop UI). Markup transcribed 1:1; croppie is
                              NOT staged — FLAGGED in the page-doc. */}
                          <div
                            id="uploadimageModal"
                            className="modal "
                            role="dialog"
                            aria-hidden="true"
                          >
                            <div className="modal-dialog">
                              <div className="modal-content">
                                <div className="modal-header header-from">
                                  <h4 className="modal-title">
                                    ปรับตำแหน่งรูปโปรไฟล์
                                  </h4>
                                  <button
                                    type="button"
                                    className="close"
                                    data-dismiss="modal"
                                    aria-hidden="true"
                                  >
                                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1">
                                      <line x1="18" y1="6" x2="6" y2="18"></line>
                                      <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                  </button>
                                </div>
                                <div className="modal-body header-from">
                                  <div className="row">
                                    <div className=" container-fluid">
                                      <div className="col-md-12 text-center">
                                        <span>เลื่อนและซูมรูปภาพตามต้องการ</span>
                                        <div
                                          id="image_demo"
                                          style={{
                                            width: "100%",
                                            marginTop: "10px",
                                          }}
                                        ></div>
                                      </div>
                                      <div className="col-md-12 text-center">
                                        <button className="btn btn-outline-info round btn-min-width mr-1 mb-1 crop_image">
                                          ตัดและบันทึกภาพ
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          {/* L253-254 — name + member code */}
                          <h2 className="">
                            <span className="d-inline-block">{fullName}</span>
                          </h2>
                          <h5 className="">
                            รหัสสมาชิก : <span>{userID}</span>
                            <span></span>
                          </h5>
                        </div>

                        {/* L257 — divider */}
                        <hr />
                        {/* L258-299 — contact (left) + address/dob/sex (right) */}
                        <div className="row">
                          <div className="col-12 col-md-6">
                            {/* L260-263 — email */}
                            <span className="font-18 font-weight-500">
                              อีเมล{" "}
                            </span>
                            <p>
                              <a className="font-16" href={`mailto:${userEmail}`}>
                                {userEmail}
                              </a>
                            </p>
                            {/* L264-269 — phone */}
                            <span className="font-18 font-weight-500">
                              เบอร์โทร{" "}
                            </span>
                            <ul className="list-unstyled">
                              <li className="">
                                <a className="font-16" href={`tel:${userTel}`}>
                                  {userTel}
                                </a>
                              </li>
                            </ul>
                            {/* L270-283 — Facebook + LINE */}
                            <ul className="list-unstyled">
                              <li className="mt-2 mb-2">
                                <a
                                  className="text-muted font-16"
                                  href={userFacebook || ""}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <button className="btn btn-info">
                                    <i className="fab fa-facebook-f"></i>
                                  </button>{" "}
                                  :{" "}
                                  {userFacebook === "" || userFacebook == null
                                    ? "ยังไม่ระบุ"
                                    : userFacebook}
                                </a>
                              </li>
                              <li className="mt-2 mb-2">
                                <a className="text-muted font-16" href="">
                                  <button className="btn btn-success">
                                    <i className="fab fa-line font-18"></i>
                                  </button>{" "}
                                  :{" "}
                                  {userLineID === "" || userLineID == null
                                    ? "ยังไม่ระบุ"
                                    : userLineID}
                                </a>
                              </li>
                            </ul>
                          </div>
                          <div className="col-12 col-md-6">
                            {/* L286 — main address + add-address link */}
                            <span className="font-18 font-weight-500">
                              ที่อยู่จัดส่งสินค้า (ที่อยู่หลัก)
                            </span>{" "}
                            <Link
                              className="text-info font-14 float-right"
                              href="/addresses/add"
                            >
                              <i className="ft-plus"></i> เพิ่มที่อยู่
                            </Link>
                            <p className="text-muted font-16">
                              {fullAddress !== "" ? (
                                fullAddress
                              ) : (
                                <span className="text-danger">
                                  กรุณาเพิ่มที่อยู่ (จำเป็น*)
                                </span>
                              )}
                            </p>
                            {/* L290-293 — birthday */}
                            <span className="font-18 font-weight-500">
                              เกิดเมื่อ{" "}
                            </span>
                            <p className="text-muted font-16">
                              {userBirthday === "" || userBirthday == null
                                ? "ยังไม่ระบุ"
                                : userBirthday}
                            </p>
                            {/* L294-297 — sex */}
                            <span className="font-18 font-weight-500">เพศ</span>
                            <p className="text-muted font-16">
                              {userSex === "" || userSex == null
                                ? "ยังไม่ระบุ"
                                : userSex}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* eCommerce statistic — profile.php L306-397 */}
              <div className="row pt-2">
                {/* L308-329 — ฝากสั่งซื้อสินค้า → shops/ */}
                <div className="col-xl-3 col-lg-6 col-12 align-self-center">
                  <Link href="/service-order">
                    <div className="card pull-up">
                      <div className="card-content">
                        <div className="card-body">
                          <div className="media d-flex">
                            <div className="media-body text-left">
                              <h2 className="info tam-counter" data-count={countShops}>{countShops}</h2>
                              <h4>ฝากสั่งซื้อสินค้า</h4>
                            </div>
                            <div>
                              <i className="icon-basket-loaded info font-large-2 float-right"></i>
                            </div>
                          </div>
                          <div className="progress progress-sm mt-1 mb-0 box-shadow-2">
                            <div
                              className="progress-bar bg-gradient-x-info"
                              role="progressbar"
                              style={{ width: "100%" }}
                              aria-valuenow={100}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
                {/* L330-351 — ฝากนำเข้าสินค้า → forwarder/ */}
                <div className="col-xl-3 col-lg-6 col-12 align-self-center">
                  <Link href="/service-import">
                    <div className="card pull-up">
                      <div className="card-content">
                        <div className="card-body">
                          <div className="media d-flex">
                            <div className="media-body text-left">
                              <h2 className="warning tam-counter" data-count={countForwarder}>
                                {countForwarder}
                              </h2>
                              <h4>ฝากนำเข้าสินค้า</h4>
                            </div>
                            <div>
                              <i className="ft-box warning font-large-2 float-right"></i>
                            </div>
                          </div>
                          <div className="progress progress-sm mt-1 mb-0 box-shadow-2">
                            <div
                              className="progress-bar bg-gradient-x-warning"
                              role="progressbar"
                              style={{ width: "100%" }}
                              aria-valuenow={100}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
                {/* L352-373 — ฝากชำระเงิน → payment/ */}
                <div className="col-xl-3 col-lg-6 col-12 align-self-center">
                  <Link href="/service-payment">
                    <div className="card pull-up">
                      <div className="card-content">
                        <div className="card-body">
                          <div className="media d-flex">
                            <div className="media-body text-left">
                              <h2 className="purple tam-counter" data-count={countPayment}>
                                {countPayment}
                              </h2>
                              <h4>ฝากชำระเงิน</h4>
                            </div>
                            <div>
                              <i className="purple font-large-2 float-right">
                                <svg viewBox="0 0 24 24" width="35" height="35" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1 font-large-2">
                                  <line x1="12" y1="1" x2="12" y2="23"></line>
                                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                                </svg>
                              </i>
                            </div>
                          </div>
                          <div className="progress progress-sm mt-1 mb-0 box-shadow-2">
                            <div
                              className="progress-bar bg-gradient-x-purple"
                              role="progressbar"
                              style={{ width: "100%" }}
                              aria-valuenow={100}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
                {/* L374-395 — กระเป๋าสตางค์ → wallet/ */}
                <div className="col-xl-3 col-lg-6 col-12 align-self-center">
                  <Link href="/wallet">
                    <div className="card pull-up">
                      <div className="card-content">
                        <div className="card-body">
                          <div className="media d-flex">
                            <div className="media-body text-left">
                              <h2 className="success">
                                <span className="tam-counter" data-count={walletTotal}>
                                  {walletTotal}
                                </span>
                                <span className="font-14"> บาท</span>
                              </h2>
                              <h4>กระเป๋าสตางค์</h4>
                            </div>
                            <div>
                              <i className="icon-wallet success font-large-2 float-right"></i>
                            </div>
                          </div>
                          <div className="progress progress-sm mt-1 mb-0 box-shadow-2">
                            <div
                              className="progress-bar bg-gradient-x-success"
                              role="progressbar"
                              style={{ width: "100%" }}
                              aria-valuenow={100}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
              {/* / eCommerce statistic */}
            </section>
            {/* Basic Carousel end — L399 */}

            {/* LINE Notify panel REMOVED 2026-05-26 — service EOL'd
                2025-03-31. LIFF + Messaging API replacement pending
                (see task L · docs/learnings/partner-apis-quirks.md
                "2026-05-26 LINE Notify dead"). */}
          </div>
        </div>
      </div>
      {/* END: Content — L403 */}
    </div>
  );
}
