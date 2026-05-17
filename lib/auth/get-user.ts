/**
 * Server-side helpers to read the current user + profile.
 *
 * Always use these in Server Components / Server Actions / Route Handlers
 * so RLS protects data access via the user's session cookie.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readActiveImpersonation } from "@/lib/auth/impersonation";

export type Profile = {
  // identity
  id: string;
  account_type: "personal" | "juristic";
  member_code: string | null;
  status: "incomplete" | "active" | "suspended";
  is_active: boolean;

  // contact
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;

  // marketing/sign-up
  services: string[] | null;
  how_know: string | null;
  register_with: "email" | "facebook" | "google" | "line" | null;
  referral_channel: string | null;
  recommended_by: string | null;

  // juristic-only (extended in B2 corporate table)
  tax_id: string | null;
  company_name: string | null;
  address: Record<string, unknown> | null;

  // demographics
  sex: "male" | "female" | "other" | null;
  birthday: string | null;
  last_login_at: string | null;

  // media + socials
  avatar_url: string | null;
  line_id: string | null;
  facebook_url: string | null;

  // LINE Messaging API push (ADR-0001)
  line_user_id: string | null;
  line_linked_at: string | null;
  notify_channels: { line: boolean; email: boolean } | null;

  // customer classification
  customer_group: string;
  freight_type: "seafreight" | "cargo" | null;
  shop_user: boolean;

  // admin linkage
  admin_id: string | null;
  sales_admin_id: string | null;

  // shipping preferences
  transport_type: string | null;
  ship_by: string | null;
  pay_method: "origin" | "destination" | null;

  // credit + comparison
  comparison_enabled: boolean;
  comparison_value: number;
  credit_enabled: boolean;
  credit_limit: number;
  credit_days: number;

  note: string | null;

  // TOS acceptance (B6)
  tos_accepted_version: string | null;
  tos_accepted_at: string | null;

  created_at: string;
  updated_at: string;
};

/**
 * Returns the current Supabase auth user, or null if not signed in.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Returns the current user + their profile row.
 * Profile may be null if user signed up but profile row hasn't been created yet.
 */
export async function getCurrentUserWithProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  return { user, profile };
}

// ════════════════════════════════════════════════════════════
// G-4 · getEffectiveUser — impersonation-aware user resolver
// ════════════════════════════════════════════════════════════
// Returns either the signed-in admin (no impersonation) OR the target
// customer's profile (when impersonation is active + valid). The
// returned profile carries `_impersonating: true` so callers can
// branch on it (banner UI, mutation refusal, etc.).
//
// Behaviour:
//   - not signed in            → null
//   - signed in, no impersonation → { profile, _impersonating:false }
//   - signed in, impersonating  → { profile=TARGET, _impersonating:true,
//                                   adminId, sessionId, expiresAt }
//
// Admin role re-verification + session expiry check happens inside
// readActiveImpersonation (lib/auth/impersonation.ts). On any failure
// path (cookie expired, admin role revoked, session ended) it silently
// downgrades to the non-impersonating branch — the customer can still
// proceed as themselves; the stale cookie just gets ignored.
//
// ── Adoption status ─────────────────────────────────────────
// V1 of G-4 ships the foundation: cookie, session row, audit,
// banner mount, write block. The (protected) pages still call
// requireAuth() / getCurrentUserWithProfile() which return the
// ADMIN's profile, so most page chrome (sidebar badges, TOS gate)
// reflects the admin during impersonation. The banner confirms
// the mode is active + writes refuse + the customer's RLS reads
// scoped to target_profile_id flow through getEffectiveUser when
// a page is migrated. Progressive page adoption is a V2 task —
// the security goal (read-only + audited) is met today.

export type EffectiveProfile = Profile & {
  _impersonating: false;
} | Profile & {
  _impersonating: true;
  _admin_id:      string;
  _session_id:    string;
  _expires_at:    string;
};

export async function getEffectiveUser(): Promise<
  | null
  | {
      profile: EffectiveProfile;
      /** Convenience flag mirroring profile._impersonating. */
      isImpersonating: boolean;
    }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Check for an active impersonation session.
  const impersonation = await readActiveImpersonation(user.id);

  if (!impersonation) {
    // Plain self — read own profile via the RLS-scoped client.
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();
    if (!profile) return null;
    return {
      profile: { ...profile, _impersonating: false } as EffectiveProfile,
      isImpersonating: false,
    };
  }

  // Impersonating — read the TARGET profile via the admin client so
  // we don't get blocked by any RLS edge case (e.g. admin lacks
  // direct access to a suspended profile that the customer themselves
  // would still see).
  const adminClient = createAdminClient();
  const { data: targetProfile } = await adminClient
    .from("profiles")
    .select("*")
    .eq("id", impersonation.target_profile_id)
    .maybeSingle<Profile>();

  // If the target profile vanished mid-session (deleted, etc.), bail
  // cleanly — caller will see "not found" + we let the banner + cookie
  // get cleared on the next adminEndImpersonation tick.
  if (!targetProfile) {
    // No profile to return as — fall back to admin's own profile.
    const { data: own } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();
    if (!own) return null;
    return {
      profile: { ...own, _impersonating: false } as EffectiveProfile,
      isImpersonating: false,
    };
  }

  return {
    profile: {
      ...targetProfile,
      _impersonating: true,
      _admin_id:      impersonation.admin_id,
      _session_id:    impersonation.session_id,
      _expires_at:    impersonation.expires_at,
    } as EffectiveProfile,
    isImpersonating: true,
  };
}
