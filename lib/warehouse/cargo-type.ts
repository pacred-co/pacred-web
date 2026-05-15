/**
 * Canonical cargo-type taxonomy + legacy-code mapping. V-D2.
 *
 * The two legacy systems tag the SAME five categories with DIFFERENT
 * latin codes (see docs/audit/cargo-ops-forensics-2026-05-16.md §3.3):
 *
 *   PCS API "Shipment Report"   : A / M / X / O / Z
 *   China warehouse 装柜明细 manifest : G / T / F   (no brand/controlled equivalent)
 *
 * Pacred stores ONLY the canonical value (`cargo_shipments.cargo_type`,
 * migration 0040). Both legacy inputs normalise via `toCanonicalCargoType()`
 * on import (MOMO sync + manifest import) — never store a raw legacy code.
 */

export const CARGO_TYPE_VALUES = [
  "general",
  "electrical",
  "food_drug",
  "brand",
  "controlled",
] as const;

export type CargoType = (typeof CARGO_TYPE_VALUES)[number];

/** Thai customer/admin-facing label. */
export const CARGO_TYPE_LABEL_TH: Record<CargoType, string> = {
  general:    "ทั่วไป",
  electrical: "เครื่องใช้ไฟฟ้า",
  food_drug:  "อาหาร/ยา",
  brand:      "แบรนด์เนม/พิเศษ",
  controlled: "สินค้าควบคุม",
};

/** Import-clearance requirement note per type (drives staff prompts). */
export const CARGO_TYPE_CLEARANCE_NOTE: Record<CargoType, string> = {
  general:    "",
  electrical: "ต้องมีใบรับรอง มอก.",
  food_drug:  "ต้องมีใบอนุญาต อย.",
  brand:      "ตรวจสอบลิขสิทธิ์/แบรนด์ — special handling",
  controlled: "สินค้าควบคุม — ตรวจสิทธิ์นำเข้าก่อน",
};

/**
 * Legacy code → canonical. Covers BOTH legacy code sets:
 *   PCS API   : A=general · M=electrical · X=brand · O=food_drug · Z=controlled
 *   Manifest  : G=general · T=electrical · F=food_drug
 * Looked up upper-cased, so input case does not matter.
 */
const LEGACY_CARGO_CODE_MAP: Readonly<Record<string, CargoType>> = {
  // PCS API "Shipment Report" codes
  A: "general",
  M: "electrical",
  X: "brand",
  O: "food_drug",
  Z: "controlled",
  // China warehouse manifest (装柜明细) codes
  G: "general",
  T: "electrical",
  F: "food_drug",
};

/** True if the value is a valid canonical cargo type. */
export function isCargoType(v: unknown): v is CargoType {
  return typeof v === "string" && (CARGO_TYPE_VALUES as readonly string[]).includes(v);
}

/**
 * Normalise a legacy cargo-type code to the canonical value.
 *
 * Accepts:
 *  - a bare legacy letter — `"A"`, `"g"` (either system, case-insensitive)
 *  - the full legacy label form — `"普通货物/ทั่วไป/A"` (the trailing
 *    "/"-token is the code; this is how the raw exports store it)
 *  - an already-canonical value — `"general"` (returned as-is)
 *
 * Returns `null` for an unknown / empty code so the caller can default
 * (e.g. to `"general"`) AND flag the row for staff review.
 */
export function toCanonicalCargoType(legacy: string | null | undefined): CargoType | null {
  if (!legacy) return null;
  const trimmed = legacy.trim();
  if (!trimmed) return null;

  // Full legacy label form "普通货物/ทั่วไป/A" → take the last "/"-token.
  const token = trimmed.includes("/")
    ? trimmed.slice(trimmed.lastIndexOf("/") + 1).trim()
    : trimmed;
  if (!token) return null;

  // Already canonical?
  if (isCargoType(token.toLowerCase())) return token.toLowerCase() as CargoType;

  return LEGACY_CARGO_CODE_MAP[token.toUpperCase()] ?? null;
}
