/**
 * Unit tests for the shop-refund-history pure helpers (E6).
 *
 * Scope: tests ONLY the pure helpers extracted to
 * `lib/admin/refund-history-helpers.ts` (date filter math · pagination
 * range · search-match predicate). The `listRefundHistory` action
 * itself hits Supabase + requireAdmin so it belongs to an integration
 * suite (skipped under `pnpm test:unit`).
 *
 * Why import from `lib/admin/refund-history-helpers` not the action
 * file? Importing from `service-orders-refund-history.ts` transitively
 * pulls in `lib/supabase/admin.ts` → `server-only`, which errors under
 * `tsx`. The helpers were split out for exactly this reason — the
 * action re-exports them so production callers still only need ONE
 * import.
 *
 * Run with:
 *   npx tsx actions/admin/service-orders-refund-history.test.ts
 */

import {
  nowIso,
  daysAgoIso,
  todayIso,
  endOfDayTs,
  refundHistoryRange,
  refundHistoryMatches,
  DEFAULT_REFUND_WINDOW_DAYS,
} from "../../lib/admin/refund-history-helpers";

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

function assertTrue(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}`);
  }
}

// ════════════════════════════════════════════════════════════════
// A. Date helpers
// ════════════════════════════════════════════════════════════════

section("A. Date helpers");

const fixedRef = new Date("2026-06-09T08:00:00Z");

assertEq("todayIso(fixed ref)", todayIso(fixedRef), "2026-06-09");
assertEq("daysAgoIso(30, fixed ref)", daysAgoIso(30, fixedRef), "2026-05-10");
assertEq("daysAgoIso(0, fixed ref)", daysAgoIso(0, fixedRef), "2026-06-09");
assertEq("daysAgoIso(1, fixed ref)", daysAgoIso(1, fixedRef), "2026-06-08");
assertEq("endOfDayTs", endOfDayTs("2026-06-09"), "2026-06-09T23:59:59");

assertTrue(
  "nowIso returns ISO string of length >= 20",
  typeof nowIso() === "string" && nowIso().length >= 20 && nowIso().includes("T"),
);

assertEq(
  "DEFAULT_REFUND_WINDOW_DAYS is 30",
  DEFAULT_REFUND_WINDOW_DAYS,
  30,
);

// ════════════════════════════════════════════════════════════════
// B. Pagination range math
// ════════════════════════════════════════════════════════════════

section("B. refundHistoryRange — 1-based page → 0-based .range()");

assertEq("page 1 · size 50 → [0, 49]", refundHistoryRange(1, 50), { from: 0, to: 49 });
assertEq("page 2 · size 50 → [50, 99]", refundHistoryRange(2, 50), { from: 50, to: 99 });
assertEq("page 3 · size 25 → [50, 74]", refundHistoryRange(3, 25), { from: 50, to: 74 });
assertEq("page 1 · size 1 → [0, 0]", refundHistoryRange(1, 1), { from: 0, to: 0 });
// Defensive: invalid → clamps to page 1, pageSize 50
assertEq("page 0 → clamp to page 1", refundHistoryRange(0, 50), { from: 0, to: 49 });
assertEq("page NaN → clamp to page 1", refundHistoryRange(NaN, 50), { from: 0, to: 49 });
assertEq("size 0 → clamp to 50", refundHistoryRange(1, 0), { from: 0, to: 49 });
assertEq("size NaN → clamp to 50", refundHistoryRange(1, NaN), { from: 0, to: 49 });

// ════════════════════════════════════════════════════════════════
// C. Search-match — case-insensitive substring on hno OR userid
// ════════════════════════════════════════════════════════════════

section("C. refundHistoryMatches — case-insensitive (hno OR userid)");

const row = { hno: "P26060001", userid: "PR321" };

assertEq("empty keyword → match all", refundHistoryMatches("", row), true);
assertEq("null keyword → match all", refundHistoryMatches(null, row), true);
assertEq("undefined keyword → match all", refundHistoryMatches(undefined, row), true);
assertEq("whitespace-only → match all", refundHistoryMatches("   ", row), true);

assertEq("matches hno (exact)", refundHistoryMatches("P26060001", row), true);
assertEq("matches hno (prefix)", refundHistoryMatches("P260", row), true);
assertEq("matches hno (suffix)", refundHistoryMatches("0001", row), true);
assertEq("matches hno (case-insensitive)", refundHistoryMatches("p26060001", row), true);

assertEq("matches userid (exact)", refundHistoryMatches("PR321", row), true);
assertEq("matches userid (case-insensitive)", refundHistoryMatches("pr321", row), true);
assertEq("matches userid (prefix)", refundHistoryMatches("PR", row), true);

assertEq("no match", refundHistoryMatches("XYZ", row), false);
assertEq("partial no-match", refundHistoryMatches("P9999", row), false);

// Null tolerance — if hno/userid is null on the candidate row, still no NPE.
assertEq(
  "no match with null hno",
  refundHistoryMatches("foo", { hno: null, userid: null }),
  false,
);
assertEq(
  "empty kw matches even null candidate",
  refundHistoryMatches("", { hno: null, userid: null }),
  true,
);

// ════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════

console.log(`\n────────────────────────────────────────`);
console.log(`  service-orders-refund-history.test.ts`);
console.log(`  ${pass} passed · ${fail} failed`);
console.log(`────────────────────────────────────────`);
if (fail > 0) process.exit(1);
