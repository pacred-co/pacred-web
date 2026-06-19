/**
 * derivePayMethod — the canonical carrier → ต้นทาง/ปลายทาง mapping.
 *
 * Faithful port of legacy `setPayMethodShip($fShipBy)`
 * (pcs-admin/include/function.php L2839-2843):
 *
 *   payMethod = '1' (ต้นทาง · pay-at-origin)  — the carrier bills the SENDER.
 *               Legacy origin-billing set: Flash (2), J&T (24),
 *               ไปรษณีย์ไทย / Thai Post (11), and the PCS self-pickup / เหมาๆ /
 *               Express family (PCS, PCSF, PCSE).
 *   payMethod = '2' (ปลายทาง · pay-at-destination / COD) — every other private
 *               carrier (the legacy default).
 *
 * WHY this also encodes the owner's "ใน กทม → บังคับต้นทาง (default) ·
 * ต่างจังหวัด → เลือกขนส่ง + เก็บปลายทาง" rule WITHOUT an explicit province
 * switch: the BKK-metro zip band only EXPOSES origin-billing carriers
 * (Flash/J&T/PCS), while upcountry exposes the full private roster — so the
 * carrier the customer is allowed to pick, fed through this map, yields the
 * right payMethod. The province behaviour is emergent from carrier-eligibility
 * (lib/cart/ship-by-eligibility.ts + lib/bkk-zip.ts) composed with this map.
 *
 * MUST be the SINGLE source for BOTH order-entry paths — the ฝากนำเข้า
 * forwarder path (actions/forwarder-legacy.ts) AND the shop cart
 * (actions/cart.ts). Re-implementing it per entry point is the §0e dead-rule
 * trap that let the shop cart silently trust raw client `payMethod` input
 * (so a BKK shop order was NOT force-set to ต้นทาง). One helper, both paths.
 */

/** Carrier ids/codes that bill at ORIGIN (sender pays · payMethod='1'). */
export const PAY_AT_ORIGIN_CARRIERS: ReadonlySet<string> = new Set([
  "PCS",   // รับเองที่โกดัง (self-pickup)
  "PCSF",  // PCS เหมาๆ (legacy code)
  "PRF",   // PR เหมาๆ (D1 rebrand of PCSF · new orders write this)
  "PCSE",  // PCS Express
  "24",    // J&T Express
  "2",     // Flash Express
  "11",    // ไปรษณีย์ไทย / Thai Post
]);

/** True when the carrier bills the sender (ต้นทาง). */
export function isPayAtOriginCarrier(fShipBy: string | null | undefined): boolean {
  if (!fShipBy) return false;
  return PAY_AT_ORIGIN_CARRIERS.has(fShipBy.trim());
}

/**
 * '1' = ต้นทาง (pay-at-origin) · '2' = ปลายทาง (pay-at-destination / COD).
 * Default for an unknown / empty carrier is '2' (ปลายทาง) — matches legacy
 * setPayMethodShip's fall-through default.
 */
export function derivePayMethod(fShipBy: string | null | undefined): "1" | "2" {
  return isPayAtOriginCarrier(fShipBy) ? "1" : "2";
}
