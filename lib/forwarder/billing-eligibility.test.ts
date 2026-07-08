/**
 * Unit tests for the 2026-06-14 money fixes on the วางบิล / ใบเสร็จ path:
 *
 *   BUG A — revenue leak: the billing-run line amount must be the FULL
 *     composite (calcForwarderOutstanding = Σ 7 price columns − discount −
 *     1% juristic), NOT ftotalprice alone. We assert the bill total ==
 *     Σ calcForwarderOutstanding over the rows.
 *
 *   BUG B — credit orders invisible: isBillableForwarder must accept BOTH
 *     the awaiting-payment cohort (fstatus='5') and the credit-unsettled
 *     cohort (fstatus 5/6 · fcredit='1' · paydeposit<>'1' · fstatus<>'99').
 *
 * Pure, no IO. Run: pnpm tsx lib/forwarder/billing-eligibility.test.ts
 * (wired into pnpm test:unit + pnpm test).
 */

import {
  isAwaitingPaymentEligible,
  isCreditUnsettledEligible,
  isAdvanceBillEligible,
  isBillableForwarder,
  isBillingRunEligible,
  isCheckedArrivedForwarder,
  type ForwarderBillingEligibilityFields,
} from "./billing-eligibility";
import {
  calcForwarderOutstanding,
  type ForwarderPriceFields,
} from "./outstanding";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// ── Builders ─────────────────────────────────────────────────────────
function gate(o: Partial<ForwarderBillingEligibilityFields>): ForwarderBillingEligibilityFields {
  return { fstatus: null, fcredit: null, paydeposit: null, ...o };
}

/** Full price row (all 0/null) + the eligibility flags, with overrides. */
function fullRow(
  o: Partial<ForwarderPriceFields & ForwarderBillingEligibilityFields>,
): ForwarderPriceFields & ForwarderBillingEligibilityFields {
  return {
    ftotalprice: 0, ftransportprice: 0, fpriceupdate: 0, fshippingservice: 0,
    pricecrate: 0, ftransportpricechnthb: 0, priceother: 0, fdiscount: 0,
    fusercompany: null, fstatus: null, fcredit: null, paydeposit: null, ...o,
  };
}

// ─────────────────────────────────────────────────────────────────────
// BUG B — eligibility predicate
// ─────────────────────────────────────────────────────────────────────

section("BUG B · isAwaitingPaymentEligible (cohort A)");
assertEq("fstatus='5' → eligible", isAwaitingPaymentEligible(gate({ fstatus: "5" })), true);
assertEq("fstatus='6' → NOT cohort A", isAwaitingPaymentEligible(gate({ fstatus: "6" })), false);
assertEq("fstatus='5' with surrounding space → eligible (trim)", isAwaitingPaymentEligible(gate({ fstatus: " 5 " })), true);
assertEq("fstatus=null → not eligible", isAwaitingPaymentEligible(gate({ fstatus: null })), false);

section("BUG B · isCreditUnsettledEligible (cohort B)");
assertEq("credit unsettled at fstatus='5' → eligible",
  isCreditUnsettledEligible(gate({ fstatus: "5", fcredit: "1", paydeposit: "0" })), true);
assertEq("credit unsettled at fstatus='6' → eligible (the key BUG B case)",
  isCreditUnsettledEligible(gate({ fstatus: "6", fcredit: "1", paydeposit: "0" })), true);
assertEq("credit but paydeposit='1' (settled) → NOT eligible",
  isCreditUnsettledEligible(gate({ fstatus: "6", fcredit: "1", paydeposit: "1" })), false);
assertEq("credit at fstatus='99' (cancelled) → NOT eligible",
  isCreditUnsettledEligible(gate({ fstatus: "99", fcredit: "1", paydeposit: "0" })), false);
assertEq("credit at fstatus='4' (pre-billable stage) → NOT eligible",
  isCreditUnsettledEligible(gate({ fstatus: "4", fcredit: "1", paydeposit: "0" })), false);
assertEq("not credit (fcredit='0') at fstatus='6' → NOT cohort B",
  isCreditUnsettledEligible(gate({ fstatus: "6", fcredit: "0", paydeposit: "0" })), false);
assertEq("paydeposit null treated as unsettled → eligible",
  isCreditUnsettledEligible(gate({ fstatus: "6", fcredit: "1", paydeposit: null })), true);

section("BUG B · isBillableForwarder (union)");
assertEq("plain awaiting-payment fstatus='5' → billable",
  isBillableForwarder(gate({ fstatus: "5" })), true);
assertEq("credit unsettled fstatus='6' → billable (was INVISIBLE before fix)",
  isBillableForwarder(gate({ fstatus: "6", fcredit: "1", paydeposit: "0" })), true);
assertEq("non-credit fstatus='6' → NOT billable (no false-positive)",
  isBillableForwarder(gate({ fstatus: "6", fcredit: "0" })), false);
assertEq("settled credit fstatus='6' paydeposit='1' → NOT billable",
  isBillableForwarder(gate({ fstatus: "6", fcredit: "1", paydeposit: "1" })), false);
assertEq("cancelled fstatus='99' → NOT billable",
  isBillableForwarder(gate({ fstatus: "99", fcredit: "1", paydeposit: "0" })), false);

// ─────────────────────────────────────────────────────────────────────
// BUG A — bill total == Σ calcForwarderOutstanding (the under-charge)
// ─────────────────────────────────────────────────────────────────────
//
// This mirrors createBillingRunInvoice's (d) step: subtotal = Σ of the
// per-line outstanding over the selected rows; each line's amount_thb =
// that same per-line outstanding. So the bill subtotal MUST equal the sum.

section("BUG A · bill subtotal == Σ calcForwarderOutstanding");

// Three realistic rows where ftotalprice is only ONE of the 7 columns.
const billRows: Array<ForwarderPriceFields & ForwarderBillingEligibilityFields> = [
  fullRow({
    fstatus: "5",
    ftotalprice: 1000, ftransportprice: 200, fpriceupdate: 50,
    fshippingservice: 30, pricecrate: 20, ftransportpricechnthb: 10,
    priceother: 5, fdiscount: 15,
  }), // outstanding = 1300
  fullRow({
    fstatus: "6", fcredit: "1", paydeposit: "0",
    ftotalprice: 500, ftransportprice: 100, priceother: 25, fdiscount: 25,
  }), // outstanding = 600 (credit order — only counted because BUG B fix)
  fullRow({
    fstatus: "5", fusercompany: "1",
    ftotalprice: 2000, ftransportprice: 0, fdiscount: 0,
  }), // juristic 1% → outstanding = 1980
];

// Per-line amounts the action writes (= what the customer is billed per line).
const perLine = billRows.map((r) => calcForwarderOutstanding(r));
assertEq("per-line outstanding values", perLine, [1300, 600, 1980]);

// The header subtotal the action stores = Σ of the per-line amounts.
const billSubtotal = perLine.reduce((s, n) => s + n, 0);
assertEq("bill subtotal == Σ calcForwarderOutstanding", billSubtotal, 3880);

// The OLD (buggy) subtotal that used ftotalprice alone — proves the leak size.
const buggySubtotal = billRows.reduce((s, r) => s + Number(r.ftotalprice ?? 0), 0);
assertEq("buggy ftotalprice-only subtotal was LOWER (the leak)", buggySubtotal, 3500);
assertEq("leak amount the fix recovers", billSubtotal - buggySubtotal, 380);

// Final total = subtotal + admin adjustments (additional, never inside the
// composite → no double-count). e.g. +CHN 100, +TH 50, +other 0, −discount 80.
const finalTotal = Math.max(0, billSubtotal + 100 + 50 + 0 - 80);
assertEq("final total = subtotal + adjustments (no double-count)", finalTotal, 3950);

// ── Cohort C — ADVANCE bill (owner 2026-06-23 · gated on the เฟิม flag, SAFE-default) ──
section("cohort C — advance billing (fstatus 2/3/4, confirmed + priced)");
// SAFE-DEFAULT: not confirmed → never advance-billable (so shipping it changes nothing).
assertEq("fstatus 2, NOT confirmed → no advance bill",
  isAdvanceBillEligible(gate({ fstatus: "2", ftotalprice: 1000 })), false);
assertEq("fstatus 2 confirmed + priced → advance billable",
  isAdvanceBillEligible(gate({ fstatus: "2", advance_bill_confirmed: "1", ftotalprice: 1000 })), true);
assertEq("fstatus 3 confirmed + priced → billable",
  isAdvanceBillEligible(gate({ fstatus: "3", advance_bill_confirmed: "1", ftotalprice: 1 })), true);
assertEq("fstatus 4 confirmed + priced → billable",
  isAdvanceBillEligible(gate({ fstatus: "4", advance_bill_confirmed: "1", ftotalprice: 1 })), true);
assertEq("confirmed (bool true) + priced → billable",
  isAdvanceBillEligible(gate({ fstatus: "2", advance_bill_confirmed: true, ftotalprice: 1 })), true);
assertEq("confirmed but ฿0 (unmeasured) → NOT billable (กันเก็บตังมั่ว)",
  isAdvanceBillEligible(gate({ fstatus: "2", advance_bill_confirmed: "1", ftotalprice: 0 })), false);
assertEq("confirmed but fstatus 1 (รอเข้าโกดัง · ของยังไม่ถึง MOMO) → no advance bill",
  isAdvanceBillEligible(gate({ fstatus: "1", advance_bill_confirmed: "1", ftotalprice: 1000 })), false);
assertEq("confirmed but already settled (paydeposit='1') → no",
  isAdvanceBillEligible(gate({ fstatus: "2", advance_bill_confirmed: "1", paydeposit: "1", ftotalprice: 1000 })), false);
assertEq("confirmed but cancelled (99) → no",
  isAdvanceBillEligible(gate({ fstatus: "99", advance_bill_confirmed: "1", ftotalprice: 1000 })), false);
// isBillableForwarder now accepts cohort C too (without regressing A/B).
assertEq("isBillableForwarder: confirmed fstatus 2 → true",
  isBillableForwarder(gate({ fstatus: "2", advance_bill_confirmed: "1", ftotalprice: 1000 })), true);
assertEq("isBillableForwarder: fstatus 2 not confirmed → false (unchanged)",
  isBillableForwarder(gate({ fstatus: "2", ftotalprice: 1000 })), false);
assertEq("isBillableForwarder: plain fstatus 5 still true (cohort A intact)",
  isBillableForwarder(gate({ fstatus: "5" })), true);

// ── BILLING-RUN eligibility (owner 2026-07-07 · credit/นิติ ONLY, drop cash) ──
section("billing-run eligibility — credit/นิติ only (drop the cash cohort)");
// นิติ customer → every billable stage counts (incl. plain cash fstatus='5').
assertEq("juristic: plain fstatus 5 (cash) → eligible",
  isBillingRunEligible(gate({ fstatus: "5" }), true), true);
assertEq("juristic: credit-unsettled fstatus 6 → eligible",
  isBillingRunEligible(gate({ fstatus: "6", fcredit: "1" }), true), true);
assertEq("juristic: confirmed advance (fstatus 2) → eligible",
  isBillingRunEligible(gate({ fstatus: "2", advance_bill_confirmed: "1", ftotalprice: 1000 }), true), true);
assertEq("juristic: non-billable (fstatus 1) → not eligible",
  isBillingRunEligible(gate({ fstatus: "1" }), true), false);
// CASH (non-juristic) customer → the plain fstatus='5' cohort is DROPPED.
assertEq("cash: plain fstatus 5 → NOT eligible (dropped · collect on portal)",
  isBillingRunEligible(gate({ fstatus: "5" }), false), false);
// CASH but on credit → still eligible (credit cohort survives).
assertEq("cash-but-credit: fstatus 5 fcredit=1 → eligible",
  isBillingRunEligible(gate({ fstatus: "5", fcredit: "1" }), false), true);
assertEq("cash-but-credit: fstatus 6 fcredit=1 → eligible",
  isBillingRunEligible(gate({ fstatus: "6", fcredit: "1" }), false), true);
// CASH + confirmed advance bill → still eligible (advance cohort survives).
assertEq("cash: confirmed advance (fstatus 3) → eligible",
  isBillingRunEligible(gate({ fstatus: "3", advance_bill_confirmed: "1", ftotalprice: 1 }), false), true);
// CASH + settled credit (paydeposit=1) → not eligible.
assertEq("cash: settled credit (paydeposit=1) → not eligible",
  isBillingRunEligible(gate({ fstatus: "6", fcredit: "1", paydeposit: "1" }), false), false);
// non-billable row → never eligible regardless of juristic.
assertEq("cash: non-billable (fstatus 1) → not eligible",
  isBillingRunEligible(gate({ fstatus: "1" }), false), false);

section("G4 — isCheckedArrivedForwarder (ตรวจตู้-done arrival · fstatus='4')");
// Only fstatus='4' matches — the fstatus arm of the G4 pre-lift admission.
assertEq("fstatus 4 → checked-arrived", isCheckedArrivedForwarder(gate({ fstatus: "4" })), true);
assertEq("fstatus 4 (untrimmed ' 4 ') → checked-arrived", isCheckedArrivedForwarder(gate({ fstatus: " 4 " })), true);
assertEq("fstatus 5 → NOT checked-arrived", isCheckedArrivedForwarder(gate({ fstatus: "5" })), false);
assertEq("fstatus 3 → NOT checked-arrived", isCheckedArrivedForwarder(gate({ fstatus: "3" })), false);
assertEq("fstatus null → NOT checked-arrived", isCheckedArrivedForwarder(gate({ fstatus: null })), false);
// It is NOT billable on its own — must never widen isBillableForwarder.
assertEq("checked-arrived (4) is NOT billable on its own",
  isBillableForwarder(gate({ fstatus: "4" })), false);
// A plain fstatus='4' also fails isBillingRunEligible for a juristic customer
// (admission requires the check-queue membership, added by the caller, not this fn).
assertEq("juristic: plain fstatus 4 → NOT billing-run-eligible (needs check-queue)",
  isBillingRunEligible(gate({ fstatus: "4" }), true), false);

console.log(`\n${fail === 0 ? "✅" : "❌"} forwarder/billing-eligibility: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
