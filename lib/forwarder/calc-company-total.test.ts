/**
 * Unit tests for calPriceForwarderSumCompany — the legacy forwarder per-row
 * NET total (faithful port of function.php L1384-1392). MONEY-CRITICAL: this is
 * the "ราคารวมสุทธิ" a customer sees + pays on every ฝากนำเข้า (forwarder) row,
 * shared by 5+ surfaces (service-import list / [fNo] detail / table / tracking /
 * interactive total). It had ZERO tests; a silent regression here mis-states
 * every customer's payable amount.
 *
 * The formula under test:
 *   pricePayAll = fPriceUpdate + fTotalPrice + fTransportPrice + fShippingService
 *               + priceCrate + fTransportPriceChnThb + priceOther − fDiscount
 *   if fUserCompany === "1":  pricePayAll −= pricePayAll × 0.01   (1% juristic WHT)
 *
 * Run with:  tsx lib/forwarder/calc-company-total.test.ts
 *            (or `pnpm test:unit` to run the whole suite)
 *
 * Exits non-zero if any assertion fails — matches the repo's tsx test harness
 * (assert helper + "N pass, M fail" summary + exit code · no Jest/Vitest).
 */

import { calPriceForwarderSumCompany } from "./calc-company-total";

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

/** Assert two numbers are equal within a tiny float epsilon (THB money math). */
function assertClose(label: string, actual: number, expected: number, eps = 1e-9) {
  if (Math.abs(actual - expected) <= eps) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${expected}\n    actual:   ${actual}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

/**
 * Positional-argument builder mirroring the EXACT call contract at every
 * consumer site (verified vs service-import/[fNo]/page.tsx L772-782):
 *   (fUserCompany, fPriceUpdate, fTotalPrice, fTransportPrice, fShippingService,
 *    fDiscount, priceCrate, fTransportPriceChnThb, priceOther)
 */
type Args = {
  fUserCompany: string | null;
  fPriceUpdate: number;
  fTotalPrice: number;
  fTransportPrice: number;
  fShippingService: number;
  fDiscount: number;
  priceCrate: number;
  fTransportPriceChnThb: number;
  priceOther: number;
};
function call(a: Partial<Args> = {}): number {
  const x: Args = {
    fUserCompany: null,
    fPriceUpdate: 0,
    fTotalPrice: 0,
    fTransportPrice: 0,
    fShippingService: 0,
    fDiscount: 0,
    priceCrate: 0,
    fTransportPriceChnThb: 0,
    priceOther: 0,
    ...a,
  };
  return calPriceForwarderSumCompany(
    x.fUserCompany,
    x.fPriceUpdate,
    x.fTotalPrice,
    x.fTransportPrice,
    x.fShippingService,
    x.fDiscount,
    x.priceCrate,
    x.fTransportPriceChnThb,
    x.priceOther,
  );
}

// ────────────────────────────────────────────────────────────
section("1. additive components — each of the 7 cost legs adds 1:1");
// ────────────────────────────────────────────────────────────
{
  assertEq("all-zero → 0", call(), 0);
  assertEq("fPriceUpdate adds", call({ fPriceUpdate: 100 }), 100);
  assertEq("fTotalPrice adds", call({ fTotalPrice: 200 }), 200);
  assertEq("fTransportPrice adds", call({ fTransportPrice: 300 }), 300);
  assertEq("fShippingService adds", call({ fShippingService: 400 }), 400);
  assertEq("priceCrate adds", call({ priceCrate: 500 }), 500);
  assertEq("fTransportPriceChnThb adds", call({ fTransportPriceChnThb: 600 }), 600);
  assertEq("priceOther adds", call({ priceOther: 700 }), 700);

  // All seven legs together (no discount, individual account).
  const full = call({
    fPriceUpdate: 100,
    fTotalPrice: 200,
    fTransportPrice: 300,
    fShippingService: 400,
    priceCrate: 500,
    fTransportPriceChnThb: 600,
    priceOther: 700,
  });
  assertEq("sum of all 7 legs = 2800", full, 2800);
}

// ────────────────────────────────────────────────────────────
section("2. discount is SUBTRACTED (the 6th positional arg)");
// ────────────────────────────────────────────────────────────
{
  assertEq("subtotal 1000 − discount 100 = 900", call({ fTotalPrice: 1000, fDiscount: 100 }), 900);
  assertEq("discount only (subtotal 0) → negative", call({ fDiscount: 250 }), -250);
  // Argument-ORDER guard: discount must reduce, crate/chn/other must add.
  // If positional order ever drifts, these break.
  assertEq(
    "order guard: +crate +chn +other −discount",
    call({ priceCrate: 50, fTransportPriceChnThb: 30, priceOther: 20, fDiscount: 40 }),
    60,
  );
}

// ────────────────────────────────────────────────────────────
section("3. juristic (fUserCompany==='1') → exactly 1% WHT reduction");
// ────────────────────────────────────────────────────────────
{
  // 10000 × 0.99 = 9900
  assertClose("juristic 10000 → 9900", call({ fUserCompany: "1", fTotalPrice: 10000 }), 9900);
  // 1000 × 0.99 = 990
  assertClose("juristic 1000 → 990", call({ fUserCompany: "1", fTotalPrice: 1000 }), 990);
  // The reduction is exactly subtotal × 0.01.
  const subtotal = 2120 * 5.01; // a real legacy figure pattern (¥×rate)
  assertClose(
    "juristic = subtotal − subtotal×0.01",
    call({ fUserCompany: "1", fTotalPrice: subtotal }),
    subtotal - subtotal * 0.01,
  );
  // WHT applies to the NET (after discount), not the gross subtotal.
  // (1000 − 100) = 900 → ×0.99 = 891
  assertClose(
    "juristic WHT applies AFTER discount",
    call({ fUserCompany: "1", fTotalPrice: 1000, fDiscount: 100 }),
    891,
  );
}

// ────────────────────────────────────────────────────────────
section("4. NON-juristic = no WHT (only literal '1' triggers the reduction)");
// ────────────────────────────────────────────────────────────
{
  assertEq("fUserCompany null → no WHT", call({ fUserCompany: null, fTotalPrice: 1000 }), 1000);
  assertEq("fUserCompany '0' → no WHT", call({ fUserCompany: "0", fTotalPrice: 1000 }), 1000);
  assertEq("fUserCompany '' → no WHT", call({ fUserCompany: "", fTotalPrice: 1000 }), 1000);
  assertEq("fUserCompany '2' → no WHT", call({ fUserCompany: "2", fTotalPrice: 1000 }), 1000);
  // Strict-equality guard: numeric-ish strings that aren't exactly "1".
  assertEq("fUserCompany '10' → no WHT", call({ fUserCompany: "10", fTotalPrice: 1000 }), 1000);
  assertEq("fUserCompany ' 1' (space) → no WHT", call({ fUserCompany: " 1", fTotalPrice: 1000 }), 1000);
  assertEq("fUserCompany 'true' → no WHT", call({ fUserCompany: "true", fTotalPrice: 1000 }), 1000);
}

// ────────────────────────────────────────────────────────────
section("5. edge cases — zero / negative net / large numbers");
// ────────────────────────────────────────────────────────────
{
  // Discount exceeding subtotal yields a negative net (the function does NOT
  // floor at 0 — it's a faithful arithmetic port; callers/UI decide clamping).
  assertEq("discount > subtotal → negative net preserved", call({ fTotalPrice: 100, fDiscount: 300 }), -200);

  // Juristic on a negative net still applies ×0.99 to the (negative) total.
  // (−200) × 0.99 = −198
  assertClose(
    "juristic on negative net → ×0.99 of negative",
    call({ fUserCompany: "1", fTotalPrice: 100, fDiscount: 300 }),
    -198,
  );

  // Large but realistic container figures stay exact (no overflow/precision loss
  // at THB magnitudes).
  assertEq(
    "large legs sum exactly",
    call({
      fPriceUpdate: 1_000_000,
      fTotalPrice: 2_500_000,
      fTransportPrice: 750_000,
      fShippingService: 50,
    }),
    4_250_050,
  );

  // Zero juristic-flagged subtotal stays 0 (no negative-zero surprises in JSON).
  assertEq("juristic on 0 → 0", call({ fUserCompany: "1" }), 0);
}

// ────────────────────────────────────────────────────────────
section("6. realistic blended order (individual vs juristic delta = exactly 1%)");
// ────────────────────────────────────────────────────────────
{
  const legs = {
    fPriceUpdate: 0,
    fTotalPrice: 8800, // freight subtotal
    fTransportPrice: 1500, // ค่าขนส่งในไทย
    fShippingService: 50, // +50 PCS service fee shape
    priceCrate: 350, // ตีลัง
    fTransportPriceChnThb: 1200, // ค่าขนส่งในจีน (THB)
    priceOther: 100,
    fDiscount: 200,
  };
  const subtotal = 8800 + 1500 + 50 + 350 + 1200 + 100 - 200; // 11800
  const individual = call(legs);
  const juristic = call({ ...legs, fUserCompany: "1" });
  assertEq("individual net = computed subtotal", individual, subtotal);
  assertClose("juristic net = subtotal × 0.99", juristic, subtotal * 0.99);
  // The WHT discount equals exactly 1% of the individual net.
  assertClose("WHT delta = 1% of individual net", individual - juristic, subtotal * 0.01);
}

// ── Summary ──
console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
