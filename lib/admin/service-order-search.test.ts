/**
 * Unit tests for `service-order-search` heuristic helpers (E5).
 *
 * Scope: pure-helper exercise — no DB, no SUT mocking. Asserts the
 * detection regex handles the real-world shapes staff actually paste:
 *   - taobao/MOMO China shop order numbers (long all-digit)
 *   - YT/SF/JT/EMS/TH/CN/HK Chinese carrier tracking IDs
 *   - hNo / PR codes (should NOT trigger the cross-table scan)
 *   - thai / latin names (should NOT trigger)
 *   - MOMO container codes (e.g. KSTHGZ06031234567)
 *
 * Pattern matches other lib/admin/*.test.ts (pass/fail counts, tsx
 * runner, no vitest).
 *
 * Run with:
 *   npx tsx lib/admin/service-order-search.test.ts
 */

import {
  looksLikeTrackingOrShipping,
  sanitizeSearchTerm,
  SEARCH_AXES_HINT,
} from "./service-order-search";

let pass = 0;
let fail = 0;

function section(title: string) {
  console.log(`\n── ${title} ──`);
}

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(
      `  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
    );
  }
}

// ════════════════════════════════════════════════════════════════
// A. POSITIVE cases — tracking / shipping numbers should trigger
// ════════════════════════════════════════════════════════════════

section("A. Tracking / shipping numbers SHOULD trigger the cross-table scan");

// Real Chinese carrier formats (anonymised but shape-identical)
assertEq("YT15-digit tracking", looksLikeTrackingOrShipping("YT3045123456789"), true);
assertEq("SF12-digit tracking", looksLikeTrackingOrShipping("SF123456789012"), true);
assertEq("JT10-digit + suffix", looksLikeTrackingOrShipping("JT3045123456"), true);
assertEq("KSTHGZ MOMO container code", looksLikeTrackingOrShipping("KSTHGZ06031234567"), true);
assertEq("EMS-style 13 char + prefix", looksLikeTrackingOrShipping("EE123456789TH"), true);

// All-digit MOMO / taobao shop-order numbers (long)
assertEq("14-digit shop order", looksLikeTrackingOrShipping("12345678901234"), true);
assertEq("20-digit shop order", looksLikeTrackingOrShipping("12345678901234567890"), true);
assertEq("10-digit boundary", looksLikeTrackingOrShipping("1234567890"), true);

// Whitespace-padded — should still detect
assertEq("trimmed leading/trailing space", looksLikeTrackingOrShipping("  YT3045123456789  "), true);

// ════════════════════════════════════════════════════════════════
// B. NEGATIVE — hNo / PR / names should NOT trigger
// ════════════════════════════════════════════════════════════════

section("B. hNo / PR / names should NOT trigger (header text search handles them)");

assertEq("hNo P12345", looksLikeTrackingOrShipping("P12345"), false);
assertEq("hNo P26060001", looksLikeTrackingOrShipping("P26060001"), false);
assertEq("PR member code", looksLikeTrackingOrShipping("PR123"), false);
assertEq("PR10683 long member code", looksLikeTrackingOrShipping("PR10683"), false);
assertEq("PCS legacy member code", looksLikeTrackingOrShipping("PCS8765"), false);
assertEq("thai name", looksLikeTrackingOrShipping("สมชาย"), false);
assertEq("latin name", looksLikeTrackingOrShipping("John Doe"), false);
assertEq("empty string", looksLikeTrackingOrShipping(""), false);
assertEq("whitespace only", looksLikeTrackingOrShipping("   "), false);
assertEq("short digits (< 10)", looksLikeTrackingOrShipping("123456789"), false);
assertEq("short letters (< 9 with too few digits)", looksLikeTrackingOrShipping("office 12"), false);
assertEq("text with single digit", looksLikeTrackingOrShipping("warehouse 1"), false);

// ════════════════════════════════════════════════════════════════
// C. CASE INSENSITIVITY — lowercase letters work too
// ════════════════════════════════════════════════════════════════

section("C. Case-insensitivity — lowercase tracking variants also detect");

assertEq("lowercase yt prefix", looksLikeTrackingOrShipping("yt3045123456789"), true);
assertEq("lowercase pr code skip", looksLikeTrackingOrShipping("pr123"), false);
assertEq("mixed-case hNo skip", looksLikeTrackingOrShipping("p12345"), false);

// ════════════════════════════════════════════════════════════════
// D. SANITIZE — strips dangerous PostgREST chars
// ════════════════════════════════════════════════════════════════

section("D. sanitizeSearchTerm — drops PostgREST .or() injection chars");

assertEq("strip percent", sanitizeSearchTerm("hello%world"), "helloworld");
assertEq("strip comma", sanitizeSearchTerm("a,b,c"), "abc");
assertEq("strip asterisk", sanitizeSearchTerm("foo*bar"), "foobar");
assertEq("strip parens", sanitizeSearchTerm("(scan)"), "scan");
assertEq("plain string passes", sanitizeSearchTerm("YT3045123456789"), "YT3045123456789");
assertEq("strip all at once", sanitizeSearchTerm("(%a*,b)"), "ab");

// ════════════════════════════════════════════════════════════════
// E. CONSTANTS — the placeholder/help-text axis hint exists
// ════════════════════════════════════════════════════════════════

section("E. SEARCH_AXES_HINT — non-empty Thai string for the UI label");

assertEq("hint is non-empty", SEARCH_AXES_HINT.length > 0, true);
assertEq(
  "hint mentions all 5 axes (loose contains)",
  SEARCH_AXES_HINT.includes("hNo") &&
    SEARCH_AXES_HINT.includes("PR") &&
    SEARCH_AXES_HINT.includes("ชื่อ") &&
    SEARCH_AXES_HINT.includes("tracking") &&
    SEARCH_AXES_HINT.includes("เลขสั่งจีน"),
  true,
);

// ════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════

console.log(`\n────────────────────────────────────────`);
console.log(`  service-order-search.test.ts`);
console.log(`  ${pass} passed · ${fail} failed`);
console.log(`────────────────────────────────────────`);
if (fail > 0) process.exit(1);
