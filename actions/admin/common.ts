"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, type AdminRole } from "@/lib/auth/require-admin";

export type AdminActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Audit log helper — call after every admin mutation. Best-effort:
 * doesn't throw if the insert fails (admin action already happened;
 * losing the audit row is preferable to rolling back work).
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient();
  try {
    await admin.from("admin_audit_log").insert({
      admin_id:    adminId,
      action,
      target_type: targetType,
      target_id:   targetId,
      payload:     payload ?? null,
    });
  } catch (e) {
    console.error("[admin_audit_log] failed:", e);
  }
}

/** Wrap an admin action body with auth + audit. Throws on auth failure. */
export async function withAdmin<T>(
  roles: AdminRole[] | undefined,
  fn: (ctx: { adminId: string }) => Promise<AdminActionResult<T>>,
): Promise<AdminActionResult<T>> {
  const { user } = await requireAdmin(roles);
  return fn({ adminId: user.id });
}
