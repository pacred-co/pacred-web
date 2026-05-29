/**
 * G6 · server-side companion to `default-queue-filter.ts`.
 *
 * `default-queue-filter.ts` is intentionally pure (testable without DB);
 * this module adds the Supabase-touching helpers a Server Component
 * needs to look up the admin's `legacy_admin_id` (for /admin/customers
 * sales_admin landing) before calling `buildDefaultLandingRedirect`.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Look up the admin's legacy PCS id (`admin_<nickname>` string) so we
 * can scope `/admin/customers` to their own book via `?adminidsale=`.
 *
 * Returns null when:
 *   - userId is null/empty
 *   - The admin has no row in `admin_contact_extras`
 *   - The admin's row has no `legacy_admin_id` set (= Pacred-native
 *     fresh hire, never bridged to PCS)
 *
 * Non-throwing: errors are logged but the redirect path falls back to
 * "no default filter" if lookup fails. Better to show unfiltered than
 * block the page on a transient DB hiccup.
 */
export async function getAdminLegacyId(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_contact_extras")
    .select("legacy_admin_id")
    .eq("profile_id", userId)
    .maybeSingle<{ legacy_admin_id: string | null }>();
  if (error) {
    console.error(`[admin_contact_extras lookup] failed`, {
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return data?.legacy_admin_id ?? null;
}
