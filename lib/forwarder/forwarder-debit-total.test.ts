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
    ftrackingchn: p.ftrackingchn ?? null,
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

console.log("computeForwarderDebitBatch — PCSF/PRF first-item เหมาๆ ฿100");
{
  // 2 เหมาๆ-zero rows. Only the FIRST gets +100 + the transport-fix id.
  const b = computeForwarderDebitBatch(
    [
      row({ id: 11, fshipby: "PCSF", ftransportprice: 0, ftotalprice: 100 }),
      row({ id: 12, fshipby: "PCSF", ftransportprice: 0, ftotalprice: 100 }),
    ],
    { userId: "PR124", isCorporate: false },
  );
  assertClose("first PCSF = 200 (+100)", b.lines[0].price_thb, 200);
  assertClose("second PCSF = 100 (free transport)", b.lines[1].price_thb, 100);
  assertEq("first flagged pcsf", b.lines[0].isPcsfFirst, true);
  assertEq("second not flagged", b.lines[1].isPcsfFirst, false);
  assertEq("fix-id = 11", b.pcsfTransportFixId, "11");
  // total = 200 + 100 = 300 — the ฿100 appears exactly ONCE
  assertClose("batch total = 300 (single ฿100)", b.total_thb, 300);
}
// PRF (rebrand alias) is recognised exactly like PCSF.
{
  const b = computeForwarderDebitBatch(
    [row({ id: 13, fshipby: "PRF", ftransportprice: 0, ftotalprice: 100 })],
    { userId: "PR124", isCorporate: false },
  );
  assertClose("PRF first = 200 (+100)", b.lines[0].price_thb, 200);
  assertEq("PRF flagged pcsf", b.lines[0].isPcsfFirst, true);
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
  assertClose("row21 = 150 (its own 50 transport, no เหมาๆ)", b.lines[0].price_thb, 150);
  assertClose("row22 = 200 (first zero-PCSF gets +100)", b.lines[1].price_thb, 200);
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
  // corporate, 2 PCSF-zero rows. First gets +100, batch sum then ≥1000 → 1% each.
  // bases: row(100+100=200 after เหมาๆ), row(100). pre-corp total = 300 → < 1000 → no corp.
  const b1 = computeForwarderDebitBatch(
    [
      row({ id: 61, fshipby: "PCSF", ftransportprice: 0, ftotalprice: 100 }),
      row({ id: 62, fshipby: "PCSF", ftransportprice: 0, ftotalprice: 100 }),
    ],
    { userId: "PR900", isCorporate: true },
  );
  assertEq("small PCSF batch — no corp discount", b1.applyCorporateDiscount, false);
  assertClose("first = 200", b1.lines[0].price_thb, 200);

  // now make it cross 1000: row 600 + (เหมาๆ 400+100=500) = 1100 ≥ 1000 → 1% each
  const b2 = computeForwarderDebitBatch(
    [
      row({ id: 71, ftotalprice: 600 }),
      row({ id: 72, fshipby: "PCSF", ftransportprice: 0, ftotalprice: 400 }),
    ],
    { userId: "PR900", isCorporate: true },
  );
  assertEq("big PCSF+corp batch — corp discount fired", b2.applyCorporateDiscount, true);
  assertEq("pcsf fix-id = 72", b2.pcsfTransportFixId, "72");
  // row71: 600 − 1% = 594 ; row72: (400+100) − 1% = 495
  assertClose("row71 = 594", b2.lines[0].price_thb, 594);
  assertClose("row72 = 495", b2.lines[1].price_thb, 495);
  assertClose("batch total = 1089", b2.total_thb, 1089);
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

console.log("computeForwarderDebitBatch — itemised breakdown (owner: แจงรายละเอียดค่า)");
{
  // เหมาๆ-zero juristic batch ≥1000: freight 1000 + other 200 - disc 100 + เหมาๆ 100 = 1200; 1% off
  const b = computeForwarderDebitBatch(
    [row({ id: 90, fshipby: "PCSF", ftransportprice: 0, ftotalprice: "1000", fpriceupdate: "200", fdiscount: "100" })],
    { userId: "PR130", isCorporate: true },
  );
  const bd = b.lines[0].breakdown;
  assertClose("breakdown.freight", bd.freight, 1000);
  assertClose("breakdown.otherCharges", bd.otherCharges, 200);
  assertClose("breakdown.discount", bd.discount, 100);
  assertEq("breakdown.maoFee (first เหมาๆ-zero) = 100", bd.maoFee, 100);
  assertClose("breakdown.wht1pct = 1% of 1200", bd.wht1pct, 12);
  assertClose("breakdown.total = 1200 - 12", bd.total, 1188);
  assertClose("breakdown.total === price_thb", bd.total, b.lines[0].price_thb);
  assertClose("components reconcile to total", bd.freight + bd.otherCharges + bd.maoFee - bd.discount - bd.wht1pct, bd.total);
}
{
  // non-PCSF personal small order: no maoFee, no wht
  const b = computeForwarderDebitBatch(
    [row({ id: 91, fshipby: "Flash", ftransportprice: 0, ftotalprice: "45.10" })],
    { userId: "PR131", isCorporate: false },
  );
  const bd = b.lines[0].breakdown;
  assertEq("no PCSF → maoFee=0", bd.maoFee, 0);
  assertEq("personal → wht1pct=0", bd.wht1pct, 0);
  assertClose("total = freight", bd.total, 45.1);
}

// ── เหมาๆ anchored to the BASE tracking per shipment (owner 2026-06-23 · กันเก็บตังเบิ้ล) ──
// When rows carry ftrackingchn, the ฿100 fee fires on the base tracking (suffix 0)
// ONLY — never on a -N sub-row. This makes the fee deterministic per shipment across
// ANY pay path (whole-batch OR line-by-line in separate actions).
console.log("computeForwarderDebitBatch — เหมาๆ anchored to base tracking");
{
  // whole shipment (base + 2 sub-rows), all PCSF-zero → fee ONCE on the base row.
  const b = computeForwarderDebitBatch(
    [
      row({ id: 1, ftrackingchn: "1780103566",   fshipby: "PRF", ftransportprice: 0, ftotalprice: 100 }),
      row({ id: 2, ftrackingchn: "1780103566-2", fshipby: "PRF", ftransportprice: 0, ftotalprice: 100 }),
      row({ id: 3, ftrackingchn: "1780103566-3", fshipby: "PRF", ftransportprice: 0, ftotalprice: 100 }),
    ],
    { userId: "PR106", isCorporate: false },
  );
  assertClose("base row carries +100", b.lines[0].price_thb, 200);
  assertClose("sub-row -2 no fee", b.lines[1].price_thb, 100);
  assertClose("sub-row -3 no fee", b.lines[2].price_thb, 100);
  assertEq("fix-id = base row", b.pcsfTransportFixId, "1");
  assertClose("batch total = 400 (300 + one ฿100)", b.total_thb, 400);
}
// ── B1 (2026-07-13) N-box เหมาๆ = ฿100 ONCE ─────────────────────────────────
// resolveAutoThShippingFill now auto-fills a เหมาๆ row as PRF · ftransportprice ฿0
// (NOT ฿100). This test asserts the payoff: N such box-split PRF-zero rows of one
// shipment are charged ฿100 exactly ONCE (the anchor), never N×฿100. Before B1 the
// auto-fill stamped ฿100 into each row's ftransportprice → isPcsfZero(row) went false
// (ftransportprice≠0) → the anchor stopped counting them AND each row's ฿100 folded
// into otherCharges → an N-box เหมาๆ shipment billed N×฿100. ฿0 rows restore ฿100-once.
console.log("computeForwarderDebitBatch — B1 N-box เหมาๆ (PRF-zero) = ฿100 once");
{
  const N = 6;
  const boxes = Array.from({ length: N }, (_, i) =>
    row({
      id: 100 + i,
      ftrackingchn: i === 0 ? "KY7788" : `KY7788-${i + 1}/${N}`, // base (suffix 0) + -N/M siblings
      fshipby: i % 2 === 0 ? "PRF" : "PCSF",                     // legacy + rebrand both count
      ftransportprice: 0,                                        // B1: auto-fill leaves ฿0
      ftotalprice: 250,
    }),
  );
  const b = computeForwarderDebitBatch(boxes, { userId: "PR200", isCorporate: false });
  // 6 × 250 freight = 1500 · เหมาๆ ฿100 ONCE = 1600 (NOT 1500 + 6×100 = 2100)
  assertClose("B1: 6-box เหมาๆ shipment = ฿100 once (1600, not 2100)", b.total_thb, 1600);
  assertEq("B1: exactly one เหมาๆ anchor (the base row)", b.lines.filter((l) => l.isPcsfFirst).length, 1);
  assertEq("B1: anchor is the base tracking row", b.pcsfTransportFixId, "100");
  assertClose("B1: each non-anchor box = plain ฿250 (no per-row ฿100)", b.lines[1].price_thb, 250);
}
{
  // LINE-BY-LINE (the double-charge case): paying a -N sub-row ALONE → NO fee
  // (the base row carries it); paying the base row alone → fee once. Old logic
  // would have charged ฿100 on EACH solo batch.
  const sub = computeForwarderDebitBatch(
    [row({ id: 2, ftrackingchn: "1780103566-2", fshipby: "PRF", ftransportprice: 0, ftotalprice: 100 })],
    { userId: "PR106", isCorporate: false },
  );
  assertClose("solo -N row → no เหมาๆ (was the double)", sub.lines[0].price_thb, 100);
  assertEq("solo -N row → no fix-id", sub.pcsfTransportFixId, null);
  const baseRow = computeForwarderDebitBatch(
    [row({ id: 1, ftrackingchn: "1780103566", fshipby: "PRF", ftransportprice: 0, ftotalprice: 100 })],
    { userId: "PR106", isCorporate: false },
  );
  assertClose("solo base row → เหมาๆ once", baseRow.lines[0].price_thb, 200);
}
{
  // back-compat: NO ftrackingchn → legacy first-PCSF-in-batch behaviour unchanged.
  const b = computeForwarderDebitBatch(
    [
      row({ id: 1, fshipby: "PRF", ftransportprice: 0, ftotalprice: 100 }),
      row({ id: 2, fshipby: "PRF", ftransportprice: 0, ftotalprice: 100 }),
    ],
    { userId: "PR106", isCorporate: false },
  );
  assertClose("legacy: first row +100", b.lines[0].price_thb, 200);
  assertClose("legacy: second row no fee", b.lines[1].price_thb, 100);
}

console.log(`\nforwarder-debit-total: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
