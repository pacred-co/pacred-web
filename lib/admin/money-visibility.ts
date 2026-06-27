/**
 * Money-internal visibility gate.
 *
 * 2026-06-27 (owner ปอน) — the admin model is now THREE visibility tiers, and
 * the old single "cost+profit" gate is SPLIT into two independent predicates so
 * the middle tier can see PROFIT without seeing COST:
 *
 *   ┌──────────────┬──────────┬─────────┬───────────┐
 *   │ Tier         │ ต้นทุน    │ กำไร    │ ยอดขาย     │
 *   ├──────────────┼──────────┼─────────┼───────────┤
 *   │ ultra        │   ✅     │   ✅    │    ✅      │   ← Ultra Admin Z (sees all)
 *   │ super        │   ❌     │   ✅    │    ✅      │   ← sees profit, NOT cost
 *   │ normies      │   ❌     │   ❌    │    ✅      │   ← sees neither (god-nav, money-blind)
 *   └──────────────┴──────────┴─────────┴───────────┘
 *
 * `canViewCost`   → COST / ต้นทุน / COGS / cost-rate (เรทหยวนต้นทุน) / declared
 *                   value (มูลค่าสำแดง). ultra only (+ the legacy job roles
 *                   accounting · pricing, kept for existing holders).
 * `canViewProfit` → PROFIT / กำไร / margin / มาร์จิน / commission (คอม) / payout
 *                   amounts / P&L. ultra + super (+ accounting · pricing).
 *
 * "Money internals" (owner: "ทั้งหมดทุกส่วน") =
 *   • cost / ต้นทุน / COGS              (fcosttotalprice, cost_unit_thb, ค่าตู้, ...) → canViewCost
 *   • cost-side FX / cost rate          (hRateCostDefault, payRateCost, เรทหยวนต้นทุน) → canViewCost
 *   • declared value / มูลค่าสำแดง       (declared_value_thb, declared_amount_ccy)     → canViewCost
 *   • profit / margin / กำไร / มาร์จิน   (fProfit*, payprofitthb, computeMarginVat, P&L) → canViewProfit
 *   • commission / คอมมิชชั่น (amounts)  (tb_user_sales payouts, freight commission)    → canViewProfit
 *
 * NOT money-internal (stays visible to ALL admins incl. normies): SELLING price,
 * customer quotes, wallet balances, order status.
 *
 * MIGRATION NOTE — `canViewCostProfit` (the OLD single predicate) is kept as a
 * back-compat alias of the STRICTER `canViewCost`, so every existing call site
 * keeps its EXACT current behavior (super sees nothing). To grant `super` the
 * new profit visibility on a surface, switch that surface to `canViewProfit`
 * (profit-only) or split it inline (cost-line gated by canViewCost · profit-line
 * by canViewProfit). Defaulting to the strict alias means a missed surface
 * UNDER-shows (super sees less) rather than LEAKS cost — fail-closed by design.
 *
 * SECURITY: callers MUST hide at the DATA layer — omit the field/column before
 * render (Server Components), skip the column entirely in CSV/PDF exports, or
 * pass the boolean down as a prop and conditionally render in Client Components.
 * Never rely on CSS to hide a value that was already sent to the browser. And
 * never gate a cost/profit number with `isGodRole(...)` — that would expose it
 * to `super`/`normies` (both god-nav); always use these predicates.
 *
 * Pure module (no server-only import) so both server + client code can import
 * the predicates. Reading the viewer's roles is the caller's job
 * (`getAdminRoles()` on the server, or a prop threaded to the client).
 */
import type { AdminRole } from "@/lib/auth/require-admin";

/**
 * Roles allowed to see COST internals (ต้นทุน / declared / cost-rate). `ultra`
 * is the god money-role; `accounting` + `pricing` are legacy job roles kept for
 * existing holders (the picker no longer assigns them — owner ปอน 2026-06-27).
 * `super` is deliberately EXCLUDED (it sees profit, not cost).
 */
export const COST_ROLES: readonly AdminRole[] = ["ultra", "accounting", "pricing"] as const;

/**
 * Roles allowed to see PROFIT internals (กำไร / margin / commission / payout).
 * Same as COST_ROLES PLUS `super` — the middle visibility tier that sees profit
 * but not cost.
 */
export const PROFIT_ROLES: readonly AdminRole[] = ["ultra", "super", "accounting", "pricing"] as const;

/**
 * Back-compat: the OLD bundled set === the COST set (strict). Kept exported so
 * existing importers don't break. New code should import COST_ROLES / PROFIT_ROLES.
 */
export const COST_PROFIT_ROLES = COST_ROLES;

/** May this role set see COST internals (ต้นทุน / declared / cost-rate)? */
export function canViewCost(roles: AdminRole[] | null | undefined): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.some((r) => COST_ROLES.includes(r));
}

/** May this role set see PROFIT internals (กำไร / margin / commission / payout)? */
export function canViewProfit(roles: AdminRole[] | null | undefined): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.some((r) => PROFIT_ROLES.includes(r));
}

/**
 * DEPRECATED alias of `canViewCost` (the strict, cost-level gate). Existing call
 * sites keep their current behavior (super/normies see nothing). Migrate
 * profit-only surfaces to `canViewProfit` to grant `super` profit visibility.
 */
export function canViewCostProfit(roles: AdminRole[] | null | undefined): boolean {
  return canViewCost(roles);
}
