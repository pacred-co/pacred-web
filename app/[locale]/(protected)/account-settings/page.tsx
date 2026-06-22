import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { PasswordForm } from "./password-form";
import { ProfileAvatarUpload } from "../profile/profile-avatar-upload";
import { CustomerCoverUpload } from "../profile/customer-cover-upload";
import { getBusinessConfig } from "@/lib/business-config";
import { getSignedBucketUrl } from "@/lib/storage/upload";
import { PROFILE_COVER_BUCKET, PROFILE_COVER_KEY, customerCoverKey } from "@/actions/admin/profile-cover-keys";

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
 *   - $_SESSION['userPicture']                 → tb_users.userPicture
 *   - $_SESSION['userName'] . $userLastName    → tb_users.userName / userlastname
 *   - $_SESSION['userID']                      → tb_users.userID (the member code)
 * `tb_*` is RLS-locked to service_role, so the read goes through the
 * admin client; the join key is `tb_users.userID === profile.member_code`
 * (the customer's "PR<n>" code).
 *
 * The change-password POST handler (account-settings.php L3-36 — verify
 * old password against tb_users.userPass, UPDATE userpass + pcs_logged)
 * is transcribed 1:1 into the Server Action `updatePasswordAction`
 * (`./actions.ts`); the form + its jQuery behaviours + SweetAlert result
 * popups (L79-247) are the `<PasswordForm>` client component.
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred. Nothing else changed.
 */

export default async function AccountSettingsPage() {
  const t = await getTranslations("accountSettingsPage");
  // Shared FB-header labels (eyebrow / account type / status) live in the
  // profilePage namespace — reuse them here so the header matches /profile.
  const tProfile = await getTranslations("profilePage");
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // header.php L12-38 — the legacy SELECT that fills $_SESSION; the
  // account-settings screen consumes userName / userLastName / userPicture.
  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select("userName, userLastName, userPicture")
    .eq("userID", memberCode)
    .maybeSingle<{
      userName: string | null;
      userLastName: string | null;
      userPicture: string | null;
    }>();
  if (userRowErr) {
    console.error(`[tb_users list] failed`, { code: userRowErr.code, message: userRowErr.message });
  }

  // $_SESSION['userName'] . ' ' . $_SESSION['userLastName']
  // (account-settings.php L72) — prefer the ported tb_users name,
  // fall back to the Pacred profile fields.
  const legacyName = [userRow?.userName, userRow?.userLastName]
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
  // (account-settings.php L69-70). The migrated tb_users.userPicture
  // holds a bare filename → reference it under the legacy images path;
  // prefer the Pacred avatar_url when set.
  const userPicture =
    profile.avatar_url ||
    (userRow?.userPicture
      ? `/legacy/pcs/images/users/${userRow.userPicture}`
      : "/legacy/pcs/images/users/user.jpg");

  // FB-style cover — same per-customer mechanism as /profile (own cover →
  // shared global banner → bundled default).
  const DEFAULT_COVER = "/images/admin/customerprofile/bannertest01g.gif";
  const myCoverPath = await getBusinessConfig<string>(customerCoverKey(memberCode), "");
  const globalCoverPath = await getBusinessConfig<string>(PROFILE_COVER_KEY, "");
  const coverPath = myCoverPath || globalCoverPath;
  const coverSrc =
    (coverPath ? await getSignedBucketUrl(PROFILE_COVER_BUCKET, coverPath, 86400) : null) ||
    DEFAULT_COVER;
  const hasMyCover = !!myCoverPath;
  const isJuristic = profile.account_type === "juristic";

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — static public/ asset, loaded via a plain
          <link> so it bypasses the app's Tailwind/PostCSS pipeline. Kept
          for the password-form SweetAlert result popup (`.pcs-swal-*`),
          which is styled here and has no Tailwind equivalent. The page
          chrome below is a Tailwind rebuild (เดฟ 2026-05-30 — Bootstrap-4
          markup rendered unstyled after Bootstrap CSS was dropped). */}
      <link rel="stylesheet" href="/legacy/pcs/account-settings.css" />

      {/* account-settings.php <title> L39 (Next.js owns <head> — kept
          here as a comment for fidelity record):
          ตั้งค่าบัญชีผู้ใช้งาน <userID> | Pacred */}

      {/* BEGIN: Content — account-settings.php L44. Wrapped in
          `.pcs-content-pad` so the (protected) layout's desktop padding
          (sidebar + FloatingTabs clearance) kicks in automatically. */}
      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6 max-w-[960px] mx-auto">
        {/* L48-59 — breadcrumb header */}
        <div className="flex items-center gap-2 text-[11px] text-muted mb-3">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">
            {t("breadcrumbHome")}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{t("breadcrumbCurrent")}</span>
        </div>

        {/* L60-123 — content-body · the account card */}
        <section className="overflow-hidden rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 md:p-6">
          {/* FB-style cover + avatar header — matches /profile (มีพื้นหลัง · แก้พื้นหลังได้ ·
              แก้รูปโปรไฟล์ได้). Reuses the SAME per-customer cover + avatar controls. */}
          <div className="relative -mx-4 -mt-4 md:-mx-6 md:-mt-6 h-28 sm:h-36 overflow-hidden bg-primary-600">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverSrc} alt="" className="h-full w-full object-cover" />
            {/* customer's own "เปลี่ยนพื้นหลัง" (bottom-right) */}
            <CustomerCoverUpload hasCustom={hasMyCover} />
          </div>
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-2 sm:gap-4 px-1">
            {/* avatar column — overlaps the cover + the change-pic control */}
            <div className="flex flex-col items-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={userPicture}
                className="relative z-20 -mt-14 sm:-mt-16 w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full object-cover bg-white ring-4 ring-white dark:ring-surface shadow-sm"
                width={120}
                alt=""
              />
              <ProfileAvatarUpload />
            </div>
            {/* name + eyebrow + member code + status */}
            <div className="min-w-0 flex flex-1 flex-col items-center sm:items-start gap-1.5 sm:pt-2">
              <div className="flex flex-wrap items-baseline justify-center sm:justify-start gap-x-2 gap-y-0.5">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground leading-tight break-words">
                  {fullName}
                </h2>
                <span className="text-[11px] font-semibold tracking-wide text-primary-600">
                  {tProfile("myAccountEyebrow")} · {isJuristic ? tProfile("accountJuristic") : tProfile("accountPersonal")}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base sm:text-lg font-bold font-mono text-foreground">{userID}</span>
                <span className="rounded-full border border-green-200 bg-green-50 px-3 py-0.5 text-xs font-medium text-green-700">
                  {tProfile("statusActive")}
                </span>
              </div>
            </div>
          </div>

          {/* L75-115 — change-password form (centered, narrower on desktop) */}
          <div className="mx-auto w-full max-w-[480px] mt-5 border-t border-border pt-5">
            <PasswordForm />
          </div>
        </section>
      </div>
      {/* END: Content — L127 */}
    </div>
  );
}
