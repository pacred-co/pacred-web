/**
 * Unit tests for thai-number.ts (PHP ReadNumber port).
 *
 * Run with: pnpm tsx lib/utils/thai-number.test.ts
 * Will exit non-zero on first failed assertion.
 */

import { readThaiInteger, readThaiBaht } from "./thai-number";

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

// ── readThaiInteger: edges + units ───────────────────────────────────────
console.log("readThaiInteger: zero + negatives + non-finite");
assertEq("zero → empty", readThaiInteger(0), "");
assertEq("negative → empty", readThaiInteger(-5), "");
assertEq("NaN → empty", readThaiInteger(NaN), "");
assertEq("Infinity → empty", readThaiInteger(Infinity), "");

console.log("\nreadThaiInteger: 1-9 digits");
assertEq("1", readThaiInteger(1), "หนึ่ง");
assertEq("2", readThaiInteger(2), "สอง");
assertEq("3", readThaiInteger(3), "สาม");
assertEq("4", readThaiInteger(4), "สี่");
assertEq("5", readThaiInteger(5), "ห้า");
assertEq("6", readThaiInteger(6), "หก");
assertEq("7", readThaiInteger(7), "เจ็ด");
assertEq("8", readThaiInteger(8), "แปด");
assertEq("9", readThaiInteger(9), "เก้า");

console.log("\nreadThaiInteger: tens (สิบ + เอ็ด + ยี่)");
assertEq("10 → สิบ (no หนึ่ง)", readThaiInteger(10), "สิบ");
assertEq("11 → สิบเอ็ด", readThaiInteger(11), "สิบเอ็ด");
assertEq("12 → สิบสอง", readThaiInteger(12), "สิบสอง");
assertEq("20 → ยี่สิบ (not สองสิบ)", readThaiInteger(20), "ยี่สิบ");
assertEq("21 → ยี่สิบเอ็ด", readThaiInteger(21), "ยี่สิบเอ็ด");
assertEq("30 → สามสิบ", readThaiInteger(30), "สามสิบ");
assertEq("99 → เก้าสิบเก้า", readThaiInteger(99), "เก้าสิบเก้า");

console.log("\nreadThaiInteger: hundreds");
assertEq("100 → หนึ่งร้อย", readThaiInteger(100), "หนึ่งร้อย");
assertEq("101 → หนึ่งร้อยเอ็ด", readThaiInteger(101), "หนึ่งร้อยเอ็ด");
assertEq("110 → หนึ่งร้อยสิบ", readThaiInteger(110), "หนึ่งร้อยสิบ");
assertEq("121 → หนึ่งร้อยยี่สิบเอ็ด", readThaiInteger(121), "หนึ่งร้อยยี่สิบเอ็ด");
assertEq("999 → เก้าร้อยเก้าสิบเก้า", readThaiInteger(999), "เก้าร้อยเก้าสิบเก้า");

console.log("\nreadThaiInteger: thousands → hundred-thousands");
assertEq("1000 → หนึ่งพัน", readThaiInteger(1000), "หนึ่งพัน");
assertEq("1001 → หนึ่งพันเอ็ด", readThaiInteger(1001), "หนึ่งพันเอ็ด");
assertEq("1234 → หนึ่งพันสองร้อยสามสิบสี่", readThaiInteger(1234), "หนึ่งพันสองร้อยสามสิบสี่");
assertEq("10000 → หนึ่งหมื่น", readThaiInteger(10000), "หนึ่งหมื่น");
assertEq("100000 → หนึ่งแสน", readThaiInteger(100000), "หนึ่งแสน");

console.log("\nreadThaiInteger: millions (recursive)");
assertEq("1000000 → หนึ่งล้าน", readThaiInteger(1000000), "หนึ่งล้าน");
assertEq("1000001 → หนึ่งล้านเอ็ด", readThaiInteger(1000001), "หนึ่งล้านเอ็ด");
assertEq(
  "12345678 → สิบสองล้านสามแสนสี่หมื่นห้าพันหกร้อยเจ็ดสิบแปด",
  readThaiInteger(12345678),
  "สิบสองล้านสามแสนสี่หมื่นห้าพันหกร้อยเจ็ดสิบแปด",
);
assertEq("100000000 → หนึ่งร้อยล้าน", readThaiInteger(100000000), "หนึ่งร้อยล้าน");
assertEq("1000000000 → หนึ่งพันล้าน", readThaiInteger(1000000000), "หนึ่งพันล้าน");
assertEq(
  "1000000000000 → หนึ่งล้านล้าน",
  readThaiInteger(1_000_000_000_000),
  "หนึ่งล้านล้าน",
);

// ── readThaiBaht: receipt-format ─────────────────────────────────────────
console.log("\nreadThaiBaht: zero + edges");
assertEq("0 → ศูนย์บาทถ้วน", readThaiBaht(0), "ศูนย์บาทถ้วน");
assertEq("NaN → ศูนย์บาทถ้วน", readThaiBaht(NaN), "ศูนย์บาทถ้วน");

console.log("\nreadThaiBaht: whole baht (ถ้วน)");
assertEq("1 → หนึ่งบาทถ้วน", readThaiBaht(1), "หนึ่งบาทถ้วน");
assertEq("100 → หนึ่งร้อยบาทถ้วน", readThaiBaht(100), "หนึ่งร้อยบาทถ้วน");
assertEq(
  "1234 → หนึ่งพันสองร้อยสามสิบสี่บาทถ้วน",
  readThaiBaht(1234),
  "หนึ่งพันสองร้อยสามสิบสี่บาทถ้วน",
);

console.log("\nreadThaiBaht: with satang");
assertEq("0.5 → ห้าสิบสตางค์", readThaiBaht(0.5), "ห้าสิบสตางค์");
assertEq("0.25 → ยี่สิบห้าสตางค์", readThaiBaht(0.25), "ยี่สิบห้าสตางค์");
assertEq("0.01 → หนึ่งสตางค์", readThaiBaht(0.01), "หนึ่งสตางค์");
assertEq(
  "100.50 → หนึ่งร้อยบาทห้าสิบสตางค์",
  readThaiBaht(100.5),
  "หนึ่งร้อยบาทห้าสิบสตางค์",
);
assertEq(
  "1234.05 → หนึ่งพันสองร้อยสามสิบสี่บาทห้าสตางค์",
  readThaiBaht(1234.05),
  "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสตางค์",
);

console.log("\nreadThaiBaht: large amounts (typical receipt totals)");
assertEq(
  "12345.67 → สิบสองพันสามร้อยสี่สิบห้าบาทหกสิบเจ็ดสตางค์ (wait — should be 'หนึ่งหมื่นสองพัน...')",
  readThaiBaht(12345.67),
  "หนึ่งหมื่นสองพันสามร้อยสี่สิบห้าบาทหกสิบเจ็ดสตางค์",
);
assertEq(
  "146395.12 → from screenshot ROG order",
  readThaiBaht(146395.12),
  "หนึ่งแสนสี่หมื่นหกพันสามร้อยเก้าสิบห้าบาทสิบสองสตางค์",
);

console.log("\nreadThaiBaht: negative (refund)");
assertEq("-50 → ลบห้าสิบบาทถ้วน", readThaiBaht(-50), "ลบห้าสิบบาทถ้วน");

console.log("\nreadThaiBaht: floating point edge");
// 0.1 + 0.2 = 0.30000000000000004 — must round to 30 satang
assertEq("0.1 + 0.2 → สามสิบสตางค์", readThaiBaht(0.1 + 0.2), "สามสิบสตางค์");

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
