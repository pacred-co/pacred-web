/**
 * God-role predicate (owner directive · 2026-06-18 mig 0189 · extended 2026-06-27 ปอน).
 *
 * `ultra` ("Ultra Admin Z") + `super` + `normies` are the three VISIBILITY tiers
 * — all god-nav: they bypass every navigation / Phase / action gate that
 * historically checked `super`. They differ ONLY in money-internal VISIBILITY,
 * which is gated separately (lib/admin/money-visibility.ts):
 *   • ultra   → sees cost + profit   (canViewCost ✓ · canViewProfit ✓)
 *   • super   → sees profit, NOT cost (canViewCost ✗ · canViewProfit ✓)
 *   • normies → sees neither          (canViewCost ✗ · canViewProfit ✗)
 *
 * Use `isGodRole(roles)` at EVERY site that previously did
 * `roles.includes("super")` to grant access / a mutation — so all three tiers
 * inherit the same nav/action reach. Do NOT use it for money-internal surfaces
 * (those use canViewCost / canViewProfit, which keep cost/profit out of
 * super/normies respectively).
 *
 * Pure module (no `server-only`) so Client Components can import it too. The
 * `AdminRole` import is type-only, so this never pulls the server-only
 * require-admin runtime into a client bundle.
 */
import type { AdminRole } from "@/lib/auth/require-admin";

/** True if the viewer holds a god-nav role (`ultra`, `super`, or `normies`). */
export function isGodRole(roles: AdminRole[] | null | undefined): boolean {
  if (!roles) return false;
  return roles.includes("ultra") || roles.includes("super") || roles.includes("normies");
}
