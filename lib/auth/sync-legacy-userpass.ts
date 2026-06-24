import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { passTam } from "./pcs-legacy-password";

/**
 * Keep the legacy `tb_users."userPass"` (passTam hash) in sync whenever a
 * password is reset or changed — the fix for the recurring "ลูกค้าเก่า login
 * ไม่ได้หลังรีรหัส" bug (owner 2026-06-24, PR050 + many other migrated customers).
 *
 * WHY: a migrated PCS customer's `auth.users` row was provisioned with a
 * SYNTHETIC email (`pcs-legacy-<code>@users.pacred.invalid`) and NO phone. When
 * such a customer logs in BY PHONE, native Supabase `signInWithPassword({phone})`
 * misses (no phone on the auth row) → the request falls through to the legacy
 * bridge (`lib/auth/pcs-legacy-bridge.ts`), which verifies the typed password
 * against `tb_users."userPass"` (the passTam hash). Every reset path only ever
 * updated Supabase Auth (`updateUserById`/`updateUser`), leaving `userPass`
 * stale — so the new password was NEVER accepted on the phone-login path. This
 * helper closes that gap: after any reset, write `passTam(newPassword)` to
 * `userPass` too, so BOTH the native (Auth) path AND the legacy-bridge (userPass)
 * path accept the new password. Faithful to legacy `pcs-admin/users.php`, which
 * always wrote `userPass` on reset.
 *
 * BEST-EFFORT: never throws. A row miss = a Pacred-native (non-migrated)
 * customer with no `tb_users` row, which is fine — their password lives only in
 * Supabase Auth and the bridge never fires for them.
 *
 * The column is the quoted mixed-case `"userPass"` keyed by `"userID"` (=
 * member_code); PostgREST preserves that casing, matching the bridge's own
 * SELECT.
 */
export async function syncLegacyUserPass(
  userid: string | null | undefined,
  plaintext: string,
): Promise<void> {
  const code = (userid ?? "").trim();
  if (code === "" || !plaintext) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("tb_users")
      .update({ userPass: passTam(plaintext) })
      .eq("userID", code);
    if (error) {
      console.error("[syncLegacyUserPass] update failed", {
        code: error.code,
        message: error.message,
        userid: code,
      });
    }
  } catch (err) {
    console.error("[syncLegacyUserPass] threw", { userid: code, err: String(err) });
  }
}
