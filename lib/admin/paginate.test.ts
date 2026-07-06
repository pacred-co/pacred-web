/**
 * Unit tests for lib/admin/paginate.ts — the pure pagination helpers behind the
 * shared admin-list `.range()` windowing + the <PageSizeSelect> control.
 * Focuses on parsePageSize (the 2026-07-06 addition), plus a couple of
 * parsePage / pageRange guards so a regression in the window math is caught.
 *
 * Run with:  pnpm tsx lib/admin/paginate.test.ts
 */

import {
  DEFAULT_PAGE_SIZE,
  ALLOWED_PAGE_SIZES,
  ALL_PAGE_SIZE_CAP,
  parsePage,
  parsePageSize,
  pageRange,
} from "./paginate";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function eq<T>(name: string, actual: T, expected: T): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    console.log(`  ✗ ${name}`);
  }
}

console.log("parsePageSize");
eq("undefined → default", parsePageSize(undefined), DEFAULT_PAGE_SIZE);
eq("empty string → default", parsePageSize(""), DEFAULT_PAGE_SIZE);
eq("garbage → default", parsePageSize("abc"), DEFAULT_PAGE_SIZE);
eq("out-of-set number → default", parsePageSize("37"), DEFAULT_PAGE_SIZE);
eq("negative → default", parsePageSize("-100"), DEFAULT_PAGE_SIZE);
for (const n of ALLOWED_PAGE_SIZES) {
  eq(`allowed ${n} → ${n}`, parsePageSize(String(n)), n);
}
eq("'all' → hard cap", parsePageSize("all"), ALL_PAGE_SIZE_CAP);
eq("array value → first element", parsePageSize(["100", "500"]), 100);
eq("array 'all' → hard cap", parsePageSize(["all"]), ALL_PAGE_SIZE_CAP);
eq("cap never exceeds 5000", ALL_PAGE_SIZE_CAP, 5000);

console.log("parsePage");
eq("undefined → 1", parsePage(undefined), 1);
eq("'3' → 3", parsePage("3"), 3);
eq("'0' → 1 (clamp)", parsePage("0"), 1);
eq("'-2' → 1 (clamp)", parsePage("-2"), 1);

console.log("pageRange (with custom pageSize)");
eq("page 1 size 100 → [0,99]", pageRange(1, 100), { from: 0, to: 99 });
eq("page 2 size 100 → [100,199]", pageRange(2, 100), { from: 100, to: 199 });
eq("page 1 all-cap → [0,4999]", pageRange(1, ALL_PAGE_SIZE_CAP), { from: 0, to: ALL_PAGE_SIZE_CAP - 1 });

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("\nFailures:\n" + failures.map((f) => "  ✗ " + f).join("\n"));
  process.exit(1);
}
