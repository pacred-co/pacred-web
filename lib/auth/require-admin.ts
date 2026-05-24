/**
 * Admin-side auth guard. Use in (admin) layouts/pages/Server Actions.
 *
 *   const { user, roles } = await requireAdmin();
 *   const { user } = await requireAdmin(["accounting"]);
 *
 * Behavior:
 *   - not signed in    → redirect to /login
 *   - signed in, not an admin (or doesn't have any of the required roles)
 *                      → 404 (notFound)
 *   - admin            → returns user + their active roles
 */

import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/get-user";

// 'warehouse' + 'driver' added by migration 0033 — extended admins.role
// CHECK constraint to support warehouse spine + driver scan flows.
// 'interpreter' added by migration 0054 — V-H1 ล่ามจีน commission portal
// (ADR-0015 Q3 + Phase I2 RBAC ack 2026-05-17 / E-5 resolution).
export type AdminRole = "super" | "ops" | "accounting" | "sales_admin" | "warehouse" | "driver" | "interpreter";

/**
 * Sprint-8c — per-request memoized fetch of (user, roles). The same admin
 * page typically calls `requireAdmin(...)` from the (admin) layout AND
 * `requireAdmin(["ops"])` (or a `getAdminRoles()` for conditional render)
 * from the page itself — without this `cache()` wrapper that's 2 fresh
 * `auth.getUser()` + 2 fresh `admins` SELECT round-trips per nav. By
 * keeping the I/O in a shared cached helper, both API surfaces (the
 * throwing `requireAdmin` and the soft `getAdminRoles`) share ONE
 * I/O pair per render — even when `requireAdmin` is called with
 * different `requiredRoles` arguments (the post-check differs, but the
 * underlying user + roles data is the same).
 */
const getAdminUserAndRoles = cache(async (): Promise<
  | { user: { id: string; email: string | null }; roles: AdminRole[] }
  | null
> => {
  // Chained through `getCurrentUser` (also cache()-wrapped) so the auth RTT
  // is shared with any customer-side helper that ran earlier in the same
  // render (e.g. the layout's NavBar uses client-side auth, but a few
  // admin actions still call `getCurrentUser` for write-author tagging).
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("admins")
    .select("role")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  const roles = (rows ?? []).map((r) => r.role as AdminRole);
  return { user: { id: user.id, email: user.email ?? null }, roles };
});

export async function requireAdmin(requiredRoles?: AdminRole[]): Promise<{
  user: { id: string; email: string | null };
  roles: AdminRole[];
}> {
  const data = await getAdminUserAndRoles();
  if (!data) redirect("/login");

  const { user, roles } = data;
  if (roles.length === 0) notFound();

  if (requiredRoles && requiredRoles.length > 0) {
    const ok = roles.includes("super") || requiredRoles.some((r) => roles.includes(r));
    if (!ok) notFound();
  }

  return { user, roles };
}

/** Non-throwing check — returns roles or null. Use in components that
 * want to render conditionally without redirecting. */
export async function getAdminRoles(): Promise<AdminRole[] | null> {
  const data = await getAdminUserAndRoles();
  if (!data || data.roles.length === 0) return null;
  return data.roles;
}

export function hasRole(roles: AdminRole[], required: AdminRole | AdminRole[]): boolean {
  if (roles.includes("super")) return true;
  const need = Array.isArray(required) ? required : [required];
  return need.some((r) => roles.includes(r));
}
