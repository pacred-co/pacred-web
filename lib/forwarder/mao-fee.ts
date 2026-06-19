/**
 * เหมาๆ (Pacred Mao Mao) flat in-Thailand delivery fee — the SINGLE SOURCE OF TRUTH.
 *
 * Owner 2026-06-19: the เหมาๆ flat fee is **฿100** (the promo was raised from the
 * legacy ฿50 — "เหมาๆ เรา เก็บ 100 บาท"). It was wrong (฿50) in every collect path
 * and produced under-stated bills.
 *
 * Carrier code: legacy = "PCSF"; the D1 rebrand renamed it to **"PRF"** (owner:
 * "เคยให้เปลี่ยน PCSF เป็น PRF แล้ว"). Both are recognised here so existing
 * tb_forwarder rows (fshipby='PCSF') AND new 'PRF' rows both get the flat fee;
 * new orders should write MAO_CARRIER_CODE.
 */

/** เหมาๆ flat delivery fee (THB). Owner-confirmed 2026-06-19: ฿100. */
export const MAO_FLAT_FEE = 100;

/** The เหมาๆ carrier code new orders write (D1 rebrand: PCSF → PRF). */
export const MAO_CARRIER_CODE = "PRF" as const;

/** Both เหมาๆ carrier codes (legacy + rebrand) — for SQL `.in("fshipby", …)` filters. */
export const MAO_CARRIER_CODES = ["PCSF", "PRF"] as const;

/** True if this fshipby is the เหมาๆ carrier — accepts the legacy "PCSF" and the
 *  rebranded "PRF" so old + new rows both price correctly. */
export function isMaoCarrier(shipBy: string | null | undefined): boolean {
  const s = (shipBy ?? "").trim().toUpperCase();
  return s === "PCSF" || s === "PRF";
}
