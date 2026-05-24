/**
 * D1 / G3 · Warehouse free-area check — port of legacy
 *           member/include/pages/forwarder/checkFreeArea.php
 *
 * ── What the legacy actually does ───────────────────────────────────
 *
 * Naming aside (the gap doc calls this a "warehouse" check), the
 * legacy `checkFreeArea.php` is a **delivery-area** gate keyed by the
 * customer's destination postal code. It runs when the user selects
 * `fShipBy='PCSF'` (the "PCS จัดส่งฟรี กทม. และปริมณฑล" promo) and
 * confirms whether the chosen shipping address falls inside the
 * Bangkok + 5 metro-province ZIP allowlist hard-coded in
 *   member/include/function.php  (optionHShipByCart2 L822-828)
 *   member/include/pages/forwarder/checkFreeArea.php  L4-10
 *
 * Concretely the legacy SELECTs:
 *
 *   SELECT addressZIPCode FROM tb_address
 *    WHERE userID='$_SESSION[userID]'
 *      AND addressID='$_POST[ID]'
 *      AND addressZIPCode IN ('$idsFromArr')
 *
 * — i.e. there is **NO** `tb_warehouse` and **NO** `tb_rate_free_area`
 * table involved. The "free area" is the same ZIP allowlist that
 * `lib/bkk-zip.ts` already ports (BKK 10xxx + Nonthaburi 11xxx +
 * Samut Prakan/Sakhon + Nakhon Pathom + Pathum Thani metro). The gap
 * doc's table names were speculative — the actual data lives in
 * source code, not a master table.
 *
 * ── What this helper does ──────────────────────────────────────────
 *
 * `checkWarehouseArea` decides whether the PCSF free-delivery promo
 * applies to a given shipment. When it does, the caller zeroes the
 * `thailand_delivery_thb` adder before handing the input to
 * `calcPrice` — that mirrors the legacy "PCS เหมาๆ" experience where
 * the customer pays no Thai-domestic delivery fee inside the metro
 * allowlist.
 *
 * The helper is intentionally pure (no DB, no network, no Supabase
 * client) — it is a configuration lookup. That makes it trivially
 * unit-testable and reusable from both the server action AND the
 * client-side price preview without a Supabase roundtrip.
 *
 * Why expose `weight`/`volume`/`shipBy`/`cargoType` even though the
 * legacy ignores them? The D1 gap brief (§5) committed to the
 * signature `checkWarehouseArea({ warehouseId, weight, volume,
 * shipBy, cargoType })` — keeping it lets later phases plug in a
 * weight/CBM cap (e.g. "free only ≤ 50 kg") or a cargo-type exclusion
 * (e.g. "no PCSF for special cargo") without breaking callers. Today
 * the only inputs that actually drive a decision are `postalCode` +
 * `shipBy`; the rest are reserved for future rules and are typed +
 * documented but not consulted.
 *
 * ── Surfaced TODOs ─────────────────────────────────────────────────
 *  - The legacy reads `tb_settings.freeShipping=1` (function.php L791)
 *    as a master switch — if that flag is off, even an in-allowlist
 *    ZIP doesn't surface PCSF. Right now we trust the caller to gate
 *    by the same admin setting (settings.free_shipping_enabled) before
 *    calling us; once Phase G admin settings ship we can pull it here.
 *  - Pathum Thani: `checkFreeArea.php` includes 12000 in the array
 *    but the sister-file `getShipBy.php` (L9) sets PathumThani=[].
 *    `lib/bkk-zip.ts` follows the empty list (the conservative path —
 *    we'd rather refuse a free shipment than over-promise) so 12000
 *    returns `false` here too. If/when the business decides which way
 *    is right, update `lib/bkk-zip.ts` and the existing bkk-zip tests
 *    will cover the new ZIPs.
 *  - The "หนองแขม allowlist" exemption (calPrice.php L34-38, mirrored
 *    in `actions/forwarder.ts L156-164`) is a *post-price* +50฿
 *    rebate, not a free-area gate, so it stays where it lives.
 */

import { isFreeShippingZip } from "@/lib/bkk-zip";

/** Identifier the legacy promo uses on tb_forwarder.fShipBy. */
export const PCSF_PROMO_CODE = "PCSF" as const;

export type CheckWarehouseAreaInput = {
  /**
   * Source warehouse identifier — legacy `fwarehousechina`
   * ('1'=กวางโจว, '2'=อี้อู), or the new enum
   * ("guangzhou" | "yiwu"). Reserved for future per-warehouse rules
   * (today every Chinese warehouse gets the same Thai-side promo).
   */
  warehouseId?: string | null;

  /** Customer destination postal code (5-digit Thai ZIP). */
  postalCode: string | null | undefined;

  /** Selected shipping method (legacy `fShipBy`). Only `'PCSF'` enables
   *  the promo; anything else short-circuits to `freeAreaApplies=false`. */
  shipBy?: string | null;

  /** Reserved — declared price delta the caller wanted to waive. When
   *  the promo applies we report it back as `waivedThb` so the caller
   *  can adjust the `thailand_delivery_thb` line item it passes into
   *  `calcPrice`. */
  thailandDeliveryThb?: number | null;

  /** Reserved — future per-shipment cap by weight. */
  weight?: number | null;

  /** Reserved — future per-shipment cap by CBM. */
  volume?: number | null;

  /** Reserved — future cargo-type exclusion (e.g. "special" disqualifies). */
  cargoType?: string | null;
};

export type CheckWarehouseAreaResult = {
  /** True when the customer's destination is inside the free-shipping
   *  ZIP allowlist AND the selected shipping method is the PCSF promo. */
  freeAreaApplies: boolean;

  /** The adjusted Thai-domestic delivery fee the caller should pass to
   *  `calcPrice` — `0` when `freeAreaApplies`, otherwise the original
   *  `thailandDeliveryThb` echoed back unchanged. Always a finite
   *  non-negative number so the caller never has to special-case
   *  null. */
  adjustedPrice: number;

  /** Detail bag for auditing / UI surfacing. Always present. */
  freeAreaInfo: {
    /** Postal code we checked (trimmed). */
    postalCode: string;
    /** True if `postalCode` is in the BKK/metro allowlist. */
    zipMatched: boolean;
    /** True if the chosen `shipBy` is the PCSF promo. */
    pcsfRequested: boolean;
    /** Original `thailandDeliveryThb` (defaults to 0 when not supplied). */
    originalThailandDeliveryThb: number;
    /** Amount waived (`originalThailandDeliveryThb` when the promo
     *  applies, otherwise 0). */
    waivedThb: number;
    /** Why the promo didn't apply (only set when
     *  `freeAreaApplies=false`). */
    reason?:
      | "zip_not_in_free_area"
      | "ship_by_not_pcsf"
      | "no_postal_code";
  };
};

function normaliseThb(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Decide whether the PCSF free-delivery promo applies to a given
 * forwarder shipment. Pure — safe to call from a server action OR a
 * client component (we don't import `server-only`).
 *
 * Legacy: member/include/pages/forwarder/checkFreeArea.php L4-30
 *         member/include/function.php optionHShipByCart2 L822-861
 *
 * Truth table:
 *
 *   shipBy   | zip in allowlist | result
 *   ─────────┼──────────────────┼───────────────────────────────
 *   'PCSF'   | yes              | freeAreaApplies=true, fee→0
 *   'PCSF'   | no               | freeAreaApplies=false (reason=zip…)
 *   other    | yes              | freeAreaApplies=false (reason=ship…)
 *   other    | no               | freeAreaApplies=false (reason=ship…)
 *   any      | postal missing   | freeAreaApplies=false (reason=no_postal…)
 */
export function checkWarehouseArea(
  input: CheckWarehouseAreaInput,
): CheckWarehouseAreaResult {
  const originalThb = normaliseThb(input.thailandDeliveryThb);
  const postalRaw = (input.postalCode ?? "").trim();
  const pcsfRequested = input.shipBy === PCSF_PROMO_CODE;
  const zipMatched = postalRaw.length > 0 && isFreeShippingZip(postalRaw);

  // No postal code at all — short-circuit; the caller likely has
  // not collected the shipping address yet (preview-as-you-type).
  if (postalRaw.length === 0) {
    return {
      freeAreaApplies: false,
      adjustedPrice: originalThb,
      freeAreaInfo: {
        postalCode: "",
        zipMatched: false,
        pcsfRequested,
        originalThailandDeliveryThb: originalThb,
        waivedThb: 0,
        reason: "no_postal_code",
      },
    };
  }

  // Promo not selected — never waive even when ZIP would qualify.
  if (!pcsfRequested) {
    return {
      freeAreaApplies: false,
      adjustedPrice: originalThb,
      freeAreaInfo: {
        postalCode: postalRaw,
        zipMatched,
        pcsfRequested: false,
        originalThailandDeliveryThb: originalThb,
        waivedThb: 0,
        reason: "ship_by_not_pcsf",
      },
    };
  }

  // Promo selected but destination outside the metro allowlist —
  // mirror the legacy Swal.fire("ที่อยู่ของคุณ ไม่ได้อยู่ในพื้นที่
  // จัดส่งฟรี!!!"). We return `false` so the caller can either bounce
  // the submit OR fall back to a different `ship_by`; the action
  // already validates `ship_by` so business-rule enforcement stays
  // there.
  if (!zipMatched) {
    return {
      freeAreaApplies: false,
      adjustedPrice: originalThb,
      freeAreaInfo: {
        postalCode: postalRaw,
        zipMatched: false,
        pcsfRequested: true,
        originalThailandDeliveryThb: originalThb,
        waivedThb: 0,
        reason: "zip_not_in_free_area",
      },
    };
  }

  // PCSF + in-allowlist ZIP → waive the Thai-domestic delivery fee.
  return {
    freeAreaApplies: true,
    adjustedPrice: 0,
    freeAreaInfo: {
      postalCode: postalRaw,
      zipMatched: true,
      pcsfRequested: true,
      originalThailandDeliveryThb: originalThb,
      waivedThb: originalThb,
    },
  };
}
