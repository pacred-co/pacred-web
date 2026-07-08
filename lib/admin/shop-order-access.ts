/**
 * ฝากสั่งซื้อ (shop-order) edit-access predicate — faithful to legacy PCS.
 *
 * Legacy `pcs-admin/shops.php` L528 gates the "อัปเดตรายการ" (edit) button to
 * eight departmentKeys:
 *   CEO · Manager · QAAndQC · Accounting · ITDT · CSPurchasing · SaleCargo · Marketing
 * — i.e. every OFFICE department. It is HIDDEN for the two field departments
 * (คลัง warehouse · คนขับ driver) and for the Freight lane (cargo shops.php is
 * cargo-only).
 *
 * Pacred mapping (owner 2026-07-08 "เอาตาม legacy · เทียบให้เป๊ะ"):
 *   • CEO / ITDT / Manager (executive+it depts) → the three god-nav tiers
 *     ultra / super / normies → covered by `isGodRole()`.
 *   • Manager                → "manager"
 *   • QAAndQC                → "qa"
 *   • Accounting             → "accounting"
 *   • CSPurchasing           → "sales_admin" (CS mgr) + "interpreter" (ล่ามจีน)
 *                              + "purchaser" / "purchaser_lead" (ผู้สั่งซื้อ/หัวหน้า)
 *   • SaleCargo              → "sales" + "sales_admin"
 *   • Marketing              → marketing staff hold god-nav + a marketing
 *                              position → covered by isGodRole (no bare role).
 *   • (office-adjacent · err inclusive) → "pricing" + "ops"
 * EXCLUDED (blocked, exactly as legacy): bare "warehouse", "driver", "freight_*".
 *
 * Because `requireAdmin([roles])` and `hasRole()` both OR-in `isGodRole()`, the
 * god-nav majority always passes; this allowlist only decides the few staff who
 * hold a bare (non-god) function role. Erring inclusive on office roles is safe
 * — the failure mode we must avoid is locking out a legitimate editor.
 *
 * Pure module (no `server-only`) so both the server gate (edit/page.tsx) and the
 * client list button (service-orders-table.tsx) can share ONE source of truth.
 * `AdminRole` is a type-only import (erased at compile · no server-only pull-in).
 */
import type { AdminRole } from "@/lib/auth/require-admin";
import { isGodRole } from "@/lib/admin/god-role";

/** Office function-roles that may edit a ฝากสั่งซื้อ order (legacy shops.php L528). */
export const SHOP_ORDER_EDIT_ROLES: readonly AdminRole[] = [
  "manager",        // Manager
  "qa",             // QAAndQC
  "accounting",     // Accounting
  "sales_admin",    // Cargo Sales Manager / CS Manager (SaleCargo · CSPurchasing · Marketing)
  "sales",          // Cargo Sales Staff (SaleCargo)
  "interpreter",    // ล่ามจีน (CSPurchasing)
  "purchaser",      // ผู้สั่งซื้อ (CSPurchasing)
  "purchaser_lead", // หัวหน้าสั่งซื้อ (CSPurchasing)
  "pricing",        // Cargo Pricing (office · accounting-adjacent)
  "ops",            // operations office
] as const;

/**
 * True if the viewer may edit a ฝากสั่งซื้อ order — god-nav (ultra/super/normies)
 * OR any office role above. Bare warehouse/driver/freight → false (legacy blocks).
 */
export function canEditShopOrder(roles: AdminRole[] | null | undefined): boolean {
  if (isGodRole(roles)) return true;
  if (!roles) return false;
  return SHOP_ORDER_EDIT_ROLES.some((r) => roles.includes(r));
}
