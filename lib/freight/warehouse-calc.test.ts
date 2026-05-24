/**
 * D1 / G3 · Unit tests for the warehouse free-area check.
 *
 * Covers the truth table documented in `warehouse-calc.ts`:
 *
 *   shipBy   | zip in allowlist | postal supplied | result
 *   ─────────┼──────────────────┼─────────────────┼───────────────────────
 *   'PCSF'   | yes              | yes             | applies, fee → 0
 *   'PCSF'   | no               | yes             | does not apply
 *   other    | yes              | yes             | does not apply
 *   other    | no               | yes             | does not apply
 *   any      | n/a              | no              | does not apply (no_postal_code)
 *
 * Run with:  pnpm tsx lib/freight/warehouse-calc.test.ts
 * (Wired into pnpm test via package.json scripts.)
 *
 * Pattern matches lib/forwarder/calc-price.test.ts + lib/bkk-zip.test.ts.
 */

import {
  checkWarehouseArea,
  PCSF_PROMO_CODE,
  type CheckWarehouseAreaInput,
} from "./warehouse-calc";

let pass = 0;
let fail = 0;

function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(
      `  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
    );
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

function inBkk(overrides: Partial<CheckWarehouseAreaInput> = {}): CheckWarehouseAreaInput {
  return {
    warehouseId: "guangzhou",
    postalCode: "10110",            // BKK — Khlong Toei (in legacy allowlist)
    shipBy:    PCSF_PROMO_CODE,
    thailandDeliveryThb: 250,
    weight: 12,
    volume: 0.05,
    cargoType: "general",
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════
// (1) Happy path — PCSF + in-allowlist ZIP → promo applies, fee → 0
// ════════════════════════════════════════════════════════════════════
section("(1) PCSF + in-allowlist ZIP → freeAreaApplies, fee waived");
{
  const r = checkWarehouseArea(inBkk());
  assertEq("freeAreaApplies = true", r.freeAreaApplies, true);
  assertEq("adjustedPrice → 0 (legacy waives delivery fee)", r.adjustedPrice, 0);
  assertEq("zipMatched true", r.freeAreaInfo.zipMatched, true);
  assertEq("pcsfRequested true", r.freeAreaInfo.pcsfRequested, true);
  assertEq("originalThailandDeliveryThb echoed back", r.freeAreaInfo.originalThailandDeliveryThb, 250);
  assertEq("waivedThb = original fee", r.freeAreaInfo.waivedThb, 250);
  assertEq("no reason field on success", r.freeAreaInfo.reason, undefined);
}

section("(1b) PCSF + Nonthaburi metro ZIP (11000) → applies");
{
  const r = checkWarehouseArea(inBkk({ postalCode: "11000", thailandDeliveryThb: 80 }));
  assertEq("Nonthaburi free area applies", r.freeAreaApplies, true);
  assertEq("Nonthaburi fee waived", r.adjustedPrice, 0);
  assertEq("waivedThb = 80", r.freeAreaInfo.waivedThb, 80);
}

section("(1c) PCSF + Samut Sakhon (74000) → applies");
{
  const r = checkWarehouseArea(inBkk({ postalCode: "74000", thailandDeliveryThb: 500 }));
  assertEq("Samut Sakhon applies", r.freeAreaApplies, true);
  assertEq("Samut Sakhon fee waived", r.adjustedPrice, 0);
}

section("(1d) zero original fee → still applies (no negative number trickery)");
{
  const r = checkWarehouseArea(inBkk({ thailandDeliveryThb: 0 }));
  assertEq("applies even when fee is 0", r.freeAreaApplies, true);
  assertEq("adjustedPrice = 0", r.adjustedPrice, 0);
  assertEq("waivedThb = 0", r.freeAreaInfo.waivedThb, 0);
}

// ════════════════════════════════════════════════════════════════════
// (2) ZIP-not-in-area path — PCSF requested but address outside metro
// ════════════════════════════════════════════════════════════════════
section("(2) PCSF + Chiang Mai (50000) → does NOT apply");
{
  const r = checkWarehouseArea(inBkk({ postalCode: "50000" }));
  assertEq("freeAreaApplies = false", r.freeAreaApplies, false);
  assertEq("adjustedPrice unchanged at 250", r.adjustedPrice, 250);
  assertEq("zipMatched = false", r.freeAreaInfo.zipMatched, false);
  assertEq("reason = zip_not_in_free_area", r.freeAreaInfo.reason, "zip_not_in_free_area");
  assertEq("waivedThb = 0", r.freeAreaInfo.waivedThb, 0);
}

section("(2b) PCSF + Pathum Thani 12000 → does NOT apply (matches getShipBy.php)");
{
  // The legacy is inconsistent: checkFreeArea.php L7 includes 12000 but
  // the canonical getShipBy.php L9 + function.php L825 sets PathumThani=[].
  // bkk-zip.ts follows the conservative empty list. This test pins that
  // behaviour so a future drift surfaces here, not in a customer dispute.
  const r = checkWarehouseArea(inBkk({ postalCode: "12000" }));
  assertEq("Pathum Thani 12000 does NOT apply", r.freeAreaApplies, false);
  assertEq("Pathum Thani reason = zip_not_in_free_area", r.freeAreaInfo.reason, "zip_not_in_free_area");
}

// ════════════════════════════════════════════════════════════════════
// (3) ship_by not PCSF — even an in-allowlist ZIP doesn't waive
// ════════════════════════════════════════════════════════════════════
section("(3) Kerry Express + BKK ZIP → no promo (customer chose paid courier)");
{
  const r = checkWarehouseArea(inBkk({ shipBy: "4" /* Kerry */ }));
  assertEq("freeAreaApplies = false", r.freeAreaApplies, false);
  assertEq("adjustedPrice unchanged at 250", r.adjustedPrice, 250);
  assertEq("zipMatched is still true (informational)", r.freeAreaInfo.zipMatched, true);
  assertEq("pcsfRequested = false", r.freeAreaInfo.pcsfRequested, false);
  assertEq("reason = ship_by_not_pcsf", r.freeAreaInfo.reason, "ship_by_not_pcsf");
}

section("(3b) shipBy null → no promo (default before user picks)");
{
  const r = checkWarehouseArea(inBkk({ shipBy: null }));
  assertEq("null shipBy → no apply", r.freeAreaApplies, false);
  assertEq("null shipBy reason", r.freeAreaInfo.reason, "ship_by_not_pcsf");
}

section("(3c) shipBy empty string → no promo");
{
  const r = checkWarehouseArea(inBkk({ shipBy: "" }));
  assertEq("empty shipBy → no apply", r.freeAreaApplies, false);
  assertEq("empty shipBy reason", r.freeAreaInfo.reason, "ship_by_not_pcsf");
}

// ════════════════════════════════════════════════════════════════════
// (4) Edge — missing/blank postal codes
// ════════════════════════════════════════════════════════════════════
section("(4) postal code missing — short-circuits");
{
  const r = checkWarehouseArea(inBkk({ postalCode: undefined }));
  assertEq("undefined postal → no apply", r.freeAreaApplies, false);
  assertEq("undefined postal reason", r.freeAreaInfo.reason, "no_postal_code");
  assertEq("adjustedPrice unchanged", r.adjustedPrice, 250);
}

section("(4b) postal code null");
{
  const r = checkWarehouseArea(inBkk({ postalCode: null }));
  assertEq("null postal → no apply", r.freeAreaApplies, false);
  assertEq("null postal reason", r.freeAreaInfo.reason, "no_postal_code");
}

section("(4c) postal code is whitespace");
{
  const r = checkWarehouseArea(inBkk({ postalCode: "   " }));
  assertEq("whitespace postal → no apply", r.freeAreaApplies, false);
  assertEq("whitespace postal reason", r.freeAreaInfo.reason, "no_postal_code");
}

// ════════════════════════════════════════════════════════════════════
// (5) Defensive — non-finite / negative fees normalise to 0
// ════════════════════════════════════════════════════════════════════
section("(5) defensive — negative fee normalised");
{
  const r = checkWarehouseArea(inBkk({ thailandDeliveryThb: -100 }));
  assertEq("negative fee normalised to 0", r.freeAreaInfo.originalThailandDeliveryThb, 0);
  assertEq("negative fee still applies (zip + PCSF)", r.freeAreaApplies, true);
  assertEq("adjustedPrice = 0", r.adjustedPrice, 0);
}

section("(5b) defensive — NaN fee normalised");
{
  const r = checkWarehouseArea(inBkk({ thailandDeliveryThb: Number.NaN }));
  assertEq("NaN fee normalised to 0", r.freeAreaInfo.originalThailandDeliveryThb, 0);
  assertEq("NaN fee still applies (zip + PCSF)", r.freeAreaApplies, true);
}

section("(5c) defensive — undefined fee normalised");
{
  const r = checkWarehouseArea(inBkk({ thailandDeliveryThb: undefined }));
  assertEq("undefined fee normalised to 0", r.freeAreaInfo.originalThailandDeliveryThb, 0);
}

section("(5d) whitespace around postal code still matches");
{
  const r = checkWarehouseArea(inBkk({ postalCode: "  10110  " }));
  assertEq("trimmed postal still matches BKK allowlist", r.freeAreaApplies, true);
  assertEq("postalCode is trimmed in output", r.freeAreaInfo.postalCode, "10110");
}

// ── Summary ──
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
