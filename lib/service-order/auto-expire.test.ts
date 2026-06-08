/**
 * Unit tests for the shop-order auto-cancel eligibility predicate
 * (lib/service-order/auto-expire.ts::isShopOrderAutoExpireEligible) — the pure,
 * DB-free guard extracted from `autoExpireOverdueShopOrder`.
 *
 * Faithful to legacy detail.php L73-78 / update.php L72-78: a status-2
 * (รอชำระเงิน) order whose hDatePayment deadline has PASSED is the only thing
 * that may flip to hStatus 6 (ยกเลิก). Every other case must be skipped (NEVER
 * cancel a paid / in-progress / not-yet-due / un-dated order).
 *
 * `now` is injected so the past/future boundary is deterministic.
 *
 * Run:  tsx lib/service-order/auto-expire.test.ts   (wired into pnpm test:unit)
 */

import { isShopOrderAutoExpireEligible } from "./auto-expire-eligibility";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

console.log("=== isShopOrderAutoExpireEligible — shop-order auto-cancel guard (legacy detail.php L73) ===");

const NOW = Date.parse("2026-06-09T12:00:00.000Z");
const PAST = "2026-06-08T12:00:00.000Z"; // 24h before NOW
const FUTURE = "2026-06-10T12:00:00.000Z"; // 24h after NOW
const eligible = (over: { id?: number; hstatus?: string | null; hdatepayment?: string | null }) =>
  isShopOrderAutoExpireEligible({ id: 1, hstatus: "2", hdatepayment: PAST, ...over }, NOW);

// ── (a) the ONE eligible case: status-2 + past-due deadline ───────────────
section("(a) eligible: status-2 + past-due");
assertEq("status '2' + past deadline → eligible (true)", eligible({}), true);

// ── (b) status guard — only '2' is ever expirable ──────────────────────────
section("(b) status≠'2' → never eligible");
for (const s of ["1", "3", "4", "5", "6", "7", "", null]) {
  assertEq(`hstatus ${JSON.stringify(s)} (even if past-due) → skip`, eligible({ hstatus: s }), false);
}

// ── (c) hdatepayment guard — null / empty / unparseable → skip ─────────────
section("(c) missing / bad deadline → skip");
assertEq("null hdatepayment → skip", eligible({ hdatepayment: null }), false);
assertEq("empty-string hdatepayment → skip", eligible({ hdatepayment: "" }), false);
assertEq("unparseable hdatepayment → skip (non-finite due)", eligible({ hdatepayment: "not-a-date" }), false);

// ── (d) due-date boundary — future / exactly-now → skip; past → eligible ───
section("(d) past/future boundary");
assertEq("future deadline → skip", eligible({ hdatepayment: FUTURE }), false);
assertEq("deadline exactly === now → skip (legacy due>=now keeps)",
  isShopOrderAutoExpireEligible({ id: 1, hstatus: "2", hdatepayment: new Date(NOW).toISOString() }, NOW), false);
assertEq("deadline 1ms before now → eligible",
  isShopOrderAutoExpireEligible({ id: 1, hstatus: "2", hdatepayment: new Date(NOW - 1).toISOString() }, NOW), true);
assertEq("deadline 1ms after now → skip",
  isShopOrderAutoExpireEligible({ id: 1, hstatus: "2", hdatepayment: new Date(NOW + 1).toISOString() }, NOW), false);

// ── (e) default now → a clearly-past deadline is still eligible (real clock) ─
section("(e) default now arg");
assertEq("status-2 + year-2000 deadline (real Date.now) → eligible",
  isShopOrderAutoExpireEligible({ id: 9, hstatus: "2", hdatepayment: "2000-01-01T00:00:00.000Z" }), true);
assertEq("status-2 + year-3000 deadline (real Date.now) → skip",
  isShopOrderAutoExpireEligible({ id: 9, hstatus: "2", hdatepayment: "3000-01-01T00:00:00.000Z" }), false);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
