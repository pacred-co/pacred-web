import type { AdminRole } from "@/lib/auth/require-admin";

/**
 * V-E12 — pick the single dashboard variant to render for a multi-role admin.
 *
 * Priority order (most "focused" wins so the dashboard surface always
 * matches what the staff member is actually accountable for):
 *
 *   super > accounting > warehouse > sales_admin > driver > interpreter > ops
 *
 *  - super: company-wide view; always wins (the owner / dev / ก๊อต).
 *  - accounting / warehouse / sales_admin / driver / interpreter: the
 *    role-specialised dashboards — picking the most-focused one gives the
 *    staffer the queue they need to clear today rather than a generic ops
 *    overview.
 *  - ops: fallback for a staffer with only the generic ops role; matches
 *    the existing "office staffer" view.
 *
 * The cookie-or-querystring "view as" switch (spec §UI) is not implemented
 * in V1 — a super seeing the super view is the right default. Multi-role
 * staffers (e.g. an admin with BOTH `accounting` + `warehouse`) get the
 * higher-priority dashboard; their other-role pages are reachable via the
 * sidebar.
 */

// Narrowed to DashboardVariant (hand-curated subset of AdminRole) — without
// this, TS2322 fires because migration 0091 extended AdminRole with sales /
// qa / 13 freight_* values that don't have dedicated dashboards. Each PRIORITY
// entry MUST also be a DashboardVariant; the type narrowing here is the
// compile-time gate that keeps the two unions in lockstep.
const PRIORITY: DashboardVariant[] = [
  "super",
  "manager",      // 0118 · Cargo Manager — between super and accounting (cross-team approver)
  "accounting",
  "warehouse",
  "sales_admin",
  "driver",
  "interpreter",
  "ops",
];

export type DashboardVariant =
  | "super"
  | "manager"     // 0118 · Cargo Manager dashboard variant
  | "accounting"
  | "warehouse"
  | "sales_admin"
  | "driver"
  | "interpreter"
  | "ops";

export function pickPrimaryRole(roles: AdminRole[]): DashboardVariant {
  // 2026-06-18 (mig 0189) — Ultra Admin Z renders the full god dashboard, same
  // variant as super. The cost/profit values on it are gated separately by
  // canViewCostProfit() against the viewer's REAL roles (ultra passes; super
  // does not), so reusing the variant is safe.
  if (roles.includes("ultra")) return "super";
  for (const r of PRIORITY) {
    // r: DashboardVariant; the includes() narrows on AdminRole because
    // every DashboardVariant IS an AdminRole (one-way subset relation).
    if (roles.includes(r as AdminRole)) return r;
  }
  // No recognised role → caller already 404'd via requireAdmin([]); guard
  // anyway so the dispatch table never has a missing branch.
  return "ops";
}
