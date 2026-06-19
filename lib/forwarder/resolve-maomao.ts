/**
 * Server-side เหมาๆ (PCS/PRF Mao Mao) eligibility guard for the ORDER-CREATE writers.
 *
 * THE BUG this closes (owner 2026-06-19: "default เขตเหมาๆ เก็บต้นทางหมดเลย"):
 * the create writers (createLegacyForwarder, submitCartOrder) honored the client's
 * `pro="f"` (เหมาๆ promo checkbox) BLINDLY — they set fShipBy="PCSF" without re-checking
 * whether the delivery address is actually in the เหมาๆ free-pickup zone. An out-of-zone
 * customer then got the เหมาๆ carrier → derivePayMethod returns '1' (ต้นทาง) → wrongly
 * billed pay-at-origin + promised a free pickup Pacred can't fulfil upcountry.
 *
 * Legacy NEVER trusted a raw `pro` flag: checkPCSMaoMao.php only OFFERED the promo
 * checkbox when proF≠2 (in-zone), and checkFreeArea.php CLEARED #hShipBy + warned when
 * the address fell out of zone — it dropped the promo, it did NOT reject the order.
 *
 * This is the SINGLE SOURCE OF TRUTH the writers call so the rule can't drift per-caller.
 * Pure + unit-testable (no DB) — the caller passes the resolved address zip.
 */

import { isMaomaoEligibleForAddress } from "@/lib/cart/ship-by-eligibility";
import { MAO_CARRIER_CODE } from "./mao-fee";

export interface ResolveMaomaoArgs {
  /** The client's เหมาๆ promo flag (form field `pro`; "f" = ticked). */
  pro: string | null | undefined;
  /** tb_address id the order ships to ("PCS" = self-pickup, handled by the caller). */
  addressID: string | null | undefined;
  /** The resolved delivery-address ZIP (from the tb_address row). */
  zip: string | null | undefined;
  /** The carrier the customer otherwise picked (fallback when เหมาๆ is dropped). */
  pickedCarrier: string | null | undefined;
}

export interface ResolveMaomaoResult {
  /** The carrier to write: MAO_CARRIER_CODE when eligible, else the picked carrier
   *  (or null when the customer ticked ONLY เหมาๆ but is out of zone — caller rejects). */
  carrier: string | null;
  /** true = the เหมาๆ flat fee applies (eligible + ticked). */
  maoApplied: boolean;
  /** true = the customer ticked เหมาๆ but the address is out of zone (dropped). */
  droppedOutOfZone: boolean;
}

/**
 * Resolve the in-Thailand carrier honoring the เหมาๆ zone gate.
 * NOTE: the caller handles addressID==='PCS' (self-pickup) BEFORE calling this —
 * self-pickup wins over the promo and has no delivery zip.
 */
export function resolveMaomaoCarrier(args: ResolveMaomaoArgs): ResolveMaomaoResult {
  const pro = (args.pro ?? "").trim();
  const picked = (args.pickedCarrier ?? "").trim() || null;

  // Not ticking เหมาๆ → just the picked carrier, no fee.
  if (pro !== "f") return { carrier: picked, maoApplied: false, droppedOutOfZone: false };

  // Ticked เหมาๆ + address in the BKK-metro free zone → honour it.
  if (isMaomaoEligibleForAddress({ addressID: args.addressID, zip: args.zip })) {
    return { carrier: MAO_CARRIER_CODE, maoApplied: true, droppedOutOfZone: false };
  }

  // Ticked เหมาๆ but OUT OF ZONE → drop the promo (faithful checkFreeArea: clear + warn,
  // don't fail). Fall back to the picked upcountry carrier; null → caller surfaces the
  // "เหมาๆ ใช้ได้เฉพาะเขตกรุงเทพฯ-ปริมณฑล" message instead of writing a blank carrier.
  return { carrier: picked, maoApplied: false, droppedOutOfZone: true };
}
