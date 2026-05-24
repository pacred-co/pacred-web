/**
 * V-E5 — safe-numeric helper unit tests.
 *
 * Covers the int32-overflow rejection + range guards exported from
 * safe-numeric.ts. Every numeric input across the freight/cargo write
 * paths goes through these schemas; a regression here re-opens the
 * int32-garbage attack surface PORT_PLAN V-E5 calls out.
 *
 *   1. INT32_OVERFLOW_THRESHOLD + isInt32OverflowSuspect — pure helper
 *   2. safeThbAmount  — [0, 999_999_999.99] + int32 reject
 *   3. safeUsdAmount  — [0, 99_999_999.99] + int32 reject
 *   4. safeQty        — integer [0, 9_999_999] + int32 reject
 *   5. safeExchangeRate — [10, 100] + int32 reject (rejects 3.3 typo)
 *   6. safeDutyPct    — [0, 100] + int32 reject
 *   7. safeVatPct     — [0, 30]  + int32 reject
 *   8. safeWhtPct     — [0, 50]  + int32 reject
 *   9. safeHsCode     — string [4, 20] chars
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  INT32_OVERFLOW_THRESHOLD,
  isInt32OverflowSuspect,
  rangeFailMessage,
  safeThbAmount,
  safeUsdAmount,
  safeQty,
  safeDecimalQty,
  safeExchangeRate,
  safeDutyPct,
  safeVatPct,
  safeWhtPct,
  safeHsCode,
  safeInt32Money,
  MAX_THB_AMOUNT,
  MAX_USD_AMOUNT,
  MAX_QTY,
  MAX_EXCHANGE_RATE,
  MIN_EXCHANGE_RATE,
} from "./safe-numeric";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}

console.log("safe-numeric helpers (V-E5)");

// ── 1) INT32 overflow threshold + helper ──────────────────────
console.log("  ▸ INT32_OVERFLOW_THRESHOLD + isInt32OverflowSuspect");
assert("threshold is -1_000_000",                       INT32_OVERFLOW_THRESHOLD === -1_000_000);
assert("-2_146_826_265 (legacy int32 garbage) → suspect",  isInt32OverflowSuspect(-2_146_826_265));
assert("-1_000_001 → suspect",                          isInt32OverflowSuspect(-1_000_001));
assert("-1_000_000 → suspect (boundary inclusive)",     isInt32OverflowSuspect(-1_000_000));
assert("-999_999 → NOT suspect",                        !isInt32OverflowSuspect(-999_999));
assert("0 → NOT suspect",                               !isInt32OverflowSuspect(0));
assert("999_999_999 → NOT suspect",                     !isInt32OverflowSuspect(999_999_999));
assert("NaN → NOT suspect (Number.isFinite gate)",      !isInt32OverflowSuspect(NaN));
assert("Infinity → NOT suspect",                        !isInt32OverflowSuspect(Infinity));

// ── 2) safeThbAmount [0, 999_999_999.99] ──────────────────────
console.log("  ▸ safeThbAmount");
assert("0 valid",                                       safeThbAmount.safeParse(0).success);
assert("100.50 valid",                                  safeThbAmount.safeParse(100.50).success);
assert("MAX (999_999_999.99) valid",                    safeThbAmount.safeParse(MAX_THB_AMOUNT).success);
assert("MAX+0.01 INVALID",                              !safeThbAmount.safeParse(MAX_THB_AMOUNT + 0.01).success);
assert("-1 INVALID (< min)",                            !safeThbAmount.safeParse(-1).success);
assert("-2_146_826_265 INVALID (int32 garbage)",        !safeThbAmount.safeParse(-2_146_826_265).success);

// ── 3) safeUsdAmount [0, 99_999_999.99] ───────────────────────
console.log("  ▸ safeUsdAmount");
assert("0 valid",                                       safeUsdAmount.safeParse(0).success);
assert("MAX (99_999_999.99) valid",                     safeUsdAmount.safeParse(MAX_USD_AMOUNT).success);
assert("100_000_000 INVALID",                           !safeUsdAmount.safeParse(100_000_000).success);
assert("-2_146_826_265 INVALID (int32 garbage)",        !safeUsdAmount.safeParse(-2_146_826_265).success);

// ── 4) safeQty (integer [0, 9_999_999]) ───────────────────────
console.log("  ▸ safeQty (integer)");
assert("0 valid",                                       safeQty.safeParse(0).success);
assert("1 valid",                                       safeQty.safeParse(1).success);
assert("MAX_QTY (9_999_999) valid",                     safeQty.safeParse(MAX_QTY).success);
assert("1.5 INVALID (not integer)",                     !safeQty.safeParse(1.5).success);
assert("10_000_000 INVALID (> max)",                    !safeQty.safeParse(10_000_000).success);
assert("-2_146_826_265 INVALID (int32 garbage)",        !safeQty.safeParse(-2_146_826_265).success);

// ── 5) safeDecimalQty (non-integer allowed) ───────────────────
console.log("  ▸ safeDecimalQty (decimal)");
assert("1.5 valid (cbm-style)",                         safeDecimalQty.safeParse(1.5).success);
assert("0.001 valid",                                   safeDecimalQty.safeParse(0.001).success);
assert("MAX valid",                                     safeDecimalQty.safeParse(MAX_QTY).success);
assert("-1 INVALID",                                    !safeDecimalQty.safeParse(-1).success);

// ── 6) safeExchangeRate [10, 100] ─────────────────────────────
console.log("  ▸ safeExchangeRate (USD→THB sanity floor + ceiling)");
assert("33.16 valid (observed real rate)",              safeExchangeRate.safeParse(33.16).success);
assert("MIN (10) valid",                                safeExchangeRate.safeParse(MIN_EXCHANGE_RATE).success);
assert("MAX (100) valid",                               safeExchangeRate.safeParse(MAX_EXCHANGE_RATE).success);
assert("3.3 INVALID (missing decimal typo)",            !safeExchangeRate.safeParse(3.3).success);
assert("9 INVALID (< floor)",                           !safeExchangeRate.safeParse(9).success);
assert("101 INVALID (> ceiling)",                       !safeExchangeRate.safeParse(101).success);
assert("-2_146_826_265 INVALID",                        !safeExchangeRate.safeParse(-2_146_826_265).success);

// ── 7) safeDutyPct [0, 100] ───────────────────────────────────
console.log("  ▸ safeDutyPct");
assert("0 valid",                                       safeDutyPct.safeParse(0).success);
assert("7.5 valid",                                     safeDutyPct.safeParse(7.5).success);
assert("100 valid",                                     safeDutyPct.safeParse(100).success);
assert("100.01 INVALID",                                !safeDutyPct.safeParse(100.01).success);
assert("-1 INVALID",                                    !safeDutyPct.safeParse(-1).success);

// ── 8) safeVatPct [0, 30] ─────────────────────────────────────
console.log("  ▸ safeVatPct");
assert("7 valid (real Thai VAT)",                       safeVatPct.safeParse(7).success);
assert("30 valid",                                      safeVatPct.safeParse(30).success);
assert("31 INVALID",                                    !safeVatPct.safeParse(31).success);

// ── 9) safeWhtPct [0, 50] ─────────────────────────────────────
console.log("  ▸ safeWhtPct");
assert("15 valid (default Thai service WHT)",           safeWhtPct.safeParse(15).success);
assert("50 valid",                                      safeWhtPct.safeParse(50).success);
assert("51 INVALID",                                    !safeWhtPct.safeParse(51).success);

// ── 10) safeHsCode (string [4, 20]) ───────────────────────────
console.log("  ▸ safeHsCode");
assert("84715000 valid (8 digits — common Thai HS)",    safeHsCode.safeParse("84715000").success);
assert("8471 valid (4 digits — minimum)",               safeHsCode.safeParse("8471").success);
assert("123 INVALID (< min length)",                    !safeHsCode.safeParse("123").success);
assert("21-char string INVALID (> max length)",         !safeHsCode.safeParse("123456789012345678901").success);
assert("trims whitespace",
  safeHsCode.safeParse("  84715000  ").success &&
  safeHsCode.parse("  84715000  ") === "84715000");

// ── 11) safeInt32Money (integer money guard) ──────────────────
console.log("  ▸ safeInt32Money");
assert("100 valid",                                     safeInt32Money.safeParse(100).success);
assert("999_999_999 valid",                             safeInt32Money.safeParse(999_999_999).success);
assert("1_000_000_000 INVALID",                         !safeInt32Money.safeParse(1_000_000_000).success);
assert("100.50 INVALID (not integer)",                  !safeInt32Money.safeParse(100.50).success);
assert("-2_146_826_265 INVALID (int32 garbage)",        !safeInt32Money.safeParse(-2_146_826_265).success);

// ── 12) rangeFailMessage helper ───────────────────────────────
console.log("  ▸ rangeFailMessage");
assert("formats Thai message",
  rangeFailMessage("commercial_value_usd", -2_146_826_265, 0, 99_999_999.99)
    .includes("commercial_value_usd"));
assert("includes value",
  rangeFailMessage("x", 999, 0, 100).includes("999"));

console.log(`\nsafe-numeric.test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
