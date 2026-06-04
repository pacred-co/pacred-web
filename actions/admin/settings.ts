"use server";

import type { AdminActionResult } from "./common";

// ════════════════════════════════════════════════════════════
// ADR-0024 — config / settings SOT.  NEUTRALIZED 2026-06-01.
// ════════════════════════════════════════════════════════════
//
// This action USED to write the rebuilt `settings` table (singleton id=1:
// service_fee · juristic_discount_* · qc_fee_per_item · crate_fee_base ·
// free_shipping_enabled/_threshold; yuan_rate was already removed earlier).
//
// The 2026-06-01 big audit (docs/decisions/0024-config-settings-sot.md)
// confirmed every one of those fields is a DEAD-WRITE for the live customer
// money path (verified per-consumer · §0e):
//
//   • Yuan rate              → live path reads tb_settings.rpdefault/rsdefault
//                              (getCurrentYuanRate, cart.ts). Edit at
//                              /admin/settings/legacy-rates.
//   • Free shipping          → live forwarder/receipt path reads
//                              tb_settings.freeshipping (1/2). Edit at
//                              /admin/settings/forwarder-costs.
//   • service_fee / juristic / QC / crate
//                            → read ONLY by the rebuilt actions/forwarder.ts
//                              lane (service-import/add, near-zero data).
//                              (The display-only /api/settings-rate preview
//                              endpoint was DELETED 2026-06-02 — Wave A §0e:
//                              unconsumed + served the stale rebuilt rate.)
//                              The live forwarder pricing uses
//                              resolve-rate.ts + tb_rate_* + the tb_settings
//                              cost matrix — NOT these fields. (Scoped to the
//                              rebuilt lane per ADR-0024 D-3a; that lane's
//                              banner is a separate follow-up.)
//
// So writing rebuilt `settings` gave staff a green toast that changed
// nothing on the live path — the same trust trap as the /admin/rates/vip
// dead-write (AGENTS.md §0e). Per ADR-0024 D-2/D-4 #1 (recommended) the
// /admin/settings page is now a READ-THROUGH HUB linking the three canonical
// editors; this write action is retired.
//
// Kept as a loud-failing stub (not deleted) so any stray caller surfaces a
// clear redirect instead of silently succeeding. The only in-repo caller
// (settings-form.tsx) no longer invokes it.

export type AdminUpdateSettingsInput = {
  service_fee?: number;
  juristic_discount_threshold?: number;
  juristic_discount_pct?: number;
  qc_fee_per_item?: number;
  crate_fee_base?: number;
  free_shipping_enabled?: boolean;
  free_shipping_threshold?: number | null;
  confirm_unusual_rate?: boolean;
};

/**
 * @deprecated ADR-0024 — the rebuilt `settings` table is not the canonical
 * home for any config field. Use the canonical editors instead:
 *   • yuan rate     → /admin/settings/legacy-rates (tb_settings.rpdefault/rsdefault)
 *   • free shipping + cost matrix → /admin/settings/forwarder-costs (tb_settings)
 *   • tax / OTP / wallet / flags  → /admin/settings/business-config (business_config)
 * This stub no longer writes anything and returns an error pointing there.
 */
export async function adminUpdateSettings(
  _input: AdminUpdateSettingsInput,
): Promise<AdminActionResult> {
  void _input;
  return {
    ok: false,
    error:
      "หน้าตั้งค่านี้เลิกแก้ค่าโดยตรงแล้ว (ADR-0024) — เรทหยวนแก้ที่ " +
      "“ปรับเรทหยวนรายวัน”, ส่งฟรี/ต้นทุนที่ “เรทต้นทุนฝากนำเข้า”, " +
      "ภาษี/OTP/กระเป๋าที่ “Business Config”.",
  };
}
