/**
 * ship-by-eligibility.ts — which carrier may a delivery to THIS address use?
 *
 * 🔴 OWNER RULE (2026-07-14, verbatim):
 *   "ให้อิง data ตามไฟล์นี้เลย เพราะเอามาจากการทำงานจริงฝั่ง PCS ·
 *    บังคับให้เลือกให้ใส่แค่ที่มีในไฟล์ที่ส่งให้เท่านั้น · ใช้เกณฑ์ตามไฟล์นี้ได้ทั้งหมด ·
 *    ไม่ให้เลือกหรือให้ใส่ นอกเหนือจาก data ตรงนี้"
 *
 * → The **ขนส่งเอกชน (private-courier)** list is derived SOLELY from the owner's
 *   workbook (`lib/forwarder/carrier-province-coverage.ts`, generated from
 *   `บริษัทขนส่ง_พื้นที่ขนส่ง(จังหวัด).xlsx`). It is a CLOSED, COMPLETE list — 28
 *   couriers, every one already carrying its legacy `fshipby` code.
 *
 * ── What this REPLACED (2026-07-14) ─────────────────────────────────────────
 * The legacy `api-shipBy.php` `PROVINCE_RULES` table (and its `PCSFAM` all-options
 * list) used to drive this file, first alone and then UNIONed with the workbook.
 * Both are now GONE for private carriers, because the legacy table:
 *   - offered ~16 couriers the owner no longer uses (25 มังกรทอง · 35 ศิริสมบูรณ์ ·
 *     36 นิวสอง · 37 โชคสถาพร · 38 ทรัพย์สมบูรณ์ถาวร · 39 MNB · 40 โชคพูลทรัพย์ ·
 *     41 สิรินคร · 42 KSD · 43 นวรรณ · 44 กุญชรมณี · 45 เอ็มพอร์ท · 1 DHL · 4 Kerry ·
 *     5 Nim Express · 11 ไปรษณีย์ไทย);
 *   - stored the owner's ORIGINAL TYPOS ("ศรีสระเกษ" · "เพชบูรณ์" · "เพรชบุรี" ·
 *     "หนองบัว" · "อยุธยา") that never matched a real `tb_address.addressprovince`;
 *   - carried district gates the workbook has since CORRECTED — e.g. it allowed
 *     อาร์.ซี.เอ็กซเพรส (31) in สุพรรณบุรี only for amphoe บางเลน/ลาดบัวหลวง (which are
 *     in นครปฐม / อยุธยา!), while the workbook says 31 covers สุพรรณบุรี ทุกอำเภอ and
 *     serves นครปฐม "ส่งแค่บางเลน" + อยุธยา "ส่งแค่ราชบัวหลวง".
 * The workbook's per-province RESTRICTION note is now carried on the option
 * (`ShipByOption.note`) and shown at the point of choice, rather than silently
 * removing the courier — the owner's file is the criterion (ใช้เกณฑ์ตามไฟล์นี้).
 *
 * ── What is UNCHANGED (own-fleet / money semantics — do not regress) ────────
 *   - `PCS` (รับเองที่โกดัง) · `PCSF` (เหมาๆ/PRF) · `PCSE` (ด่วน/PRE) = Pacred's OWN
 *     delivery, NOT "ขนส่งเอกชน". They are offered by the pickers themselves and are
 *     exempt from the closed list (`lib/forwarder/carrier-coverage-guard.ts`).
 *   - The BKK-metro ZIP branch (`isFreeShippingZip`) still returns Flash-only, exactly
 *     as `api-shipBy.php` did (the maomao branch hides the dropdown in that zone) — and
 *     `derivePayMethodForDelivery` (ต้นทาง / COD ปลายทาง) is untouched.
 *   - `isMaomaoEligibleForAddress` = a faithful port of `checkPCSMaoMao.php`.
 *
 * Enforcement: the picker filters, and EVERY server action that writes a carrier runs
 * `checkCarrierForProvince()` — a UI filter alone would not stop a raw action post.
 *
 * Sources: `member/include/pages/cart/api-shipBy.php` · `checkPCSMaoMao.php` ·
 *          `member/include/function.php` L3-9 (BKK ZIP set, now `lib/bkk-zip.ts`).
 */

import { isFreeShippingZip } from "@/lib/bkk-zip";
import {
  CARRIER_PROVINCE_COVERAGE,
  canonicalProvince,
  carriersForProvince,
  type CarrierCoverage,
} from "@/lib/forwarder/carrier-province-coverage";

export type ShipByOption = {
  /** legacy `tb_forwarder.fshipby` code. */
  id: string;
  name: string;
  /** Per-province delivery restriction from the owner's workbook
   *  ("ไม่เข้าวังน้ำเขียว / บัวลาย" · "ส่งแค่บางเลน" · "ไม่ไป เบตง"). Display-only. */
  note?: string;
  /** Carrier-level notes from the workbook ("เริ่มต้น 30" · "ไม่รับสาย" ·
   *  "ต้องแจ้งอำเภอก่อน"). Display-only. */
  notes?: string[];
};

function toOption(c: CarrierCoverage, province: string): ShipByOption {
  const opt: ShipByOption = { id: c.code, name: c.name };
  const note = c.provinceNotes?.[province];
  if (note) opt.note = note;
  if (c.notes?.length) opt.notes = [...c.notes];
  return opt;
}

/** Flash — the one courier the BKK-metro ZIP branch offers (api-shipBy.php L530-532). */
const FLASH_CODE = "2";

/** Every workbook courier, province-agnostic (used when no province is known yet). */
export const ALL_WORKBOOK_CARRIER_OPTIONS: ShipByOption[] =
  CARRIER_PROVINCE_COVERAGE.filter((c) => c.code !== "").map((c) => ({
    id: c.code,
    name: c.name,
    ...(c.notes?.length ? { notes: [...c.notes] } : {}),
  }));

/**
 * THE closed private-courier list for a province — the ONLY source of ขนส่งเอกชน
 * options anywhere in the platform (admin pickers + cart + the auto-suggest).
 *
 * Province-only ON PURPOSE: it does NOT run the BKK-metro ZIP branch, because that
 * branch is a legacy dropdown-HIDING quirk (Flash-only) and staff picking a courier for
 * a BKK address must still see the real list. The customer cart keeps
 * `getShipByOptionsForAddress` (ZIP semantics intact).
 *
 * Returns [] when the province is blank/unknown → the caller MUST show an empty-state
 * ("ตั้งจังหวัดปลายทางก่อน"), never a free-text fallback.
 */
export function getPrivateCarrierOptionsForProvince(
  province: string | null | undefined,
): ShipByOption[] {
  const p = canonicalProvince(province);
  if (!p) return [];
  return carriersForProvince(p).map((c) => toOption(c, p));
}

export type ShipByContext = {
  /** ZIP code from `tb_address.addresszipcode`. */
  zip:      string | null | undefined;
  /** Province from `tb_address.addressprovince`. */
  province: string | null | undefined;
  /** Amphoe (district) from `tb_address.addressdistrict`.
   *  Kept on the context for callers, but the workbook gates by PROVINCE and carries the
   *  district restriction as a NOTE — see the header. */
  amphoe?:  string | null | undefined;
  /** Member code (legacy `$userID`) — `PCSFAM` bypasses the BKK Flash-only quirk. */
  userID:   string | null | undefined;
};

/**
 * The carrier options for one delivery address (customer cart + the auto-suggest).
 *
 *   - `PCSFAM` (the legacy "all options" account) → the province's full workbook list,
 *     bypassing the BKK Flash-only ZIP quirk. (It no longer means "every carrier ever" —
 *     the list is closed to the workbook.) With no resolvable province it falls back to
 *     the whole workbook.
 *   - ZIP in the BKK-metro allowlist → Flash only (verbatim api-shipBy.php).
 *   - Otherwise → the province's workbook couriers (Flash + J&T serve all 77, so a valid
 *     Thai province always yields at least those two).
 */
export function getShipByOptionsForAddress(ctx: ShipByContext): ShipByOption[] {
  const zip      = (ctx.zip      ?? "").trim();
  const province = canonicalProvince(ctx.province);

  if (ctx.userID === "PCSFAM") {
    return province
      ? getPrivateCarrierOptionsForProvince(province)
      : [...ALL_WORKBOOK_CARRIER_OPTIONS];
  }

  // BKK metro (เหมาๆ zone) — the legacy `} else {` branch sets $optionShipBy = Flash only.
  if (isFreeShippingZip(zip)) {
    const flash = CARRIER_PROVINCE_COVERAGE.find((c) => c.code === FLASH_CODE);
    return flash ? [{ id: flash.code, name: flash.name }] : [];
  }

  return getPrivateCarrierOptionsForProvince(province);
}

/**
 * Maomao (Pacred เหมาๆ) eligibility — `checkPCSMaoMao.php`:
 *   - addressID === 'PCS' (warehouse pickup) → NOT eligible (proF=2).
 *   - ZIP in the BKK metro allowlist → eligible (proF=1).
 *   - Otherwise → not eligible (proF=2).
 * Unchanged by the 2026-07-14 closed-list rule (own-fleet, not a private courier).
 */
export function isMaomaoEligibleForAddress(args: {
  addressID: string | null | undefined;
  zip:       string | null | undefined;
}): boolean {
  if (!args.addressID || args.addressID === "PCS") return false;
  return isFreeShippingZip(args.zip);
}
