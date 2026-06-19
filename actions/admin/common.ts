"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, type AdminRole } from "@/lib/auth/require-admin";
import { logger, redactId } from "@/lib/logger";

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
    logger.error("audit", "admin_audit_log insert failed", e, {
      adminId:    redactId(adminId),
      action,
      targetType,
      targetId:   redactId(targetId),
    });
  }
}

/** Wrap an admin action body with auth + audit. Throws on auth failure. */
export async function withAdmin<T>(
  roles: AdminRole[] | undefined,
  // ctx.roles (2026-06-19) exposes the CALLER's actual roles so an action that
  // admits several roles can still gate a specific field per-role (e.g. the
  // forwarder ค่าเทียบ override is read-only for `warehouse`). Additive — existing
  // callers that destructure only { adminId } are unaffected.
  fn: (ctx: { adminId: string; roles: AdminRole[] }) => Promise<AdminActionResult<T>>,
): Promise<AdminActionResult<T>> {
  const { user, roles: actualRoles } = await requireAdmin(roles);
  return fn({ adminId: user.id, roles: actualRoles });
}
