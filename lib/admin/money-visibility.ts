/**
 * Money-internal visibility gate (owner directive · 2026-06-18).
 *
 * Pacred hides ALL "money internals" from every admin role EXCEPT the three
 * allowed below. This is the capability that distinguishes `ultra`
 * ("Ultra Admin Z") from `super`: both are god roles for navigation/actions,
 * but `super` may NOT see money internals — only `ultra`, `accounting`, and
 * `pricing` may.
 *
 * "Money internals" (owner: "ทั้งหมดทุกส่วน") =
 *   • cost / ต้นทุน / COGS              (fcosttotalprice, cost_unit_thb, ค่าตู้, ...)
 *   • profit / margin / กำไร / มาร์จิน   (fProfit*, payprofitthb, computeMarginVat, P&L)
 *   • cost-side FX / cost rate          (hRateCostDefault, payRateCost, เรทหยวนต้นทุน)
 *   • declared value / มูลค่าสำแดง       (declared_value_thb, declared_amount_ccy)
 *   • commission / คอมมิชชั่น (amounts)  (tb_user_sales payouts, freight commission)
 *
 * NOT money-internal (stays visible to all admins): SELLING price, customer
 * quotes, wallet balances, order status.
 *
 * SECURITY: callers MUST hide at the DATA layer — omit the field/column before
 * render (Server Components), skip the column entirely in CSV/PDF exports, or
 * pass `canViewCostProfit` down as a boolean prop and conditionally render in
 * Client Components. Never rely on CSS to hide a value that was already sent to
 * the browser.
 *
 * Pure module (no server-only import) so both server + client code can import
 * the predicate. Reading the viewer's roles is the caller's job
 * (`getAdminRoles()` on the server, or a prop threaded to the client).
 */
import type { AdminRole } from "@/lib/auth/require-admin";

/**
 * The ONLY roles allowed to see money internals. Deliberately excludes `super`
 * (owner 2026-06-18: super loses cost/profit visibility) and every operational
 * role. `ultra` is the god role; `accounting` + `pricing` have a legitimate
 * cost/profit job function.
 */
export const COST_PROFIT_ROLES: readonly AdminRole[] = ["ultra", "accounting", "pricing"] as const;

/**
 * May this set of admin roles see money internals?
 * `true` iff the viewer holds ultra, accounting, or pricing. (NOT super.)
 */
export function canViewCostProfit(roles: AdminRole[] | null | undefined): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.some((r) => COST_PROFIT_ROLES.includes(r));
}
