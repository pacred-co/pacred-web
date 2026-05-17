/**
 * TOS (Terms of Service) versioning — SERVER-ONLY read side.
 *
 * `getActiveTosVersion()` reads the active row from `tos_versions`
 * (migration 0047) via the service-role Supabase client. It is **server-only**
 * — `import "server-only"` below makes a build fail loudly if a Client
 * Component ever pulls it in.
 *
 * The client-safe pieces — `CURRENT_TOS_VERSION`, the types, `isTosCurrent()`
 * — live in `lib/tos.ts` and may be imported from anywhere (including
 * `components/tos-gate.tsx`, a Client Component).
 *
 * V-G4 / V-G4.1 — versioned TOS lives in DB table `tos_versions`:
 *   1. Admin populates `tos_versions` via /admin/settings/tos-versions and
 *      flips `is_active=true` on the version to go live.
 *   2. `getActiveTosVersion(scope)` reads the latest active row for the scope.
 *   3. On any miss/error it falls back to `CURRENT_TOS_VERSION` — so the
 *      customer gate always has a version, and behaviour is unchanged until
 *      the admin seeds the table.
 */
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { CURRENT_TOS_VERSION, type TosScope, type TosActiveVersion } from "@/lib/tos";

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
