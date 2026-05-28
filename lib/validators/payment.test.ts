/**
 * Unit tests for yuan-payment (service-payment) Zod schema.
 *
 * Locks the validation contract for /service-payment/add — yuan transfer
 * request flow. 3 channels (alipay/wechat/bank), yuan_amount + exchange_rate
 * bounds, optional slip/id_doc URLs.
 *
 * Pattern matches lib/validators/auth.test.ts.
 */

import { yuanPaymentSchema } from "./payment";

let pass = 0;
let fail = 0;

function assertOk(label: string, schema: { safeParse: (v: unknown) => { success: boolean } }, input: unknown) {
  const res = schema.safeParse(input);
  if (res.success) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: success\n    got: ${JSON.stringify(res)}`); }
}

function assertFail(label: string, schema: { safeParse: (v: unknown) => { success: boolean } }, input: unknown) {
  const res = schema.safeParse(input);
  if (!res.success) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: failure\n    got: success`); }
}

function section(name: string) {
  console.log(`\n${name}`);
}

const validPayment = {
  channel:          "alipay" as const,
  recipient_detail: "Account ABC12345 - Mr. Wang Test",
  yuan_amount:      1000,
  exchange_rate:    5.1,
};

// ────────────────────────────────────────────────────────────
section("yuanPaymentSchema — channel enum + required fields");
// ────────────────────────────────────────────────────────────

assertOk  ("happy path alipay",              yuanPaymentSchema, validPayment);
assertOk  ("channel=wechat",                 yuanPaymentSchema, { ...validPayment, channel: "wechat" });
assertOk  ("channel=bank",                   yuanPaymentSchema, { ...validPayment, channel: "bank" });
assertOk  ("with paid_via_wallet=true",      yuanPaymentSchema, { ...validPayment, paid_via_wallet: true });
assertOk  ("with paid_via_wallet=false",     yuanPaymentSchema, { ...validPayment, paid_via_wallet: false });
assertOk  ("with slip_url",                  yuanPaymentSchema, { ...validPayment, slip_url: "slips/abc.jpg" });
assertOk  ("with id_doc_url",                yuanPaymentSchema, { ...validPayment, id_doc_url: "docs/id-card.pdf" });

assertFail("channel invalid 'paypal'",       yuanPaymentSchema, { ...validPayment, channel: "paypal" });
assertFail("channel missing",                yuanPaymentSchema, { recipient_detail: validPayment.recipient_detail, yuan_amount: 1000, exchange_rate: 5.1 });

// ────────────────────────────────────────────────────────────
section("yuanPaymentSchema — recipient_detail bounds");
// ────────────────────────────────────────────────────────────

assertOk  ("min 5 chars",                    yuanPaymentSchema, { ...validPayment, recipient_detail: "12345" });
assertOk  ("with full text 100 chars",       yuanPaymentSchema, { ...validPayment, recipient_detail: "x".repeat(100) });
assertOk  ("max 2000 chars",                 yuanPaymentSchema, { ...validPayment, recipient_detail: "x".repeat(2000) });

assertFail("4 chars (too short)",            yuanPaymentSchema, { ...validPayment, recipient_detail: "1234" });
assertFail("empty",                          yuanPaymentSchema, { ...validPayment, recipient_detail: "" });
assertFail("> 2000 chars",                   yuanPaymentSchema, { ...validPayment, recipient_detail: "x".repeat(2001) });

// ────────────────────────────────────────────────────────────
section("yuanPaymentSchema — yuan_amount bounds");
// ────────────────────────────────────────────────────────────

assertOk  ("yuan_amount=0.01 (positive)",    yuanPaymentSchema, { ...validPayment, yuan_amount: 0.01 });
assertOk  ("yuan_amount=999",                yuanPaymentSchema, { ...validPayment, yuan_amount: 999 });
assertOk  ("yuan_amount=1,000,000 (max)",    yuanPaymentSchema, { ...validPayment, yuan_amount: 1_000_000 });

assertFail("yuan_amount=0 (not positive)",   yuanPaymentSchema, { ...validPayment, yuan_amount: 0 });
assertFail("yuan_amount=-100 negative",      yuanPaymentSchema, { ...validPayment, yuan_amount: -100 });
assertFail("yuan_amount=1,000,001 over max", yuanPaymentSchema, { ...validPayment, yuan_amount: 1_000_001 });
assertFail("yuan_amount missing",            yuanPaymentSchema, { ...validPayment, yuan_amount: undefined });
assertFail("yuan_amount string '1000'",      yuanPaymentSchema, { ...validPayment, yuan_amount: "1000" });

// ────────────────────────────────────────────────────────────
section("yuanPaymentSchema — exchange_rate bounds [1-100] (V-E5)");
// ────────────────────────────────────────────────────────────
// V-E5 hardening (Sprint-14 Agent P, commit 845e788) — CNY→THB rate
// is now bounded by `CNY_RATE_MIN=1` / `CNY_RATE_MAX=100` in
// `lib/validators/payment.ts` to protect against the legacy
// int32-overflow garbage + "เรทเบิ้ล" doubled-rate class of error.
// Real-world CNY→THB sits ~4.9–5.1; the broad [1, 100] window keeps
// the validator tolerant of historic + future swings while still
// rejecting catastrophic typos like 0.0001 (missing decimal) or
// 1000 (10x typo).

assertOk  ("rate=1 (floor exact)",           yuanPaymentSchema, { ...validPayment, exchange_rate: 1 });
assertOk  ("rate=5.1 (typical Thai)",        yuanPaymentSchema, { ...validPayment, exchange_rate: 5.1 });
assertOk  ("rate=100 (ceiling exact)",       yuanPaymentSchema, { ...validPayment, exchange_rate: 100 });

assertFail("rate=0.0001 (below floor)",      yuanPaymentSchema, { ...validPayment, exchange_rate: 0.0001 });
assertFail("rate=0.5 (below floor)",         yuanPaymentSchema, { ...validPayment, exchange_rate: 0.5 });
assertFail("rate=101 (over ceiling)",        yuanPaymentSchema, { ...validPayment, exchange_rate: 101 });
assertFail("rate=1000 (10x typo)",           yuanPaymentSchema, { ...validPayment, exchange_rate: 1000 });
assertFail("rate=0 (not positive)",          yuanPaymentSchema, { ...validPayment, exchange_rate: 0 });
assertFail("rate=-5 negative",               yuanPaymentSchema, { ...validPayment, exchange_rate: -5 });
assertFail("rate missing",                   yuanPaymentSchema, { ...validPayment, exchange_rate: undefined });

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
