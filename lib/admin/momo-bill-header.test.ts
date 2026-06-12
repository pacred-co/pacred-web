/**
 * ════════════════════════════════════════════════════════════════════════
 * MOMO หัวบิล (bill-header) box-count exclusion — unit tests (2026-06-12).
 *
 * Locks the rule shared by every admin box-count Σ surface (forwarder-volume
 * report · per-container completeness · forwarder-check queue):
 *   a BARE zero-weight tracking is the MOMO bill-OPEN placeholder when its
 *   `-N/M` box siblings exist for the same (baseTracking, userid) → exclude
 *   it from the count; KEEP a bare row that has weight (real legacy order).
 *
 * Mirrors `countableGroupMembers` in
 *   app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx.
 *
 * SAFETY — pure · no DB · no IO. Runs in test:unit.
 * RUN:  pnpm tsx lib/admin/momo-bill-header.test.ts
 * ════════════════════════════════════════════════════════════════════════
 */

import assert from "node:assert/strict";
import {
  baseTracking,
  trackingSuffix,
  filterCountableForwarderRows,
  type ForwarderCountAccessors,
} from "./momo-bill-header";

let passed = 0;
function it(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// A minimal row shape that stands in for tb_forwarder.
type R = { tracking: string | null; weight: number | null; userid: string; famount: number };
const acc: ForwarderCountAccessors<R> = {
  tracking: (r) => r.tracking,
  weight: (r) => r.weight,
  userid: (r) => r.userid,
};

const sumBoxes = (rows: R[]) =>
  filterCountableForwarderRows(rows, acc).reduce((s, r) => s + r.famount, 0);

console.log("MOMO bill-header — trackingSuffix / baseTracking:");

it("trackingSuffix — bare = 0", () => {
  assert.equal(trackingSuffix("1780555730"), 0);
});
it("trackingSuffix — '-N' form", () => {
  assert.equal(trackingSuffix("1780555730-3"), 3);
});
it("trackingSuffix — '-N/M' box-of-boxes form", () => {
  assert.equal(trackingSuffix("302098539663-1/7"), 1);
});
it("trackingSuffix — null / empty → 0", () => {
  assert.equal(trackingSuffix(null), 0);
  assert.equal(trackingSuffix(""), 0);
});
it("baseTracking — strips both suffix forms", () => {
  assert.equal(baseTracking("1780555730-3"), "1780555730");
  assert.equal(baseTracking("302098539663-1/7"), "302098539663");
  assert.equal(baseTracking("1780555730"), "1780555730");
});
it("baseTracking — null / '-' → null", () => {
  assert.equal(baseTracking(null), null);
  assert.equal(baseTracking("-"), null);
  assert.equal(baseTracking("  "), null);
});

console.log("MOMO bill-header — filterCountableForwarderRows (THE rule):");

it("Test 1 — the headline bug: header 6 + 6 boxes(=1 each) → counts 6, not 12", () => {
  const rows: R[] = [
    { tracking: "1780555730",    weight: 0,   userid: "PR124", famount: 6 }, // หัวบิล
    { tracking: "1780555730-1/6", weight: 2.1, userid: "PR124", famount: 1 },
    { tracking: "1780555730-2/6", weight: 2.0, userid: "PR124", famount: 1 },
    { tracking: "1780555730-3/6", weight: 1.9, userid: "PR124", famount: 1 },
    { tracking: "1780555730-4/6", weight: 2.2, userid: "PR124", famount: 1 },
    { tracking: "1780555730-5/6", weight: 2.0, userid: "PR124", famount: 1 },
    { tracking: "1780555730-6/6", weight: 1.8, userid: "PR124", famount: 1 },
  ];
  // header dropped → 6 boxes; without the fix this would be 6 + 6 = 12.
  assert.equal(sumBoxes(rows), 6);
  assert.equal(filterCountableForwarderRows(rows, acc).length, 6);
});

it("Test 2 — '-N' (no /M) box siblings also drop the bare header", () => {
  const rows: R[] = [
    { tracking: "1779955936",   weight: 0,   userid: "PR2503", famount: 5 }, // หัวบิล
    { tracking: "1779955936-2", weight: 3.0, userid: "PR2503", famount: 1 },
    { tracking: "1779955936-3", weight: 3.0, userid: "PR2503", famount: 1 },
    { tracking: "1779955936-4", weight: 3.0, userid: "PR2503", famount: 1 },
    { tracking: "1779955936-5", weight: 3.0, userid: "PR2503", famount: 1 },
  ];
  // 4 box siblings (the base "-1" is implicit/absent here) → 4, not 5+4=9.
  assert.equal(sumBoxes(rows), 4);
});

it("Test 3 — a BARE row WITH weight is a real legacy order → KEPT", () => {
  const rows: R[] = [
    { tracking: "9990001", weight: 12.5, userid: "PR900", famount: 3 }, // real un-split parcel
  ];
  assert.equal(sumBoxes(rows), 3);
  assert.equal(filterCountableForwarderRows(rows, acc).length, 1);
});

it("Test 4 — bare row whose group has NO box sibling is KEPT even at weight 0", () => {
  // No "-N/M" sibling exists → nothing to double-count → don't drop it
  // (defensive: a lone zero-weight bare row is just an un-measured parcel).
  const rows: R[] = [
    { tracking: "8880002", weight: 0, userid: "PR880", famount: 2 },
  ];
  assert.equal(sumBoxes(rows), 2);
  assert.equal(filterCountableForwarderRows(rows, acc).length, 1);
});

it("Test 5 — different userid does NOT share a group (header kept)", () => {
  // Same base tracking but a DIFFERENT customer → not the same parcel, so the
  // bare zero-weight row is not treated as that customer's header.
  const rows: R[] = [
    { tracking: "7770003",   weight: 0,   userid: "PR700", famount: 4 }, // bare, other customer
    { tracking: "7770003-1/2", weight: 1.0, userid: "PR701", famount: 1 },
    { tracking: "7770003-2/2", weight: 1.0, userid: "PR701", famount: 1 },
  ];
  // PR700's bare row has no box sibling under PR700 → kept (4); PR701 boxes = 2.
  assert.equal(sumBoxes(rows), 4 + 2);
});

it("Test 6 — mixed dataset: only the matching header is dropped", () => {
  const rows: R[] = [
    // parcel A (split) — header dropped
    { tracking: "1000",   weight: 0,   userid: "PR1", famount: 3 },
    { tracking: "1000-1/3", weight: 1, userid: "PR1", famount: 1 },
    { tracking: "1000-2/3", weight: 1, userid: "PR1", famount: 1 },
    { tracking: "1000-3/3", weight: 1, userid: "PR1", famount: 1 },
    // parcel B (normal, un-split) — kept
    { tracking: "2000", weight: 5, userid: "PR2", famount: 2 },
    // parcel C (null tracking, can't group) — kept
    { tracking: null,   weight: 0, userid: "PR3", famount: 1 },
  ];
  // A → 3 (header 3 dropped), B → 2, C → 1  ⇒ 6  (naive would be 3+3+2+1=9)
  assert.equal(sumBoxes(rows), 3 + 2 + 1);
});

it("Test 7 — empty input → empty (no throw)", () => {
  assert.deepEqual(filterCountableForwarderRows([], acc), []);
});

it("Test 8 — weight Σ is unaffected (header weight is already 0)", () => {
  const rows: R[] = [
    { tracking: "1780555730",    weight: 0,   userid: "PR124", famount: 6 },
    { tracking: "1780555730-1/2", weight: 2.5, userid: "PR124", famount: 1 },
    { tracking: "1780555730-2/2", weight: 2.5, userid: "PR124", famount: 1 },
  ];
  const kept = filterCountableForwarderRows(rows, acc);
  const weightSum = kept.reduce((s, r) => s + (r.weight ?? 0), 0);
  // dropping a 0-weight header doesn't change the weight Σ.
  assert.equal(weightSum, 5.0);
});

console.log(`\nMOMO bill-header: ${passed} assertions passed ✅`);
