/**
 * Unit tests for lib/forwarder/forwarder-debit-total.ts
 * (P0-19 Phase 2 · forwarder pay-on-behalf · 2026-05-30).
 *
 * Asserts the EXACT pricing contract ported from legacy
 * `pcs-admin/pay-users.php` `paymentForwarderNew` (L202-500):
 *   • base price formula (L320)
 *   • PCSF first-item ฿50 transport (L386-395) + the fix-id surfaced
 *   • PCSMao single-charge — the ฿50 is counted exactly once (L328-331)
 *   • corporate 1% allowance gated on BATCH total ≥ ฿1000 (L333-335)
 *   • PCS999 exempt from the PCSF/เหมาๆ rule (L328 / L386)
 *   • defensive varchar coercion + NaN refusal of bad rows
 *
 * Harness: plain `tsx` (no vitest) · pass/fail counters · matches
 * actions/admin/forwarders-bulk-tb.test.ts style.
 */

import {
  computeForwarderDebitBatch,
  type ForwarderDebitRow,
} from "./forwarder-debit-total";

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

function assertTrue(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}`);
  }
}

/** Minimal row builder — only the pricing columns matter. */
function row(p: Partial<ForwarderDebitRow> & { id: number | string }): ForwarderDebitRow {
  return {
    id: p.id,
    fshipby: p.fshipby ?? null,
    ftotalprice: p.ftotalprice ?? 0,
    ftransportprice: p.ftransportprice ?? 0,
    fpriceupdate: p.fpriceupdate ?? 0,
    fshippingservice: p.fshippingservice ?? 0,
    pricecrate: p.pricecrate ?? 0,
    ftransportpricechnthb: p.ftransportpricechnthb ?? 0,
    priceother: p.priceother ?? 0,
    fdiscount: p.fdiscount ?? 0,
  };
}

console.log("computeForwarderDebitBatch — base formula");
{
  // base = (1000 + 200 + 50 + 30 + 40 + 60 + 10) − 90 = 1300
  const b = computeForwarderDebitBatch(
    [row({ id: 1, ftotalprice: 1000, ftransportprice: 200, fpriceupdate: 50, fshippingservice: 30, pricecrate: 40, ftransportpricechnthb: 60, priceother: 10, fdiscount: 90 })],
    { userId: "PR124", isCorporate: false },
  );
  assertClose("single row base = 1300", b.total_thb, 1300);
  assertEq("one line", b.lines.length, 1);
  assertClose("line price = 1300", b.lines[0].price_thb, 1300);
  assertEq("no PCSF fix", b.pcsfTransportFixId, null);
  assertEq("no corporate discount", b.applyCorporateDiscount, false);
  assertEq("not pcsf first", b.lines[0].isPcsfFirst, false);
}

console.log("computeForwarderDebitBatch — multi-row sum");
{
  const b = computeForwarderDebitBatch(
    [
      row({ id: 1, ftotalprice: 500 }),
      row({ id: 2, ftotalprice: 300, fdiscount: 50 }),
      row({ id: 3, ftotalprice: 200 }),
    ],
    { userId: "PR124", isCorporate: false },
  );
  // 500 + 250 + 200 = 950
  assertClose("sum = 950", b.total_thb, 950);
  assertClose("row2 = 250", b.lines[1].price_thb, 250);
  assertEq("under-1000 corporate=false → no discount even if corp", b.applyCorporateDiscount, false);
}

console.log("computeForwarderDebitBatch — PCSF first-item ฿50");
{
  // 2 PCSF-zero rows. Only the FIRST gets +50 + the transport-fix id.
  const b = computeForwarderDebitBatch(
    [
      row({ id: 11, fshipby: "PCSF", ftransportprice: 0, ftotalprice: 100 }),
      row({ id: 12, fshipby: "PCSF", ftransportprice: 0, ftotalprice: 100 }),
    ],
    { userId: "PR124", isCorporate: false },
  );
  assertClose("first PCSF = 150 (+50)", b.lines[0].price_thb, 150);
  assertClose("second PCSF = 100 (free transport)", b.lines[1].price_thb, 100);
  assertEq("first flagged pcsf", b.lines[0].isPcsfFirst, true);
  assertEq("second not flagged", b.lines[1].isPcsfFirst, false);
  assertEq("fix-id = 11", b.pcsfTransportFixId, "11");
  // total = 150 + 100 = 250 — the ฿50 appears exactly ONCE
  assertClose("batch total = 250 (single ฿50)", b.total_thb, 250);
}

console.log("computeForwarderDebitBatch — PCSF with a non-zero transport row mixed in");
{
  // first row is PCSF but transport already 50 → NOT a เหมาๆ-zero row, no +50.
  const b = computeForwarderDebitBatch(
    [
      row({ id: 21, fshipby: "PCSF", ftransportprice: 50, ftotalprice: 100 }),
      row({ id: 22, fshipby: "PCSF", ftransportprice: 0, ftotalprice: 100 }),
    ],
    { userId: "PR124", isCorporate: false },
  );
  assertClose("row21 = 150 (its own 50 transport, no +50)", b.lines[0].price_thb, 150);
  assertClose("row22 = 150 (first zero-PCSF gets +50)", b.lines[1].price_thb, 150);
  assertEq("fix-id = 22 (the first zero one)", b.pcsfTransportFixId, "22");
}

console.log("computeForwarderDebitBatch — PCS999 exempt from PCSF +50");
{
  const b = computeForwarderDebitBatch(
    [row({ id: 31, fshipby: "PCSF", ftransportprice: 0, ftotalprice: 100 })],
    { userId: "PCS999", isCorporate: false },
  );
  assertClose("PCS999 PCSF row = 100 (no +50)", b.lines[0].price_thb, 100);
  assertEq("PCS999 no fix-id", b.pcsfTransportFixId, null);
  assertEq("PCS999 not flagged pcsf", b.lines[0].isPcsfFirst, false);
}

console.log("computeForwarderDebitBatch — corporate 1% allowance, batch ≥ ฿1000");
{
  // two rows summing to 1200 (≥1000) for a corporate customer → each −1%.
  const b = computeForwarderDebitBatch(
    [
      row({ id: 41, ftotalprice: 800 }),
      row({ id: 42, ftotalprice: 400 }),
    ],
    { userId: "PR900", isCorporate: true },
  );
  assertEq("corporate discount fired", b.applyCorporateDiscount, true);
  assertClose("row41 = 792 (800 − 1%)", b.lines[0].price_thb, 792);
  assertClose("row42 = 396 (400 − 1%)", b.lines[1].price_thb, 396);
  assertClose("batch total = 1188", b.total_thb, 1188);
}

console.log("computeForwarderDebitBatch — corporate but batch < ฿1000 → no discount");
{
  const b = computeForwarderDebitBatch(
    [row({ id: 51, ftotalprice: 900 })],
    { userId: "PR900", isCorporate: true },
  );
  assertEq("corporate discount NOT fired (< 1000)", b.applyCorporateDiscount, false);
  assertClose("row51 = 900 (full price)", b.lines[0].price_thb, 900);
}

console.log("computeForwarderDebitBatch — corporate + PCSF first-item interplay");
{
  // corporate, 2 PCSF-zero rows. First gets +50, batch sum then ≥1000 → 1% each.
  // bases: row(100+50=150 after pcsf), row(100). pre-corp total = 250 → < 1000 → no corp.
  const b1 = computeForwarderDebitBatch(
    [
      row({ id: 61, fshipby: "PCSF", ftransportprice: 0, ftotalprice: 100 }),
      row({ id: 62, fshipby: "PCSF", ftransportprice: 0, ftotalprice: 100 }),
    ],
    { userId: "PR900", isCorporate: true },
  );
  assertEq("small PCSF batch — no corp discount", b1.applyCorporateDiscount, false);
  assertClose("first = 150", b1.lines[0].price_thb, 150);

  // now make it cross 1000: row 600 + (pcsf 400+50=450) = 1050 ≥ 1000 → 1% each
  const b2 = computeForwarderDebitBatch(
    [
      row({ id: 71, ftotalprice: 600 }),
      row({ id: 72, fshipby: "PCSF", ftransportprice: 0, ftotalprice: 400 }),
    ],
    { userId: "PR900", isCorporate: true },
  );
  assertEq("big PCSF+corp batch — corp discount fired", b2.applyCorporateDiscount, true);
  assertEq("pcsf fix-id = 72", b2.pcsfTransportFixId, "72");
  // row71: 600 − 1% = 594 ; row72: (400+50) − 1% = 445.5
  assertClose("row71 = 594", b2.lines[0].price_thb, 594);
  assertClose("row72 = 445.5", b2.lines[1].price_thb, 445.5);
  assertClose("batch total = 1039.5", b2.total_thb, 1039.5);
}

console.log("computeForwarderDebitBatch — varchar coercion + NaN refusal");
{
  // legacy-style varchar inputs (strings)
  const b = computeForwarderDebitBatch(
    [row({ id: 81, ftotalprice: "1000", ftransportprice: "200", fdiscount: "100" })],
    { userId: "PR124", isCorporate: false },
  );
  assertClose("string columns coerce → 1100", b.lines[0].price_thb, 1100);

  // a row that nets ≤ 0 → NaN (refuse the debit; don't silently 0-charge)
  const bad = computeForwarderDebitBatch(
    [row({ id: 82, ftotalprice: 100, fdiscount: 100 })],
    { userId: "PR124", isCorporate: false },
  );
  assertTrue("zero-net row → NaN price", Number.isNaN(bad.lines[0].price_thb));
  assertEq("zero-net row excluded from total", bad.total_thb, 0);
}

console.log("computeForwarderDebitBatch — empty batch");
{
  const b = computeForwarderDebitBatch([], { userId: "PR124", isCorporate: false });
  assertEq("empty lines", b.lines.length, 0);
  assertEq("empty total", b.total_thb, 0);
  assertEq("empty fix-id", b.pcsfTransportFixId, null);
}

console.log(`\nforwarder-debit-total: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
