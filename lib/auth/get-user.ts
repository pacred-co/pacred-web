/**
 * Server-side helpers to read the current user + profile.
 *
 * Always use these in Server Components / Server Actions / Route Handlers
 * so RLS protects data access via the user's session cookie.
 */

import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
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
 *
 * **Sprint-8c — wrapped with React `cache()`.** A single protected-page
 * render typically calls this (or `getCurrentUserWithProfile`) from
 * 2–4 places: the root `(protected)` layout's `requireAuth()`, a
 * sub-layout (e.g. `(protected)/sales/layout.tsx`), the page itself,
 * and sometimes a nested data-fetcher. Without `cache()` each of
 * those was firing a fresh `supabase.auth.getUser()` Supabase Auth
 * roundtrip (Asia region: ~150–400 ms each) plus a fresh `profiles`
 * SELECT — adding up to >1 second of duplicate waiting on every nav.
 *
 * `cache()` memoizes for the duration of ONE server render
 * (per-request scope — Next.js guarantees no cross-request leakage),
 * so layout + sub-layout + page now share a single auth check.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();

  // PERF (2026-06-03 · final systemic auth fix): verify the session JWT
  // LOCALLY via getClaims() instead of getUser() (a network round-trip to the
  // GoTrue auth server on EVERY render — the last remaining per-nav auth tax).
  //
  // This project signs sessions with an ASYMMETRIC ES256 key (confirmed via
  // the project's JWKS endpoint), so getClaims() validates the JWT's signature
  // in-process using the cached public key. That is AUTHORITATIVE (a forged or
  // tampered cookie fails signature verification — unlike getSession(), which
  // only decodes) AND fast (no network on the warm path; JWKS is cached). For
  // any legacy HS256 token getClaims() falls back to a server call internally,
  // and we also fall back to getUser() below on any failure — so this can
  // never be LESS secure or LESS correct than before, only faster.
  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!error && claims?.sub) {
      // Reconstruct a minimal Supabase User from the verified claims. Callers
      // use .id / .email; the rest is populated best-effort from the token so
      // the User shape stays intact for any incidental field access.
      return {
        id: claims.sub,
        email: claims.email ?? undefined,
        phone: claims.phone ?? undefined,
        app_metadata: claims.app_metadata ?? {},
        user_metadata: claims.user_metadata ?? {},
        aud: Array.isArray(claims.aud) ? claims.aud[0] ?? "" : claims.aud ?? "",
        role: typeof claims.role === "string" ? claims.role : undefined,
        created_at: "",
      } as User;
    }
  } catch {
    // JWKS unreachable / unexpected token shape — fall through to the
    // authoritative network check rather than failing the request.
  }

  // Fallback: authoritative network check (legacy HS256 tokens, or any
  // getClaims() failure path above).
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
});

/**
 * Returns the current user + their profile row.
 * Profile may be null if user signed up but profile row hasn't been created yet.
 *
 * **Sprint-8c — wrapped with React `cache()` + chained through
 * `getCurrentUser` so the auth RTT is shared.** `getCurrentUser`,
 * `getCurrentUserWithProfile`, and `getEffectiveUser` are each
 * memoized per-request, but they're DIFFERENT functions — so without
 * chaining, the layout's `requireAuth` + the banner's
 * `getEffectiveUser` would still fire two independent
 * `supabase.auth.getUser()` round-trips. By having both call
 * `getCurrentUser()` first (which is itself cached), they share a
 * single auth check + we only pay for the profile fetch that this
 * function actually needs.
 */
export const getCurrentUserWithProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (profileErr) {
    console.error(`[profiles list] failed`, { code: profileErr.code, message: profileErr.message });
  }

  return { user, profile };
});

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

export const getEffectiveUser = cache(async (): Promise<
  | null
  | {
      profile: EffectiveProfile;
      /** Convenience flag mirroring profile._impersonating. */
      isImpersonating: boolean;
    }
> => {
  // Sprint-8c — chain through getCurrentUser so the auth RTT is shared with
  // `requireAuth` / `getCurrentUserWithProfile` (which the layout already
  // called via requireAuth). Otherwise the ImpersonationBanner in the
  // protected layout was doubling the per-nav `supabase.auth.getUser()`
  // round-trip even after each function was individually cache()-wrapped.
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  // Check for an active impersonation session.
  const impersonation = await readActiveImpersonation(user.id);

  if (!impersonation) {
    // Plain self — read own profile via the RLS-scoped client.
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();
    if (profileErr) {
      console.error(`[profiles lookup] failed`, { code: profileErr.code, message: profileErr.message, details: profileErr.details, hint: profileErr.hint });
      throw new Error(`Failed to load profiles (${profileErr.code ?? "unknown"}): ${profileErr.message}`);
    }
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
  const { data: targetProfile, error: targetProfileErr } = await adminClient
    .from("profiles")
    .select("*")
    .eq("id", impersonation.target_profile_id)
    .maybeSingle<Profile>();

  // If the target profile vanished mid-session (deleted, etc.), bail
  // cleanly — caller will see "not found" + we let the banner + cookie
  // get cleared on the next adminEndImpersonation tick.
  if (targetProfileErr) {
    console.error(`[profiles lookup] failed`, { code: targetProfileErr.code, message: targetProfileErr.message, details: targetProfileErr.details, hint: targetProfileErr.hint });
    throw new Error(`Failed to load profiles (${targetProfileErr.code ?? "unknown"}): ${targetProfileErr.message}`);
  }
  if (!targetProfile) {
    // No profile to return as — fall back to admin's own profile.
    const { data: own, error: ownErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();
    if (ownErr) {
      console.error(`[profiles lookup] failed`, { code: ownErr.code, message: ownErr.message, details: ownErr.details, hint: ownErr.hint });
      throw new Error(`Failed to load profiles (${ownErr.code ?? "unknown"}): ${ownErr.message}`);
    }
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
});
