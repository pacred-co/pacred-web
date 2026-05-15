/**
 * Unit tests for wallet Zod schemas.
 *
 * Locks the validation contract for /wallet/deposit + /wallet/withdraw
 * forms — money-handling code path needs especially tight bounds since
 * a missed validation = financial mistake.
 *
 * Pattern matches lib/validators/auth.test.ts (pass/fail counts, no vitest).
 */

import { depositSchema, withdrawSchema } from "./wallet";

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

// ────────────────────────────────────────────────────────────
section("depositSchema — amount bounds");
// ────────────────────────────────────────────────────────────

assertOk  ("amount=1 (min positive)",       depositSchema, { amount: 1 });
assertOk  ("amount=500",                    depositSchema, { amount: 500 });
assertOk  ("amount=1,000,000 (max)",        depositSchema, { amount: 1_000_000 });
assertOk  ("amount=999.99 (decimal)",       depositSchema, { amount: 999.99 });
assertFail("amount=0 (not positive)",       depositSchema, { amount: 0 });
assertFail("amount=-100 (negative)",        depositSchema, { amount: -100 });
assertFail("amount=1,000,001 (over max)",   depositSchema, { amount: 1_000_001 });
assertFail("amount=null",                   depositSchema, { amount: null });
assertFail("amount=undefined (required)",   depositSchema, {});
assertFail("amount=string '500'",           depositSchema, { amount: "500" });

// ────────────────────────────────────────────────────────────
section("depositSchema — optional fields");
// ────────────────────────────────────────────────────────────

assertOk("happy with slip_url",
  depositSchema, { amount: 500, slip_url: "https://example.com/slip.jpg" });
assertOk("happy with slip_date YYYY-MM-DD",
  depositSchema, { amount: 500, slip_date: "2026-05-16" });
assertOk("happy with slip_date YYYY-MM-DDTHH:MM (longer prefix matches /^\\d{4}-\\d{2}-\\d{2}/)",
  depositSchema, { amount: 500, slip_date: "2026-05-16T14:30" });
assertOk("happy with bank_name + note",
  depositSchema, { amount: 500, bank_name: "SCB", note: "เติมเงินรอจัดส่ง" });
assertOk("empty slip_date transformed to undefined",
  depositSchema, { amount: 500, slip_date: "" });
assertOk("empty bank_name transformed to undefined",
  depositSchema, { amount: 500, bank_name: "" });
assertFail("slip_date malformed '2026/05/16'",
  depositSchema, { amount: 500, slip_date: "2026/05/16" });
assertFail("slip_date too short '2026-05'",
  depositSchema, { amount: 500, slip_date: "2026-05" });
assertFail("note > 500 chars",
  depositSchema, { amount: 500, note: "a".repeat(501) });

// ────────────────────────────────────────────────────────────
section("withdrawSchema — required bank account fields");
// ────────────────────────────────────────────────────────────

const validWithdraw = {
  amount: 1000,
  bank_name: "SCB",
  account_name: "ทดสอบ ทดสอบ",
  account_number: "1234567890",
};

assertOk  ("happy path 10-digit account",        withdrawSchema, validWithdraw);
assertOk  ("happy path 8-digit account",         withdrawSchema, { ...validWithdraw, account_number: "12345678" });
assertOk  ("happy path 20-digit account",        withdrawSchema, { ...validWithdraw, account_number: "12345678901234567890" });
assertOk  ("happy path with dashes",             withdrawSchema, { ...validWithdraw, account_number: "123-456-7890" });
assertOk  ("with optional note",                 withdrawSchema, { ...validWithdraw, note: "ขอด่วน" });
assertOk  ("empty note transformed to undefined", withdrawSchema, { ...validWithdraw, note: "" });

assertFail("missing bank_name",                  withdrawSchema, { ...validWithdraw, bank_name: "" });
assertFail("missing account_name",               withdrawSchema, { ...validWithdraw, account_name: "" });
assertFail("account_number 7 digits (too short)", withdrawSchema, { ...validWithdraw, account_number: "1234567" });
assertFail("account_number 21 digits (too long)", withdrawSchema, { ...validWithdraw, account_number: "123456789012345678901" });
assertFail("account_number with letters",        withdrawSchema, { ...validWithdraw, account_number: "1234ABCD90" });
assertFail("account_number with spaces",         withdrawSchema, { ...validWithdraw, account_number: "123 456 7890" });

// ────────────────────────────────────────────────────────────
section("withdrawSchema — amount bounds shared with deposit");
// ────────────────────────────────────────────────────────────

assertOk  ("amount=1 ok",                        withdrawSchema, { ...validWithdraw, amount: 1 });
assertOk  ("amount=1,000,000 ok (max)",          withdrawSchema, { ...validWithdraw, amount: 1_000_000 });
assertFail("amount=0 not positive",              withdrawSchema, { ...validWithdraw, amount: 0 });
assertFail("amount=-100 negative",               withdrawSchema, { ...validWithdraw, amount: -100 });
assertFail("amount=1,000,001 over max",          withdrawSchema, { ...validWithdraw, amount: 1_000_001 });

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
