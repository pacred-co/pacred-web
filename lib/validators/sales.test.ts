/**
 * Unit tests for sales (team-leader payout) Zod schemas.
 *
 * Locks the validation contract for /sales/* payout request flow.
 *
 * Pattern matches lib/validators/auth.test.ts.
 */

import { requestPayoutSchema } from "./sales";

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

const validPayout = {
  commission_ids: ["00000000-0000-4000-8000-000000000001"],  // valid UUID v4 per Zod
  bank_name:      "SCB",
  account_name:   "ทดสอบ ทดสอบ",
  account_number: "1234567890",
};

// ────────────────────────────────────────────────────────────
section("requestPayoutSchema — commission_ids array");
// ────────────────────────────────────────────────────────────

assertOk  ("happy path 1 id",                requestPayoutSchema, validPayout);
assertOk  ("multiple commission_ids",        requestPayoutSchema, { ...validPayout, commission_ids: [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
]});

assertFail("empty commission_ids",           requestPayoutSchema, { ...validPayout, commission_ids: [] });
assertFail("missing commission_ids",         requestPayoutSchema, {
  bank_name: validPayout.bank_name,
  account_name: validPayout.account_name,
  account_number: validPayout.account_number,
});
assertFail("invalid UUID format",            requestPayoutSchema, { ...validPayout, commission_ids: ["not-a-uuid"] });
assertFail("invalid v4 UUID (no version)",   requestPayoutSchema, { ...validPayout, commission_ids: ["00000000-0000-0000-0000-000000000001"] });

// ────────────────────────────────────────────────────────────
section("requestPayoutSchema — bank account fields");
// ────────────────────────────────────────────────────────────

assertOk  ("8-digit account",                requestPayoutSchema, { ...validPayout, account_number: "12345678" });
assertOk  ("20-digit account",               requestPayoutSchema, { ...validPayout, account_number: "12345678901234567890" });
assertOk  ("account with dashes",            requestPayoutSchema, { ...validPayout, account_number: "123-456-7890" });
assertOk  ("KTB bank_name",                  requestPayoutSchema, { ...validPayout, bank_name: "KTB" });

assertFail("missing bank_name",              requestPayoutSchema, { ...validPayout, bank_name: "" });
assertFail("missing account_name",           requestPayoutSchema, { ...validPayout, account_name: "" });
assertFail("account 7-digit too short",      requestPayoutSchema, { ...validPayout, account_number: "1234567" });
assertFail("account 21-digit too long",      requestPayoutSchema, { ...validPayout, account_number: "123456789012345678901" });
assertFail("account with letters",           requestPayoutSchema, { ...validPayout, account_number: "1234ABCD90" });
assertFail("account with spaces",            requestPayoutSchema, { ...validPayout, account_number: "123 456 7890" });

// ────────────────────────────────────────────────────────────
section("requestPayoutSchema — optional note");
// ────────────────────────────────────────────────────────────

assertOk  ("with note",                      requestPayoutSchema, { ...validPayout, note: "เร่งด่วน" });
assertOk  ("empty note transformed to undefined", requestPayoutSchema, { ...validPayout, note: "" });
assertFail("note > 500 chars",               requestPayoutSchema, { ...validPayout, note: "x".repeat(501) });

// ────────────────────────────────────────────────────────────
section("requestPayoutSchema — text length bounds");
// ────────────────────────────────────────────────────────────

assertFail("bank_name > 100",                requestPayoutSchema, { ...validPayout, bank_name: "x".repeat(101) });
assertFail("account_name > 200",             requestPayoutSchema, { ...validPayout, account_name: "x".repeat(201) });

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
