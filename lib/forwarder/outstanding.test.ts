/**
 * Unit tests for lib/forwarder/outstanding.ts — the ยอดค้างชำระ (outstanding
 * balance) calc, port of legacy calPriceForwarderMain() (function.php L1878).
 * Pure, no IO. Sum of 7 price fields − discount, with a 1% juristic allowance.
 *
 * Run:  pnpm tsx lib/forwarder/outstanding.test.ts   (wired into pnpm test:unit)
 */

import { calcForwarderOutstanding, calcForwarderGross, type ForwarderPriceFields } from "./outstanding";
import { computeBillWht } from "../billing/wht";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

/** Build a full ForwarderPriceFields row (all fields 0/null) with overrides. */
function row(o: Partial<ForwarderPriceFields>): ForwarderPriceFields {
  return {
    ftotalprice: 0, ftransportprice: 0, fpriceupdate: 0, fshippingservice: 0,
    pricecrate: 0, ftransportpricechnthb: 0, priceother: 0, fdiscount: 0,
    fusercompany: null, ...o,
  };
}

section("calcForwarderOutstanding");
assertEq("single field, non-juristic", calcForwarderOutstanding(row({ ftotalprice: 1000 })), 1000);

assertEq("sum of all 7 fields − discount (non-juristic)",
  calcForwarderOutstanding(row({
    ftotalprice: 1000, ftransportprice: 100, fpriceupdate: 50, fshippingservice: 30,
    pricecrate: 20, ftransportpricechnthb: 10, priceother: 5, fdiscount: 15,
  })), 1200);

assertEq("juristic (fusercompany='1') → 1% allowance off the grand total",
  calcForwarderOutstanding(row({
    ftotalprice: 1000, ftransportprice: 100, fpriceupdate: 50, fshippingservice: 30,
    pricecrate: 20, ftransportpricechnthb: 10, priceother: 5, fdiscount: 15,
    fusercompany: "1",
  })), 1188); // 1200 − (1200 × 0.01)

assertEq("juristic via numeric 1 also triggers allowance",
  calcForwarderOutstanding(row({ ftotalprice: 1000, fusercompany: 1 })), 990);

assertEq("overpaid (discount > sum) clamps to 0 (never negative)",
  calcForwarderOutstanding(row({ ftotalprice: 100, fdiscount: 500 })), 0);

assertEq("legacy varchar columns (strings) are coerced",
  calcForwarderOutstanding(row({ ftotalprice: "1000.50", fshippingservice: "9.50", fdiscount: "10" })), 1000);

assertEq("garbage string coerces to 0 (no NaN leak)",
  calcForwarderOutstanding(row({ ftotalprice: 500, ftransportprice: "abc" })), 500);

assertEq("fusercompany='0' is NOT juristic (no allowance)",
  calcForwarderOutstanding(row({ ftotalprice: 1000, fusercompany: "0" })), 1000);

// ────────────────────────────────────────────────────────────────────────
// D1 (2026-07-13) — COD (ปลายทาง · paymethod='2') EXCLUDES the domestic leg
// (ftransportprice · collected at the door by the courier) from the bill/
// outstanding. Prepaid (ต้นทาง '1' / absent) includes it as before.
// ────────────────────────────────────────────────────────────────────────
section("D1 COD domestic-leg exclusion");
assertEq("absent paymethod → prepaid → domestic leg INCLUDED",
  calcForwarderOutstanding(row({ ftotalprice: 1000, ftransportprice: 100 })), 1100);
assertEq("paymethod='1' (ต้นทาง) → domestic leg INCLUDED",
  calcForwarderOutstanding(row({ ftotalprice: 1000, ftransportprice: 100, paymethod: "1" })), 1100);
assertEq("paymethod='2' (COD) → domestic leg EXCLUDED",
  calcForwarderOutstanding(row({ ftotalprice: 1000, ftransportprice: 100, paymethod: "2" })), 1000);
assertEq("paymethod=2 numeric (COD) → domestic leg EXCLUDED",
  calcForwarderOutstanding(row({ ftotalprice: 1000, ftransportprice: 100, paymethod: 2 })), 1000);
assertEq("COD excludes ONLY the domestic leg (chnthb/other legs untouched)",
  calcForwarderOutstanding(row({ ftotalprice: 1000, ftransportprice: 100, ftransportpricechnthb: 50, priceother: 20, paymethod: "2" })), 1070);
assertEq("calcForwarderGross COD → domestic leg EXCLUDED too (bill face agrees)",
  calcForwarderGross(row({ ftotalprice: 1000, ftransportprice: 100, paymethod: "2" })), 1000);
assertEq("juristic COD → 1% off the COD-excluded gross",
  calcForwarderOutstanding(row({ ftotalprice: 1000, ftransportprice: 100, paymethod: "2", fusercompany: "1" })), 990); // (1000)−1%

// ────────────────────────────────────────────────────────────────────────
// calcForwarderGross — the GROSS composite (no 1% allowance · the ใบวางบิล face)
// ────────────────────────────────────────────────────────────────────────
section("calcForwarderGross");

assertEq("single field, non-juristic = same as outstanding",
  calcForwarderGross(row({ ftotalprice: 1000 })), 1000);

assertEq("sum of all 7 fields − discount",
  calcForwarderGross(row({
    ftotalprice: 1000, ftransportprice: 100, fpriceupdate: 50, fshippingservice: 30,
    pricecrate: 20, ftransportpricechnthb: 10, priceother: 5, fdiscount: 15,
  })), 1200);

// The CORE difference: gross ignores the juristic 1% (outstanding applies it).
assertEq("juristic → gross is the FULL amount (NO 1% allowance)",
  calcForwarderGross(row({ ftotalprice: 1000, fusercompany: "1" })), 1000);
assertEq("juristic numeric 1 → still gross (no allowance)",
  calcForwarderGross(row({ ftotalprice: 1000, fusercompany: 1 })), 1000);

assertEq("overpaid (discount > sum) clamps to 0",
  calcForwarderGross(row({ ftotalprice: 100, fdiscount: 500 })), 0);

assertEq("legacy varchar columns coerced",
  calcForwarderGross(row({ ftotalprice: "1000.50", fshippingservice: "9.50", fdiscount: "10" })), 1000);

// gross ≥ outstanding always; equal for non-juristic, 1% higher for juristic.
{
  const r = row({ ftotalprice: 5000, fusercompany: "1" });
  assertEq("juristic: gross(5000) vs outstanding(4950) differ by exactly the 1%",
    [calcForwarderGross(r), calcForwarderOutstanding(r)], [5000, 4950]);
}
{
  const r = row({ ftotalprice: 5000, fusercompany: "0" });
  assertEq("non-juristic: gross === outstanding (no withholding gap)",
    calcForwarderGross(r) === calcForwarderOutstanding(r), true);
}

// ────────────────────────────────────────────────────────────────────────
// Reconciliation — the WHT-fix invariant the ใบวางบิล relies on.
// The bill stores GROSS (calcForwarderGross) and applies the 1% ONCE via
// computeBillWht(gross). This must NOT be the old double-deduction
// (computeBillWht(NET) = gross × 0.98). Lock both the right path and the
// regression it replaces.
// ────────────────────────────────────────────────────────────────────────
section("WHT reconciliation (gross → 1% once → net)");

{
  // Juristic ฿5,000 gross → WHT ฿50 → net ฿4,950. One deduction.
  const gross = calcForwarderGross(row({ ftotalprice: 5000, fusercompany: "1" }));
  const w = computeBillWht(true, gross);
  assertEq("juristic ฿5,000 gross → WHT ฿50, net ฿4,950 (single deduction)",
    [gross, w.wht_amount, w.net_payable], [5000, 50, 4950]);
  assertEq("net_payable reconciles: wht + net === gross (to satang)",
    Math.round((w.wht_amount + w.net_payable) * 100) / 100, gross);
}

{
  // REGRESSION GUARD — the bug was computeBillWht(NET): the NET was already
  // gross×0.99, so withholding 1% again gave gross×0.9801 (≈ gross×0.98).
  // The fix (computeBillWht(GROSS)) must give gross×0.99 instead.
  const r = row({ ftotalprice: 5000, fusercompany: "1" });
  const gross = calcForwarderGross(r);            // 5000
  const net   = calcForwarderOutstanding(r);      // 4950 (already −1%)
  const buggy = computeBillWht(true, net).net_payable;   // old: 4950 × 0.99 = 4900.5
  const fixed = computeBillWht(true, gross).net_payable; // new: 5000 × 0.99 = 4950
  assertEq("OLD net-stored path double-deducts (4900.5 ≈ gross×0.98)", buggy, 4900.5);
  assertEq("NEW gross-stored path withholds once (4950 = gross×0.99)", fixed, 4950);
  assertEq("the fix recovers the lost ~1% of gross", Math.round((fixed - buggy) * 100) / 100, 49.5);
}

{
  // Non-juristic: gross === net, no WHT line, no difference either way.
  const gross = calcForwarderGross(row({ ftotalprice: 5000, fusercompany: "0" }));
  const w = computeBillWht(false, gross);
  assertEq("non-juristic ฿5,000 → no WHT, net === gross",
    [w.wht_amount, w.net_payable], [0, 5000]);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} forwarder/outstanding: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
