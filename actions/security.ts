"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validators/security";

type ActionResult = { ok: true } | { ok: false; error: string };

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
