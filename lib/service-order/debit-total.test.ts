/**
 * Unit tests for `computeShopOrderDebitTotal` — the pure source-of-truth
 * helper that decides how much to debit a customer wallet when admin
 * marks a tb_header_order paid (Tier A2 fix · 2026-05-29).
 *
 * Locks the legacy contract from `pcs-admin/pay-users.php` L158:
 *   pricePay = ((hTotalPriceCHN + hShippingCHN) * hRate) + hShippingService
 * with the post-D1 refinement: prefer the stored `htotalpriceuser` so
 * refund adjustments (repayItem.php) propagate.
 *
 * Pattern matches lib/wallet/balance.test.ts + lib/validators/wallet.test.ts
 * (plain Node — no vitest, pass/fail counts, exit 1 on any fail).
 */

import { computeShopOrderDebitTotal } from "./debit-total";

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
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

function assertNaN(label: string, actual: number) {
  if (Number.isNaN(actual)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(
      `  ✗ ${label}\n    expected: NaN\n    actual:   ${JSON.stringify(actual)}`,
    );
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// ────────────────────────────────────────────────────────────
section("computeShopOrderDebitTotal — uses stored htotalpriceuser first");
// ────────────────────────────────────────────────────────────

// The happy path — htotalpriceuser is set by update2; we trust it.
// (No recompute drift even if hrate changed since the order was priced.)
assertEq("simple positive htotalpriceuser",
  computeShopOrderDebitTotal({ htotalpriceuser: 1500 }), 1500);

assertEq("string htotalpriceuser (PostgREST numeric)",
  computeShopOrderDebitTotal({ htotalpriceuser: "1234.56" }), 1234.56);

assertEq("htotalpriceuser preferred even if breakdown columns disagree",
  computeShopOrderDebitTotal({
    htotalpriceuser: 1000,
    // Breakdown would compute (100 + 20) * 5 + 50 = 650 — but we trust the stored total
    htotalpricechn: 100, hshippingchn: 20, hrate: 5, hshippingservice: 50,
  }), 1000);

assertEq("two-decimal rounding (away from float drift)",
  computeShopOrderDebitTotal({ htotalpriceuser: 1500.005 }), 1500.01);

// ────────────────────────────────────────────────────────────
section("computeShopOrderDebitTotal — falls back to live formula when stored is empty");
// ────────────────────────────────────────────────────────────
// Mirrors pay-users.php L158:
//   pricePay = ( (hTotalPriceCHN + hShippingCHN) * hRate ) + hShippingService

assertEq("recomputes when htotalpriceuser is null",
  computeShopOrderDebitTotal({
    htotalpriceuser: null,
    htotalpricechn: 100, hshippingchn: 20, hrate: 5, hshippingservice: 50,
  }), 650);  // (100 + 20) * 5 + 50

assertEq("recomputes when htotalpriceuser is 0",
  computeShopOrderDebitTotal({
    htotalpriceuser: 0,
    htotalpricechn: 100, hshippingchn: 20, hrate: 5, hshippingservice: 50,
  }), 650);

assertEq("recomputes when htotalpriceuser is undefined",
  computeShopOrderDebitTotal({
    htotalpriceuser: undefined,
    htotalpricechn: 200, hshippingchn: 0, hrate: 4.85, hshippingservice: 50,
  }), 1020);  // (200 + 0) * 4.85 + 50 = 970 + 50

assertEq("recompute preserves 2-decimal precision",
  computeShopOrderDebitTotal({
    htotalpriceuser: 0,
    htotalpricechn: 33.33, hshippingchn: 0, hrate: 5.123, hshippingservice: 0,
  }), Math.round(33.33 * 5.123 * 100) / 100);  // 170.75

assertEq("recompute with hshippingservice only (free chinese shipping)",
  computeShopOrderDebitTotal({
    htotalpriceuser: 0,
    htotalpricechn: 0, hshippingchn: 0, hrate: 5, hshippingservice: 50,
  }), 50);

// ────────────────────────────────────────────────────────────
section("computeShopOrderDebitTotal — returns NaN on invalid input");
// ────────────────────────────────────────────────────────────
// Caller MUST refuse the debit when NaN is returned (prevents silent
// 0-debit revenue leaks).

assertNaN("all columns null/missing → NaN",
  computeShopOrderDebitTotal({ htotalpriceuser: null }));

assertNaN("stored=0 + breakdown undefined → NaN",
  computeShopOrderDebitTotal({ htotalpriceuser: 0 }));

assertNaN("stored=0 + only some breakdown columns → NaN",
  computeShopOrderDebitTotal({
    htotalpriceuser: 0,
    htotalpricechn: 100,
    // missing hshippingchn / hrate / hshippingservice
  }));

assertNaN("negative htotalpriceuser triggers fallback, fallback also negative → NaN",
  // Negative stored value falls through to the recompute branch (we treat
  // <=0 as "not finalised"). If the recompute also yields <=0, return NaN.
  computeShopOrderDebitTotal({
    htotalpriceuser: -100,
    htotalpricechn: 0, hshippingchn: 0, hrate: 1, hshippingservice: 0,
  }));

assertNaN("non-numeric stored + non-numeric breakdown → NaN",
  computeShopOrderDebitTotal({
    htotalpriceuser: "not-a-number" as unknown as string,
    htotalpricechn: "bad" as unknown as string,
    hshippingchn: 0, hrate: 5, hshippingservice: 0,
  }));

// ────────────────────────────────────────────────────────────
section("computeShopOrderDebitTotal — realistic legacy-shape inputs");
// ────────────────────────────────────────────────────────────
// Sanity-check with real Pacred-prod-shape values (numbers come back from
// PostgREST as strings for numeric(10,2) columns).

assertEq("Pacred-prod row with all numeric strings",
  computeShopOrderDebitTotal({
    htotalpriceuser: "2389.85",
    htotalpricechn:  "456.50",
    hshippingchn:    "15.00",
    hshippingservice:"50.00",
    hrate:           "4.95",
  }), 2389.85);

assertEq("Pacred-prod row WITHOUT htotalpriceuser (forces recompute)",
  computeShopOrderDebitTotal({
    htotalpriceuser: "0.00",
    htotalpricechn:  "456.50",
    hshippingchn:    "15.00",
    hshippingservice:"50.00",
    hrate:           "4.95",
  }), Math.round(((456.5 + 15) * 4.95 + 50) * 100) / 100);  // (471.5 * 4.95) + 50 = 2383.925 → 2383.93

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
