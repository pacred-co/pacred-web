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
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminRole = "super" | "ops" | "accounting" | "sales_admin";

export async function requireAdmin(requiredRoles?: AdminRole[]): Promise<{
  user: { id: string; email: string | null };
  roles: AdminRole[];
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("admins")
    .select("role")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  const roles = (rows ?? []).map((r) => r.role as AdminRole);
  if (roles.length === 0) notFound();

  if (requiredRoles && requiredRoles.length > 0) {
    const ok = roles.includes("super") || requiredRoles.some((r) => roles.includes(r));
    if (!ok) notFound();
  }

  return { user: { id: user.id, email: user.email ?? null }, roles };
}

/** Non-throwing check — returns roles or null. Use in components that
 * want to render conditionally without redirecting. */
export async function getAdminRoles(): Promise<AdminRole[] | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from("admins")
    .select("role")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  const roles = (rows ?? []).map((r) => r.role as AdminRole);
  return roles.length > 0 ? roles : null;
}

export function hasRole(roles: AdminRole[], required: AdminRole | AdminRole[]): boolean {
  if (roles.includes("super")) return true;
  const need = Array.isArray(required) ? required : [required];
  return need.some((r) => roles.includes(r));
}
