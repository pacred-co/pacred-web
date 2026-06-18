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
  // 2026-06-08 (ภูม warehouse-handoff readiness ROUND 2): un-blocked
  // `/admin/driver-runs` and `/admin/drivers` — same stale-sync pattern as
  // /admin/barcode round 1. sidebar-menu.ts:1095-1096 + 1029 expose both
  // to driver / warehouse roles without phase tags; the network gate was
  // bouncing them. Page-level requireAdmin() on driver-runs accepts any
  // admin (filters by profile_id), and /admin/drivers requires ["ops",
  // "super"] which still rejects warehouse/driver at the action level —
  // so removing the Phase gate is safe.
  // NB: driver-runs ALSO has a dead-read trap (reads rebuilt 0-row
  // `forwarder_driver` instead of live `tb_forwarder_driver_item`) — that
  // is tracked separately and is NOT made worse by un-blocking the gate;
  // staff would just see an empty page instead of a silent redirect.
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
  // 2026-06-08 (ภูม flag · warehouse hand-off readiness): un-block
  // `/admin/warehouse/qa-inspections` — `lib/admin/sidebar-menu.ts:1057-1061`
  // explicitly removed its phase tag with the comment "un-phase-gated for the
  // warehouse role because PCS_Cargo_Guidebook_TH.md L441-454 lists
  // pre-shipment QA as a daily warehouse duty". Keeping the block here meant
  // warehouse staff saw the sidebar item, clicked it, and got bounced to
  // /admin (the dashboard) — stale sync between sidebar + this gate. The
  // action-level role gate inside the QA module is still enforced, so a
  // non-warehouse non-super clicking it gets a "no permission" inside the
  // page rather than a silent redirect.
  "/admin/withdrawal/freight-th",        // freight-th stub (placeholder per brief)
  "/admin/learning",                     // Learning hub (all topics)

  // Phase 3 — deeper future
  "/admin/cnt-hs",                       // container payments (deleted)
  "/admin/forwarders/container-cost-check", // container-cost-check (deeper)
  "/admin/reports/system",               // system observability reports

  // Phase 4 — way later
  // 2026-06-08 (ภูม flag · warehouse hand-off readiness): un-block
  // `/admin/barcode` — the comment said "warehouse-only future" because
  // barcode was a stub in Wave 0-25. It is now the warehouse DAILY-DRIVER
  // tool (Wave 26-29 + Wave 30 LIVE on prod, MOMO sync writes tb_forwarder
  // every 5 min on Vercel cron). `actions/admin/barcode-import.ts:378`
  // declares its action gate `["super", "ops", "warehouse"]`; the sidebar
  // promotes `barcode.recordIntake` to a top-level flat link for warehouse
  // role (sidebar-menu.ts:200, 1054). With the block here, warehouse staff
  // clicked the link and got bounced to /admin — they could not do their
  // job. The action-level role gate still rejects sales/accounting roles
  // who URL-type into a scan page.
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

/**
 * Phase 1 carve-outs — pathnames that LOOK like Phase 2 prefixes (so
 * they'd match `PHASE_2_PLUS_ROUTES` via `startsWith`) but are intentionally
 * Phase 1 (visible / accessible to non-super roles).
 *
 * Add an entry here when a Phase 1 page lives UNDER a Phase 2 prefix —
 * e.g. `/admin/drivers/work` is the driver mobile UI (Phase 1, all driver
 * roles) but it sits under `/admin/drivers` (Phase 2, sales/CEO oversight).
 * Without the carve-out, the proxy.ts middleware would bounce drivers off
 * their own work page → infinite redirect loop with the driver-landing
 * redirect in `app/[locale]/(admin)/admin/page.tsx`.
 *
 * Matching: exact path OR `path.startsWith(carve + "/")` — same shape as
 * the block list.
 */
const PHASE_1_CARVEOUTS = [
  "/admin/drivers/work",                 // 2026-05-28 — Driver mobile UI parity sprint
] as const;

/** Does this pathname target a Phase 2/3/4 admin URL? */
export function isPhase2PlusRoute(pathname: string): boolean {
  const path = stripLocale(pathname);
  // Carve-out wins — a Phase 1 sub-path under a Phase 2 prefix is NOT blocked.
  if (PHASE_1_CARVEOUTS.some((carve) => path === carve || path.startsWith(carve + "/"))) {
    return false;
  }
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
  // `ultra` (Ultra Admin Z) + `super` are god roles — no Phase gating.
  if (role === "ultra" || role === "super") return true;
  if (!role) return false;
  return !isPhase2PlusRoute(pathname);
}
