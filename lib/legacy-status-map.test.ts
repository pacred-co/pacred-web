/**
 * Unit tests for lib/legacy-status-map.ts — the D1 canonical legacy↔rebuilt↔Thai
 * status vocabulary (hstatus 1-6 / fstatus 1-7). Pure, no IO. Load-bearing:
 * every order/forwarder display + status-filter query reads this.
 *
 * Run:  pnpm tsx lib/legacy-status-map.test.ts   (wired into pnpm test:unit)
 */

import {
  legacyOrderStatusThai, legacyForwarderStatusThai,
  toLegacyOrderCode, toLegacyForwarderCode,
  LEGACY_ORDER_TABS, LEGACY_ORDER_STATUS, LEGACY_FORWARDER_STATUS,
} from "./legacy-status-map";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// ── order status → Thai ──
section("legacyOrderStatusThai (hstatus)");
assertEq("1 → รอดำเนินการ", legacyOrderStatusThai("1"), "รอดำเนินการ");
assertEq("2 → รอชำระเงิน", legacyOrderStatusThai("2"), "รอชำระเงิน");
assertEq("5 → สำเร็จ", legacyOrderStatusThai("5"), "สำเร็จ");
assertEq("6 → ยกเลิก", legacyOrderStatusThai("6"), "ยกเลิก");
assertEq("null → empty string", legacyOrderStatusThai(null), "");
assertEq("unknown code → echoes the code", legacyOrderStatusThai("99"), "99");

// ── forwarder status → Thai (ship → arrive → THEN pay) ──
section("legacyForwarderStatusThai (fstatus)");
assertEq("1 → รอสินค้าเข้าโกดังจีน", legacyForwarderStatusThai("1"), "รอสินค้าเข้าโกดังจีน");
assertEq("5 → รอชำระเงิน (pay AFTER arrival — the COD inversion)", legacyForwarderStatusThai("5"), "รอชำระเงิน");
assertEq("7 → ส่งแล้ว", legacyForwarderStatusThai("7"), "ส่งแล้ว");
assertEq("empty → empty string", legacyForwarderStatusThai(""), "");

// ── rebuilt key → legacy code (for status-filter queries) ──
section("toLegacyOrderCode / toLegacyForwarderCode");
assertEq("'completed' → order code 5", toLegacyOrderCode("completed"), "5");
assertEq("'cancelled' → order code 6", toLegacyOrderCode("cancelled"), "6");
assertEq("unknown rebuilt key → undefined", toLegacyOrderCode("nope"), undefined);
assertEq("'delivered' → forwarder code 7", toLegacyForwarderCode("delivered"), "7");
assertEq("'pending_payment' → forwarder code 5", toLegacyForwarderCode("pending_payment"), "5");

// ── round-trip integrity ──
section("round-trip + tabs");
assertEq("toLegacyOrderCode(key of '3') === '3'", toLegacyOrderCode(LEGACY_ORDER_STATUS["3"].key), "3");
assertEq("toLegacyForwarderCode(key of '6') === '6'", toLegacyForwarderCode(LEGACY_FORWARDER_STATUS["6"].key), "6");
// "40" (ถึงโกดังจีน · owner 2026-06-16 MOMO arrival) slots between 4 and 5.
assertEq("order tabs are 7 in legacy display order (incl. 40)", LEGACY_ORDER_TABS.map((t) => t.code), ["1", "2", "3", "4", "40", "5", "6"]);
assertEq("first tab is รอดำเนินการ", LEGACY_ORDER_TABS[0].thai, "รอดำเนินการ");
assertEq("'40' → ถึงโกดังจีน", LEGACY_ORDER_STATUS["40"].thai, "ถึงโกดังจีน");
assertEq("'arrived_china_warehouse' → order code 40", toLegacyOrderCode("arrived_china_warehouse"), "40");

console.log(`\n${fail === 0 ? "✅" : "❌"} legacy-status-map: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
