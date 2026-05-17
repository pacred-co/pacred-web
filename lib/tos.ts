/**
 * TOS (Terms of Service) versioning — CLIENT-SAFE module.
 *
 * Pure constants + types + sync helpers only — NO server imports. Safe to
 * import from Client Components (e.g. `components/tos-gate.tsx`).
 *
 * The DB-backed read — `getActiveTosVersion()` — lives in `lib/tos-server.ts`
 * (it uses the service-role Supabase client, which is server-only). Server
 * callers (layout, actions) import that from there.
 *
 * V-G4 / V-G4.1 — versioned TOS lives in DB table `tos_versions` (migration
 * 0047). `getActiveTosVersion()` reads the latest active row; on any miss it
 * falls back to `CURRENT_TOS_VERSION` below.
 *
 * Bump `CURRENT_TOS_VERSION` whenever you change the FALLBACK version. Once
 * admin populates the DB table, the constant becomes a defensive backstop.
 */

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
