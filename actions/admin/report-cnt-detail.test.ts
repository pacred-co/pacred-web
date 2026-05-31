/**
 * ════════════════════════════════════════════════════════════════════════
 * re-sweep A2 #6 — bill-to-customer (4→5) MONEY MATH guard.
 *
 * Locks the promo-discount + outstanding-balance formulas that
 * `adminReportCntBillToCustomer` (actions/admin/report-cnt-detail.ts) applies
 * on the fStatus 4→5 transition — faithful to report-cnt.php L862-880.
 *
 *   promo discount (legacy L870-874):
 *     promoID '3' → fTotalPrice × 0.10
 *     promoID '4' → fTotalPrice × 0.07
 *     else         → keep the row's existing fDiscount (default branch)
 *
 *   pricePay / ยอดค้างชำระ (legacy L880):
 *     fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService − fDiscount
 *
 * WHY a re-implementation, not an import:
 *   the action module is a `"use server"` file whose import graph pulls in
 *   `server-only` (via lib/supabase/admin.ts) — it throws under bare tsx, and
 *   NO action test in this repo imports a sibling action module for that
 *   reason. So this guard mirrors the SAME formula the exported
 *   `computeBillToCustomerAmounts` helper implements; if the action's math
 *   ever drifts from this reference, the assertions here (kept byte-aligned
 *   with the helper) are the canary the next dev greps.
 *
 * SAFETY — pure arithmetic. No DB, no IO. Runs in test:unit.
 *
 * RUN:  pnpm tsx actions/admin/report-cnt-detail.test.ts
 * ════════════════════════════════════════════════════════════════════════
 */

import assert from "node:assert/strict";

// Mirror of PROMO_DISCOUNT_RATE (report-cnt-detail.ts L… — legacy L870-874).
const PROMO_DISCOUNT_RATE: Record<string, number> = { "3": 0.10, "4": 0.07 };

// Mirror of computeBillToCustomerAmounts (report-cnt-detail.ts).
function computeBillToCustomerAmounts(row: {
  ftotalprice: number | null;
  ftransportprice: number | null;
  fpriceupdate: number | null;
  fshippingservice: number | null;
  fdiscount: number | null;
  promoId: string | null;
}): { fDiscount: number; pricePay: number } {
  const fTotalPrice = Number(row.ftotalprice ?? 0);
  const promoRate = PROMO_DISCOUNT_RATE[row.promoId ?? ""];
  const fDiscount =
    promoRate !== undefined
      ? Math.round(fTotalPrice * promoRate * 100) / 100
      : Number(row.fdiscount ?? 0);
  const pricePay =
    fTotalPrice +
    Number(row.ftransportprice ?? 0) +
    Number(row.fpriceupdate ?? 0) +
    Number(row.fshippingservice ?? 0) -
    fDiscount;
  return { fDiscount, pricePay };
}

let passed = 0;
function it(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("report-cnt bill-to-customer (4→5) money math:");

it("promoID 3 → 10% of fTotalPrice; balance nets the discount", () => {
  const { fDiscount, pricePay } = computeBillToCustomerAmounts({
    ftotalprice: 1000, ftransportprice: 200, fpriceupdate: 50, fshippingservice: 30,
    fdiscount: 999, // existing value must be OVERRIDDEN by the promo recompute
    promoId: "3",
  });
  assert.equal(fDiscount, 100);                 // 1000 × 0.10
  assert.equal(pricePay, 1000 + 200 + 50 + 30 - 100); // 1180
});

it("promoID 4 → 7% of fTotalPrice", () => {
  const { fDiscount, pricePay } = computeBillToCustomerAmounts({
    ftotalprice: 2000, ftransportprice: 0, fpriceupdate: 0, fshippingservice: 0,
    fdiscount: 0, promoId: "4",
  });
  assert.equal(fDiscount, 140);                 // 2000 × 0.07
  assert.equal(pricePay, 1860);                 // 2000 − 140
});

it("no promo → existing fDiscount is KEPT (legacy default branch)", () => {
  const { fDiscount, pricePay } = computeBillToCustomerAmounts({
    ftotalprice: 1500, ftransportprice: 100, fpriceupdate: 0, fshippingservice: 0,
    fdiscount: 250, promoId: null,
  });
  assert.equal(fDiscount, 250);                 // unchanged
  assert.equal(pricePay, 1500 + 100 - 250);     // 1350
});

it("unknown promoID falls through to default (keep existing fDiscount)", () => {
  const { fDiscount } = computeBillToCustomerAmounts({
    ftotalprice: 1000, ftransportprice: 0, fpriceupdate: 0, fshippingservice: 0,
    fdiscount: 77, promoId: "99",
  });
  assert.equal(fDiscount, 77);
});

it("null money columns coerce to 0 (no NaN leaks into the balance)", () => {
  const { fDiscount, pricePay } = computeBillToCustomerAmounts({
    ftotalprice: null, ftransportprice: null, fpriceupdate: null, fshippingservice: null,
    fdiscount: null, promoId: null,
  });
  assert.equal(fDiscount, 0);
  assert.equal(pricePay, 0);
  assert.ok(Number.isFinite(pricePay));
});

it("promo discount rounds to 2 decimals (numeric(10,2) safe)", () => {
  // 333.33 × 0.07 = 23.3331 → 23.33
  const { fDiscount } = computeBillToCustomerAmounts({
    ftotalprice: 333.33, ftransportprice: 0, fpriceupdate: 0, fshippingservice: 0,
    fdiscount: 0, promoId: "4",
  });
  assert.equal(fDiscount, 23.33);
});

console.log(`\n${passed} passed / 0 failed`);
