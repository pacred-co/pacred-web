/**
 * lib/admin/go-live-status.ts — the live readiness snapshot for the
 * Go-Live Control Panel (/admin/settings/go-live).
 *
 * Reads the current state of every DORMANT go-live lever from its authoritative
 * source (business_config rows · freight_commission_tiers · the admins role
 * table · server env presence) so the panel can show, in ONE place, what is
 * already live, what is ready-and-waiting on an owner flip, and what still needs
 * an external input. PURE READ — never mutates. Server-only.
 *
 * §0e isolation: this module ONLY reads. The flips themselves go through the
 * existing audited super-only actions (adminUpdateBusinessConfig /
 * adminSetFreightCommissionTierConfirmed) from the client — never a new
 * write path here.
 */
import "server-only";

import { getBusinessConfig } from "@/lib/business-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHOP_YUAN_TAX_INVOICE_FLAG_KEY } from "@/lib/tax/shop-yuan-flag";
import { FREIGHT_COMMISSION_FLAG_KEY } from "@/lib/freight-commission/flag";

/** The raw shapes the panel's inline JSON editors round-trip. */
export type CustomsFxRaw = { [k: string]: number | boolean | undefined; pending?: boolean };
export type PeakGlRaw = { selling?: string; cost?: string; declared?: string; pending?: boolean };

/** The four staff roles that gate the cargo-acct / freight-doc surfaces. */
export const GO_LIVE_ROLE_KEYS = [
  "pricing",
  "warehouse",
  "freight_export_doc",
  "freight_import_doc",
] as const;
export type GoLiveRoleKey = (typeof GO_LIVE_ROLE_KEYS)[number];

export type GoLiveStatus = {
  /** tax_invoice.shop_yuan_enabled — ฝากสั่ง/ฝากโอน ใบกำกับ issuance live? */
  shopYuanEnabled: boolean;
  shopYuanRaw: { enabled: boolean };

  /** commission.freight_enabled — freight commission accrual live? */
  freightCommissionEnabled: boolean;
  freightCommissionRaw: { enabled: boolean };
  /** active tier counts — can't responsibly go live with 0 confirmed. */
  freightTierActiveCount: number;
  freightTierConfirmedCount: number;

  /** customs.fx_rates — the ใบขน declared-value FX (กรมศุล monthly). */
  customsFxRaw: CustomsFxRaw;
  customsFxPending: boolean;
  customsFxCurrencyCount: number;

  /** peak.gl_accounts — the PEAK CSV chart-of-accounts map. */
  peakGlRaw: PeakGlRaw;
  peakGlPending: boolean;
  peakGlFilled: boolean;

  /** active-admin head-count per gating role. */
  roleCounts: Record<GoLiveRoleKey, number>;

  /** server env presence (booleans only — NEVER the secret value). */
  receiptSecretSet: boolean;
  netbaySet: boolean;
};

function countCurrencies(raw: CustomsFxRaw): number {
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (k === "pending") continue;
    const num = Number(v);
    if (Number.isFinite(num) && num > 0) n++;
  }
  return n;
}

/** Load the full readiness snapshot. Each read fails-safe to a dormant/empty
 *  default so the panel renders even if a row is missing. */
export async function loadGoLiveStatus(): Promise<GoLiveStatus> {
  const admin = createAdminClient();

  const [shopYuanRaw, freightRaw, customsFxRaw, peakGlRaw, rolesRes] = await Promise.all([
    getBusinessConfig<{ enabled: boolean }>(SHOP_YUAN_TAX_INVOICE_FLAG_KEY, { enabled: false }),
    getBusinessConfig<{ enabled: boolean }>(FREIGHT_COMMISSION_FLAG_KEY, { enabled: false }),
    getBusinessConfig<CustomsFxRaw>("customs.fx_rates", { USD: 36.5, CNY: 5.1, pending: true }),
    getBusinessConfig<PeakGlRaw>("peak.gl_accounts", { selling: "", cost: "", declared: "", pending: true }),
    admin
      .from("admins")
      .select("role, profile_id")
      .eq("is_active", true)
      .in("role", [...GO_LIVE_ROLE_KEYS]),
  ]);

  // Freight tiers — count active + owner-confirmed.
  let freightTierActiveCount = 0;
  let freightTierConfirmedCount = 0;
  {
    const { data, error } = await admin
      .from("freight_commission_tiers")
      .select("is_owner_confirmed, active");
    if (error) {
      console.error(`[go-live-status freight tiers]`, { code: error.code, message: error.message });
    } else {
      for (const r of (data ?? []) as Array<{ is_owner_confirmed: boolean; active: boolean }>) {
        if (!r.active) continue;
        freightTierActiveCount++;
        if (r.is_owner_confirmed) freightTierConfirmedCount++;
      }
    }
  }

  // Role head-count (distinct active admins per role).
  const roleCounts = Object.fromEntries(GO_LIVE_ROLE_KEYS.map((r) => [r, 0])) as Record<GoLiveRoleKey, number>;
  if (rolesRes.error) {
    console.error(`[go-live-status roles]`, { code: rolesRes.error.code, message: rolesRes.error.message });
  } else {
    const seen = new Set<string>();
    for (const row of (rolesRes.data ?? []) as Array<{ role: string; profile_id: string }>) {
      const k = `${row.role}:${row.profile_id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if ((GO_LIVE_ROLE_KEYS as readonly string[]).includes(row.role)) {
        roleCounts[row.role as GoLiveRoleKey]++;
      }
    }
  }

  const peakGlFilled = !!peakGlRaw?.selling?.trim() && !!peakGlRaw?.cost?.trim();

  return {
    shopYuanEnabled: shopYuanRaw?.enabled === true,
    shopYuanRaw: { enabled: shopYuanRaw?.enabled === true },

    freightCommissionEnabled: freightRaw?.enabled === true,
    freightCommissionRaw: { enabled: freightRaw?.enabled === true },
    freightTierActiveCount,
    freightTierConfirmedCount,

    customsFxRaw,
    customsFxPending: customsFxRaw?.pending === true,
    customsFxCurrencyCount: countCurrencies(customsFxRaw),

    peakGlRaw,
    peakGlPending: peakGlRaw?.pending === true,
    peakGlFilled,

    roleCounts,

    receiptSecretSet: !!process.env.RECEIPT_TOKEN_SECRET,
    // The documented NETBAY scheme (.env.example) is ENDPOINT + USERNAME + PASSWORD.
    netbaySet: !!(process.env.NETBAY_ENDPOINT && process.env.NETBAY_USERNAME),
  };
}
