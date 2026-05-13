"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestOtp, verifyOtp } from "@/actions/otp";
import { normalizePhone } from "@/lib/utils/phone";
import {
  changePasswordSchema,
  confirmPhoneChangeSchema,
  requestPhoneChangeSchema,
  type ChangePasswordInput,
  type ConfirmPhoneChangeInput,
  type RequestPhoneChangeInput,
} from "@/lib/validators/security";

type ActionResult = { ok: true } | { ok: false; error: string };
type OtpResult    = { ok: true; bypass?: boolean } | { ok: false; error: string };

/**
 * Change password. Verifies the current password by re-signing in with
 * Supabase before issuing the update, so a stolen session can't change
 * the password without knowing the current one. Mirrors what legacy
 * account-settings.php did (require current pass before write).
 */
export async function changePassword(input: ChangePasswordInput): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { ok: false, error: "not_signed_in" };

  // Verify current password by attempting a fresh sign-in
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email:    user.email,
    password: d.currentPassword,
  });
  if (verifyErr) {
    return { ok: false, error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
  }

  // Update to the new password
  const { error: updErr } = await supabase.auth.updateUser({ password: d.newPassword });
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/profile");
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════
// P-3 · Change phone (atomic across auth.users + profiles)
// ════════════════════════════════════════════════════════════════════════
//
// 2-step flow:
//   1) requestPhoneChangeOtp(): verify password, ensure phone is free,
//      issue an OTP to the *new* phone via the existing custom OTP
//      gateway (purpose="change_phone").
//   2) confirmPhoneChange(): verify OTP, then update both auth.users.phone
//      (admin API — skips Supabase's built-in confirmation OTP since we
//      already verified our own) AND profiles.phone. If the profile write
//      fails after the auth update succeeded, we revert auth back to the
//      old phone so the two sources don't drift.
//
// SMS gateway is currently behind OTP_BYPASS=true while ThaiBulkSMS /
// กสทช. paperwork is pending (ก๊อต wires the live sender once approved).
// The full flow is wired end-to-end so the moment OTP_BYPASS flips off,
// real codes start flowing without any code change here.

/** Step 1: verify password + send OTP to the new phone. */
export async function requestPhoneChangeOtp(
  input: RequestPhoneChangeInput,
): Promise<OtpResult> {
  const parsed = requestPhoneChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // We require an email on file to re-verify the password. OAuth users
  // without a password should not see this flow at all (UI hides it), but
  // guard server-side anyway.
  if (!user.email) {
    return { ok: false, error: "บัญชีนี้ไม่มีรหัสผ่าน ติดต่อทีมงานเพื่อเปลี่ยนเบอร์" };
  }

  // Verify current password by re-signing in (same trick as changePassword)
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email:    user.email,
    password: d.currentPassword,
  });
  if (verifyErr) {
    return { ok: false, error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
  }

  const newPhone = normalizePhone(d.newPhone);

  // Reject if the user typed their own current phone
  const currentPhone = user.phone ? normalizePhone(user.phone) : null;
  if (currentPhone && currentPhone === newPhone) {
    return { ok: false, error: "เบอร์ใหม่ต้องไม่เหมือนเบอร์เดิม" };
  }

  // Reject if some other profile already owns this phone
  const admin = createAdminClient();
  const { data: clash } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", newPhone)
    .neq("id", user.id)
    .maybeSingle();
  if (clash) {
    return { ok: false, error: "เบอร์นี้ถูกใช้กับบัญชีอื่นแล้ว" };
  }

  return await requestOtp(newPhone, "change_phone");
}

/** Step 2: verify OTP + atomically update auth.users.phone and profiles.phone. */
export async function confirmPhoneChange(
  input: ConfirmPhoneChangeInput,
): Promise<ActionResult> {
  const parsed = confirmPhoneChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const newPhone = normalizePhone(d.newPhone);
  const oldPhone = user.phone ? normalizePhone(user.phone) : null;

  const verified = await verifyOtp(newPhone, d.otp, "change_phone");
  if (!verified) {
    return { ok: false, error: "รหัส OTP ไม่ถูกต้องหรือหมดอายุ" };
  }

  const admin = createAdminClient();

  // Re-check phone availability right before the write (small TOCTOU window
  // since requestPhoneChangeOtp — another user could have grabbed it).
  const { data: clash } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", newPhone)
    .neq("id", user.id)
    .maybeSingle();
  if (clash) {
    return { ok: false, error: "เบอร์นี้ถูกใช้กับบัญชีอื่นแล้ว" };
  }

  // Step A: update auth.users.phone (admin path bypasses Supabase's own
  // OTP confirmation since we already gated with our custom OTP above).
  const { error: authErr } = await admin.auth.admin.updateUserById(user.id, {
    phone:         newPhone.replace(/^\+/, ""),  // Supabase stores phones without leading "+"
    phone_confirm: true,
  });
  if (authErr) {
    return { ok: false, error: authErr.message };
  }

  // Step B: update profiles.phone. If this fails, revert auth so the two
  // tables don't drift.
  const { error: profErr } = await admin
    .from("profiles")
    .update({ phone: newPhone })
    .eq("id", user.id);
  if (profErr) {
    if (oldPhone) {
      await admin.auth.admin.updateUserById(user.id, {
        phone:         oldPhone.replace(/^\+/, ""),
        phone_confirm: true,
      });
    }
    return { ok: false, error: profErr.message };
  }

  revalidatePath("/profile");
  return { ok: true };
}
