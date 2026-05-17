/**
 * V-E7 — freight-payment validator + business-logic unit tests.
 *
 * Covers the contract surface that catches regressions before they hit
 * the DB / a customer's receipt:
 *
 *   1. recordFreightPaymentSchema — Zod contract for the admin action
 *   2. voidFreightPaymentSchema   — void requires a reason
 *   3. computeInvoicePaymentStatus — unpaid/partial/paid/overpaid math
 *      (the load-bearing helper — both the page loader, the action's
 *      recompute, and the PDF route call it; a regression silently
 *      mislabels every freight receipt)
 *   4. freightInvoiceTotalThb     — landed-cost sum (V-E7 design decision)
 *   5. roundThb                   — 2dp cents rounding
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  recordFreightPaymentSchema,
  voidFreightPaymentSchema,
  computeInvoicePaymentStatus,
  freightInvoiceTotalThb,
  roundThb,
  FREIGHT_PAYMENT_METHODS,
} from "./freight-payment";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}
function assertThrows(label: string, fn: () => unknown): void {
  try {
    fn();
    fail++; console.error("  ✗", label, "(expected to throw, didn't)");
  } catch {
    pass++; console.log("  ✓", label);
  }
}

console.log("freight-payment validators (V-E7)");

// ────────────────────────────────────────────────────────────
// (a) recordFreightPaymentSchema — happy paths
// ────────────────────────────────────────────────────────────
// Valid RFC-4122 v4 UUIDs (Zod v4 .uuid() checks the version nibble).
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-9222-222222222222";
const UUID_C = "33333333-3333-4333-a333-333333333333";
const UUID_D = "44444444-4444-4444-b444-444444444444";

console.log("  (a) recordFreightPaymentSchema — accepts valid input");
{
  const ok = recordFreightPaymentSchema.parse({
    freight_invoice_id: UUID_A,
    method:             "bank_transfer",
    amount_thb:         15000.5,
    bank_ref:           "KBANK-20260517-001",
  });
  assert("bank_transfer happy path parses",   ok.method === "bank_transfer");
  assert("amount preserved",                  ok.amount_thb === 15000.5);

  const cash = recordFreightPaymentSchema.parse({
    freight_invoice_id: UUID_B,
    method:             "cash",
    amount_thb:         500,
  });
  assert("cash happy path parses",            cash.method === "cash");

  const wallet = recordFreightPaymentSchema.parse({
    freight_invoice_id: UUID_C,
    method:             "wallet",
    amount_thb:         1,
    paid_at:            "2026-05-17T10:30:00Z",
  });
  assert("wallet + paid_at parses",           wallet.method === "wallet");
  assert("paid_at preserved",                 wallet.paid_at === "2026-05-17T10:30:00Z");
}

// ────────────────────────────────────────────────────────────
// (b) recordFreightPaymentSchema — rejections
// ────────────────────────────────────────────────────────────
console.log("  (b) recordFreightPaymentSchema — rejects bad input");
{
  const base = {
    freight_invoice_id: UUID_A,
    method:             "cash" as const,
  };
  assertThrows("rejects zero amount",       () => recordFreightPaymentSchema.parse({ ...base, amount_thb: 0 }));
  assertThrows("rejects negative amount",   () => recordFreightPaymentSchema.parse({ ...base, amount_thb: -100 }));
  assertThrows("rejects over-cap amount",   () => recordFreightPaymentSchema.parse({ ...base, amount_thb: 1_000_000_000 }));
  assertThrows("rejects bogus method",      () => recordFreightPaymentSchema.parse({ ...base, method: "crypto", amount_thb: 100 }));
  assertThrows("rejects non-uuid invoice",  () => recordFreightPaymentSchema.parse({ freight_invoice_id: "not-a-uuid", method: "cash", amount_thb: 100 }));
  assertThrows("rejects bad paid_at",       () => recordFreightPaymentSchema.parse({ ...base, amount_thb: 100, paid_at: "2026-05-17" }));

  // Only the 3 V1 methods are allowed.
  assert("exactly 3 payment methods",       FREIGHT_PAYMENT_METHODS.length === 3);
  assert("methods are cash/bank_transfer/wallet",
    FREIGHT_PAYMENT_METHODS.includes("cash") &&
    FREIGHT_PAYMENT_METHODS.includes("bank_transfer") &&
    FREIGHT_PAYMENT_METHODS.includes("wallet"));
}

// ────────────────────────────────────────────────────────────
// (c) voidFreightPaymentSchema — reason required
// ────────────────────────────────────────────────────────────
console.log("  (c) voidFreightPaymentSchema — reason required");
{
  const ok = voidFreightPaymentSchema.parse({
    id:          UUID_D,
    void_reason: "บันทึกผิด invoice",
  });
  assert("valid void parses",               ok.void_reason === "บันทึกผิด invoice");
  assertThrows("rejects empty reason",      () => voidFreightPaymentSchema.parse({ id: UUID_D, void_reason: "" }));
  assertThrows("rejects < 3 char reason",   () => voidFreightPaymentSchema.parse({ id: UUID_D, void_reason: "ab" }));
  assertThrows("rejects non-uuid id",       () => voidFreightPaymentSchema.parse({ id: "x", void_reason: "valid reason" }));

  // Trims before length-check.
  const trimmed = voidFreightPaymentSchema.parse({
    id:          UUID_D,
    void_reason: "  ผิดจริง  ",
  });
  assert("trims void_reason",               trimmed.void_reason === "ผิดจริง");
}

// ────────────────────────────────────────────────────────────
// (d) computeInvoicePaymentStatus — the load-bearing helper
// ────────────────────────────────────────────────────────────
console.log("  (d) computeInvoicePaymentStatus — settlement math");
{
  // Total 10000.
  assert("0 paid → unpaid",            computeInvoicePaymentStatus(0,     10000) === "unpaid");
  assert("partial → partial",          computeInvoicePaymentStatus(3000,  10000) === "partial");
  assert("exact total → paid",         computeInvoicePaymentStatus(10000, 10000) === "paid");
  assert("over total → overpaid",      computeInvoicePaymentStatus(12000, 10000) === "overpaid");

  // Epsilon tolerance — float dust must NOT trap an invoice at partial.
  assert("9999.995 of 10000 → paid (epsilon)",  computeInvoicePaymentStatus(9999.995, 10000) === "paid");
  assert("9999.98 of 10000 → still partial",    computeInvoicePaymentStatus(9999.98,  10000) === "partial");
  assert("10000.005 → paid not overpaid",       computeInvoicePaymentStatus(10000.005, 10000) === "paid");
  assert("10000.02 → overpaid",                 computeInvoicePaymentStatus(10000.02, 10000) === "overpaid");

  // Defensive edges.
  assert("negative paid clamps → unpaid",       computeInvoicePaymentStatus(-50,  10000) === "unpaid");
  assert("zero total + payment → paid",         computeInvoicePaymentStatus(100,  0)     === "paid");
  assert("zero total + zero paid → unpaid",     computeInvoicePaymentStatus(0,    0)     === "unpaid");

  // A tiny partial on a tiny invoice.
  assert("1 of 2 → partial",                    computeInvoicePaymentStatus(1, 2) === "partial");
}

// ────────────────────────────────────────────────────────────
// (e) freightInvoiceTotalThb — landed-cost sum (V-E7 design decision)
// ────────────────────────────────────────────────────────────
console.log("  (e) freightInvoiceTotalThb — landed-cost sum");
{
  assert("commercial + duty + vat",
    freightInvoiceTotalThb({ commercial_value_thb: 100000, duty_thb: 10000, vat_thb: 7700 }) === 117700);
  assert("nulls count as 0",
    freightInvoiceTotalThb({ commercial_value_thb: 50000, duty_thb: null, vat_thb: null }) === 50000);
  assert("all null → 0",
    freightInvoiceTotalThb({ commercial_value_thb: null, duty_thb: null, vat_thb: null }) === 0);
  assert("rounds to 2dp",
    freightInvoiceTotalThb({ commercial_value_thb: 100.005, duty_thb: 0, vat_thb: 0 }) === 100.01);
}

// ────────────────────────────────────────────────────────────
// (f) roundThb — 2dp cents
// ────────────────────────────────────────────────────────────
console.log("  (f) roundThb — 2dp cents rounding");
{
  assert("1234.567 → 1234.57",  roundThb(1234.567) === 1234.57);
  assert("0.005 → 0.01",        roundThb(0.005) === 0.01);
  assert("integer untouched",   roundThb(500) === 500);
  assert("negative rounds",     roundThb(-1.005) === -1);
}

// ────────────────────────────────────────────────────────────
// (g) ledger sum invariant — partial payments converge to paid
// ────────────────────────────────────────────────────────────
console.log("  (g) multi-payment ledger invariant");
{
  // Three partial payments against a 30000 invoice.
  const partials = [10000, 12000.5, 7999.5];
  const total = 30000;
  let running = 0;
  const statuses: string[] = [];
  for (const p of partials) {
    running = roundThb(running + p);
    statuses.push(computeInvoicePaymentStatus(running, total));
  }
  assert("after payment 1 → partial",  statuses[0] === "partial");
  assert("after payment 2 → partial",  statuses[1] === "partial");
  assert("after payment 3 → paid",     statuses[2] === "paid");
  assert("ledger sums exactly to total", running === total);
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
