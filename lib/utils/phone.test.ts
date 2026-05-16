/**
 * Unit tests for normalizePhone + detectIdentifier.
 *
 * Critical helpers in the auth/signup path — covers chat audit L-3
 * (OTP silent fail) by making sure phone normalization is consistent
 * across the signup form, login lookup, and SMS dispatch.
 *
 * Pattern matches lib/forwarder/calc-price.test.ts (plain tsx + manual
 * assertions, no vitest dep).
 */

import { normalizePhone, detectIdentifier } from "./phone";

let pass = 0;
let fail = 0;

function assertEq<T>(label: string, actual: T, expected: T) {
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

// ────────────────────────────────────────────────────────────
section("normalizePhone — Thai mobile (leading 0)");
// ────────────────────────────────────────────────────────────

assertEq("compact 0812345678 → +66812345678",        normalizePhone("0812345678"),     "+66812345678");
assertEq("spaced 081 234 5678 → +66812345678",       normalizePhone("081 234 5678"),   "+66812345678");
assertEq("dashed 081-234-5678 → +66812345678",       normalizePhone("081-234-5678"),   "+66812345678");
assertEq("parens (081)234-5678 → +66812345678",      normalizePhone("(081)234-5678"),  "+66812345678");
assertEq("leading-zero 02-123-4567 → +6621234567",   normalizePhone("02-123-4567"),    "+6621234567");

// ────────────────────────────────────────────────────────────
section("normalizePhone — international (already E.164)");
// ────────────────────────────────────────────────────────────

assertEq("with-plus +66812345678 → +66812345678",     normalizePhone("+66812345678"),   "+66812345678");
assertEq("with-plus and spaces +66 81 234 5678",      normalizePhone("+66 81 234 5678"),"+66812345678");
assertEq("non-TH +1 555 1234 → +15551234",            normalizePhone("+1 555 1234"),    "+15551234");

// ────────────────────────────────────────────────────────────
section("normalizePhone — 66-prefix (no plus)");
// ────────────────────────────────────────────────────────────

assertEq("66812345678 → +66812345678",                normalizePhone("66812345678"),    "+66812345678");
assertEq("spaced 66 81 234 5678",                     normalizePhone("66 81 234 5678"), "+66812345678");

// ────────────────────────────────────────────────────────────
section("normalizePhone — no-prefix (assume TH +66)");
// ────────────────────────────────────────────────────────────

assertEq("9-digit 812345678 → +66812345678",          normalizePhone("812345678"),      "+66812345678");

// ────────────────────────────────────────────────────────────
section("detectIdentifier — email");
// ────────────────────────────────────────────────────────────

assertEq("user@example.com",        detectIdentifier("user@example.com"),       "email");
assertEq("plus-tag user+tag@x.co",  detectIdentifier("user+tag@example.com"),   "email");
assertEq("trailing space (still has @)", detectIdentifier(" me@pacred.co "),    "email");

// ────────────────────────────────────────────────────────────
section("detectIdentifier — memberCode (PR + min 3 digits)");
// ────────────────────────────────────────────────────────────

assertEq("PR001 → memberCode (new 3-digit pattern)", detectIdentifier("PR001"),    "memberCode");
assertEq("PR042 → memberCode",            detectIdentifier("PR042"),         "memberCode");
assertEq("PR999 → memberCode",            detectIdentifier("PR999"),         "memberCode");
assertEq("PR1000 → memberCode (past 999)", detectIdentifier("PR1000"),       "memberCode");
assertEq("PR12345 → memberCode (5-digit still ok)", detectIdentifier("PR12345"), "memberCode");
assertEq("PR00001 → memberCode (legacy 5-digit compat)", detectIdentifier("PR00001"), "memberCode");
assertEq("lowercase pr001 → memberCode (case-insensitive)", detectIdentifier("pr001"), "memberCode");
assertEq("mixed-case Pr042 → memberCode", detectIdentifier("Pr042"),         "memberCode");
assertEq("trimmed ' PR001 ' → memberCode", detectIdentifier(" PR001 "),      "memberCode");

assertEq("PR12 (only 2 digits) → phone (fallback)",    detectIdentifier("PR12"),        "phone");
assertEq("PCS12345 (legacy prefix) → phone (fallback)", detectIdentifier("PCS12345"),  "phone");
assertEq("RP001 (wrong order) → phone",                detectIdentifier("RP001"),      "phone");

// ────────────────────────────────────────────────────────────
section("detectIdentifier — phone (fallback)");
// ────────────────────────────────────────────────────────────

assertEq("0812345678 → phone",          detectIdentifier("0812345678"),   "phone");
assertEq("+66812345678 → phone",        detectIdentifier("+66812345678"), "phone");
assertEq("081-234-5678 (dashed) → phone", detectIdentifier("081-234-5678"), "phone");

// Edge cases — implementation contract
assertEq("empty string → phone (fallback, no @ + no PR)", detectIdentifier(""), "phone");
assertEq("whitespace-only '   ' → phone",                detectIdentifier("   "), "phone");

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
