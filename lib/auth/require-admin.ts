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
 *
 * Phase-gated visibility (2026-05-20 owner brief): this function gates on
 * admin-vs-non-admin only. To also gate by sidebar Phase (i.e. block non-
 * `super` admins from Phase 2/3/4 URLs), compose with `canAccessRoute(...)`
 * from `lib/admin/phase-access.ts` in the layout/page:
 *
 *     const { roles } = await requireAdmin();
 *     const role = primaryRole(roles);
 *     const pathname = (await headers()).get("x-pathname") ?? "";
 *     if (!canAccessRoute(pathname, role)) notFound();
 *
 * (requireAdmin itself stays pathname-agnostic — adding `headers()` reads
 * here would force every admin Server Action into the dynamic bucket.)
 */

import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/get-user";
import { isGodRole } from "@/lib/admin/god-role";

// 'warehouse' + 'driver' added by migration 0033 — extended admins.role
// CHECK constraint to support warehouse spine + driver scan flows.
// 'interpreter' added by migration 0054 — V-H1 ล่ามจีน commission portal
// (ADR-0015 Q3 + Phase I2 RBAC ack 2026-05-17 / E-5 resolution).
//
// 2026-05-20 ค่ำ (Agent ZZ · ภูม brief "port เลย ยึดตาม Owner ก่อน")
//   migration 0091 expansion — added:
//     - 'sales'        — Cargo Sales Staff (legacy doc role #30) — DISTINCT
//                         from 'sales_admin' (Cargo Sales Manager, #29) per
//                         doc lines 780-788 + 792-870. Manager keeps approval
//                         rights; staff sees the same operational menu without
//                         approval/marketing settings.
//     - 'qa'           — QA & QC staff (legacy doc role #5, lines 358-382).
//                         Previously folded into `super`; carving out a real
//                         role-of-its-own so a QA staffer can log in WITHOUT
//                         being granted full CEO privileges.
//     - 'freight_sales_manager', 'freight_sales' (doc roles #16-17)
//     - 'freight_export_manager', 'freight_export_cs',
//       'freight_export_doc', 'freight_export_clearance',
//       'freight_clearance_both', 'freight_export_messenger' (doc roles #18-23)
//     - 'freight_import_manager', 'freight_import_cs',
//       'freight_import_doc', 'freight_import_clearance',
//       'freight_import_messenger' (doc roles #24-28 — note: role #22 the
//       Shipping-Clearance-Import-and-Export role is mapped to a single
//       'freight_clearance_both' value because the doc itself uses one
//       PHP file for both companyType=2 dept=2 sec=7 and dept=3 sec=13).
//
//   Per ภูม "ห้ามเดา" — every Freight role is added with a STUB menu in
//   sidebar-menu.ts; the doc shows only `[Full Export Operations Access]`
//   placeholders for items, NOT the actual sidebar trees. Real menus will
//   be enumerated when พี่เดฟ extends the doc with per-role item lists.
// 2026-05-28 ดึก (Wave 26 · ภูม decision #6) — `manager` split out of `super`
// per `docs/research/legacy-deep-dive/_SYNTHESIS.md` §6 D6. Migration 0118
// adds the role to the CHECK constraint. Manager has approval rights for
// cnt-payment + cross-team supervision but NO role grants + NO billing config.
export type AdminRole =
  // 2026-06-18 (owner · mig 0189) — `ultra` = "Ultra Admin Z": the TRUE god role.
  // Sees + does EVERYTHING incl. money internals (cost · profit/margin · cost-rate/FX ·
  // declared value · commission). Ranks ABOVE `super`. After this, `super` is god for
  // everything EXCEPT money internals — those are gated by canViewCostProfit() in
  // lib/admin/money-visibility.ts to {ultra, accounting, pricing} only.
  | "ultra"
  | "super"
  | "manager"               // Cargo Manager — approve cnt-payment · cross-team supervise (0118)
  | "ops"
  | "accounting"
  | "sales_admin"           // Cargo Sales Manager (#29) — Mgr tier, has approval
  | "sales"                 // Cargo Sales Staff   (#30) — Staff tier
  | "qa"                    // QA & QC staff       (#5)
  | "warehouse"
  | "driver"
  | "interpreter"
  | "pricing"                   // Cargo Pricing — captures COST (PEAK stock-in · 3-number tax-invoice model · mig 0158)
  // ── CompanyType 2: Freight (doc roles #16-28) ────────────────────
  | "freight_sales_manager"     // #16
  | "freight_sales"             // #17
  | "freight_export_manager"    // #18
  | "freight_export_cs"         // #19  CS / Doc Export
  | "freight_export_doc"        // #20  Shipping Doc Export
  | "freight_export_clearance"  // #21  Shipping Clearance (Export)
  | "freight_clearance_both"    // #22  Shipping Clearance (Import & Export) — shared file
  | "freight_export_messenger"  // #23  Messenger (Export)
  | "freight_import_manager"    // #24
  | "freight_import_cs"         // #25  CS & Doc Import
  | "freight_import_doc"        // #26  Shipping Doc Import
  | "freight_import_clearance"  // #27  Shipping Clearance (Import)
  | "freight_import_messenger"; // #28  Messenger (Import)

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
  const { data: rows, error: rowsErr } = await supabase
    .from("admins")
    .select("role")
    .eq("profile_id", user.id)
    .eq("is_active", true);
  if (rowsErr) {
    console.error(`[admins list] failed`, { code: rowsErr.code, message: rowsErr.message });
  }

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
    // `ultra` + `super` are god roles — they satisfy any required-role check.
    const ok = isGodRole(roles) || requiredRoles.some((r) => roles.includes(r));
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
  if (isGodRole(roles)) return true;
  const need = Array.isArray(required) ? required : [required];
  return need.some((r) => roles.includes(r));
}

// `isGodRole` lives in the pure module `lib/admin/god-role.ts` so Client
// Components can import it too; re-exported here for the many server callers
// that already import from require-admin.
export { isGodRole } from "@/lib/admin/god-role";
