/**
 * Locks the MOMO invoice ⇄ system reconcile math.
 *
 * The two assertions that matter most are the NORMALISATIONS — both are silently
 * money-wrong if a future edit drops them:
 *   · a `per_box` invoice's CBM column × qty  (else MOMO's billed CBM reads low)
 *   · Σ over MATCHED rows only                (else an unfound line fakes a profit)
 *
 * Run: tsx lib/admin/momo-invoice-reconcile.test.ts
 */
import assert from "node:assert/strict";
import { invoiceLineCbm, buildReconcileTotals, type ReconcileRow } from "./momo-invoice-reconcile";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("invoiceLineCbm — the invoice's CBM column → line total");

ok("line_total basis: the column IS the line total", () => {
  assert.equal(invoiceLineCbm({ cbm: 2.0366, qty: 6 }, "line_total"), 2.0366);
});

ok("per_box basis: the column is ONE box → × qty", () => {
  assert.equal(invoiceLineCbm({ cbm: 0.3108, qty: 5 }, "per_box"), 1.554);
});

ok("per_box with qty 1 == line_total (the readings agree on 1-box lines)", () => {
  assert.equal(
    invoiceLineCbm({ cbm: 0.42, qty: 1 }, "per_box"),
    invoiceLineCbm({ cbm: 0.42, qty: 1 }, "line_total"),
  );
});

ok("per_box with a missing/zero qty falls back to 1 box (never × 0)", () => {
  assert.equal(invoiceLineCbm({ cbm: 0.5, qty: 0 }, "per_box"), 0.5);
  assert.equal(invoiceLineCbm({ cbm: 0.5, qty: null }, "per_box"), 0.5);
});

ok("null basis reads as the line total (parser only nulls it when it cannot matter)", () => {
  assert.equal(invoiceLineCbm({ cbm: 1.25, qty: 3 }, null), 1.25);
});

ok("zero / null / non-finite cbm → 0, never NaN", () => {
  assert.equal(invoiceLineCbm({ cbm: 0, qty: 4 }, "per_box"), 0);
  assert.equal(invoiceLineCbm({ cbm: null, qty: 4 }, "line_total"), 0);
  assert.equal(invoiceLineCbm({ cbm: Number.NaN, qty: 2 }, "per_box"), 0);
});

ok("6dp is preserved — we store 6dp, MOMO prints 4dp", () => {
  assert.equal(invoiceLineCbm({ cbm: 0.089812, qty: 1 }, "line_total"), 0.089812);
});

console.log("\nbuildReconcileTotals — the four answers the accountant needs");

const matched = (over: Partial<ReconcileRow> = {}): ReconcileRow => ({
  matched: true,
  invoiceCbm: 1,
  ourCbm: 1,
  invoiceCost: 2500,
  currentCost: 2500,
  ourSell: 3700,
  ...over,
});

ok("empty input → all zeros, no NaN", () => {
  const t = buildReconcileTotals([]);
  assert.equal(t.lines, 0);
  assert.equal(t.cbmDiff, 0);
  assert.equal(t.costDiff, 0);
  assert.equal(t.profitDiff, 0);
  assert.equal(t.profitNow, 0);
});

ok("cost/profit when MOMO bills MORE than we booked → กำไรลด", () => {
  // stored cost 2,500 (the คิว × 2,500 estimate) · MOMO actually billed 3,000
  const t = buildReconcileTotals([matched({ invoiceCost: 3000, currentCost: 2500, ourSell: 3700 })]);
  assert.equal(t.costDiff, 500, "+500 = MOMO เก็บมากกว่าที่ระบบบันทึก");
  assert.equal(t.profitNow, 1200, "3700 − 2500");
  assert.equal(t.profitAfter, 700, "3700 − 3000");
  assert.equal(t.profitDiff, -500, "บันทึกใบนี้แล้วกำไรลด 500");
});

ok("cost/profit when MOMO bills LESS than we booked → กำไรเพิ่ม", () => {
  const t = buildReconcileTotals([matched({ invoiceCost: 2200, currentCost: 2500, ourSell: 3700 })]);
  assert.equal(t.costDiff, -300);
  assert.equal(t.profitAfter, 1500);
  assert.equal(t.profitDiff, 300);
});

ok("profitDiff is always exactly −costDiff (the two boxes can never disagree)", () => {
  const t = buildReconcileTotals([
    matched({ invoiceCost: 3000.55, currentCost: 2500.1, ourSell: 4100.9 }),
    matched({ invoiceCost: 1200.25, currentCost: 1500.4, ourSell: 1800.05 }),
  ]);
  assert.equal(t.profitDiff, -t.costDiff);
});

ok("CBM diff: + means our system holds more คิว than MOMO billed", () => {
  const t = buildReconcileTotals([matched({ ourCbm: 2.5, invoiceCbm: 2.0 })]);
  assert.equal(t.cbmDiff, 0.5);
});

ok("CBM diff: − means MOMO billed more คิว than our system holds", () => {
  const t = buildReconcileTotals([matched({ ourCbm: 1.8, invoiceCbm: 2.0366 })]);
  assert.equal(t.cbmDiff, -0.2366);
});

ok("🔴 UNMATCHED lines are held OUT of every comparison Σ, and reported", () => {
  const t = buildReconcileTotals([
    matched({ invoiceCost: 2500, currentCost: 2500, ourSell: 3700, invoiceCbm: 1, ourCbm: 1 }),
    { matched: false, invoiceCbm: 5, ourCbm: null, invoiceCost: 9999, currentCost: null, ourSell: null },
  ]);
  assert.equal(t.lines, 2);
  assert.equal(t.matchedLines, 1);
  assert.equal(t.unmatchedLines, 1);
  // the whole bill is still visible…
  assert.equal(t.invoiceCostAll, 12499);
  assert.equal(t.invoiceCbmAll, 6);
  // …but the comparison Σ only spans what we could actually compare
  assert.equal(t.invoiceCost, 2500);
  assert.equal(t.invoiceCbm, 1);
  assert.equal(t.unmatchedCost, 9999);
  // and an unfound ฿9,999 line can NOT masquerade as profit
  assert.equal(t.profitAfter, 1200);
  assert.equal(t.cbmDiff, 0);
});

ok("a matched-but-unpriced row (ftotalprice 0) is counted, not hidden", () => {
  const t = buildReconcileTotals([
    matched({ ourSell: 0, invoiceCost: 2500, currentCost: 2500 }),
    matched({ ourSell: 3700, invoiceCost: 2500, currentCost: 2500 }),
  ]);
  assert.equal(t.sellMissingLines, 1, "screen must be able to say ยังไม่ตั้งราคา 1 รายการ");
  assert.equal(t.sell, 3700);
  assert.equal(t.profitAfter, -1300, "genuinely negative until that row is priced");
});

ok("null cost/sell/cbm on a matched row count as 0, never NaN", () => {
  const t = buildReconcileTotals([
    { matched: true, invoiceCbm: 1, ourCbm: null, invoiceCost: 100, currentCost: null, ourSell: null },
  ]);
  assert.equal(t.ourCbm, 0);
  assert.equal(t.currentCost, 0);
  assert.equal(t.sell, 0);
  assert.equal(t.costDiff, 100);
  assert.equal(t.profitAfter, -100);
});

ok("satang rounding: many lines still foot to 2dp exactly", () => {
  const t = buildReconcileTotals([
    matched({ invoiceCost: 10.115, currentCost: 0, ourSell: 0 }),
    matched({ invoiceCost: 10.115, currentCost: 0, ourSell: 0 }),
    matched({ invoiceCost: 10.115, currentCost: 0, ourSell: 0 }),
  ]);
  assert.equal(t.invoiceCost, 30.35);
  assert.equal(t.invoiceCostAll, 30.35);
});

ok("real shape: INV-20260708-0002 GZS260620-2 partial round (3 of 7 rows)", () => {
  // The documented prod case: the invoice bills 3 rows for ฿10,858.25 while the
  // container's Σ stored cost is ฿19,470.33 — the other 4 rows are still estimates.
  const t = buildReconcileTotals([
    matched({ invoiceCost: 5091.5, currentCost: 5091.5, ourSell: 7200, invoiceCbm: 2.0366, ourCbm: 2.036604 }),
    matched({ invoiceCost: 34.78, currentCost: 40, ourSell: 60, invoiceCbm: 0.0139, ourCbm: 0.0139 }),
    matched({ invoiceCost: 181.42, currentCost: 200, ourSell: 300, invoiceCbm: 0.0726, ourCbm: 0.0726 }),
  ]);
  assert.equal(t.matchedLines, 3);
  assert.equal(t.invoiceCost, 5307.7);
  assert.equal(t.currentCost, 5331.5);
  assert.equal(t.costDiff, -23.8, "MOMO บิลถูกกว่าที่ประเมินไว้ 23.80");
  assert.equal(t.sell, 7560);
  assert.equal(t.profitNow, 2228.5);
  assert.equal(t.profitAfter, 2252.3);
  assert.equal(t.profitDiff, 23.8);
  // 6dp survives the 4dp-vs-6dp compare instead of inventing a diff
  assert.equal(t.cbmDiff, 0.000004);
});

console.log(`\n✅ momo-invoice-reconcile: ${passed} assertions passed`);
