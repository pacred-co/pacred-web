/**
 * Unit tests for lib/forwarder/forwarder-collect-total.ts
 * (UNIT C · forwarder customer SELF-PAY · 2026-06-19).
 *
 * Asserts the CUSTOMER self-pay collect contract ported from legacy
 * `member/include/pages/forwarder/calPrice.php` L25-45 (mirrored in
 * `actions/forwarder.ts calculateForwarderTotal` L111-179):
 *   • per-row composite total formula (L26)
 *   • PCSF-zero row → +฿50 flat batch fee (L29-42)
 *   • หนองแขม district × userNotPCS50 allowlist → NO +50 (L34-38)
 *   • juristic (userCompany='1') AND total >= 1000 → 1% reduction (L43-45)
 *   • juristic AND total < 1000 → NO 1%
 *   • non-juristic → NO 1%
 *
 * The whole point of this helper is killing BUG-2 — display == charge — so the
 * assertions below double as the regression lock.
 *
 * Harness: plain `tsx` (no vitest) · pass/fail counters · matches
 * lib/forwarder/forwarder-debit-total.test.ts style.
 */

import {
  computeForwarderCollectTotal,
  userNotPCS50,
  type ForwarderCollectRow,
} from "./forwarder-collect-total";

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function assertClose(label: string, actual: number, expected: number, eps = 0.005) {
  if (Math.abs(actual - expected) <= eps) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${expected}\n    actual:   ${actual}`);
  }
}

/** Build a ForwarderCollectRow with sane zero defaults. */
function row(p: Partial<ForwarderCollectRow> = {}): ForwarderCollectRow {
  return {
    fshipby: p.fshipby ?? "Flash",
    ftransportprice: p.ftransportprice ?? 0,
    faddressdistrict: p.faddressdistrict ?? null,
    ftotalprice: p.ftotalprice ?? 0,
    fpriceupdate: p.fpriceupdate ?? 0,
    fshippingservice: p.fshippingservice ?? 0,
    pricecrate: p.pricecrate ?? 0,
    ftransportpricechnthb: p.ftransportpricechnthb ?? 0,
    priceother: p.priceother ?? 0,
    fdiscount: p.fdiscount ?? 0,
  };
}

console.log("forwarder-collect-total:");

// 1. A NORMAL row — composite total formula, no PCSF, no juristic.
{
  const r = computeForwarderCollectTotal(
    [row({
      ftotalprice: "100",
      ftransportprice: "20",
      fpriceupdate: "10",
      fshippingservice: "5",
      pricecrate: "3",
      ftransportpricechnthb: "2",
      priceother: "1",
      fdiscount: "11",
    })],
    { userId: "PR130", userCompany: "0" },
  );
  // 100 + 20 + 10 + 5 + 3 + 2 + 1 - 11 = 130
  assertClose("normal row composite total = 130", r.total, 130);
  assertEq("normal row no +50", r.applied50, false);
  assertEq("normal row no 1%", r.appliedWht, false);
  assertEq("normal row countPCSF = 0", r.countPCSF, 0);
}

// 2. A PCSF-zero row → +฿50 flat fee.
{
  const r = computeForwarderCollectTotal(
    [row({ fshipby: "PCSF", ftransportprice: 0, ftotalprice: "45.10" })],
    { userId: "PR131", userCompany: "0" },
  );
  // 45.10 + 50 = 95.10
  assertClose("PCSF-zero row total = freight + 50", r.total, 95.1);
  assertEq("PCSF-zero row applied50", r.applied50, true);
  assertEq("PCSF-zero row countPCSF = 1", r.countPCSF, 1);
}

// 3. A หนองแขม row + an exempt (allowlist) user → NO +50.
{
  const exemptUser = "PR50"; // on userNotPCS50
  assertEq("PR50 is on the allowlist", userNotPCS50.has(exemptUser), true);
  const r = computeForwarderCollectTotal(
    [row({
      fshipby: "PCSF",
      ftransportprice: 0,
      ftotalprice: "45.10",
      faddressdistrict: "แขวงหนองแขม เขตหนองแขม",
    })],
    { userId: exemptUser, userCompany: "0" },
  );
  // PCSF count 1, then หนองแขม+allowlist un-counts → 0 → NO +50.
  assertClose("หนองแขม + exempt user → NO +50, total = freight", r.total, 45.1);
  assertEq("หนองแขม + exempt user → applied50 false", r.applied50, false);
  assertEq("หนองแขม + exempt user → countPCSF = 0", r.countPCSF, 0);
}

// 3b. A หนองแขม row but a NON-allowlist user → +50 STILL applies (exemption needs both).
{
  const r = computeForwarderCollectTotal(
    [row({
      fshipby: "PCSF",
      ftransportprice: 0,
      ftotalprice: "45.10",
      faddressdistrict: "แขวงหนองแขม เขตหนองแขม",
    })],
    { userId: "PR9999", userCompany: "0" }, // NOT on the allowlist
  );
  assertClose("หนองแขม but non-allowlist user → +50 applies", r.total, 95.1);
  assertEq("หนองแขม but non-allowlist user → applied50 true", r.applied50, true);
}

// 4. userCompany='1' AND total >= 1000 → 1% off.
{
  const r = computeForwarderCollectTotal(
    [row({ ftotalprice: "1000", fpriceupdate: "200" })],
    { userId: "PR140", userCompany: "1" },
  );
  // 1200, juristic, >= 1000 → 1% off = 1188
  assertClose("juristic >= 1000 → 1% off, total = 1188", r.total, 1188);
  assertEq("juristic >= 1000 → appliedWht true", r.appliedWht, true);
}

// 5. userCompany='1' AND total < 1000 → NO 1%.
{
  const r = computeForwarderCollectTotal(
    [row({ ftotalprice: "500" })],
    { userId: "PR141", userCompany: "1" },
  );
  assertClose("juristic but < 1000 → NO 1%, total = 500", r.total, 500);
  assertEq("juristic but < 1000 → appliedWht false", r.appliedWht, false);
}

// 6. non-juristic (userCompany != '1') AND total >= 1000 → NO 1%.
{
  const r = computeForwarderCollectTotal(
    [row({ ftotalprice: "1000", fpriceupdate: "200" })],
    { userId: "PR142", userCompany: "0" },
  );
  assertClose("non-juristic >= 1000 → NO 1%, total = 1200", r.total, 1200);
  assertEq("non-juristic >= 1000 → appliedWht false", r.appliedWht, false);
}

// 7. Combined: PCSF +50 lifts a 960 personal order to 1010 — but personal so NO 1%.
{
  const r = computeForwarderCollectTotal(
    [row({ fshipby: "PCSF", ftransportprice: 0, ftotalprice: "960" })],
    { userId: "PR143", userCompany: "0" },
  );
  assertClose("PCSF +50 → 1010, personal → no 1%", r.total, 1010);
  assertEq("applied50 true", r.applied50, true);
  assertEq("appliedWht false (personal)", r.appliedWht, false);
}

// 8. Combined juristic: PCSF +50 pushes a 980 juristic order over 1000 → 1% on 1030.
{
  const r = computeForwarderCollectTotal(
    [row({ fshipby: "PCSF", ftransportprice: 0, ftotalprice: "980" })],
    { userId: "PR144", userCompany: "1" },
  );
  // 980 + 50 = 1030 → >= 1000 → 1% off = 1019.70
  assertClose("PCSF +50 lifts juristic over 1000 → 1% on 1030 = 1019.70", r.total, 1019.7);
  assertEq("applied50 true", r.applied50, true);
  assertEq("appliedWht true", r.appliedWht, true);
}

// 9. Multiple PCSF-zero rows → still ONE flat +50 (not per-row).
{
  const r = computeForwarderCollectTotal(
    [
      row({ fshipby: "PCSF", ftransportprice: 0, ftotalprice: "100" }),
      row({ fshipby: "PCSF", ftransportprice: 0, ftotalprice: "200" }),
    ],
    { userId: "PR145", userCompany: "0" },
  );
  // 100 + 200 + 50 (one flat) = 350
  assertClose("two PCSF-zero rows → ONE +50 → 350", r.total, 350);
  assertEq("countPCSF = 2", r.countPCSF, 2);
  assertEq("applied50 true (count >= 1)", r.applied50, true);
}

console.log(`\nforwarder-collect-total: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
