/**
 * Unit tests — ถอยสถานะ (rollback) ฝากนำเข้า DECISIONS (owner 2026-07-17).
 *
 * Focus (money-critical · the plan decides what gets UN-COLLECTED / CANCELLED):
 *   1. Refusals — the "REFUSE, never guess" set: forward moves · 99/credit ·
 *      ส่งแล้ว(7) · driver en route · combined เติม-แล้วจ่าย slip · a bill or
 *      receipt SHARED with other orders (cancelling those would silently revert
 *      OTHER customers' orders = "งานหาย").
 *   2. Steps — FACT-driven, in unwind order (driver → payment → bill-paid →
 *      cancel-bill → receipt → credit → flip). Never rank-driven: an
 *      advance-billed fstatus-4 row DOES carry a bill.
 *   3. clearDateCols — every stage above `to` is cleared; `to`'s own stamp is kept.
 *
 * The named spec cases: 6→3 (driver+bill+receipt+payment) · 5→4 (bill+receipt) ·
 * 4→3 (nothing) · forward (no-op) · 99/credit edges.
 *
 * Run: tsx lib/admin/forwarder-rollback-plan.test.ts
 */

import assert from "node:assert/strict";
import {
  planForwarderRollback,
  isRollbackTransition,
  type RollbackFacts,
  type RollbackPlan,
} from "./forwarder-rollback-plan";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/** A clean row that carries NOTHING — override only what a case is about. */
function facts(p: Partial<RollbackFacts>): RollbackFacts {
  return {
    from: "4",
    to: "3",
    isCredit: false,
    hasSettledPayment: false,
    hasCombinedSlip: false,
    hasPaidBill: false,
    hasIssuedBill: false,
    isBillShared: false,
    hasActiveReceipt: false,
    isReceiptShared: false,
    hasOpenDriverStop: false,
    hasDriverEnRoute: false,
    ...p,
  };
}

/** Narrow to the ok:true shape (asserts + returns, so callers stay type-safe). */
function ok(plan: RollbackPlan): Extract<RollbackPlan, { ok: true }> {
  assert.equal(plan.ok, true, `expected an ok plan, got refusal: ${plan.ok === false ? plan.refusal : "?"}`);
  if (plan.ok !== true) throw new Error("unreachable");
  return plan;
}

function refusalOf(plan: RollbackPlan): string {
  assert.equal(plan.ok, false, "expected a refusal, got an ok plan");
  return plan.ok === false ? plan.refusal : "";
}

console.log("\nplanForwarderRollback — refusals");

check("from === to → not_a_change", () => {
  assert.equal(refusalOf(planForwarderRollback(facts({ from: "4", to: "4" }))), "not_a_change");
});

check("forward (4→5) → not_a_rollback (the existing forward path owns it)", () => {
  assert.equal(refusalOf(planForwarderRollback(facts({ from: "4", to: "5" }))), "not_a_rollback");
});

check("forward from the bottom (1→7) → not_a_rollback", () => {
  assert.equal(refusalOf(planForwarderRollback(facts({ from: "1", to: "7" }))), "not_a_rollback");
});

check("to '99' (สถานะพิเศษ/ยกเลิก) → out_of_scope_status", () => {
  assert.equal(refusalOf(planForwarderRollback(facts({ from: "6", to: "99" }))), "out_of_scope_status");
});

check("from '99' → out_of_scope_status (restore is not this path)", () => {
  assert.equal(refusalOf(planForwarderRollback(facts({ from: "99", to: "4" }))), "out_of_scope_status");
});

check("to 'credit' → out_of_scope_status (the CreditForm owns it)", () => {
  assert.equal(refusalOf(planForwarderRollback(facts({ from: "5", to: "credit" }))), "out_of_scope_status");
});

check("unknown/garbage status → out_of_scope_status", () => {
  assert.equal(refusalOf(planForwarderRollback(facts({ from: "6", to: "" }))), "out_of_scope_status");
  assert.equal(refusalOf(planForwarderRollback(facts({ from: "abc", to: "3" }))), "out_of_scope_status");
});

check("from '7' ส่งแล้ว → shipped_irreversible (goods are with the customer)", () => {
  assert.equal(refusalOf(planForwarderRollback(facts({ from: "7", to: "6" }))), "shipped_irreversible");
  assert.equal(refusalOf(planForwarderRollback(facts({ from: "7", to: "1" }))), "shipped_irreversible");
});

check("driver en route → driver_en_route (a real truck is moving)", () => {
  assert.equal(
    refusalOf(planForwarderRollback(facts({ from: "6", to: "5", hasDriverEnRoute: true }))),
    "driver_en_route",
  );
});

check("shipped_irreversible outranks driver_en_route (most decisive reason wins)", () => {
  assert.equal(
    refusalOf(planForwarderRollback(facts({ from: "7", to: "5", hasDriverEnRoute: true }))),
    "shipped_irreversible",
  );
});

check("combined เติม-แล้วจ่าย slip → combined_slip (partial reverse would mis-refund)", () => {
  assert.equal(
    refusalOf(planForwarderRollback(facts({
      from: "6", to: "5", hasSettledPayment: true, hasCombinedSlip: true,
    }))),
    "combined_slip",
  );
});

check("combined flag with NO settled payment does not refuse (nothing to reverse)", () => {
  const plan = ok(planForwarderRollback(facts({
    from: "4", to: "3", hasSettledPayment: false, hasCombinedSlip: true,
  })));
  assert.deepEqual(plan.steps, ["flip_status"]);
});

check("shared PAID bill → bill_shared (never revert other customers' orders)", () => {
  assert.equal(
    refusalOf(planForwarderRollback(facts({ from: "6", to: "5", hasPaidBill: true, isBillShared: true }))),
    "bill_shared",
  );
});

check("shared ISSUED bill → bill_shared", () => {
  assert.equal(
    refusalOf(planForwarderRollback(facts({ from: "5", to: "4", hasIssuedBill: true, isBillShared: true }))),
    "bill_shared",
  );
});

check("isBillShared with NO bill does not refuse (stale flag can't block)", () => {
  const plan = ok(planForwarderRollback(facts({ from: "4", to: "3", isBillShared: true })));
  assert.deepEqual(plan.steps, ["flip_status"]);
});

check("shared receipt → receipt_shared (never un-document a live sibling order)", () => {
  assert.equal(
    refusalOf(planForwarderRollback(facts({
      from: "5", to: "4", hasActiveReceipt: true, isReceiptShared: true,
    }))),
    "receipt_shared",
  );
});

check("isReceiptShared with NO active receipt does not refuse", () => {
  const plan = ok(planForwarderRollback(facts({ from: "4", to: "3", isReceiptShared: true })));
  assert.deepEqual(plan.steps, ["flip_status"]);
});

console.log("\nplanForwarderRollback — the spec's named cases");

check("6→3 · driver + payment + paid bill + receipt → full unwind, in order", () => {
  const plan = ok(planForwarderRollback(facts({
    from: "6",
    to: "3",
    hasOpenDriverStop: true,
    hasSettledPayment: true,
    hasPaidBill: true,
    hasActiveReceipt: true,
  })));
  assert.deepEqual(plan.steps, [
    "driver_cleanup",
    "reverse_payment",
    "reverse_bill_paid",
    "cancel_bill",
    "void_receipt",
    "release_credit",   // hasPaidBill may RESTORE fcredit='1' → release after
    "flip_status",
  ]);
  // left 4 · 5 · 6 → their stamps go; '3' (where we land) keeps its own.
  assert.deepEqual(plan.clearDateCols, ["fdatestatus4", "fdatestatus5", "fdatestatus6"]);
});

check("5→4 · issued bill + receipt → cancel bill + void receipt (no payment leg)", () => {
  const plan = ok(planForwarderRollback(facts({
    from: "5", to: "4", hasIssuedBill: true, hasActiveReceipt: true,
  })));
  assert.deepEqual(plan.steps, ["cancel_bill", "void_receipt", "flip_status"]);
  assert.deepEqual(plan.clearDateCols, ["fdatestatus5"]);
});

check("4→3 · carries nothing → flip only", () => {
  const plan = ok(planForwarderRollback(facts({ from: "4", to: "3" })));
  assert.deepEqual(plan.steps, ["flip_status"]);
  assert.deepEqual(plan.clearDateCols, ["fdatestatus4"]);
});

check("2→1 · flip only · no date col for '1' (it has none)", () => {
  const plan = ok(planForwarderRollback(facts({ from: "2", to: "1" })));
  assert.deepEqual(plan.steps, ["flip_status"]);
  assert.deepEqual(plan.clearDateCols, ["fdatestatus2"]);
});

check("6→1 · clears every stamp 2..6, none for '1'", () => {
  const plan = ok(planForwarderRollback(facts({ from: "6", to: "1" })));
  assert.deepEqual(plan.clearDateCols, [
    "fdatestatus2", "fdatestatus3", "fdatestatus4", "fdatestatus5", "fdatestatus6",
  ]);
});

console.log("\nplanForwarderRollback — fact-driven, not rank-driven");

check("4→3 on an ADVANCE-BILLED row DOES cancel the bill (advance_bill_confirmed)", () => {
  // advance billing makes fstatus 2/3/4 rows billable — so "4→3 has no docs"
  // must never be assumed from the numbers.
  const plan = ok(planForwarderRollback(facts({ from: "4", to: "3", hasIssuedBill: true })));
  assert.deepEqual(plan.steps, ["cancel_bill", "flip_status"]);
});

check("5→4 with a STALE settled payment (PR178 orphan) reverses the payment", () => {
  const plan = ok(planForwarderRollback(facts({ from: "5", to: "4", hasSettledPayment: true })));
  assert.deepEqual(plan.steps, ["reverse_payment", "flip_status"]);
});

check("payment reverses on ANY rollback, not only out of 6", () => {
  const plan = ok(planForwarderRollback(facts({ from: "5", to: "1", hasSettledPayment: true })));
  assert.ok(plan.steps.includes("reverse_payment"));
});

console.log("\nplanForwarderRollback — credit edges");

check("6→5 on an UN-SETTLED credit row → release_credit (to < 6)", () => {
  const plan = ok(planForwarderRollback(facts({ from: "6", to: "5", isCredit: true })));
  assert.deepEqual(plan.steps, ["release_credit", "flip_status"]);
});

check("release_credit lands AFTER reverse_bill_paid (which can restore fcredit='1')", () => {
  const plan = ok(planForwarderRollback(facts({
    from: "6", to: "5", isCredit: true, hasPaidBill: true,
  })));
  assert.ok(
    plan.steps.indexOf("release_credit") > plan.steps.indexOf("reverse_bill_paid"),
    "release_credit must run after reverse_bill_paid",
  );
});

check("a paid bill implies a possible credit restore → release_credit even if !isCredit", () => {
  const plan = ok(planForwarderRollback(facts({ from: "6", to: "5", hasPaidBill: true })));
  assert.ok(plan.steps.includes("release_credit"));
});

check("no credit + no paid bill → NO release_credit step", () => {
  const plan = ok(planForwarderRollback(facts({ from: "6", to: "5", hasSettledPayment: true })));
  assert.ok(!plan.steps.includes("release_credit"));
});

check("flip_status is ALWAYS last", () => {
  const cases: Array<Partial<RollbackFacts>> = [
    { from: "6", to: "3", hasOpenDriverStop: true, hasSettledPayment: true, hasPaidBill: true, hasActiveReceipt: true, isCredit: true },
    { from: "5", to: "4", hasIssuedBill: true },
    { from: "4", to: "3" },
    { from: "6", to: "1", isCredit: true },
  ];
  for (const c of cases) {
    const plan = ok(planForwarderRollback(facts(c)));
    assert.equal(plan.steps[plan.steps.length - 1], "flip_status");
    assert.equal(plan.steps.filter((s) => s === "flip_status").length, 1);
  }
});

check("steps never repeat within one plan", () => {
  const plan = ok(planForwarderRollback(facts({
    from: "6", to: "2", isCredit: true, hasSettledPayment: true, hasPaidBill: true,
    hasIssuedBill: true, hasActiveReceipt: true, hasOpenDriverStop: true,
  })));
  assert.equal(new Set(plan.steps).size, plan.steps.length);
  // a row carrying BOTH a paid and an issued bill still cancels once
  assert.equal(plan.steps.filter((s) => s === "cancel_bill").length, 1);
});

console.log("\nisRollbackTransition");

check("true only for a real backward move between real statuses", () => {
  assert.equal(isRollbackTransition("6", "5"), true);
  assert.equal(isRollbackTransition("7", "1"), true);   // a rollback (the PLAN then refuses it)
  assert.equal(isRollbackTransition("4", "4"), false);
  assert.equal(isRollbackTransition("4", "5"), false);
  assert.equal(isRollbackTransition("6", "99"), false);
  assert.equal(isRollbackTransition("99", "5"), false);
  assert.equal(isRollbackTransition("5", "credit"), false);
  assert.equal(isRollbackTransition("", "3"), false);
});

console.log(`\n✅ forwarder-rollback-plan — ${passed} checks passed\n`);
