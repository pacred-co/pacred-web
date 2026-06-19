/**
 * Tests for the credit-limit advance guard — UNIT E.
 * Run: npx tsx lib/forwarder/credit-advance-guard.test.ts
 */

import assert from "node:assert/strict";
import {
  canAdvanceCreditCustomer,
  isCreditRow,
  type CreditAdvanceInputs,
} from "./credit-advance-guard";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("credit-advance-guard:");

// ── isCreditRow ──────────────────────────────────────────────────────────────
check("isCreditRow: '1' is a credit row", () => {
  assert.equal(isCreditRow("1"), true);
});
check("isCreditRow: '' / '0' / null / undefined are NOT credit rows", () => {
  assert.equal(isCreditRow(""), false);
  assert.equal(isCreditRow("0"), false);
  assert.equal(isCreditRow(null), false);
  assert.equal(isCreditRow(undefined), false);
});
check("isCreditRow: whitespace-padded '1' is a credit row", () => {
  assert.equal(isCreditRow(" 1 "), true);
});
check("isCreditRow: a stray non-zero value still counts as on-credit", () => {
  // legacy writes '1', but any non-empty non-'0' marker = on credit
  assert.equal(isCreditRow("2"), true);
});

// ── non-credit rows always allow ────────────────────────────────────────────
check("non-credit row flows freely even when over limit", () => {
  const v = canAdvanceCreditCustomer({ fcredit: "", outstanding: 99999, limit: 100 });
  assert.equal(v.blocked, false);
  assert.equal(v.reason, "");
});
check("non-credit row ('0') flows freely", () => {
  const v = canAdvanceCreditCustomer({ fcredit: "0", outstanding: 5000, limit: 1000 });
  assert.equal(v.blocked, false);
});

// ── credit row, headroom remains → allow ─────────────────────────────────────
check("credit row UNDER limit → allowed (order fits the line)", () => {
  const v = canAdvanceCreditCustomer({ fcredit: "1", outstanding: 4000, limit: 10000 });
  assert.equal(v.blocked, false);
  assert.equal(v.reason, "");
});
check("credit row with zero outstanding → allowed (nothing owed)", () => {
  const v = canAdvanceCreditCustomer({ fcredit: "1", outstanding: 0, limit: 10000 });
  assert.equal(v.blocked, false);
});

// ── credit row, at/over limit WITH debt → BLOCK ──────────────────────────────
check("credit row AT the limit with debt → BLOCKED", () => {
  const v = canAdvanceCreditCustomer({ fcredit: "1", outstanding: 10000, limit: 10000 });
  assert.equal(v.blocked, true);
  assert.match(v.reason, /เครดิตเต็ม\/เกินวงเงิน/);
  assert.match(v.reason, /เตรียมส่ง/);
});
check("credit row OVER the limit with debt → BLOCKED", () => {
  const v = canAdvanceCreditCustomer({ fcredit: "1", outstanding: 15000, limit: 10000 });
  assert.equal(v.blocked, true);
});
check("blocked reason shows outstanding + limit baht-formatted", () => {
  const v = canAdvanceCreditCustomer({ fcredit: "1", outstanding: 12345.5, limit: 10000 });
  assert.equal(v.blocked, true);
  assert.match(v.reason, /12,345\.50/);
  assert.match(v.reason, /10,000\.00/);
});

// ── limit = 0 (no credit line granted) edge cases ───────────────────────────
check("credit row, no line (limit 0) with debt → BLOCKED (anomalous, held)", () => {
  const v = canAdvanceCreditCustomer({ fcredit: "1", outstanding: 500, limit: 0 });
  assert.equal(v.blocked, true);
});
check("credit row, no line (limit 0) with ZERO debt → allowed (nothing to pay)", () => {
  const v = canAdvanceCreditCustomer({ fcredit: "1", outstanding: 0, limit: 0 });
  assert.equal(v.blocked, false);
});

// ── string-coercion of the legacy varchar columns ───────────────────────────
check("string outstanding/limit are coerced before compare", () => {
  const over: CreditAdvanceInputs = { fcredit: "1", outstanding: "10000", limit: "10000" };
  assert.equal(canAdvanceCreditCustomer(over).blocked, true);

  const under: CreditAdvanceInputs = { fcredit: "1", outstanding: "3000", limit: "10000" };
  assert.equal(canAdvanceCreditCustomer(under).blocked, false);
});
check("null/undefined outstanding & limit coerce to 0 (zero debt → allow)", () => {
  const v = canAdvanceCreditCustomer({ fcredit: "1", outstanding: null, limit: undefined });
  assert.equal(v.blocked, false); // outstanding 0 → nothing owed
});
check("garbage numeric strings coerce to 0 safely", () => {
  const v = canAdvanceCreditCustomer({ fcredit: "1", outstanding: "abc", limit: "xyz" });
  assert.equal(v.blocked, false); // outstanding 0
});

// ── just-below the limit boundary ────────────────────────────────────────────
check("credit row 1 satang under limit → allowed", () => {
  const v = canAdvanceCreditCustomer({ fcredit: "1", outstanding: 9999.99, limit: 10000 });
  assert.equal(v.blocked, false);
});

console.log(`\ncredit-advance-guard: ${passed} checks passed\n`);
