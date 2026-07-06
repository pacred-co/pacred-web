/**
 * Per-order purchaser (ผู้สั่งซื้อ) visibility scope rule (owner ④ · 2026-07-06 ·
 * mig 0241 · re-keyed to the POSITION/WORKSPACE axis · mig 0242).
 *
 * The ฝากสั่งซื้อ (/admin/service-orders) + ฝากนำเข้า (/admin/forwarders) lists
 * HARD-SCOPE a viewer whose WORKSPACE is `purchaser` to their own assigned
 * orders (WHERE adminidpurchaser = their tb_admin.adminID). Everyone else —
 * a `purchaser_lead` workspace (หัวหน้าสั่งซื้อ · sees ALL purchaser work), the
 * god tiers (`ultra`/`super`/`normies`), and any other workspace/role — sees ALL
 * orders + a "ผู้สั่งซื้อ" filter dropdown.
 *
 * WHY WORKSPACE, not base-role: the purchaser work-function is now assigned via
 * the POSITION (admin_contact_extras.position_id → admin_positions.workspace_role
 * · mig 0242), NOT the money-tier role. A staffer is made a purchaser by giving
 * them a base visibility role (e.g. `normies`) + the "ผู้สั่งซื้อ" position. So a
 * plain operational base role (sales/ops) MUST NOT exempt from scoping any more —
 * the WORKSPACE decides. The god tiers still see all (a purchaser_lead/super/etc.
 * is never accidentally down-scoped).
 *
 * BACK-COMPAT: the legacy raw `purchaser` / `purchaser_lead` ROLE (any pre-0242
 * direct grant, before the picker dropped them) is still honored via the role
 * clause, so existing holders keep working during the transition. Primary signal
 * is the workspace; the role is the fallback.
 *
 * Pure module (no `server-only` / no I/O) so it is unit-testable + importable
 * from either page. It reads the viewer's workspace-role + role set; the caller
 * supplies the viewer's own adminID for the actual `.eq()`.
 */
import type { AdminRole } from "@/lib/auth/require-admin";
import { isGodRole } from "@/lib/admin/god-role";

/**
 * True when the viewer must be hard-scoped to their OWN assigned orders — i.e.
 * their WORKSPACE is `purchaser` (or, back-compat, they hold the raw `purchaser`
 * role) AND they are NOT a god-nav role (ultra/super/normies see everything).
 *
 * A viewer with a different workspace (pricing/sales/…) or none, and no raw
 * purchaser role, is NOT scoped. A god-nav viewer is never scoped even if they
 * ALSO carry a purchaser workspace/role (the broader grant wins).
 *
 * @param workspaceRole  the viewer's resolved position workspace_role (or null)
 * @param roles          the viewer's money-tier / operational roles
 */
export function isPurchaserScoped(
  workspaceRole: string | null | undefined,
  roles: AdminRole[] | null | undefined,
): boolean {
  const rolesArr = roles ?? [];
  if (isGodRole(rolesArr)) return false; // god tiers always see all
  return workspaceRole === "purchaser" || rolesArr.includes("purchaser");
}

/**
 * True when the viewer may REASSIGN an order's purchaser (owner ④): the
 * `purchaser_lead` workspace (หัวหน้าสั่งซื้อ), the `interpreter` role (hands off
 * work), and the true god roles ultra/super. A plain `purchaser` may NOT
 * reassign; `normies` (god-nav) is deliberately EXCLUDED — the owner named
 * exactly {interpreter, purchaser_lead, ultra, super}.
 *
 * BACK-COMPAT: a legacy raw `purchaser_lead` role also passes (via the role
 * clause) so pre-0242 holders keep the reassign control.
 *
 * @param workspaceRole  the viewer's resolved position workspace_role (or null)
 * @param roles          the viewer's roles
 */
export function canReassignPurchaser(
  workspaceRole: string | null | undefined,
  roles: AdminRole[] | null | undefined,
): boolean {
  if (workspaceRole === "purchaser_lead") return true;
  const rolesArr = roles ?? [];
  return (
    rolesArr.includes("interpreter") ||
    rolesArr.includes("purchaser_lead") ||
    rolesArr.includes("ultra") ||
    rolesArr.includes("super")
  );
}
