/**
 * lib/tax/shop-yuan-flag.ts
 *
 * The single LIVE-GATE for ฝากสั่งซื้อ (shop) + ฝากโอน (yuan) tax-invoice
 * issuance + customer-request surfaces. MONEY/TAX-CRITICAL.
 *
 * ── Why a dedicated helper ──
 *   Every place that issues / un-defers a shop or yuan ใบกำกับ/ใบขน must read
 *   the SAME flag so the feature ships DORMANT and flips atomically. Routing
 *   it through one function (instead of inlining getBusinessConfig everywhere)
 *   means the key + default + shape can never drift between call sites.
 *
 * ── The flag ──
 *   business_config key:  tax_invoice.shop_yuan_enabled
 *   value (jsonb):        { "enabled": boolean }
 *   DEFAULT:              { "enabled": false }   ← OFF = dormant = deploy-safe
 *
 *   Seeded OFF by migration 0152. When `enabled` is false:
 *     - auto-issue at shop payment-land / yuan-approve is SKIPPED entirely
 *     - the customer-request action returns `not_yet_supported`
 *     - the customer receipt panels render the "coming soon" banner
 *   → deploying to prod changes NOTHING until the owner flips the flag.
 *
 * Server-only — reads business_config via the admin client (60s cached).
 */

import "server-only";
import { getBusinessConfig } from "@/lib/business-config";

/** The business_config key for the shop/yuan tax-invoice live-gate. */
export const SHOP_YUAN_TAX_INVOICE_FLAG_KEY = "tax_invoice.shop_yuan_enabled" as const;

type ShopYuanFlag = { enabled: boolean };

/**
 * Is shop/yuan tax-invoice issuance LIVE?
 *
 * Returns `false` on any failure (missing key, DB unreachable, malformed
 * value) — fail-CLOSED so a config glitch can never accidentally start minting
 * tax documents. The default seed is also `false`.
 */
export async function isShopYuanTaxInvoiceEnabled(): Promise<boolean> {
  const flag = await getBusinessConfig<ShopYuanFlag>(
    SHOP_YUAN_TAX_INVOICE_FLAG_KEY,
    { enabled: false },
  );
  return flag?.enabled === true;
}
