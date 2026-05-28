/**
 * Carrier registry — central catalogue of china-side carriers (per ภูม Wave 17).
 *
 * The legacy PHP back-office exposes one "api-sheets-<carrier>.php" page per
 * carrier. Despite the filename, **these are NOT Google-Sheets API consumers** —
 * each one is a manual forwarder-entry form scoped to that carrier (it sets a
 * fixed `fWarehouseName` value on INSERT into `tb_forwarder`, then runs the
 * same shared calc-price / cost / notification pipeline as the central
 * `forwarder.php` modal).
 *
 * Wave 17 P1-3..6 ports CTT / Sang / MK / MX. Each page renders the SAME
 * shared client form parameterised by carrier id; this map holds the per-
 * carrier knobs.
 *
 * Sources (legacy PHP under `pcs-admin/api-sheets-<key>.php`):
 *   - CTT  → api-sheets-ctt.php          L13  `$fWarehouseName=2;`
 *   - แสง  → api-sheets-sang-2023.php    L13  `$fWarehouseName=1;`
 *   - MK   → api-sheets-mk.php           L13  `$fWarehouseName=3;`
 *   - MX   → api-sheets-mx.php           L13  `$fWarehouseName=4;`
 *
 * Pricing rule:
 *   All 4 legacy files share the SAME PCSE / PCSF rule (lines ~78-86):
 *       if (fShipBy=='PCSE') fTransportPrice = max(50, fVolume*120)
 *       else if (fShipBy=='PCSF') fTransportPrice = 0
 *   It is NOT Sang-specific — the four pages were copy-pasted from one
 *   master template. The shared form applies the rule uniformly.
 *
 * Google-Sheets link:
 *   Decorative button at the top of each legacy page — same workbook,
 *   different gid per carrier. The link is kept so admins can cross-check
 *   the source spreadsheet, but the form does NOT call the Sheets API.
 *   Workbook: 15g49hwP8dx1bOVbVKcp1V33I_o1gSLJYeqEIdRS4Mpk
 */

export type CarrierKey = "ctt" | "sang" | "mk" | "mx";

export type CarrierConfig = {
  /** URL slug — also the route segment (`/admin/api-sheets-<key>`). */
  key: CarrierKey;
  /** Short carrier label — shown in page header + sidebar. */
  label: string;
  /** Tooltip / sub-title (Thai · used under the H1). */
  description: string;
  /** Maps to `tb_forwarder.fwarehousename` (1..4 · see legacy PHP L13). */
  warehouseCode: "1" | "2" | "3" | "4";
  /** Decorative Google-Sheets cross-reference URL (opens in new tab). */
  sheetUrl: string;
};

export const CARRIER_REGISTRY: Record<CarrierKey, CarrierConfig> = {
  sang: {
    key: "sang",
    label: "แสง (Sang)",
    description: "เพิ่มรายการนำเข้าใหม่ผ่านโกดัง แสง — fWarehouseName=1",
    warehouseCode: "1",
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/15g49hwP8dx1bOVbVKcp1V33I_o1gSLJYeqEIdRS4Mpk/edit#gid=115990265",
  },
  ctt: {
    key: "ctt",
    label: "CTT",
    description: "เพิ่มรายการนำเข้าใหม่ผ่านโกดัง CTT — fWarehouseName=2",
    warehouseCode: "2",
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/15g49hwP8dx1bOVbVKcp1V33I_o1gSLJYeqEIdRS4Mpk/edit?pli=1#gid=848467168",
  },
  mk: {
    key: "mk",
    label: "MK",
    description: "เพิ่มรายการนำเข้าใหม่ผ่านโกดัง MK — fWarehouseName=3",
    warehouseCode: "3",
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/15g49hwP8dx1bOVbVKcp1V33I_o1gSLJYeqEIdRS4Mpk/edit?pli=1#gid=1504642809",
  },
  mx: {
    key: "mx",
    label: "MX",
    description: "เพิ่มรายการนำเข้าใหม่ผ่านโกดัง MX — fWarehouseName=4",
    warehouseCode: "4",
    sheetUrl:
      "https://docs.google.com/spreadsheets/d/15g49hwP8dx1bOVbVKcp1V33I_o1gSLJYeqEIdRS4Mpk/edit?pli=1#gid=889679238",
  },
};

/** Type-narrowing guard for the route param. */
export function isCarrierKey(v: string): v is CarrierKey {
  return v === "ctt" || v === "sang" || v === "mk" || v === "mx";
}

/**
 * Shared pricing rule (legacy: all 4 api-sheets-*.php · L78-86).
 *
 *   PCSE → max(50, fVolume*120)
 *   PCSF → 0
 *   else → 0 (admin sets it later in /admin/forwarders/[fNo]/edit)
 */
export function computeTransportPrice(
  shipBy: string,
  volumeCbm: number,
): number {
  if (shipBy === "PCSE") {
    const raw = Math.max(0, volumeCbm) * 120;
    return raw < 50 ? 50 : raw;
  }
  if (shipBy === "PCSF") return 0;
  return 0;
}
