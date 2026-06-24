"use server";

/**
 * D1 Wave 18-A — admin password-reset action for migrated PCS customers.
 *
 * Legacy ground truth: `pcs-admin/users.php` per-row "รีเซ็ตรหัสผ่าน" button.
 * Admin generates a 6-char random password, force-sets it on the customer's
 * auth.users row, then surfaces the cleartext to the admin so they can relay
 * it to the customer over phone / LINE. The customer logs in with the new
 * password and is encouraged to change it from /account.
 *
 * Implementation notes:
 *   - Identity bridge: legacy `tb_users.userid` (e.g. "PR2791") maps 1:1 to
 *     `profiles.member_code` per migration 0103; the auth user's UUID lives
 *     at `profiles.id`. We look that up before calling `admin.auth.admin
 *     .updateUserById(..., { password })` — the exact pattern used by
 *     `lib/auth/pcs-legacy-bridge.ts:231`.
 *   - `tb_users."userPass"` (the legacy passTam hash) IS now re-written via
 *     `syncLegacyUserPass` (owner 2026-06-24). The old assumption — "every
 *     subsequent sign-in goes straight through Supabase Auth" — is FALSE for a
 *     migrated customer who logs in BY PHONE: their auth row has the synthetic
 *     email + no phone, so native signIn misses and the legacy bridge verifies
 *     against `userPass`. Leaving it stale broke login after every reset
 *     (PR050 + many legacy customers). We now write BOTH.
 *   - Role gate: `super` + `sales_admin` (and `accounting` for the
 *     telephone-support workflow). Matches the legacy users.php gate.
 *   - Generated password: 6 chars from an alphanumeric set excluding the
 *     visually-confusable trio (`O`/`0`/`l`/`1`/`I`) so customers don't
 *     mis-type it.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncLegacyUserPass } from "@/lib/auth/sync-legacy-userpass";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const inputSchema = z.object({
  // tb_users.userid is a varchar(10) — "PR" + up to 8 digits in practice.
  userid: z.string().trim().min(1, "missing userid").max(10),
});
export type AdminResetCustomerPasswordInput = z.infer<typeof inputSchema>;

export type AdminResetCustomerPasswordData = {
  userid: string;
  /** The newly-set cleartext password — shown ONCE so the admin can relay it. */
  new_password: string;
};

// Alphanumeric, no visually-confusable chars (O / 0 / l / 1 / I).
const PWD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generatePassword(length = 6): string {
  // crypto.getRandomValues is web-standard + works in Edge/Node 20+.
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PWD_ALPHABET[bytes[i] % PWD_ALPHABET.length];
  }
  return out;
}

export async function adminResetCustomerPassword(
  input: AdminResetCustomerPasswordInput,
): Promise<AdminActionResult<AdminResetCustomerPasswordData>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { userid } = parsed.data;

  return withAdmin(["super", "sales_admin", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Map legacy member_code (tb_users.userid) → auth.users.id via profiles.
    const { data: profile, error: lookupErr } = await admin
      .from("profiles")
      .select("id, member_code")
      .eq("member_code", userid)
      .maybeSingle<{ id: string; member_code: string }>();

    if (lookupErr) return { ok: false, error: lookupErr.message };
    if (!profile?.id) {
      // No bridge row yet — Phase-A provisioned all 8,886 migrated customers,
      // so the only way to land here is a typo, a brand-new (unmigrated) row,
      // or a manual delete. Surface the gap rather than silently creating an
      // auth user that nothing else can map back.
      return { ok: false, error: "no_auth_user_for_member_code" };
    }

    const newPassword = generatePassword(6);

    const { error: updErr } = await admin.auth.admin.updateUserById(profile.id, {
      password: newPassword,
    });
    if (updErr) return { ok: false, error: updErr.message };

    // owner 2026-06-24 — ALSO write the legacy passTam hash so a migrated PCS
    // customer who logs in BY PHONE (auth row has the synthetic email + no
    // phone → native miss → legacy bridge checks tb_users."userPass") can log
    // in with the reset password. Previously this was left stale → "ลูกค้าเก่า
    // login ไม่ได้หลังรีรหัส" (PR050 + many). Best-effort.
    await syncLegacyUserPass(userid, newPassword);

    await logAdminAction(adminId, "tb_users.password_reset", "tb_users", userid, {
      reset_by:   adminId,
      profile_id: profile.id,
      // Never store cleartext password in audit payload — only the fact that
      // a reset happened. The cleartext is delivered to the admin's screen
      // (return value) for one-time relay.
    });

    return {
      ok: true,
      data: { userid, new_password: newPassword },
    };
  });
}
