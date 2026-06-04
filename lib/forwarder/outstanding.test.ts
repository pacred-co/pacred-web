/**
 * Unit tests for lib/forwarder/outstanding.ts — the ยอดค้างชำระ (outstanding
 * balance) calc, port of legacy calPriceForwarderMain() (function.php L1878).
 * Pure, no IO. Sum of 7 price fields − discount, with a 1% juristic allowance.
 *
 * Run:  pnpm tsx lib/forwarder/outstanding.test.ts   (wired into pnpm test:unit)
 */

import { calcForwarderOutstanding, type ForwarderPriceFields } from "./outstanding";

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

console.log(`\n${fail === 0 ? "✅" : "❌"} forwarder/outstanding: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
