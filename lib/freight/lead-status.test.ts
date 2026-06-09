/**
 * BK-1 — freight lead convert-idempotency (lib/freight/lead-status.isLeadConvertible).
 *
 * Locks the guard that stops `convertLeadToQuote` (actions/admin/freight-leads.ts)
 * from re-converting an already-quoted lead (which would burn a fresh serial AND
 * insert a duplicate orphan draft quotation). Convertible for every status EXCEPT
 * 'quoted'.
 *
 * Run:  pnpm tsx lib/freight/lead-status.test.ts   (wired into pnpm test)
 */

import { isLeadConvertible, LEAD_STATUSES } from "./lead-status";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// ── (a) 'quoted' = already converted → NOT convertible (the BK-1 refusal) ──
section("(a) 'quoted' → not convertible");
assertEq("quoted → false", isLeadConvertible("quoted"), false);

// ── (b) every other allowed status → convertible ──
section("(b) pending/new/etc → convertible");
assertEq("new → true", isLeadConvertible("new"), true);
assertEq("contacted → true", isLeadConvertible("contacted"), true);
assertEq("won → true", isLeadConvertible("won"), true);
assertEq("lost → true", isLeadConvertible("lost"), true);
assertEq("spam → true", isLeadConvertible("spam"), true);
// the task names a 'pending' status; the live enum uses 'new' — guard both.
assertEq("pending (alias) → true", isLeadConvertible("pending"), true);

// ── (c) EXHAUSTIVE — every LEAD_STATUS asserted (only 'quoted' is non-convertible) ──
section("(c) every lead status — only 'quoted' blocks");
for (const s of LEAD_STATUSES) {
  assertEq(`${s} convertible == (s !== 'quoted')`, isLeadConvertible(s), s !== "quoted");
}

// ── (d) nullish / unknown statuses → convertible (only an explicit 'quoted' refuses) ──
section("(d) null/undefined/unknown → convertible (fail-open, matches != 'quoted')");
assertEq("null → true", isLeadConvertible(null), true);
assertEq("undefined → true", isLeadConvertible(undefined), true);
assertEq("'' → true", isLeadConvertible(""), true);
assertEq("unknown string → true", isLeadConvertible("draft"), true);

console.log(`\n${fail === 0 ? "✅" : "❌"} BK-1 lead-status: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
