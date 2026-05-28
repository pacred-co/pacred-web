"use server";

/**
 * Server Action for the faithful-port `/profile` screen — the
 * edit-profile handler ported from the legacy PCS Cargo
 * `member/profile.php` POST block (lines 4-66).
 *
 * D1 / ADR-0017 · runbook `docs/runbook/faithful-port-transcription.md`.
 *
 * The legacy flow (profile.php L4-66), reproduced 1:1:
 *   1. require userName / userLastName / userTel / userBirthday /
 *      userSex non-empty  → else alert("กรุณากรอกข้อมูลให้ครบ")
 *   2. SELECT ID FROM tb_users WHERE userID=<id>  → 0 rows →
 *      alert("ไม่มีบัญชีผู้ใช้นี้แล้ว")
 *   3. SELECT userEmail FROM tb_users WHERE userTel=<new>
 *      AND userTel<>${currentTel}  → >0 rows →
 *      alert("มีอีเมลนี้แล้วในระบบ")   [legacy dedupes on PHONE]
 *   4. UPDATE tb_users SET userName/userLastName/userEmail/userLineID/
 *      userFacebook/userTel/userSex/userBirthday  → fail → 'errorUpdate'
 *   5. if the phone changed → DELETE FROM tb_users_otp WHERE userID=<id>
 *   6. → 'successUpdate'
 *
 * The legacy screen is a PURE form mutation — this Server Action is the
 * faithful equivalent of the legacy `if(isset($_POST["update"]))` block.
 * The render path (page.tsx) does NOT mutate.
 *
 * `tb_*` is RLS-locked to service_role, so the writes go through the
 * admin client. The join key is `tb_users.userid === profile.member_code`
 * (the customer's "PR<n>" code).
 *
 * ⚠️ Faithful-port note — email is NOT desynced here. The legacy PCS
 * stores the email only in `tb_users.userEmail`; Pacred's auth keeps the
 * sign-in email in Supabase Auth. The legacy block at L34-39 / L58-60
 * has the activation-key regeneration STUBBED OUT (empty if/else) — so
 * faithfully, the legacy itself does NOT touch the auth/login email on a
 * profile edit. This port mirrors that: it writes `tb_users.userEmail`
 * (the legacy column, what the screen reads back) and leaves Supabase
 * Auth's credential email alone — exactly the legacy behaviour.
 */

import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/utils/phone";
import { revalidatePath } from "next/cache";

/**
 * Mirrors the legacy `$sweetalert` outcome + the inline `alert()`
 * branches of profile.php so the page can render the matching popup:
 *   successUpdate — อัปเดตข้อมูลสำเร็จ (SweetAlert, L536-543)
 *   errorUpdate   — ผิดพลาด / กรุณาลองใหม่อีกครั้ง (SweetAlert, L544-552)
 *   empty         — กรุณากรอกข้อมูลให้ครบ (alert, L10)
 *   noAccount     — ไม่มีบัญชีผู้ใช้นี้แล้ว (alert, L27)
 *   dupTel        — มีอีเมลนี้แล้วในระบบ (alert, L32 — legacy text is
 *                   "อีเมล" though the check is on phone; kept verbatim)
 */
export type ProfileUpdateResult = {
  sweetalert: "successUpdate" | "errorUpdate" | "empty" | "noAccount" | "dupTel";
};

export async function updateProfileAction(
  _prev: ProfileUpdateResult | null,
  formData: FormData,
): Promise<ProfileUpdateResult> {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { sweetalert: "errorUpdate" };
  const memberCode = data.profile.member_code ?? "";

  // profile.php L14-21 — read the posted fields (legacy escapes via
  // mysqli_real_escape_string; the Supabase client parametrises, so the
  // escape is the client's job — we just trim).
  const userName = String(formData.get("userName") ?? "").trim();
  const userLastName = String(formData.get("userLastName") ?? "").trim();
  const userEmail = String(formData.get("userEmail") ?? "").trim().toLowerCase();
  const userBirthday = String(formData.get("userBirthday") ?? "").trim();
  const userTel = String(formData.get("userTel") ?? "").trim();
  const userSex = String(formData.get("userSex") ?? "").trim();
  const userFacebook = String(formData.get("userFacebook") ?? "").trim();
  const userLineID = String(formData.get("userLineID") ?? "").trim();

  // profile.php L5-10 — required-fields check.
  if (
    userName === "" ||
    userLastName === "" ||
    userTel === "" ||
    userBirthday === "" ||
    userSex === ""
  ) {
    return { sweetalert: "empty" };
  }

  const admin = createAdminClient();

  // profile.php L24-27 — account still exists?
  const { data: exists, error: existsErr } = await admin
    .from("tb_users")
    .select("id")
    .eq("userid", memberCode)
    .maybeSingle();
  if (existsErr) {
    console.error(`[tb_users list] failed`, { code: existsErr.code, message: existsErr.message });
  }
  if (!exists) {
    return { sweetalert: "noAccount" };
  }

  // profile.php L29-32 — the current phone on file (legacy $userTel2 =
  // getMessage($userTel), i.e. the SESSION phone). Read it so the
  // dedupe-check can exclude the customer's own row.
  const { data: currentRow, error: currentRowErr } = await admin
    .from("tb_users")
    .select("usertel")
    .eq("userid", memberCode)
    .maybeSingle<{ usertel: string | null }>();
  if (currentRowErr) {
    console.error(`[tb_users list] failed`, { code: currentRowErr.code, message: currentRowErr.message });
  }
  const currentTel = currentRow?.usertel ?? "";

  // profile.php L29-32 — phone uniqueness: any OTHER user holding this
  // phone? (legacy: WHERE userTel='$userTel' AND userTel<>'$userTel2').
  if (userTel !== currentTel) {
    const { count } = await admin
      .from("tb_users")
      .select("id", { count: "exact", head: true })
      .eq("usertel", userTel)
      .neq("userid", memberCode);
    if ((count ?? 0) > 0) {
      return { sweetalert: "dupTel" };
    }
  }

  // profile.php L40-49 — the UPDATE.
  const { error: updateErr } = await admin
    .from("tb_users")
    .update({
      username: userName,
      userlastname: userLastName,
      useremail: userEmail,
      userlineid: userLineID,
      userfacebook: userFacebook,
      usertel: userTel,
      usersex: userSex,
      userbirthday: userBirthday,
    })
    .eq("userid", memberCode);
  if (updateErr) {
    // profile.php L51 — $sweetalert = 'errorUpdate'
    return { sweetalert: "errorUpdate" };
  }

  // profile.php L53-57 — phone changed → drop the customer's OTP rows.
  // Pacred-port addition (runbook §9.7): the legacy stores the phone only
  // in tb_users, but Pacred auth is SPLIT — the sign-in phone lives in
  // Supabase Auth. Writing tb_users alone would desync them: the new
  // number could not sign the customer in. Keep Supabase Auth's phone in
  // sync. Best-effort — the tb_users write above already succeeded.
  if (userTel !== currentTel) {
    await admin.auth.admin.updateUserById(data.user.id, {
      phone: normalizePhone(userTel),
    });
    await admin.from("tb_users_otp").delete().eq("userid", memberCode);
  }

  // profile.php L61 — $sweetalert = 'successUpdate'
  revalidatePath("/profile");
  return { sweetalert: "successUpdate" };
}

/**
 * Email-uniqueness check — a 1:1 port of the legacy AJAX endpoint
 * `member/include/pages/profile/checkEmailUser.php`. The legacy SQL:
 *   SELECT userEmail FROM tb_users
 *   WHERE userEmail=<input> AND userEmail<>${sessionEmail} AND userStatus<>'0'
 * → if a row exists, echo the "มีบัญชีผู้ใช้สำหรับอีเมลนี้แล้ว!" message.
 *
 * The legacy excludes the customer's OWN current email (so re-saving an
 * unchanged email is not flagged). Returns the legacy message text on a
 * collision, "" otherwise (the form's focusout handler uses non-empty
 * to mark the input invalid + disable submit — profile.php L429-435).
 */
export async function checkEmailTaken(userEmail: string): Promise<string> {
  const email = userEmail.trim().toLowerCase();
  if (email === "") return "";

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return "";
  const memberCode = data.profile.member_code ?? "";
  const admin = createAdminClient();

  // The current email on file — the legacy excludes it via
  // `userEmail<>${_SESSION['userEmail']}`.
  const { data: ownRow, error: ownRowErr } = await admin
    .from("tb_users")
    .select("useremail")
    .eq("userid", memberCode)
    .maybeSingle<{ useremail: string | null }>();
  if (ownRowErr) {
    console.error(`[tb_users list] failed`, { code: ownRowErr.code, message: ownRowErr.message });
  }
  const ownEmail = (ownRow?.useremail ?? "").toLowerCase();

  let query = admin
    .from("tb_users")
    .select("id", { count: "exact", head: true })
    .eq("useremail", email)
    .neq("userstatus", "0");
  if (ownEmail !== "") query = query.neq("useremail", ownEmail);

  const { count } = await query;
  return (count ?? 0) > 0 ? "มีบัญชีผู้ใช้สำหรับอีเมลนี้แล้ว!" : "";
}

/**
 * Phone-uniqueness check — a 1:1 port of the legacy AJAX endpoint
 * `member/include/pages/profile/checkTelUser.php`. The legacy SQL:
 *   SELECT userTel FROM tb_users
 *   WHERE userTel=<input> AND userTel<>${sessionTel} AND userStatus<>'0'
 * → if a row exists, echo the "มีบัญชีผู้ใช้สำหรับเบอรฺโทรนี้แล้ว!" message
 * (the legacy string has the original typo "เบอรฺ" — kept verbatim per
 * the faithful-port rule).
 *
 * Excludes the customer's own current phone; returns the legacy message
 * text on a collision, "" otherwise.
 */
export async function checkTelTaken(userTel: string): Promise<string> {
  const tel = userTel.trim();
  if (tel === "") return "";

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return "";
  const memberCode = data.profile.member_code ?? "";
  const admin = createAdminClient();

  const { data: ownRow, error: ownRowErr } = await admin
    .from("tb_users")
    .select("usertel")
    .eq("userid", memberCode)
    .maybeSingle<{ usertel: string | null }>();
  if (ownRowErr) {
    console.error(`[tb_users list] failed`, { code: ownRowErr.code, message: ownRowErr.message });
  }
  const ownTel = ownRow?.usertel ?? "";

  let query = admin
    .from("tb_users")
    .select("id", { count: "exact", head: true })
    .eq("usertel", tel)
    .neq("userstatus", "0");
  if (ownTel !== "") query = query.neq("usertel", ownTel);

  const { count } = await query;
  return (count ?? 0) > 0 ? "มีบัญชีผู้ใช้สำหรับเบอรฺโทรนี้แล้ว!" : "";
}
