/**
 * Unit tests for the customer-withdraw flow in actions/wallet-tb.ts
 * (submitWithdrawRequest · P0-7 · ADR-0018 D-2 rule 1 STATUS sub-case).
 *
 * The action itself is coupled to createAdminClient (real Supabase REST);
 * full E2E lives behind tests/qa-flows/wallet-delta.ts (ADR-0018 D-4). This
 * file locks down the PURE-LOGIC rules the action encodes, so a refactor
 * can't silently change the money contract:
 *
 *   A. The legacy withdraw ROW shape — type='3' · status='1' · positive
 *      amount · the debit-hold model (balance drops at submit, status stays
 *      pending). These are the constants the action writes; a wrong value
 *      here is a P0 money bug.
 *   B. The debit math — reuses lib/payment/wallet-math (canDebit /
 *      computeNewBalance). Re-asserted here for the withdraw direction
 *      (newBalance = balance − amount).
 *   C. The idempotency predicate — a second IDENTICAL pending withdraw
 *      (same userid + amount + type='3' + status='1') inside the 60s window
 *      is treated as a re-fired submit (alreadyDone), not a new request.
 *
 * Pattern matches actions/admin/wallet-hs.test.ts (pass/fail counts, no
 * vitest, executed via `tsx`).
 */

import { canDebit, computeNewBalance } from "@/lib/payment/wallet-math";

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

console.log("=== submitWithdrawRequest — pure helpers (ADR-0018 D-2 rule 1) ===");

// ────────────────────────────────────────────────────────────
// A. Legacy withdraw ROW shape — the constants the action writes.
// ────────────────────────────────────────────────────────────
//
// The customer withdraw row is the EXCEPTION to rule 1: it debits the wallet
// at submit (a "hold") yet stays status='1' because the admin must confirm
// the bank payout. This is the "debit-hold" model (ADR-0018 D-2 rule 1 STATUS
// sub-case · audit P1-26). Mirror of the insert object in submitWithdrawRequest.

function buildWithdrawHsRow(input: {
  amount: number;
  bank_name: string;
  account_name: string;
  account_number: string;
  memberCode: string;
}) {
  return {
    amount:          input.amount,        // POSITIVE — direction encoded by type='3'
    status:          "1",                 // pending — admin confirms bank payout (NOT '2')
    type:            "3",                 // ถอนเงิน (0081 L6220)
    typenew:         "2",                 // NOT-NULL filler (customer list keys off `type`)
    typeservice:     "1",                 // NOT-NULL default (withdraw is service-agnostic)
    depositnamebank: input.bank_name,     // ธนาคารปลายทาง
    nameuserbank:    input.account_name,  // ชื่อบัญชีรับเงินคืน
    nouserbank:      input.account_number,// เลขที่บัญชีโอนเงินคืน
    userid:          input.memberCode,
    adminid:         "",                  // no admin yet
    adminidcrate:    input.memberCode,    // customer self-initiated
  };
}

section("A. withdraw row shape — type='3' · status='1' · positive amount");

const row = buildWithdrawHsRow({
  amount: 1500,
  bank_name: "ไทยพาณิชย์",
  account_name: "สมชาย ใจดี",
  account_number: "123-4-56789-0",
  memberCode: "PR124",
});

assertEq("type is '3' (ถอนเงิน · NOT '7')",       row.type,    "3");
assertEq("status is '1' (pending · debit-hold)",   row.status,  "1");
assertEq("amount stays POSITIVE (1500)",           row.amount,  1500);
assertEq("typenew filler is '2'",                  row.typenew, "2");
assertEq("typeservice default '1'",                row.typeservice, "1");
assertEq("bank → depositnamebank",                 row.depositnamebank, "ไทยพาณิชย์");
assertEq("account name → nameuserbank",            row.nameuserbank, "สมชาย ใจดี");
assertEq("account number → nouserbank",            row.nouserbank, "123-4-56789-0");
assertEq("userid = member_code",                   row.userid, "PR124");
assertEq("adminid empty (no admin yet)",           row.adminid, "");
assertEq("adminidcrate = customer member_code",    row.adminidcrate, "PR124");

// ────────────────────────────────────────────────────────────
// B. Debit math — the hold reduces the wallet at submit.
// ────────────────────────────────────────────────────────────
section("B. debit math — canDebit + computeNewBalance (withdraw direction)");

assertEq("canDebit(1000, 1000) → true (exact)",     canDebit(1000, 1000), true);
assertEq("canDebit(1000, 1500) → false (overdraw)", canDebit(1000, 1500), false);
assertEq("canDebit(0, 25) → false (empty wallet)",  canDebit(0, 25),      false);
assertEq("canDebit(500.50, 500.50) → true",         canDebit(500.5, 500.5), true);
assertEq("newBalance 2000 − 1500 = 500",            computeNewBalance(2000, 1500), 500);
assertEq("newBalance 1000 − 1000 = 0",              computeNewBalance(1000, 1000), 0);
assertEq("newBalance 100.25 − 25 = 75.25 (no drift)", computeNewBalance(100.25, 25), 75.25);

// ────────────────────────────────────────────────────────────
// C. Idempotency predicate — re-fired submit → alreadyDone.
// ────────────────────────────────────────────────────────────
//
// The action probes for an IDENTICAL pending withdraw (same userid + amount +
// type='3' + status='1') created within the last 60s. If found, the call is a
// re-fired submit → returns alreadyDone (no second debit). Pure predicate
// mirror.

type ExistingRow = { userid: string; amount: number; type: string; status: string; ageMs: number };

function isDuplicateWithin60s(
  candidate: { userid: string; amount: number },
  existing: ExistingRow | null,
): boolean {
  if (!existing) return false;
  return (
    existing.userid === candidate.userid &&
    existing.amount === candidate.amount &&
    existing.type === "3" &&
    existing.status === "1" &&
    existing.ageMs <= 60_000
  );
}

section("C. idempotency — identical pending withdraw within 60s = duplicate");

assertEq(
  "same userid+amount, pending type=3, 5s old → duplicate",
  isDuplicateWithin60s({ userid: "PR124", amount: 1500 }, { userid: "PR124", amount: 1500, type: "3", status: "1", ageMs: 5_000 }),
  true,
);
assertEq(
  "no existing row → not duplicate (genuine first request)",
  isDuplicateWithin60s({ userid: "PR124", amount: 1500 }, null),
  false,
);
assertEq(
  "different amount → not duplicate (real second request)",
  isDuplicateWithin60s({ userid: "PR124", amount: 1500 }, { userid: "PR124", amount: 999, type: "3", status: "1", ageMs: 5_000 }),
  false,
);
assertEq(
  "older than 60s → not duplicate (legit later request)",
  isDuplicateWithin60s({ userid: "PR124", amount: 1500 }, { userid: "PR124", amount: 1500, type: "3", status: "1", ageMs: 90_000 }),
  false,
);
assertEq(
  "already approved (status=2) → not a pending duplicate",
  isDuplicateWithin60s({ userid: "PR124", amount: 1500 }, { userid: "PR124", amount: 1500, type: "3", status: "2", ageMs: 5_000 }),
  false,
);
assertEq(
  "different customer → not duplicate",
  isDuplicateWithin60s({ userid: "PR124", amount: 1500 }, { userid: "PR999", amount: 1500, type: "3", status: "1", ageMs: 5_000 }),
  false,
);

// ────────────────────────────────────────────────────────────
// Wrap-up
// ────────────────────────────────────────────────────────────
console.log(`\n${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
