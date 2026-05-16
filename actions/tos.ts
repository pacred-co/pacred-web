"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTosVersion } from "@/lib/tos";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * V-G4.1 — customer accepts the active TOS version.
 *
 * Reads the active version from DB (via getActiveTosVersion which falls back
 * to CURRENT_TOS_VERSION if DB has no active row), updates
 * profiles.tos_accepted_version + tos_accepted_at, AND (if DB version) also
 * inserts a tos_acceptances audit row.
 *
 * The acceptances audit row is best-effort: if it fails (e.g. tos_acceptances
 * table not yet migrated), we still mark the profile as accepted — the
 * denormalised column is the single source of truth for the gate read.
 */
export async function acceptCurrentTos(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const active = await getActiveTosVersion("all");

  const { error } = await supabase
    .from("profiles")
    .update({
      tos_accepted_version: active.version_no,
      tos_accepted_at:      new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    // PostgREST returns this when migration 0006 hasn't run yet
    if (error.message?.includes("schema cache") || error.message?.includes("tos_accepted")) {
      return { ok: false, error: "ระบบยังไม่พร้อม — โปรดให้แอดมินรัน migration ของฐานข้อมูลก่อน (supabase/migrations/0006_tos_acceptance.sql)" };
    }
    return { ok: false, error: error.message };
  }

  // V-G4.1 audit-trail row in tos_acceptances (per-version log).
  // Only meaningful when we got the version from DB — if from fallback const,
  // the matching tos_versions row doesn't exist so we can't insert.
  if (active.source === "db") {
    try {
      const admin = createAdminClient();
      // Look up the version row id by version_no.
      const { data: versionRow } = await admin
        .from("tos_versions")
        .select("id")
        .eq("version_no", active.version_no)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (versionRow) {
        await admin
          .from("tos_acceptances")
          .insert({
            profile_id:     user.id,
            tos_version_id: versionRow.id,
            // ip_address + user_agent could be threaded from request
            // headers in a future revision; V-G4.1 ships without them.
          });
        // Insert may fail on duplicate (unique on profile_id+version) —
        // that's fine; means user already accepted. Swallow.
      }
    } catch {
      // Best-effort. Profile column is canonical for gate.
    }
  }

  // Revalidate everything under (protected) since the gate component
  // lives in the layout
  revalidatePath("/", "layout");
  return { ok: true };
}
