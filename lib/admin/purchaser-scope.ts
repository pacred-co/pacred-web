/**
 * Per-order purchaser (ผู้สั่งซื้อ) visibility scope rule (owner ④ · 2026-07-06 · mig 0241).
 *
 * The ฝากสั่งซื้อ (/admin/service-orders) + ฝากนำเข้า (/admin/forwarders) lists
 * HARD-SCOPE a viewer who holds ONLY the `purchaser` role to their own assigned
 * orders (WHERE adminidpurchaser = their tb_admin.adminID). Everyone else —
 * `purchaser_lead` (หัวหน้าสั่งซื้อ · sees ALL purchaser work), `interpreter`
 * (hands off work), the god tiers (`ultra`/`super`/`normies`), and the existing
 * full-access operational roles (`accounting`/`ops`/`sales`/`warehouse`) — sees
 * ALL orders + a "ผู้สั่งซื้อ" filter dropdown.
 *
 * Pure module (no `server-only` / no I/O) so it is unit-testable + importable
 * from either page. It ONLY reads the role set; the caller supplies the viewer's
 * own adminID for the actual `.eq()`.
 *
 * Design: "purchaser-only" = holds `purchaser` AND holds NONE of the FULL_ACCESS
 * roles. So a person who is BOTH a purchaser AND a purchaser_lead/interpreter/god
 * (dual grant) sees everything (the broader grant wins) — a purchaser never gets
 * ACCIDENTALLY down-scoped by also being trusted with a supervisory role.
 */
import type { AdminRole } from "@/lib/auth/require-admin";

/**
 * Roles that see EVERY order on the two lists (no per-purchaser scope). Holding
 * ANY of these overrides a `purchaser` grant → full visibility.
 *
 *  - purchaser_lead / interpreter — the supervisory + handoff roles (owner ④).
 *  - ultra / super / normies      — the god-nav visibility tiers (isGodRole).
 *  - accounting / ops / sales / warehouse — the existing full-access operational
 *    roles that already reach these list pages (pre-0241 behaviour preserved).
 */
export const PURCHASER_FULL_ACCESS_ROLES: readonly AdminRole[] = [
  "purchaser_lead",
  "interpreter",
  "ultra",
  "super",
  "normies",
  "accounting",
  "ops",
  "sales",
  "warehouse",
];

/**
 * True when the viewer must be hard-scoped to their OWN assigned orders — i.e.
 * they hold the `purchaser` role and NONE of the full-access roles above.
 *
 * A viewer with zero roles, or with a full-access role, is NOT scoped.
 */
export function isPurchaserScoped(roles: AdminRole[] | null | undefined): boolean {
  if (!roles || roles.length === 0) return false;
  if (!roles.includes("purchaser")) return false;
  return !roles.some((r) => PURCHASER_FULL_ACCESS_ROLES.includes(r));
}

/**
 * Roles allowed to REASSIGN an order's purchaser (owner ④): interpreter +
 * purchaser_lead + the true god roles (ultra/super). A plain `purchaser` may
 * NOT reassign; `normies` (god-nav) is deliberately EXCLUDED here — the owner
 * named exactly {interpreter, purchaser_lead, ultra, super}, so we check the
 * role set explicitly rather than leaning on isGodRole (which would also admit
 * normies).
 */
export const PURCHASER_REASSIGN_ROLES: readonly AdminRole[] = [
  "interpreter",
  "purchaser_lead",
  "ultra",
  "super",
];

/** True when the viewer may reassign an order's purchaser. */
export function canReassignPurchaser(roles: AdminRole[] | null | undefined): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.some((r) => PURCHASER_REASSIGN_ROLES.includes(r));
}
