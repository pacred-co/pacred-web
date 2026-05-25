import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { PasswordForm } from "./password-form";

/**
 * Customer account-settings screen — a FAITHFUL 1:1 TRANSCRIPTION of the
 * legacy PCS Cargo `member/account-settings.php` (D1 / ADR-0017 · the
 * faithful-port workstream · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is the
 * exact HTML markup `account-settings.php` renders — same elements, same
 * Bootstrap-4 class names, same structure, same labels, same order. The
 * visual identity comes from the legacy theme CSS, brought in verbatim
 * as the static `.pcs-legacy`-scoped `public/legacy/pcs/account-settings.css`,
 * loaded via a plain `<link>` so it bypasses the app's Tailwind v4 /
 * PostCSS pipeline.
 *
 * `account-settings.php` source structure transcribed here (lines 44-127):
 *   .app-content > .content-wrapper
 *     1. .content-header > … > ol.breadcrumb
 *        — "หน้าแรก" / "ตั้งค่าบัญชีผู้ใช้"
 *     2. .content-body.pr110 > section#basic-carousel > .row > .col-md-12
 *        > .card.border-black > .card-content > .card-body
 *          a. .text-center — round avatar (150px) + <h2> name
 *             + <h5> "รหัสสมาชิก : <PR####>"
 *          b. .row > .col-md-6.offset-md-3 — the change-password <form>
 *             (rendered by the <PasswordForm> client component)
 *
 * Data — the legacy screen reads the customer from `$_SESSION` values
 * that `header.php` populates from `tb_users` (header.php L12-38):
 *   - $_SESSION['userPicture']                 → tb_users.userpicture
 *   - $_SESSION['userName'] . $userLastName    → tb_users.username / userlastname
 *   - $_SESSION['userID']                      → tb_users.userid (the member code)
 * `tb_*` is RLS-locked to service_role, so the read goes through the
 * admin client; the join key is `tb_users.userid === profile.member_code`
 * (the customer's "PR<n>" code).
 *
 * The change-password POST handler (account-settings.php L3-36 — verify
 * old password against tb_users.userpass, UPDATE userpass + pcs_logged)
 * is transcribed 1:1 into the Server Action `updatePasswordAction`
 * (`./actions.ts`); the form + its jQuery behaviours + SweetAlert result
 * popups (L79-247) are the `<PasswordForm>` client component.
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred. Nothing else changed.
 */

export default async function AccountSettingsPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // header.php L12-38 — the legacy SELECT that fills $_SESSION; the
  // account-settings screen consumes userName / userLastName / userPicture.
  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select("username, userlastname, userpicture")
    .eq("userid", memberCode)
    .maybeSingle<{
      username: string | null;
      userlastname: string | null;
      userpicture: string | null;
    }>();
  if (userRowErr) {
    console.error(`[tb_users list] failed`, { code: userRowErr.code, message: userRowErr.message });
  }

  // $_SESSION['userName'] . ' ' . $_SESSION['userLastName']
  // (account-settings.php L72) — prefer the ported tb_users name,
  // fall back to the Pacred profile fields.
  const legacyName = [userRow?.username, userRow?.userlastname]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" ")
    .trim();
  const profileName = [profile.first_name, profile.last_name]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" ")
    .trim();
  const fullName = legacyName || profileName || profile.company_name || "";

  // $_SESSION['userID'] — the customer's member code (legacy PCS#### is
  // rebranded PR####). The legacy <title> + the <h5> both print it.
  const userID = profile.member_code ?? "";

  // $_SESSION['userPicture'] — legacy: basePath."images/users/".picture
  // (account-settings.php L69-70). The migrated tb_users.userpicture
  // holds a bare filename → reference it under the legacy images path;
  // prefer the Pacred avatar_url when set.
  const userPicture =
    profile.avatar_url ||
    (userRow?.userpicture
      ? `/legacy/pcs/images/users/${userRow.userpicture}`
      : "/legacy/pcs/images/users/user.jpg");

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — static public/ asset, loaded via a plain
          <link> so it bypasses the app's Tailwind/PostCSS pipeline. */}
      <link rel="stylesheet" href="/legacy/pcs/account-settings.css" />

      {/* account-settings.php <title> L39 (Next.js owns <head> — kept
          here as a comment for fidelity record):
          ตั้งค่าบัญชีผู้ใช้งาน <userID> | Pacred */}

      {/* BEGIN: Content — account-settings.php L44 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* L48-59 — breadcrumb header */}
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
                    <li className="breadcrumb-item active">ตั้งค่าบัญชีผู้ใช้</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
          {/* L60 — content-body */}
          <div className="content-body pr110">
            {/* Basic Carousel start — L61-62 */}
            <section id="basic-carousel">
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card border-black">
                    <div className="card-content">
                      <div className="card-body">
                        {/* L68-74 — avatar + name + member code */}
                        <div className="text-center">
                          <span className="image-popup-vertical-fit el-link">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={userPicture} className="rounded-circle" width={150} alt="" />
                          </span>
                          <h2 className="pt-2">
                            <span className="d-inline-block">{fullName}</span>
                          </h2>
                          <h5 className="">
                            รหัสสมาชิก : <span>{userID}</span>
                            <span></span>
                          </h5>
                        </div>
                        {/* L75-115 — change-password form */}
                        <div className="row">
                          <div className="col-md-6 offset-md-3">
                            <PasswordForm />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            {/* Basic Carousel end — L123 */}
          </div>
        </div>
      </div>
      {/* END: Content — L127 */}
    </div>
  );
}
