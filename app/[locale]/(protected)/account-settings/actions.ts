"use server";

/**
 * Server Action for the faithful-port `/account-settings` screen — the
 * password-change handler transcribed 1:1 from the legacy PCS Cargo
 * `member/account-settings.php` POST block (lines 3-36).
 *
 * D1 / ADR-0017 · runbook `docs/runbook/faithful-port-transcription.md`.
 *
 * The legacy PHP flow, reproduced verbatim:
 *   1. require password / password1 / password2 all non-empty
 *      → else alert "กรุณากรอกข้อมูลให้ครบ"
 *   2. password1 === password2 → else $sweetalert = 'eConfirm'
 *   3. hash old + new with pass_tam() (encryptPass.php)
 *   4. SELECT userID FROM tb_users WHERE userPass=<old> AND userID=<id>
 *      → 0 rows → $sweetalert = 'ePass'  (รหัสผ่านเดิมไม่ถูกต้อง)
 *   5. UPDATE tb_users SET userPass=<new>, pcs_logged=<new> WHERE userID=<id>
 *      → fail → $sweetalert = 'eSQL' ; ok → $sweetalert = 'sPass'
 *   6. on sPass the legacy page Swal-redirects to `logout/`.
 *
 * Notes on the faithful port:
 *   - The legacy `pass_tam()` hash is the existing `passTam()` in
 *     `lib/auth/pcs-legacy-password.ts` — the same primitive the login
 *     bridge already uses. No new crypto.
 *   - `tb_*` is RLS-locked to service_role → the SELECT/UPDATE go
 *     through `createAdminClient()`. The customer is resolved from the
 *     session (`getCurrentUserWithProfile`) and the legacy `$userID`
 *     is `profile.member_code` (the "PR<n>" code).
 *   - The legacy column `tb_users.pcs_logged` is the "remembered login"
 *     token; the legacy update writes the new password hash into BOTH
 *     `userPass` and `pcs_logged` — reproduced exactly so the existing
 *     cookie/session bridge keeps working.
 */

import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { passTam } from "@/lib/auth/pcs-legacy-password";
import { signOutAction } from "@/actions/auth";

/**
 * Mirrors the legacy `$sweetalert` outcome codes so the page can render
 * the matching SweetAlert (account-settings.php lines 206-247).
 *   sPass    — อัปเดตข้อมูลสำเร็จ (then logout)
 *   eSQL     — ผิดพลาด / กรุณาลองใหม่
 *   ePass    — รหัสผ่านเดิมไม่ถูกต้อง
 *   eConfirm — รหัสใหม่ไม่ตรงกัน
 *   empty    — กรุณากรอกข้อมูลให้ครบ (legacy `alert()`)
 */
export type AccountSettingsResult =
  | { sweetalert: "sPass" | "eSQL" | "ePass" | "eConfirm" | "empty" };

export async function updatePasswordAction(
  _prev: AccountSettingsResult | null,
  formData: FormData,
): Promise<AccountSettingsResult> {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const userID = data.profile.member_code ?? "";

  // account-settings.php L3-7 — isset($_POST['update']) + all fields filled
  const password = String(formData.get("password") ?? "");
  const password1 = String(formData.get("password1") ?? "");
  const password2 = String(formData.get("password2") ?? "");
  if (password === "" || password1 === "" || password2 === "") {
    return { sweetalert: "empty" };
  }

  // account-settings.php L13 — new vs confirm
  if (password1 !== password2) {
    return { sweetalert: "eConfirm" };
  }

  // account-settings.php L14-16 — pass_tam() hash of old + confirm
  const userPass = passTam(password);
  const userPass2 = passTam(password2);

  const admin = createAdminClient();

  // account-settings.php L18-20 — verify the old password matches
  // SELECT userID FROM tb_users WHERE userPass=<old> AND userID=<id>
  const { data: matchRow } = await admin
    .from("tb_users")
    .select("userid")
    .eq("userpass", userPass)
    .eq("userid", userID)
    .maybeSingle<{ userid: string }>();

  if (!matchRow) {
    // L21 — $sweetalert = 'ePass'
    return { sweetalert: "ePass" };
  }

  // account-settings.php L23-30 — UPDATE userPass + pcs_logged
  const pcsLogged = passTam(password2);
  const { error: updateError } = await admin
    .from("tb_users")
    .update({ userpass: userPass2, pcs_logged: pcsLogged })
    .eq("userid", userID);

  if (updateError) {
    // L27 — $sweetalert = 'eSQL'
    return { sweetalert: "eSQL" };
  }

  // L29 — $sweetalert = 'sPass'
  return { sweetalert: "sPass" };
}

/**
 * account-settings.php L216-218 — on success the legacy page does
 * `window.location.replace(basePath + "logout/")`. The screen's
 * client wrapper calls this once the success SweetAlert closes.
 */
export async function accountSettingsLogoutAction(): Promise<void> {
  await signOutAction();
}
