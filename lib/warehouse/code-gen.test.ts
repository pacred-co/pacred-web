/**
 * Unit tests for the container code generator (T-P2 / CT-2).
 *
 * Pure helper — no DB.  Imports from ./code-gen directly (not server-only),
 * matches the tsx pattern in lib/forwarder/calc-price.test.ts +
 * lib/china-search/extract-product-id.test.ts.
 *
 * Run with:  pnpm tsx lib/warehouse/code-gen.test.ts
 *            (or `pnpm test:unit` to run alongside the rest)
 */

import { buildContainerCode, dateSlug, originPrefix } from "./code-gen";

let pass = 0;
let fail = 0;

function assertEq<T>(label: string, actual: T, expected: T): void {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
    fail++;
  }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

console.log("=== container code-gen ===");

// ────────────────────────────────────────────────────────────
// (a) originPrefix — known map
// ────────────────────────────────────────────────────────────
group("(a) originPrefix — known cities", () => {
  assertEq("guangzhou → GZ", originPrefix("guangzhou"), "GZ");
  assertEq("Yiwu → YW (case-insensitive)", originPrefix("Yiwu"), "YW");
  assertEq("Shenzhen → SZ", originPrefix("Shenzhen"), "SZ");
  assertEq("hangzhou → HZ", originPrefix("hangzhou"), "HZ");
  assertEq("shanghai → SH", originPrefix("shanghai"), "SH");
});

// ────────────────────────────────────────────────────────────
// (b) originPrefix — unknown falls through (uppercased, max 3 chars)
// ────────────────────────────────────────────────────────────
group("(b) originPrefix — unknown fall-through", () => {
  assertEq("GZE → GZE (already a prefix)",   originPrefix("GZE"),   "GZE");
  assertEq("xiamen → XIA",                    originPrefix("xiamen"), "XIA");
  assertEq("a → A (single char preserved)",   originPrefix("a"),     "A");
  assertEq("empty string → XX fallback",      originPrefix(""),      "XX");
});

// ────────────────────────────────────────────────────────────
// (c) dateSlug — UTC+7 (Bangkok)
// ────────────────────────────────────────────────────────────
group("(c) dateSlug — Bangkok timezone", () => {
  // 2026-05-16 17:00 UTC = 2026-05-17 00:00 Bangkok → YY=26, MM=05, DD=17
  assertEq(
    "UTC 2026-05-16 17:00 → Bangkok 260517",
    dateSlug(new Date("2026-05-16T17:00:00Z")),
    "260517",
  );
  // 2026-01-01 04:00 UTC = 2026-01-01 11:00 Bangkok
  assertEq(
    "UTC 2026-01-01 04:00 → Bangkok 260101",
    dateSlug(new Date("2026-01-01T04:00:00Z")),
    "260101",
  );
  // Edge: 2026-12-31 23:00 UTC = 2027-01-01 06:00 Bangkok → year flips
  assertEq(
    "UTC 2026-12-31 23:00 → Bangkok 270101 (year roll)",
    dateSlug(new Date("2026-12-31T23:00:00Z")),
    "270101",
  );
});

// ────────────────────────────────────────────────────────────
// (d) buildContainerCode — composition
// ────────────────────────────────────────────────────────────
group("(d) buildContainerCode — composition", () => {
  assertEq(
    "guangzhou + 2026-05-16 + seq 1",
    buildContainerCode({ origin: "guangzhou", date: new Date("2026-05-16T05:00:00Z"), seq: 1 }),
    "GZ260516-1",
  );
  assertEq(
    "yiwu + seq 42",
    buildContainerCode({ origin: "yiwu", date: new Date("2026-05-16T05:00:00Z"), seq: 42 }),
    "YW260516-42",
  );
  assertEq(
    "GZE + seq 7 (already-prefix passes through)",
    buildContainerCode({ origin: "GZE", date: new Date("2026-05-16T05:00:00Z"), seq: 7 }),
    "GZE260516-7",
  );
});

// ────────────────────────────────────────────────────────────
// summary
// ────────────────────────────────────────────────────────────
console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
