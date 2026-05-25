"use server";

/**
 * G-4 · admin impersonation server actions.
 *
 * Two actions:
 *   1. adminBeginImpersonation({target_profile_id}) — opens an
 *      impersonation_sessions row, sets the pacred_impersonating cookie,
 *      writes admin.impersonation_begin audit.
 *   2. adminEndImpersonation() — closes the active session, clears the
 *      cookie, writes admin.impersonation_end audit.
 *
 * Both are super OR ops only. WRITE BLOCKED while already impersonating
 * (defence-in-depth — assertNotImpersonating is also called on every
 * customer-side mutation).
 *
 * 30-minute TTL · max 3 simultaneous sessions per admin.
 *
 * See lib/auth/impersonation.ts for the cookie + session validation
 * helpers. See lib/auth/get-user.ts `getEffectiveUser()` for how pages
 * consume the impersonation state.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  IMPERSONATION_TTL_MS,
  MAX_ACTIVE_IMPERSONATION_SESSIONS_PER_ADMIN,
  setImpersonationCookie,
  clearImpersonationCookie,
  readActiveImpersonation,
} from "@/lib/auth/impersonation";

// ────────────────────────────────────────────────────────────
// adminBeginImpersonation
// ────────────────────────────────────────────────────────────

const beginSchema = z.object({
  target_profile_id: z.string().uuid(),
});
export type AdminBeginImpersonationInput = z.infer<typeof beginSchema>;

type BeginData = {
  session_id: string;
  expires_at: string;
  target_member_code: string | null;
  target_display_name: string;
};

export async function adminBeginImpersonation(
  input: AdminBeginImpersonationInput,
): Promise<AdminActionResult<BeginData>> {
  const parsed = beginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<BeginData>(["super", "ops"], async ({ adminId }) => {
    // Self-target nonsense — refuse cleanly.
    if (d.target_profile_id === adminId) {
      return { ok: false, error: "cannot_impersonate_self" };
    }

    const admin = createAdminClient();

    // Target must exist + not be another admin. Impersonating another
    // admin is a separate (more sensitive) concern — refuse for now.
    type TargetRow = {
      id: string;
      member_code: string | null;
      first_name: string | null;
      last_name: string | null;
      company_name: string | null;
      account_type: "personal" | "juristic" | null;
    };
    const { data: target, error: tErr } = await admin
      .from("profiles")
      .select("id, member_code, first_name, last_name, company_name, account_type")
      .eq("id", d.target_profile_id)
      .maybeSingle<TargetRow>();
    if (tErr) return { ok: false, error: tErr.message };
    if (!target) return { ok: false, error: "target_not_found" };

    const { data: targetIsAdmin, error: targetIsAdminErr } = await admin
      .from("admins")
      .select("role")
      .eq("profile_id", d.target_profile_id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle<{ role: string }>();
    if (targetIsAdminErr) {
      console.error(`[admins list] failed`, { code: targetIsAdminErr.code, message: targetIsAdminErr.message });
    }
    if (targetIsAdmin) {
      return { ok: false, error: "cannot_impersonate_admin" };
    }

    // Cap concurrent active sessions per admin. Active = ended_at IS NULL
    // AND expires_at in the future. Close any rows that have silently
    // expired so the cap reflects truth.
    const nowIso = new Date().toISOString();
    await admin
      .from("impersonation_sessions")
      .update({ ended_at: nowIso, exit_reason: "expired" })
      .eq("admin_id", adminId)
      .is("ended_at", null)
      .lt("expires_at", nowIso);

    const { count } = await admin
      .from("impersonation_sessions")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", adminId)
      .is("ended_at", null);
    if ((count ?? 0) >= MAX_ACTIVE_IMPERSONATION_SESSIONS_PER_ADMIN) {
      return {
        ok: false,
        error: `too_many_active_sessions — มี session ที่ใช้งานอยู่แล้ว ${count} อัน (cap ${MAX_ACTIVE_IMPERSONATION_SESSIONS_PER_ADMIN}) ออก session เก่าก่อน`,
      };
    }

    const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS).toISOString();

    const { data: session, error: insErr } = await admin
      .from("impersonation_sessions")
      .insert({
        admin_id:          adminId,
        target_profile_id: d.target_profile_id,
        expires_at:        expiresAt,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr) return { ok: false, error: insErr.message };

    await setImpersonationCookie({
      admin_id:          adminId,
      target_profile_id: d.target_profile_id,
      session_id:        session.id,
      expires_at:        expiresAt,
    });

    await logAdminAction(adminId, "admin.impersonation_begin", "profile", d.target_profile_id, {
      session_id:         session.id,
      expires_at:         expiresAt,
      target_member_code: target.member_code,
    });

    const displayName = target.account_type === "juristic" && target.company_name
      ? target.company_name
      : `${target.first_name ?? ""} ${target.last_name ?? ""}`.trim() || "ลูกค้า";

    // Revalidate the protected layout so the banner mounts immediately.
    revalidatePath("/", "layout");

    return {
      ok: true,
      data: {
        session_id:          session.id,
        expires_at:          expiresAt,
        target_member_code:  target.member_code,
        target_display_name: displayName,
      },
    };
  });
}

// ────────────────────────────────────────────────────────────
// adminEndImpersonation
// ────────────────────────────────────────────────────────────

type EndData = { session_id: string | null };

export async function adminEndImpersonation(): Promise<AdminActionResult<EndData>> {
  return withAdmin<EndData>(["super", "ops"], async ({ adminId }) => {
    // Read the cookie to find the live session id; tolerate the case
    // where the cookie is already missing/expired (just clear + audit
    // a generic exit).
    const session = await readActiveImpersonation(adminId);
    const admin = createAdminClient();

    if (session) {
      await admin
        .from("impersonation_sessions")
        .update({ ended_at: new Date().toISOString(), exit_reason: "manual" })
        .eq("id", session.session_id)
        .is("ended_at", null);

      await logAdminAction(adminId, "admin.impersonation_end", "profile", session.target_profile_id, {
        session_id: session.session_id,
        exit_reason: "manual",
      });
    }

    await clearImpersonationCookie();

    revalidatePath("/", "layout");

    return { ok: true, data: { session_id: session?.session_id ?? null } };
  });
}
