/**
 * Phase-gated route access — Pacred admin (2026-05-20 night owner brief).
 *
 * Companion to the sidebar Phase filter in `lib/admin/sidebar-menu.ts` +
 * `components/sections/admin-sidebar.tsx`. The sidebar filter is the
 * primary visibility mechanism (drops Phase 2+ items from the rendered
 * menu for non-`super` roles); this file is the DEFENSE-IN-DEPTH backup
 * for direct URL access (a non-super admin pasting a Phase-2 URL into the
 * address bar).
 *
 *   - Phase 1 = LIVE for customers (visible / accessible to ALL admin staff)
 *   - Phase 2 = soon-to-launch (QA queues · refunds · driver-runs · commissions
 *               · learning · marketing) — `super` only
 *   - Phase 3 = deeper future (broadcasts internal · bookings · container-costs
 *               · csv-imports · system tools) — `super` only
 *   - Phase 4 = way later (Extension toolbox · barcode · etc.) — `super` only
 *
 * The block list below is derived from every Phase 2/3/4 `href` tagged in
 * `lib/admin/sidebar-menu.ts`. Each entry is a PATHNAME prefix (queries
 * stripped). Matching is `pathname.startsWith(prefix)`.
 *
 * IMPORTANT caveat — query-only Phase 2 variants:
 *   A handful of Phase-2 sidebar items live on a query-string variant of an
 *   otherwise-Phase-1 pathname (e.g. `/admin/forwarders?q=ownerless` is
 *   Phase 2 but `/admin/forwarders` is Phase 1). Prefix-matching those would
 *   over-block the Phase-1 page. Those URLs are intentionally NOT in the
 *   block list — the sidebar filter handles their visibility, and the few
 *   non-super admins who guess at query strings are not a real threat model.
 *
 * Usage (in an admin layout / Server Component):
 *
 *   import { getAdminRoles } from "@/lib/auth/require-admin";
 *   import { canAccessRoute } from "@/lib/admin/phase-access";
 *   import { headers } from "next/headers";
 *   import { notFound } from "next/navigation";
 *
 *   const roles = await getAdminRoles();
 *   const pathname = (await headers()).get("x-pathname") ?? "";
 *   const role = primaryRole(roles ?? []);
 *   if (!canAccessRoute(pathname, role)) notFound();
 */

import type { AdminRole } from "@/lib/auth/require-admin";

/**
 * Pathname prefixes that require the `super` admin role.
 *
 * Sourced 1:1 from every `phase: 2 | 3 | 4` href in `lib/admin/sidebar-menu.ts`,
 * de-duped, with query strings stripped. Sort: alphabetical for readability.
 *
 * When you tag a new sidebar item Phase 2/3/4, ADD its href prefix here too
 * (the linkage is by hand — a tiny price for a defense-in-depth check that
 * runs on every admin page render).
 */
export const PHASE_2_PLUS_ROUTES = [
  // Phase 2 — soon-to-launch
  "/admin/bookings",                     // marketing/bookings
  "/admin/broadcasts",                   // marketing/broadcasts
  "/admin/commissions",                  // interpreter / sales commissions
  "/admin/customers/pending",            // customer approval queue (QA-like)
  "/admin/customers/transfer-rep",       // sales-rep transfer (QA)
  "/admin/driver-runs",                  // driver-runs (sales-only side)
  "/admin/drivers",                      // assign driver (driver-runs)
  "/admin/forwarder-sales",              // freight withdrawal (commissions)
  "/admin/freight/declarations",         // customs declarations (service #8 not live)
  "/admin/incidents",                    // incident triage (QA-like)
  "/admin/inventory",                    // corporate assets (maint / purchasing / stock)
  "/admin/refunds",                      // refunds (not live to customers)
  "/admin/reports/containers-awaiting-th", // QA SLA-breach queue
  "/admin/reports/credit-pending",       // QA SLA-breach queue
  "/admin/reports/monthly-orders",       // QA SLA-breach queue
  "/admin/reports/pending-payments",     // QA SLA-breach queue
  "/admin/sales-payouts",                // sales bonus payouts
  "/admin/team-leaders",                 // team-leader bonus tool
  "/admin/warehouse/bulletin",           // warehouse bulletin (QA)
  "/admin/warehouse/qa-inspections",     // warehouse QA inspections
  "/admin/withdrawal/freight-th",        // freight-th stub (placeholder per brief)
  "/admin/learning",                     // Learning hub (all topics)

  // Phase 3 — deeper future
  "/admin/cnt-hs",                       // container payments (deleted)
  "/admin/forwarders/container-cost-check", // container-cost-check (deeper)
  "/admin/reports/system",               // system observability reports

  // Phase 4 — way later
  "/admin/barcode",                      // barcode toolbox (warehouse-only future)
  "/admin/carriers",                     // Thai transport / carriers audit
  "/admin/juristic-check",               // juristic check Extension tool
] as const;

/** Type-narrowed list for callers that want it. */
export type Phase2PlusRoute = (typeof PHASE_2_PLUS_ROUTES)[number];

/**
 * Strip the locale prefix (e.g. `/en/admin/foo` → `/admin/foo`) so callers
 * can pass `usePathname()` output directly. TH = default locale = no prefix
 * (the regex is a no-op then).
 */
function stripLocale(pathname: string): string {
  return pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "");
}

/** Does this pathname target a Phase 2/3/4 admin URL? */
export function isPhase2PlusRoute(pathname: string): boolean {
  const path = stripLocale(pathname);
  return PHASE_2_PLUS_ROUTES.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}

/**
 * Can this admin role access this admin pathname under the Phase gate?
 *
 *  - `super` → always true (sees everything, no gating)
 *  - any other role → blocked from Phase 2/3/4 URLs
 *  - `null` (no admin role at all) → false (callers should generally redirect
 *    well before this — `requireAdmin` 404s non-admins — but if it leaks
 *    through, fail closed)
 *
 * This is purely a Phase gate; it does NOT replace `requireAdmin()` (which
 * gates on admin-vs-non-admin) — it composes WITH it.
 */
export function canAccessRoute(pathname: string, role: AdminRole | null): boolean {
  if (role === "super") return true;
  if (!role) return false;
  return !isPhase2PlusRoute(pathname);
}
