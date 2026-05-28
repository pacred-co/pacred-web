"use server";

/**
 * Server Action for the faithful-port `/account-settings` screen — the
 * password-change handler ported from the legacy PCS Cargo
 * `member/account-settings.php` POST block (lines 3-36).
 *
 * D1 / ADR-0017 · runbook `docs/runbook/faithful-port-transcription.md`.
 *
 * The legacy flow (account-settings.php L3-36), reproduced:
 *   1. require password / password1 / password2 non-empty   → else "empty"
 *   2. password1 === password2                              → else 'eConfirm'
 *   3. pass_tam()-hash old; SELECT … WHERE userPass=<old>    → 0 rows → 'ePass'
 *   4. UPDATE tb_users SET userPass=<new>, pcs_logged=<new>  → 'eSQL' / 'sPass'
 *   5. on 'sPass' the page redirects to logout/.
 *
 * ⚠️ Faithful ≠ literal here. The legacy PCS system stores the password
 * ONLY in `tb_users.userPass`. Pacred's auth is SPLIT — Supabase Auth is
 * the live credential store, `tb_users` is the legacy-bridge mirror. A
 * literal port (write `tb_users` only) would DESYNC the two:
 *   - the new password would NOT sign the customer in — native Supabase
 *     auth still holds the old one, and the bridge re-checks Supabase too;
 *   - the legacy old-password check `SELECT … FROM tb_users` always fails
 *     for a NATIVE Pacred customer — they have no `tb_users` row at all.
 * So to reproduce the legacy *behaviour* — "change password → it works,
 * for every customer" — this port:
 *   - verifies the old password against Supabase Auth (the universal,
 *     live store — works for native AND migrated-then-bridged customers);
 *   - writes the new password to Supabase Auth (so it actually logs in);
 *   - best-effort mirrors it into `tb_users.userPass` + `pcs_logged` so
 *     the legacy bridge stays consistent (a no-op for native customers).
 * The `pass_tam()` hash is the existing `passTam()` primitive the login
 * bridge already uses (`lib/auth/pcs-legacy-password.ts`) — no new crypto.
 */

import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { passTam } from "@/lib/auth/pcs-legacy-password";
import { signOutAction } from "@/actions/auth";

/**
 * Mirrors the legacy `$sweetalert` outcome codes so the page renders the
 * matching SweetAlert (account-settings.php lines 206-247):
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
  if (!data?.user) redirect("/login");
  if (!data.profile) redirect("/complete-profile");
  const memberCode = data.profile.member_code ?? "";

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

  // account-settings.php L18-20 — verify the OLD password. The legacy
  // checks `tb_users.userPass`; the faithful Pacred equivalent verifies
  // against Supabase Auth — the live store, works for native + migrated.
  const supabase = await createClient();
  const identifier = data.user.phone
    ? { phone: data.user.phone }
    : data.user.email
      ? { email: data.user.email }
      : null;
  if (!identifier) {
    // No usable identifier to re-verify against — treat as a failed
    // old-password check rather than silently allowing the change.
    return { sweetalert: "ePass" };
  }
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    ...identifier,
    password,
  });
  if (verifyErr) {
    // account-settings.php L21 — $sweetalert = 'ePass'
    return { sweetalert: "ePass" };
  }

  // account-settings.php L23-30 — write the new password.
  const admin = createAdminClient();

  // Supabase Auth — the live credential store (so the new password
  // actually signs the customer in on their next login).
  const { error: authErr } = await admin.auth.admin.updateUserById(
    data.user.id,
    { password: password1 },
  );
  if (authErr) {
    // account-settings.php L27 — $sweetalert = 'eSQL'
    return { sweetalert: "eSQL" };
  }

  // tb_users mirror — faithful to legacy L23-24. The legacy writes the
  // pass_tam() hash into userPass; pcs_logged then gets pass_tam() of the
  // ALREADY-hashed value (a legacy double-hash quirk — reproduced as-is).
  // A no-op for a native Pacred customer (0 rows match) — never fatal.
  const userPass2 = passTam(password1);
  const pcsLogged = passTam(userPass2);
  await admin
    .from("tb_users")
    .update({ userPass: userPass2, pcs_logged: pcsLogged })
    .eq("userID", memberCode);

  // account-settings.php L29 — $sweetalert = 'sPass'
  return { sweetalert: "sPass" };
}

/**
 * account-settings.php L216-218 — on success the legacy page does
 * `window.location.replace(basePath + "logout/")`. The screen's client
 * wrapper calls this once the success SweetAlert has shown.
 */
export async function accountSettingsLogoutAction(): Promise<void> {
  await signOutAction();
}
