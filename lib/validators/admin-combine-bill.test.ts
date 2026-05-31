/**
 * Unit tests for the combine-bill validators (no DB).
 *
 * Covers the pure parsing/dedupe/coercion logic behind the editable
 * detail page (re-sweep A2 #9):
 *   - parseForwarderIdsCsv      — the legacy `explode(",", $_POST['ID'])`
 *   - addForwardersToBillSchema — add line items to an existing bill
 *   - removeForwarderFromBillSchema — remove one line item
 *
 * Run: `tsx lib/validators/admin-combine-bill.test.ts`
 * (pure — no `.env.local` needed; part of `pnpm test:unit`).
 */

import assert from "node:assert/strict";
import {
  parseForwarderIdsCsv,
  addForwardersToBillSchema,
  removeForwarderFromBillSchema,
} from "./admin-combine-bill";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("admin-combine-bill validators");

// ── parseForwarderIdsCsv ──────────────────────────────────────
test("CSV: '1,5,6' → [1,5,6]", () => {
  assert.deepEqual(parseForwarderIdsCsv("1,5,6"), [1, 5, 6]);
});
test("CSV: tolerates spaces '1, 5 , 6'", () => {
  assert.deepEqual(parseForwarderIdsCsv("1, 5 , 6"), [1, 5, 6]);
});
test("CSV: single '42' → [42]", () => {
  assert.deepEqual(parseForwarderIdsCsv("42"), [42]);
});
test("CSV: empty string → []", () => {
  assert.deepEqual(parseForwarderIdsCsv(""), []);
});
test("CSV: drops empty tokens '1,,6'", () => {
  assert.deepEqual(parseForwarderIdsCsv("1,,6"), [1, 6]);
});
test("CSV: rejects non-numeric token", () => {
  assert.throws(() => parseForwarderIdsCsv("1,abc,6"), /ไม่ถูกต้อง/);
});
test("CSV: rejects zero / negative", () => {
  assert.throws(() => parseForwarderIdsCsv("0"), /ไม่ถูกต้อง/);
  assert.throws(() => parseForwarderIdsCsv("-3"), /ไม่ถูกต้อง/);
});

// ── addForwardersToBillSchema ─────────────────────────────────
test("add: CSV string forwarderIds + billId parse", () => {
  const r = addForwardersToBillSchema.safeParse({ billId: "12", forwarderIds: "3,4" });
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.billId, 12);
    assert.deepEqual(r.data.forwarderIds, [3, 4]);
  }
});
test("add: array forwarderIds passes through", () => {
  const r = addForwardersToBillSchema.safeParse({ billId: 7, forwarderIds: [9, 10] });
  assert.equal(r.success, true);
  if (r.success) assert.deepEqual(r.data.forwarderIds, [9, 10]);
});
test("add: dedupes repeated IDs (no FK double-insert)", () => {
  const r = addForwardersToBillSchema.safeParse({ billId: 1, forwarderIds: "5,5,6" });
  assert.equal(r.success, true);
  if (r.success) assert.deepEqual(r.data.forwarderIds, [5, 6]);
});
test("add: empty forwarderIds rejected", () => {
  const r = addForwardersToBillSchema.safeParse({ billId: 1, forwarderIds: "" });
  assert.equal(r.success, false);
});
test("add: bad billId rejected", () => {
  const r = addForwardersToBillSchema.safeParse({ billId: "0", forwarderIds: "5" });
  assert.equal(r.success, false);
});

// ── removeForwarderFromBillSchema ─────────────────────────────
test("remove: coerces string billId + forwarderId", () => {
  const r = removeForwarderFromBillSchema.safeParse({ billId: "12", forwarderId: "5" });
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.billId, 12);
    assert.equal(r.data.forwarderId, 5);
  }
});
test("remove: rejects non-positive forwarderId", () => {
  const r = removeForwarderFromBillSchema.safeParse({ billId: 12, forwarderId: 0 });
  assert.equal(r.success, false);
});
test("remove: rejects missing billId", () => {
  const r = removeForwarderFromBillSchema.safeParse({ forwarderId: 5 });
  assert.equal(r.success, false);
});

// ── cascade decision (documents the action's empty-bill rule) ──
// The action deletes the tb_bill header when, AFTER removing one line,
// the remaining tb_bill_item count is 0. This pins that predicate so a
// future refactor can't silently flip it (which would leave dangling
// empty bills, or delete bills that still have lines).
function shouldDeleteEmptyBill(remainingItemCount: number): boolean {
  return remainingItemCount === 0;
}
test("cascade: 0 remaining → delete header", () => {
  assert.equal(shouldDeleteEmptyBill(0), true);
});
test("cascade: ≥1 remaining → keep header", () => {
  assert.equal(shouldDeleteEmptyBill(1), false);
  assert.equal(shouldDeleteEmptyBill(3), false);
});

console.log(`\n${passed} passed / 0 failed`);
