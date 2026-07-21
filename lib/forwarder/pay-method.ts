/**
 * derivePayMethod — the canonical carrier → ต้นทาง/ปลายทาง mapping.
 *
 * 🔴 Owner 2026-07-18: ANY ขนส่งเอกชน (a private / third-party carrier — Flash,
 * J&T, Kerry, ไปรษณีย์, a free-text carrier name, any non-own-fleet code) →
 * ปลายทาง "2" (pay-at-destination / COD). Pacred does NOT prepay a third-party
 * courier; the customer pays it at the door, so the domestic leg is collected at
 * DESTINATION (the COD gate excludes it from the Pacred bill). Only Pacred's OWN
 * fleet stays ต้นทาง "1":
 *     PCS  — รับเองที่โกดัง (self-pickup)
 *     PCSF / PRF — เหมาๆ    ·   PCSE / PRE — Express
 * — Pacred delivers these itself + collects the domestic leg upfront.
 *
 * (Supersedes the 2026-07-09 "default ต้นทาง prepaid for ALL carriers" rule +
 * the legacy setPayMethodShip origin-set that billed Flash/J&T/ThaiPost at
 * origin — the owner reclassified every เอกชน carrier as ปลายทาง. An admin can
 * still manually override a specific row to ต้นทาง via EditPayMethodField.)
 *
 * The single-source own-fleet set is `isOwnFleetCarrier` (carrier-coverage-guard).
 *
 * MUST be the SINGLE source for BOTH order-entry paths — the ฝากนำเข้า forwarder
 * path (actions/forwarder-legacy.ts) AND the shop cart (actions/cart.ts).
 * Re-implementing it per entry point is the §0e dead-rule trap. One helper, both.
 */

import { isOwnFleetCarrier } from "./carrier-coverage-guard";

/**
 * True when Pacred's OWN fleet delivers it (ต้นทาง · sender pays upfront). A
 * ขนส่งเอกชน (third-party) carrier is NOT pay-at-origin — it's COD ปลายทาง.
 */
export function isPayAtOriginCarrier(fShipBy: string | null | undefined): boolean {
  return isOwnFleetCarrier(fShipBy);
}

/**
 * '1' = ต้นทาง (own-fleet · prepaid) · '2' = ปลายทาง (ขนส่งเอกชน · COD).
 * A non-own-fleet carrier — INCLUDING an empty/unknown one — → '2' (ปลายทาง),
 * matching the legacy fall-through default (empty carrier = not a prepaid own-fleet leg).
 */
export function derivePayMethod(fShipBy: string | null | undefined): "1" | "2" {
  return isOwnFleetCarrier(fShipBy) ? "1" : "2";
}

/**
 * derivePayMethodForDelivery — the DEFAULT payMethod for an in-Thailand delivery
 * at order-entry / carrier-selection.
 *
 * Owner 2026-07-18: keyed on the carrier —
 *   • own-fleet (PCS/PCSF/PRF/PCSE/PRE)         → ต้นทาง "1" (Pacred prepays)
 *   • ขนส่งเอกชน (any other selected carrier)     → ปลายทาง "2" (COD at the door)
 *   • NO carrier chosen yet (empty)             → ต้นทาง "1" (no COD until a
 *     carrier is picked — a blank row must not silently become COD).
 *
 * A stored paymethod is respected (EditPayMethodField stays editable); this helper
 * only supplies the DEFAULT when a carrier is (re)selected.
 *
 * Money note: this is a display/collection FLAG only (WHERE/WHEN the domestic leg
 * is collected) — it changes no price. A "2" tells the COD gate to leave the
 * domestic leg off the Pacred bill (the courier collects it at destination).
 *
 * @param fShipBy carrier code / name.
 * @param _addr   delivery address — no longer read (the rule is carrier-based, not zone-based).
 */
export function derivePayMethodForDelivery(
  fShipBy: string | null | undefined,
  _addr: { addressID?: string | number | null; zip?: string | null },
): "1" | "2" {
  const c = (fShipBy ?? "").trim();
  if (c === "") return "1"; // no carrier chosen → ต้นทาง default (no COD yet)
  return isOwnFleetCarrier(c) ? "1" : "2";
}

/**
 * 🔒 THE COD LOCK (owner 2026-07-21, verbatim) ────────────────────────────────
 *   *"ถ้าเรื่องขนส่งเอกชน ต้องตีเป็นชำระปลายทางทั้งหมดนะครับ แล้วพอเลือกชำระ
 *   ปลายทาง ก็ต้องไม่ใส่ ค่าขนส่งไทย ค่าขนส่งไทยก็ควรเป็น 0 ด้วยนะครับ
 *   ถ้าเก็บปลายทาง"*
 *
 * TWO rules, one helper, so no write path can hold a contradictory pair:
 *   1. ขนส่งเอกชน (not own-fleet) ⇒ paymethod ALWAYS '2' ปลายทาง — an admin can no
 *      longer flip a private-courier row to ต้นทาง (that was the loophole that let a
 *      COD row keep billing the domestic leg).
 *   2. paymethod '2' ⇒ ftransportprice = 0 — the courier collects at the door, so
 *      Pacred stores no domestic charge at all.
 *
 * Rule 2 is MONEY-NEUTRAL on today's bills: every money reader already drops the leg
 * for COD (`domesticLeg = paymethod === 2 ? 0 : ftransportprice` — outstanding.ts ·
 * forwarder-debit-total.ts · forwarder-collect-total.ts · auto-issue-receipt). What it
 * fixes is the STORED contradiction: a COD row carrying a live ฿311 quote reads as a
 * charge on every screen, and the moment anything flips it back to '1' that stale
 * number silently becomes billable.
 *
 * PURE — decide here, write at the caller. Returns the corrected pair + whether it
 * changed anything (so a caller can log/telemetry the correction).
 */
export function enforceCodDomesticZero(input: {
  fShipBy: string | null | undefined;
  /** the paymethod the caller WANTED to store ('' / null = derive from the carrier) */
  payMethod?: string | null;
  /** the ค่าส่งไทย the caller wanted to store */
  transportPrice?: number | string | null;
}): { payMethod: "1" | "2"; transportPrice: number; changed: boolean } {
  const carrier = (input.fShipBy ?? "").trim();
  const wanted = String(input.payMethod ?? "").trim();
  const rawPrice = Number(input.transportPrice ?? 0);
  const price = Number.isFinite(rawPrice) ? rawPrice : 0;

  // Rule 1 — a private courier is ALWAYS ปลายทาง. An own-fleet row keeps whatever the
  // caller chose (both are legitimate there: PCS/เหมาๆ prepay '1'; an admin may still
  // mark an own-fleet leg COD '2' by hand).
  let payMethod: "1" | "2";
  if (carrier !== "" && !isOwnFleetCarrier(carrier)) {
    payMethod = "2";
  } else if (wanted === "1" || wanted === "2") {
    payMethod = wanted;
  } else {
    payMethod = derivePayMethodForDelivery(carrier, { addressID: null, zip: null });
  }

  // Rule 2 — ปลายทาง stores no ค่าส่งไทย.
  const transportPrice = payMethod === "2" ? 0 : price;

  return {
    payMethod,
    transportPrice,
    changed: (wanted !== "" && wanted !== payMethod) || transportPrice !== price,
  };
}
