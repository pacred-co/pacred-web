/**
 * V-A6 — withholding-tax (ภาษีหัก ณ ที่จ่าย) validator + money-math tests.
 *
 * Covers the contract surface that catches regressions before they hit a
 * customer's tax-invoice / receipt:
 *
 *   1. WHT_RATES               — the locked rate set {1, 1.5, 2, 3, 5}
 *   2. roundThb                — 2dp cents rounding (numeric(12,2) parity)
 *   3. computeWhtNumbers       — wht_amount + net_expected math
 *      (the load-bearing helper — the admin panel + the receipt + the
 *      tax-invoice PDF all read it; a regression mis-states every WHT row)
 *   4. createWhtEntrySchema    — Zod contract + the 2 refinements
 *      (XOR parent order · wht_base ≤ gross)
 *   5. markCertReceivedSchema  — storage-path required
 *   6. waiveCertSchema         — waive reason ≥5 chars
 *   7. cancelWhtEntrySchema    — uuid only
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  WHT_RATES,
  roundThb,
  computeWhtNumbers,
  createWhtEntrySchema,
  markCertReceivedSchema,
  waiveCertSchema,
  cancelWhtEntrySchema,
} from "./withholding-tax";

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

console.log("withholding-tax validators (V-A6)");

// Valid RFC-4122 v4 UUIDs (Zod v4 .uuid() checks the version nibble).
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-9222-222222222222";

// ────────────────────────────────────────────────────────────
// (a) WHT_RATES — the locked rate set
// ────────────────────────────────────────────────────────────
console.log("  (a) WHT_RATES — locked set {1, 1.5, 2, 3, 5}");
{
  assert("exactly 5 rates",          WHT_RATES.length === 5);
  assert("contains 1",               (WHT_RATES as readonly number[]).includes(1));
  assert("contains 1.5",             (WHT_RATES as readonly number[]).includes(1.5));
  assert("contains 2",               (WHT_RATES as readonly number[]).includes(2));
  assert("contains 3",               (WHT_RATES as readonly number[]).includes(3));
  assert("contains 5",               (WHT_RATES as readonly number[]).includes(5));
  assert("does NOT contain 0",       !(WHT_RATES as readonly number[]).includes(0));
  assert("does NOT contain 10",      !(WHT_RATES as readonly number[]).includes(10));
}

// ────────────────────────────────────────────────────────────
// (b) roundThb — 2dp cents
// ────────────────────────────────────────────────────────────
console.log("  (b) roundThb — 2dp cents rounding");
{
  assert("1234.567 → 1234.57",  roundThb(1234.567) === 1234.57);
  assert("0.005 → 0.01",        roundThb(0.005) === 0.01);
  assert("integer untouched",   roundThb(500) === 500);
  assert("0 → 0",               roundThb(0) === 0);
  assert("1.004 → 1",           roundThb(1.004) === 1);
}

// ────────────────────────────────────────────────────────────
// (c) computeWhtNumbers — the load-bearing money helper
// ────────────────────────────────────────────────────────────
console.log("  (c) computeWhtNumbers — wht_amount + net_expected math");
{
  // 3% of a 10000 service base on a 10000 gross invoice.
  const r1 = computeWhtNumbers({ gross_invoice_thb: 10000, wht_base_thb: 10000, wht_rate_pct: 3 });
  assert("3% of 10000 → wht 300",       r1.wht_amount_thb === 300);
  assert("net = gross − wht (9700)",    r1.net_expected_thb === 9700);

  // 1% — cargo/forwarder default rate.
  const r2 = computeWhtNumbers({ gross_invoice_thb: 50000, wht_base_thb: 20000, wht_rate_pct: 1 });
  assert("1% of base 20000 → wht 200",  r2.wht_amount_thb === 200);
  assert("net keyed off GROSS not base",r2.net_expected_thb === 49800);

  // 1.5% — fractional rate must round to 2dp.
  const r3 = computeWhtNumbers({ gross_invoice_thb: 3333, wht_base_thb: 3333, wht_rate_pct: 1.5 });
  assert("1.5% of 3333 → wht 49.995→50.00", r3.wht_amount_thb === 50);
  assert("net = 3333 − 50 = 3283",      r3.net_expected_thb === 3283);

  // 5% — top rate.
  const r4 = computeWhtNumbers({ gross_invoice_thb: 100000, wht_base_thb: 100000, wht_rate_pct: 5 });
  assert("5% of 100000 → wht 5000",     r4.wht_amount_thb === 5000);
  assert("net = 95000",                 r4.net_expected_thb === 95000);
  assert("net is always below gross",   r4.net_expected_thb < 100000);

  // Float-dust case — the helper rounds both outputs to 2dp.
  const r5 = computeWhtNumbers({ gross_invoice_thb: 999.99, wht_base_thb: 999.99, wht_rate_pct: 3 });
  assert("3% of 999.99 rounds clean",   r5.wht_amount_thb === roundThb(999.99 * 0.03));
  assert("net rounds to 2dp",           r5.net_expected_thb === roundThb(999.99 - r5.wht_amount_thb));
}

// ────────────────────────────────────────────────────────────
// (d) createWhtEntrySchema — happy paths
// ────────────────────────────────────────────────────────────
console.log("  (d) createWhtEntrySchema — accepts valid input");
{
  const fwd = createWhtEntrySchema.parse({
    order_type:        "forwarder",
    order_id:          "F2026-0042",
    gross_invoice_thb: 10000,
    wht_base_thb:      8000,
    wht_rate_pct:      1,
  });
  assert("forwarder entry parses",        fwd.order_type === "forwarder");
  assert("order_id preserved",            fwd.order_id === "F2026-0042");

  const so = createWhtEntrySchema.parse({
    order_type:        "service_order",
    order_id:          "H2026-0099",
    gross_invoice_thb: 5000,
    wht_base_thb:      5000,
    wht_rate_pct:      3,
  });
  assert("service_order entry parses",    so.order_type === "service_order");

  // wht_base may equal gross exactly (refine allows +0.01 slack).
  const eq = createWhtEntrySchema.parse({
    order_type:        "forwarder",
    order_id:          "F1",
    gross_invoice_thb: 1000,
    wht_base_thb:      1000,
    wht_rate_pct:      2,
  });
  assert("wht_base == gross allowed",     eq.wht_base_thb === 1000);
}

// ────────────────────────────────────────────────────────────
// (e) createWhtEntrySchema — rejections
// ────────────────────────────────────────────────────────────
console.log("  (e) createWhtEntrySchema — rejects bad input");
{
  const base = {
    order_type:        "forwarder" as const,
    order_id:          "F1",
    gross_invoice_thb: 10000,
    wht_base_thb:      10000,
  };
  assertThrows("rejects rate not in set (4%)",   () => createWhtEntrySchema.parse({ ...base, wht_rate_pct: 4 }));
  assertThrows("rejects rate 0",                 () => createWhtEntrySchema.parse({ ...base, wht_rate_pct: 0 }));
  assertThrows("rejects zero gross",             () => createWhtEntrySchema.parse({ ...base, gross_invoice_thb: 0, wht_rate_pct: 3 }));
  assertThrows("rejects negative gross",         () => createWhtEntrySchema.parse({ ...base, gross_invoice_thb: -1, wht_rate_pct: 3 }));
  assertThrows("rejects zero base",              () => createWhtEntrySchema.parse({ ...base, wht_base_thb: 0, wht_rate_pct: 3 }));
  assertThrows("rejects empty order_id",         () => createWhtEntrySchema.parse({ ...base, order_id: "", wht_rate_pct: 3 }));
  assertThrows("rejects bogus order_type",       () => createWhtEntrySchema.parse({ ...base, order_type: "yuan_payment", wht_rate_pct: 3 }));
  // The refinement: wht_base must not exceed gross.
  assertThrows("rejects wht_base > gross",
    () => createWhtEntrySchema.parse({ ...base, wht_base_thb: 20000, wht_rate_pct: 3 }));
}

// ────────────────────────────────────────────────────────────
// (f) markCertReceivedSchema — storage-path required
// ────────────────────────────────────────────────────────────
console.log("  (f) markCertReceivedSchema — cert storage path required");
{
  const ok = markCertReceivedSchema.parse({
    id:                UUID_A,
    cert_number:       "WT-2026-00187",
    cert_storage_path: "profile-x/F1/cert-1747000000000.pdf",
  });
  assert("valid mark-received parses",    ok.cert_storage_path.endsWith(".pdf"));
  assert("cert_number preserved",         ok.cert_number === "WT-2026-00187");

  // cert_number is optional.
  const noNum = markCertReceivedSchema.parse({
    id:                UUID_B,
    cert_storage_path: "p/F2/cert.pdf",
  });
  assert("cert_number optional",          noNum.cert_number === undefined);

  assertThrows("rejects empty storage path", () => markCertReceivedSchema.parse({ id: UUID_A, cert_storage_path: "" }));
  assertThrows("rejects missing storage path", () => markCertReceivedSchema.parse({ id: UUID_A }));
  assertThrows("rejects non-uuid id",     () => markCertReceivedSchema.parse({ id: "x", cert_storage_path: "p/cert.pdf" }));
}

// ────────────────────────────────────────────────────────────
// (g) waiveCertSchema — reason ≥5 chars
// ────────────────────────────────────────────────────────────
console.log("  (g) waiveCertSchema — waive reason required");
{
  const ok = waiveCertSchema.parse({ id: UUID_A, waived_reason: "ลูกค้าไม่ออก 50 ทวิ" });
  assert("valid waive parses",            ok.waived_reason.length >= 5);
  assertThrows("rejects empty reason",    () => waiveCertSchema.parse({ id: UUID_A, waived_reason: "" }));
  assertThrows("rejects < 5 char reason", () => waiveCertSchema.parse({ id: UUID_A, waived_reason: "no" }));
  assertThrows("rejects non-uuid id",     () => waiveCertSchema.parse({ id: "x", waived_reason: "valid reason" }));

  // Trims before length-check.
  const trimmed = waiveCertSchema.parse({ id: UUID_A, waived_reason: "   ยกเว้น   " });
  assert("trims waived_reason",           trimmed.waived_reason === "ยกเว้น");
}

// ────────────────────────────────────────────────────────────
// (h) cancelWhtEntrySchema — uuid only
// ────────────────────────────────────────────────────────────
console.log("  (h) cancelWhtEntrySchema — uuid only");
{
  const ok = cancelWhtEntrySchema.parse({ id: UUID_B });
  assert("valid cancel parses",           ok.id === UUID_B);
  assertThrows("rejects non-uuid",        () => cancelWhtEntrySchema.parse({ id: "not-a-uuid" }));
  assertThrows("rejects missing id",      () => cancelWhtEntrySchema.parse({}));
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
