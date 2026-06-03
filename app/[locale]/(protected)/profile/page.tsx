import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { EditProfileForm } from "./edit-profile-form";
import { ProfileAvatarUpload } from "./profile-avatar-upload";

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
      "userName, userLastName, userEmail, userTel, userPicture, userSex, userBirthday, userFacebook, userLineID",
    )
    .eq("userID", memberCode)
    .maybeSingle<{
      userName: string | null;
      userLastName: string | null;
      userEmail: string | null;
      userTel: string | null;
      userPicture: string | null;
      userSex: string | null;
      userBirthday: string | null;
      userFacebook: string | null;
      userLineID: string | null;
    }>();
  if (userRowErr) {
    // Server page — surface real DB errors via throw (Next renders error
    // boundary) instead of silently falling through to a "ยังไม่ระบุ" view.
    console.error(`[profile/page] tb_users lookup failed`, {
      code: userRowErr.code, message: userRowErr.message, memberCode,
    });
    throw new Error(`tb_users lookup failed: ${userRowErr.message}`);
  }

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
    const { data: addrRow, error: addrErr } = await admin
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
    if (addrErr) {
      // Non-fatal — address is a display nicety; log and fall through with
      // empty fullAddress (the page already handles that case with a
      // "กรุณาเพิ่มที่อยู่" prompt). Don't take the whole profile page down.
      console.error(`[profile/page] tb_address lookup failed`, {
        code: addrErr.code, message: addrErr.message, mainAddressId,
      });
    }
    if (addrRow) fullAddress = buildFullAddress(addrRow);
  }

  // $_SESSION['userName'] . ' ' . $_SESSION['userLastName']
  // (profile.php L253) — prefer the ported tb_users name, fall back to
  // the Pacred profile fields.
  const userName = userRow?.userName ?? "";
  const userLastName = userRow?.userLastName ?? "";
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
  const userEmail = (userRow?.userEmail ?? "").toLowerCase();
  // $row['userTel'] / userSex / userBirthday / userFacebook / userLineID
  // — the modal SELECT (profile.php L144) + the detail block below.
  const userTel = userRow?.userTel ?? "";
  const userSex = userRow?.userSex ?? "";
  const userBirthday = userRow?.userBirthday ?? "";
  const userFacebook = userRow?.userFacebook ?? "";
  const userLineID = userRow?.userLineID ?? "";

  // $_SESSION['userPicture'] — legacy: basePath."images/users/".picture
  // (profile.php L197-198). The migrated tb_users.userpicture holds a
  // bare filename → reference it under the legacy images path; prefer
  // the Pacred avatar_url when set. (account-settings.php uses the same
  // resolution.)
  const userPictureFile = userRow?.userPicture ?? "user.jpg";
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

      {/* BEGIN: Content — profile.php L78. Tailwind chrome (ปอน 2026-05-30 ·
          mobile-first). Workflow + data identical to the legacy profile.php;
          only presentation moved Bootstrap-4 → Tailwind, matching the
          /service-import + /service-payment siblings. The `.modal` image-edit
          shells + their data-toggle/data-dismiss wiring + the dropify hidden
          inputs are kept 1:1 (Bootstrap-JS opens them · profile.css styles
          them) — only the page surface is restyled. */}
      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6">
        {/* L82-93 — breadcrumb header */}
        <nav className="mb-3 flex items-center gap-1.5 text-sm text-muted">
          <Link href="/dashboard" className="hover:text-foreground">
            หน้าแรก
          </Link>
          <span aria-hidden>/</span>
          <span className="text-foreground font-medium">โปรไฟล์</span>
        </nav>

        {/* Basic Carousel start — L95-96 */}
        <section id="basic-carousel">
          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 md:p-6">
            {/* L102-119 — two corner icon buttons */}
            <div className="flex items-center justify-end gap-1">
              {/* L104 — legacy opens the #edit-profile modal via
                  data-toggle; the modal markup is rendered by
                  <EditProfileForm> below. Bootstrap-4 vendor JS wires the
                  toggle — href/data-toggle/data-target kept EXACTLY. */}
              <a
                href="#edit-profile"
                data-toggle="modal"
                data-target="#edit-profile"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-foreground"
                aria-label="แก้ไขข้อมูล"
                title="แก้ไขข้อมูล"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </a>
              {/* L112 — link to the account-settings screen */}
              <Link
                href="/account-settings"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-foreground"
                aria-label="ตั้งค่าบัญชีผู้ใช้งาน"
                title="ตั้งค่าบัญชีผู้ใช้งาน"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </Link>
            </div>

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
                        <div className="mt-4 flex flex-col items-center text-center">
                          {/* L197-199 — magnific-popup avatar zoom link */}
                          <a
                            className="image-popup-vertical-fit el-link"
                            href={userPicture}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={userPicture}
                              className="h-[120px] w-[120px] md:h-[150px] md:w-[150px] rounded-full object-cover border border-border shadow-sm"
                              width={150}
                              alt=""
                            />
                          </a>
                          {/* 2026-06-04 — WIRED Pacred avatar upload. Replaces
                              the legacy edit-image button, whose #edit-img-profile
                              / #uploadimageModal (dropify + croppie) were
                              transcribed but never wired → a dead click. This
                              island uploads to the `avatars` bucket → profiles
                              .avatar_url (no jQuery, no comms). The inert legacy
                              modal markup below is superseded (kept harmless). */}
                          <ProfileAvatarUpload />
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
                          <h2 className="mt-3 text-xl md:text-2xl font-bold text-foreground">
                            <span>{fullName}</span>
                          </h2>
                          <h5 className="mt-1 text-sm text-muted">
                            รหัสสมาชิก : <span className="font-medium text-foreground">{userID}</span>
                            <span></span>
                          </h5>
                        </div>

                        {/* L257 — divider */}
                        <hr className="my-4 border-t border-border" />
                        {/* L258-299 — contact (left) + address/dob/sex (right) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            {/* L260-263 — email */}
                            <span className="text-sm font-semibold text-foreground">
                              อีเมล{" "}
                            </span>
                            <p className="mt-0.5 mb-3 break-words">
                              <a
                                className="text-sm text-red-600 hover:underline"
                                href={`mailto:${userEmail}`}
                              >
                                {userEmail}
                              </a>
                            </p>
                            {/* L264-269 — phone */}
                            <span className="text-sm font-semibold text-foreground">
                              เบอร์โทร{" "}
                            </span>
                            <ul className="mt-0.5 mb-3 list-none p-0">
                              <li>
                                <a
                                  className="text-sm text-red-600 hover:underline"
                                  href={`tel:${userTel}`}
                                >
                                  {userTel}
                                </a>
                              </li>
                            </ul>
                            {/* L270-283 — Facebook + LINE */}
                            <ul className="list-none p-0 space-y-2">
                              <li>
                                <a
                                  className="inline-flex items-center gap-2 text-sm text-muted"
                                  href={userFacebook || ""}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#1e9ff2] text-white">
                                    <i className="fab fa-facebook-f"></i>
                                  </span>{" "}
                                  :{" "}
                                  {userFacebook === "" || userFacebook == null
                                    ? "ยังไม่ระบุ"
                                    : userFacebook}
                                </a>
                              </li>
                              <li>
                                <a className="inline-flex items-center gap-2 text-sm text-muted" href="">
                                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#0cc27e] text-white">
                                    <i className="fab fa-line"></i>
                                  </span>{" "}
                                  :{" "}
                                  {userLineID === "" || userLineID == null
                                    ? "ยังไม่ระบุ"
                                    : userLineID}
                                </a>
                              </li>
                            </ul>
                          </div>
                          <div>
                            {/* L286 — main address + add-address link */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                ที่อยู่จัดส่งสินค้า (ที่อยู่หลัก)
                              </span>{" "}
                              <Link
                                className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                                href="/addresses/add"
                              >
                                <i className="ft-plus"></i> เพิ่มที่อยู่
                              </Link>
                            </div>
                            <p className="mt-0.5 mb-3 text-sm text-muted break-words">
                              {fullAddress !== "" ? (
                                fullAddress
                              ) : (
                                <span className="text-red-600">
                                  กรุณาเพิ่มที่อยู่ (จำเป็น*)
                                </span>
                              )}
                            </p>
                            {/* L290-293 — birthday */}
                            <span className="text-sm font-semibold text-foreground">
                              เกิดเมื่อ{" "}
                            </span>
                            <p className="mt-0.5 mb-3 text-sm text-muted">
                              {userBirthday === "" || userBirthday == null
                                ? "ยังไม่ระบุ"
                                : userBirthday}
                            </p>
                            {/* L294-297 — sex */}
                            <span className="text-sm font-semibold text-foreground">เพศ</span>
                            <p className="mt-0.5 text-sm text-muted">
                              {userSex === "" || userSex == null
                                ? "ยังไม่ระบุ"
                                : userSex}
                            </p>
                          </div>
                        </div>
            </div>
            {/* / main card */}

            {/* eCommerce statistic — profile.php L306-397. 4 Tailwind stat
                cards (grid: 1-col phone · 2-col sm · 4-col xl). Same hrefs +
                tam-counter/data-count hooks + counts. Bootstrap progress bars
                → thin Tailwind accent bars; theme colours kept per-card. */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {/* L308-329 — ฝากสั่งซื้อสินค้า → shops/ */}
              <Link
                href="/service-order"
                className="group rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-left">
                    <h2 className="text-2xl font-bold text-[#1e9ff2] tam-counter" data-count={countShops}>{countShops}</h2>
                    <h4 className="text-sm text-muted">ฝากสั่งซื้อสินค้า</h4>
                  </div>
                  <i className="icon-basket-loaded text-3xl text-[#1e9ff2]"></i>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
                  <div className="h-full w-full rounded-full bg-gradient-to-r from-[#1e9ff2] to-[#144b7f]"></div>
                </div>
              </Link>
              {/* L330-351 — ฝากนำเข้าสินค้า → forwarder/ */}
              <Link
                href="/service-import"
                className="group rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-left">
                    <h2 className="text-2xl font-bold text-[#ff9149] tam-counter" data-count={countForwarder}>
                      {countForwarder}
                    </h2>
                    <h4 className="text-sm text-muted">ฝากนำเข้าสินค้า</h4>
                  </div>
                  <i className="ft-box text-3xl text-[#ff9149]"></i>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
                  <div className="h-full w-full rounded-full bg-gradient-to-r from-[#ff9149] to-[#ff6707]"></div>
                </div>
              </Link>
              {/* L352-373 — ฝากชำระเงิน → payment/ */}
              <Link
                href="/service-payment"
                className="group rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-left">
                    <h2 className="text-2xl font-bold text-[#9c27b0] tam-counter" data-count={countPayment}>
                      {countPayment}
                    </h2>
                    <h4 className="text-sm text-muted">ฝากชำระเงิน</h4>
                  </div>
                  <i className="text-[#9c27b0]">
                    <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1">
                      <line x1="12" y1="1" x2="12" y2="23"></line>
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                  </i>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
                  <div className="h-full w-full rounded-full bg-gradient-to-r from-[#9c27b0] to-[#56157c]"></div>
                </div>
              </Link>
              {/* L374-395 — กระเป๋าสตางค์ → wallet/ */}
              <Link
                href="/wallet"
                className="group rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-left">
                    <h2 className="text-2xl font-bold text-[#0cc27e]">
                      <span className="tam-counter" data-count={walletTotal}>
                        {walletTotal}
                      </span>
                      <span className="text-sm font-medium"> บาท</span>
                    </h2>
                    <h4 className="text-sm text-muted">กระเป๋าสตางค์</h4>
                  </div>
                  <i className="icon-wallet text-3xl text-[#0cc27e]"></i>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
                  <div className="h-full w-full rounded-full bg-gradient-to-r from-[#0cc27e] to-[#0a8e5e]"></div>
                </div>
              </Link>
            </div>
            {/* / eCommerce statistic */}
          </section>
          {/* Basic Carousel end — L399 */}

          {/* LINE Notify panel REMOVED 2026-05-26 — service EOL'd
              2025-03-31. LIFF + Messaging API replacement pending
              (see task L · docs/learnings/partner-apis-quirks.md
              "2026-05-26 LINE Notify dead"). */}
      </div>
      {/* END: Content — L403 */}
    </div>
  );
}
