/**
 * derivePayMethod — the canonical carrier → ต้นทาง/ปลายทาง mapping.
 *
 * 🔒 Owner พี่ป๊อป 2026-07-21 (verbatim) ─────────────────────────────────────────
 *   "5 รายการที่เก็บเงินเป็น ต้นทาง ถ้าเลือก: Flash · J&T · ไปรษณีย์ไทย ·
 *    เหมาๆ (ที่อยู่จัดส่งละ 100฿) · Pacred express. ที่เหลือ ต่างจังหวัด ขนส่ง
 *    เอกชนทั้งหมด เก็บเป็นปลายทาง. ให้ล็อคไปเลย."
 *
 * The pay-at-origin set = Pacred PREPAYS the domestic leg + bills the customer:
 *     PCS  — รับเองที่โกดัง (self-pickup · own-fleet)
 *     PCSF / PRF — เหมาๆ (own-fleet · ฿100 flat)   ·   PCSE / PRE — Express (own-fleet)
 *     "2"  — Flash Express      ·  "24" — J&T Express   ·  "11" — ไปรษณีย์ไทย
 *   Flash/J&T/ไปรษณีย์ are the three national couriers Pacred prepays (a business
 *   account) — so ต้นทาง, ค่าส่งไทย stays on the Pacred bill.
 *
 * Everything ELSE (Kerry · Nim · ธนามัย · เคพีเอ็น · สมใจสาย · a regional/private
 * courier · a free-text name · any unknown code) → ปลายทาง "2" (COD at the door).
 * Pacred does NOT prepay it; the courier collects at destination, so the COD gate
 * excludes the domestic leg from the Pacred bill (ค่าส่งไทย = 0).
 *
 * (Supersedes the 2026-07-21 morning COD LOCK "ALL ขนส่งเอกชน → ปลายทาง" — the
 * owner refined it that afternoon: the three national couriers he prepays move
 * back to ต้นทาง; only the smaller/regional/private ones stay COD. The rule is now
 * LOCKED by carrier — EditPayMethodField is read-only, no manual per-row toggle.)
 *
 * The own-fleet subset is `isOwnFleetCarrier` (carrier-coverage-guard); the
 * pay-at-origin superset (own-fleet + the 3 national couriers) is
 * `isPayAtOriginCarrier` below — the SOT for the ต้นทาง/ปลายทาง decision.
 *
 * MUST be the SINGLE source for BOTH order-entry paths — the ฝากนำเข้า forwarder
 * path (actions/forwarder-legacy.ts) AND the shop cart (actions/cart.ts).
 * Re-implementing it per entry point is the §0e dead-rule trap. One helper, both.
 */

import { isOwnFleetCarrier } from "./carrier-coverage-guard";

/**
 * The extra pay-at-origin carriers ON TOP of own-fleet — the three national
 * couriers Pacred prepays (owner พี่ป๊อป 2026-07-21). Codes from the shipping
 * registry (lib/freight/shipping-methods.ts): Flash "2" · J&T "24" · ไปรษณีย์ "11".
 */
export const PAY_AT_ORIGIN_EXTRA_CODES = ["2", "24", "11"] as const;
const PAY_AT_ORIGIN_EXTRA_SET: ReadonlySet<string> = new Set(PAY_AT_ORIGIN_EXTRA_CODES);

/**
 * True when Pacred PREPAYS the domestic leg (ต้นทาง · sender pays upfront, ค่าส่งไทย
 * stays on the bill): own-fleet (PCS/PCSF/PRF/PCSE/PRE) OR one of the three
 * national couriers (Flash "2" / J&T "24" / ไปรษณีย์ "11"). Everything else is a
 * COD ปลายทาง carrier (courier collects at the door · leg off the Pacred bill).
 */
export function isPayAtOriginCarrier(fShipBy: string | null | undefined): boolean {
  const c = (fShipBy ?? "").trim();
  if (c === "") return false;
  return isOwnFleetCarrier(c) || PAY_AT_ORIGIN_EXTRA_SET.has(c);
}

/**
 * '1' = ต้นทาง (pay-at-origin · ค่าส่งไทยเข้าบิล) · '2' = ปลายทาง (ที่เหลือ · COD).
 * A non-pay-at-origin carrier — INCLUDING an empty/unknown one — → '2' (ปลายทาง),
 * matching the legacy fall-through default (empty carrier = not a prepaid leg).
 */
export function derivePayMethod(fShipBy: string | null | undefined): "1" | "2" {
  return isPayAtOriginCarrier(fShipBy) ? "1" : "2";
}

/**
 * derivePayMethodForDelivery — the DEFAULT payMethod for an in-Thailand delivery
 * at order-entry / carrier-selection.
 *
 * Owner พี่ป๊อป 2026-07-21:
 *   • pay-at-origin (own-fleet + Flash/J&T/ไปรษณีย์) → ต้นทาง "1" (Pacred prepays)
 *   • ที่เหลือ (any other selected carrier)          → ปลายทาง "2" (COD at the door)
 *   • NO carrier chosen yet (empty)                → ต้นทาง "1" (no COD until a
 *     carrier is picked — a blank row must not silently become COD).
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
  return isPayAtOriginCarrier(c) ? "1" : "2";
}

/**
 * 🔒 THE CARRIER LOCK (owner พี่ป๊อป 2026-07-21 "ให้ล็อคไปเลย") ──────────────────
 *   Refines the 2026-07-21-morning COD LOCK. The carrier decides the pair — no
 *   manual per-row override (EditPayMethodField is read-only):
 *     1. carrier ∈ pay-at-origin (own-fleet + Flash/J&T/ไปรษณีย์) ⇒ '1' ต้นทาง.
 *     2. carrier ∉ pay-at-origin (any other, non-empty)          ⇒ '2' ปลายทาง.
 *     3. paymethod '2' ⇒ ftransportprice = 0 — the courier collects at the door,
 *        so Pacred stores no domestic charge at all.
 *     4. carrier empty ⇒ keep the caller's chosen pay ('1'/'2') or default '1'.
 *
 * Rule 3 is MONEY-NEUTRAL on today's bills: every money reader already drops the leg
 * for COD (`domesticLeg = paymethod === 2 ? 0 : ftransportprice` — outstanding.ts ·
 * forwarder-debit-total.ts · forwarder-collect-total.ts · auto-issue-receipt). What it
 * fixes is the STORED contradiction: a COD row carrying a live ฿311 quote reads as a
 * charge on every screen, and the moment anything flips it back to '1' that stale
 * number silently becomes billable. Flash/J&T/ไปรษณีย์ are ต้นทาง now, so their
 * ค่าส่งไทย stays on the bill (auto-fill-th-shipping fills it).
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

  // The carrier decides the pair (LOCKED · owner พี่ป๊อป 2026-07-21). An empty carrier
  // has nothing to decide from → keep the caller's chosen pay, else default ต้นทาง.
  let payMethod: "1" | "2";
  if (carrier === "") {
    payMethod = wanted === "1" || wanted === "2" ? wanted : "1";
  } else {
    payMethod = isPayAtOriginCarrier(carrier) ? "1" : "2";
  }

  // Rule 3 — ปลายทาง stores no ค่าส่งไทย.
  const transportPrice = payMethod === "2" ? 0 : price;

  return {
    payMethod,
    transportPrice,
    changed: (wanted !== "" && wanted !== payMethod) || transportPrice !== price,
  };
}
