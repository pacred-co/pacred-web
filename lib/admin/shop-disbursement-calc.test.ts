/**
 * Unit tests for lib/admin/shop-disbursement-calc.ts — the pure amount /
 * eligibility math for the admin-PUSH "เบิกจ่ายค่าสินค้า" flow.
 *
 * Run: npx tsx lib/admin/shop-disbursement-calc.test.ts
 *
 * Asserts the legacy formulas from report-shops-profit-pay.php /
 * getListShop.php / print-report-shop.php satang-for-satang.
 */

import assert from "node:assert/strict";
import {
  roundUp,
  computeShopOrderAmounts,
  computeDisbursementTotals,
  isOrderStatusEligible,
} from "./shop-disbursement-calc";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("shop-disbursement-calc");

// ── roundUp (legacy ceil-to-precision) ────────────────────────────────
test("roundUp ceils to 2 decimals", () => {
  assert.equal(roundUp(10.001, 2), 10.01);
  assert.equal(roundUp(10.0001, 2), 10.01);
  assert.equal(roundUp(10.011, 2), 10.02);
});

test("roundUp leaves exact 2dp values untouched (no float over-ceil)", () => {
  assert.equal(roundUp(10.0, 2), 10.0);
  assert.equal(roundUp(10.5, 2), 10.5);
  assert.equal(roundUp(108621.38, 2), 108621.38);
  assert.equal(roundUp(1234.56, 2), 1234.56);
});

test("roundUp handles the 1.005 IEEE-754 boundary", () => {
  // 1.005 * 100 = 100.49999999999999 in float — without epsilon this
  // would ceil to 100.50 anyway (ceil rounds up), so confirm it stays.
  assert.equal(roundUp(1.005, 2), 1.01);
  // exact-multiple should NOT over-ceil
  assert.equal(roundUp(2.0, 2), 2.0);
  assert.equal(roundUp(0.07, 2), 0.07);
});

test("roundUp non-finite → 0", () => {
  assert.equal(roundUp(NaN, 2), 0);
  assert.equal(roundUp(Infinity, 2), 0);
});

// ── computeShopOrderAmounts (per-order margin) ─────────────────────────
test("computeShopOrderAmounts — cost keyed, normal margin", () => {
  // priceUser = round_up((1000 + 50) * 5, 2) = 5250
  // pricePCS  = round_up(4.5 * 1000, 2)      = 4500
  // profit    = 750 ; vat7 = 52.5
  const r = computeShopOrderAmounts({
    hno: "ONS220101-1",
    htotalpricechn: 1000,
    hshippingchn: 50,
    hrate: 5,
    hratecost: 4.5,
    hcostall: 1000,
  });
  assert.equal(r.priceUser, 5250);
  assert.equal(r.pricePCS, 4500);
  assert.equal(r.profit, 750);
  assert.equal(Math.round(r.vat7 * 100) / 100, 52.5);
  assert.equal(r.costKeyed, true);
});

test("computeShopOrderAmounts — cost NOT keyed (hCostAll=0) → pricePCS/profit 0 (รอคำนวณ)", () => {
  const r = computeShopOrderAmounts({
    hno: "ONS220101-2",
    htotalpricechn: 800,
    hshippingchn: 0,
    hrate: 5,
    hratecost: 0,
    hcostall: 0,
  });
  // priceUser still computed (= 4000)
  assert.equal(r.priceUser, 4000);
  // cost/profit zeroed because cost not yet keyed (legacy shows "รอคำนวณ")
  assert.equal(r.pricePCS, 0);
  assert.equal(r.profit, 0);
  assert.equal(r.costKeyed, false);
});

test("computeShopOrderAmounts — string inputs (PostgREST numeric→string) parse", () => {
  const r = computeShopOrderAmounts({
    hno: "ONS220101-3",
    htotalpricechn: "1000.00",
    hshippingchn: "50.00",
    hrate: "5.00",
    hratecost: "4.50",
    hcostall: "1000.00",
  });
  assert.equal(r.priceUser, 5250);
  assert.equal(r.pricePCS, 4500);
});

test("computeShopOrderAmounts — null inputs → 0 (no NaN leak)", () => {
  const r = computeShopOrderAmounts({
    hno: "ONS220101-4",
    htotalpricechn: null,
    hshippingchn: null,
    hrate: null,
    hratecost: null,
    hcostall: null,
  });
  assert.equal(r.priceUser, 0);
  assert.equal(r.pricePCS, 0);
  assert.equal(r.profit, 0);
  assert.equal(r.costKeyed, false);
});

// ── computeDisbursementTotals (batch amount = SUM(priceUser)) ──────────
test("computeDisbursementTotals — amount sums priceUser UNCONDITIONALLY", () => {
  // Order A: cost keyed → priceUser 5250, pricePCS 4500, profit 750
  // Order B: cost NOT keyed → priceUser 4000, pricePCS 0, profit 0
  const t = computeDisbursementTotals([
    { hno: "A", htotalpricechn: 1000, hshippingchn: 50, hrate: 5, hratecost: 4.5, hcostall: 1000 },
    { hno: "B", htotalpricechn: 800, hshippingchn: 0, hrate: 5, hratecost: 0, hcostall: 0 },
  ]);
  // Batch amount = SUM(priceUser) across BOTH = 5250 + 4000 = 9250
  assert.equal(t.priceUserAll, 9250);
  // Cost/profit only from cost-keyed A
  assert.equal(t.pricePCSAll, 4500);
  assert.equal(t.profitAll, 750);
  assert.equal(t.vat7All, 52.5);
  assert.equal(t.rows.length, 2);
});

test("computeDisbursementTotals — empty input → all zero", () => {
  const t = computeDisbursementTotals([]);
  assert.equal(t.priceUserAll, 0);
  assert.equal(t.pricePCSAll, 0);
  assert.equal(t.profitAll, 0);
  assert.equal(t.vat7All, 0);
  assert.equal(t.rows.length, 0);
});

test("computeDisbursementTotals — realistic legacy batch (108621.38 scale stays clean)", () => {
  // A real legacy batch amount was 108621.38 (tb_shop_pay_h.id=1).
  // Build 2 orders summing to that and confirm no float dust.
  const t = computeDisbursementTotals([
    { hno: "X", htotalpricechn: 10862.138, hshippingchn: 0, hrate: 5, hratecost: 4, hcostall: 1000 },
    { hno: "Y", htotalpricechn: 10862.138, hshippingchn: 0, hrate: 5, hratecost: 4, hcostall: 1000 },
  ]);
  // priceUser each = round_up(10862.138*5,2)=round_up(54310.69,2)=54310.69
  // sum = 108621.38
  assert.equal(t.priceUserAll, 108621.38);
});

// ── isOrderStatusEligible (status side of the gate) ────────────────────
test("isOrderStatusEligible — hStatus>2, <>6, hShopPay NULL → eligible", () => {
  assert.equal(isOrderStatusEligible({ hstatus: "3", hshoppay: null }), true);
  assert.equal(isOrderStatusEligible({ hstatus: "4", hshoppay: null }), true);
  assert.equal(isOrderStatusEligible({ hstatus: "5", hshoppay: null }), true);
  assert.equal(isOrderStatusEligible({ hstatus: 5, hshoppay: "" }), true);
});

test("isOrderStatusEligible — hStatus<=2 → NOT eligible", () => {
  assert.equal(isOrderStatusEligible({ hstatus: "1", hshoppay: null }), false);
  assert.equal(isOrderStatusEligible({ hstatus: "2", hshoppay: null }), false);
});

test("isOrderStatusEligible — hStatus=6 (cancelled) → NOT eligible", () => {
  assert.equal(isOrderStatusEligible({ hstatus: "6", hshoppay: null }), false);
});

test("isOrderStatusEligible — already disbursed (hShopPay='1') → NOT eligible", () => {
  assert.equal(isOrderStatusEligible({ hstatus: "5", hshoppay: "1" }), false);
  assert.equal(isOrderStatusEligible({ hstatus: "4", hshoppay: "1" }), false);
});

test("isOrderStatusEligible — non-numeric hStatus → NOT eligible (guarded)", () => {
  assert.equal(isOrderStatusEligible({ hstatus: null, hshoppay: null }), false);
  assert.equal(isOrderStatusEligible({ hstatus: "abc", hshoppay: null }), false);
});

console.log(`\n${passed} passed`);
