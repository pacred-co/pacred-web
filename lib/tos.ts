/**
 * TOS (Terms of Service) versioning.
 *
 * V-G4 / V-G4.1 — versioned TOS lives in DB table `tos_versions`
 * (migration 0047). This module is the read-side fallback chain:
 *
 *   1. Admin populates `tos_versions` table via /admin/settings/tos-versions
 *      and flips `is_active=true` on the version they want live.
 *   2. `getActiveTosVersion(scope)` reads the latest active row for the
 *      scope (default 'all'). If found, the gate uses DB-driven version.
 *   3. If DB returns nothing (empty table / inactive everything / query
 *      error), falls back to `CURRENT_TOS_VERSION` hardcoded constant.
 *      → existing behavior preserved when admin hasn't seeded DB yet.
 *
 * The fallback rule makes V-G4.1 SAFE to ship pre-launch:
 *   - tos_versions table empty → behavior unchanged from hardcoded const
 *   - Admin seeds 1 active row → gate switches to DB version on next read
 *
 * Bump CURRENT_TOS_VERSION (still) whenever you change the FALLBACK
 * version. Once admin populates DB, the const becomes a defensive backstop.
 */

import { createAdminClient } from "@/lib/supabase/admin";

/** Last-resort fallback version when DB has no active row. */
export const CURRENT_TOS_VERSION = "2026-05-12";

export type TosScope = "all" | "cargo_only" | "freight_only";

export type TosActiveVersion = {
  version_no:     string;
  title:          string | null;
  body_md:        string | null;
  effective_from: string | null;
  source:         "db" | "fallback";        // tells caller where it came from
};

/**
 * Resolve the currently-active TOS version for a given scope.
 *
 * Tries DB first (admin-controlled via /admin/settings/tos-versions); on any
 * miss/error returns the hardcoded fallback. NEVER throws — the customer
 * gate must always have a version to compare against.
 */
export async function getActiveTosVersion(scope: TosScope = "all"): Promise<TosActiveVersion> {
  try {
    const admin = createAdminClient();
    // Prefer scope match; fall back to 'all' if scope-specific has no row.
    const { data, error } = await admin
      .from("tos_versions")
      .select("version_no, title, body_md, effective_from")
      .eq("is_active", true)
      .in("applies_to", scope === "all" ? ["all"] : [scope, "all"])
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle<{
        version_no:     string;
        title:          string | null;
        body_md:        string | null;
        effective_from: string | null;
      }>();
    if (!error && data) {
      return {
        version_no:     data.version_no,
        title:          data.title,
        body_md:        data.body_md,
        effective_from: data.effective_from,
        source:         "db",
      };
    }
  } catch {
    // Swallow — fall through to constant fallback so the gate never breaks.
  }
  return {
    version_no:     CURRENT_TOS_VERSION,
    title:          null,
    body_md:        null,
    effective_from: null,
    source:         "fallback",
  };
}

/**
 * True if the user has accepted a version that matches the active version.
 *
 * `undefined acceptedVersion` means the profile object doesn't carry the
 * column at all (migration 0006 not applied) — treat as accepted so the
 * gate doesn't show on un-migrated dev DBs.
 *
 * If activeVersion is omitted, defaults to CURRENT_TOS_VERSION (backward-
 * compat for callers that haven't been updated to pass the dynamic value).
 */
export function isTosCurrent(
  acceptedVersion: string | null | undefined,
  activeVersion: string = CURRENT_TOS_VERSION,
): boolean {
  if (acceptedVersion === undefined) return true;
  return acceptedVersion === activeVersion;
}
