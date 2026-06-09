/**
 * lib/freight-commission/flag.ts
 *
 * The single DORMANT-GATE for the FREIGHT commission system (accrual +
 * withdrawal). 💰 MONEY-CRITICAL — mirrors the proven lib/tax/shop-yuan-flag.ts.
 *
 * ── Why a dedicated helper ──
 *   Every place that accrues / surfaces freight commission must read the SAME
 *   flag so the feature ships DORMANT and flips atomically. Routing it through
 *   one function (instead of inlining getBusinessConfig everywhere) means the
 *   key + default + shape can never drift between call sites.
 *
 * ── The flag ──
 *   business_config key:  commission.freight_enabled
 *   value (jsonb):        { "enabled": boolean }
 *   DEFAULT:              { "enabled": false }   ← OFF = dormant = deploy-safe
 *
 *   Seeded OFF by migration 0167. When `enabled` is false:
 *     - adminAccrueFreightCommission NO-OPs (records nothing)
 *     - the /admin/commission/freight UI shows a "DORMANT — รอ owner ยืนยัน
 *       rate + เปิดใช้" banner
 *   → deploying to prod changes NOTHING until the owner flips the flag (AFTER
 *     reviewing/confirming the seeded tier rates in freight_commission_tiers).
 *
 * Server-only — reads business_config via the admin client (60s cached).
 */

import "server-only";
import { getBusinessConfig } from "@/lib/business-config";

/** The business_config key for the freight-commission dormant gate. */
export const FREIGHT_COMMISSION_FLAG_KEY = "commission.freight_enabled" as const;

type FreightCommissionFlag = { enabled: boolean };

/**
 * Is the FREIGHT commission system LIVE?
 *
 * Returns `false` on any failure (missing key, DB unreachable, malformed value)
 * — fail-CLOSED so a config glitch can never accidentally start accruing
 * commission. The default seed is also `false`.
 */
export async function isFreightCommissionEnabled(): Promise<boolean> {
  const flag = await getBusinessConfig<FreightCommissionFlag>(
    FREIGHT_COMMISSION_FLAG_KEY,
    { enabled: false },
  );
  return flag?.enabled === true;
}
