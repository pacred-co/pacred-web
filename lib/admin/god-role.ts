/**
 * God-role predicate (owner directive · 2026-06-18, mig 0189).
 *
 * `ultra` ("Ultra Admin Z") + `super` are the two god roles: they bypass every
 * navigation / Phase / action gate that historically checked `super`. `ultra`
 * outranks `super`. The ONLY privilege `super` no longer holds is money-internal
 * VISIBILITY — that is gated separately by `canViewCostProfit`
 * (lib/admin/money-visibility.ts) to {ultra, accounting, pricing}.
 *
 * Use `isGodRole(roles)` at EVERY site that previously did
 * `roles.includes("super")` to grant access / visibility / a mutation — so the
 * new `ultra` role inherits the same reach. Do NOT use it for money-internal
 * surfaces (those use canViewCostProfit, which excludes super).
 *
 * Pure module (no `server-only`) so Client Components can import it too. The
 * `AdminRole` import is type-only, so this never pulls the server-only
 * require-admin runtime into a client bundle.
 */
import type { AdminRole } from "@/lib/auth/require-admin";

/** True if the viewer holds a god role (`ultra` or `super`). */
export function isGodRole(roles: AdminRole[] | null | undefined): boolean {
  if (!roles) return false;
  return roles.includes("ultra") || roles.includes("super");
}
