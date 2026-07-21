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
  approxEqualValue,
  isAdditiveLotBare,
  type ForwarderCountAccessors,
} from "./momo-bill-header";

let passed = 0;
function it(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// A minimal row shape that stands in for tb_forwarder.
type R = { tracking: string | null; weight: number | null; userid: string; famount: number; price?: number };
const acc: ForwarderCountAccessors<R> = {
  tracking: (r) => r.tracking,
  weight: (r) => r.weight,
  userid: (r) => r.userid,
};
// Money-aware accessor (ftotalprice = SELL freight) — the box-count/display surfaces.
const accMoney: ForwarderCountAccessors<R> = {
  tracking: (r) => r.tracking,
  weight: (r) => r.weight,
  userid: (r) => r.userid,
  money: (r) => r.price ?? 0,
};

const sumBoxes = (rows: R[]) =>
  filterCountableForwarderRows(rows, acc).reduce((s, r) => s + r.famount, 0);
const sumBoxesMoney = (rows: R[]) =>
  filterCountableForwarderRows(rows, accMoney).reduce((s, r) => s + r.famount, 0);

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

console.log("MOMO bill-header — AGGREGATE-WEIGHT bare base + money-guard (owner #52559 · 2026-07-16):");

it("Test 9 — aggregate-WEIGHT bare base (weight≠0) + siblings + money 0 → DROPPED (money accessor)", () => {
  // Owner #52559 shape: the bare base carries the aggregate weight (58 = Σ its 4 boxes) with
  // NO SELL freight (ftotalprice 0). The OLD zero-weight rule wrongly kept it (weight 58 ≠ 0) →
  // 4 + 4 boxes = 8. The money-guard drops it → 4.
  const rows: R[] = [
    { tracking: "1783582989",     weight: 58,   userid: "PR086", famount: 4, price: 0 },     // aggregate bare
    { tracking: "1783582989-1/4", weight: 17,   userid: "PR086", famount: 1, price: 359.86 },
    { tracking: "1783582989-2/4", weight: 14,   userid: "PR086", famount: 1, price: 238 },
    { tracking: "1783582989-3/4", weight: 13.5, userid: "PR086", famount: 1, price: 229.5 },
    { tracking: "1783582989-4/4", weight: 13.5, userid: "PR086", famount: 1, price: 229.5 },
  ];
  assert.equal(sumBoxesMoney(rows), 4); // was 8 under the old zero-weight-only rule
  assert.equal(filterCountableForwarderRows(rows, accMoney).length, 4);
});

it("Test 10 — a real PRICED anchor (money>0) with box siblings is NEVER dropped", () => {
  // A bare row that carries SELL freight is a real order/box → kept, even at weight 0
  // (a MOMO box-split anchor whose own box is dims-only) and with box siblings present.
  const rows: R[] = [
    { tracking: "800206224068",   weight: 0,  userid: "PR079", famount: 1, price: 930 }, // priced anchor
    { tracking: "800206224068-2", weight: 20, userid: "PR079", famount: 1, price: 400 },
    { tracking: "800206224068-3", weight: 20, userid: "PR079", famount: 1, price: 400 },
  ];
  assert.equal(sumBoxesMoney(rows), 3); // anchor kept (money>0) + 2 siblings
  assert.equal(filterCountableForwarderRows(rows, accMoney).length, 3);
});

it("Test 11 — เหมาๆ-only aggregate (ftotalprice 0) is DROPPED by ftotalprice signal", () => {
  // Owner-verified 52047: bare weight = Σ siblings (redundant aggregate) carrying ONLY the
  // เหมาๆ delivery fee, ftotalprice 0. The box-count signal (ftotalprice) drops it → 2 boxes.
  const rows: R[] = [
    { tracking: "1780629608",     weight: 80, userid: "PR107", famount: 2, price: 0 },   // agg + เหมาๆ (ftp 0)
    { tracking: "1780629608-1/2", weight: 47, userid: "PR107", famount: 1, price: 1228.53 },
    { tracking: "1780629608-2/2", weight: 33, userid: "PR107", famount: 1, price: 242 },
  ];
  assert.equal(sumBoxesMoney(rows), 2);
});

it("Test 12 — money-ABSENT fallback: aggregate-weight bare (weight≠0) is KEPT (no catastrophic drop)", () => {
  // Without a money accessor, the conservative legacy rule holds: only a ZERO-WEIGHT bare is a
  // header. A weight-carrying bare is KEPT so a count-only caller that forgets money never drops
  // a real anchor. (Repo count-only callers now DO pass ftotalprice → they get the money rule.)
  const rows: R[] = [
    { tracking: "1783582989",     weight: 58, userid: "PR086", famount: 4 },
    { tracking: "1783582989-1/4", weight: 17, userid: "PR086", famount: 1 },
    { tracking: "1783582989-2/4", weight: 14, userid: "PR086", famount: 1 },
  ];
  // No money accessor → aggregate-weight bare kept (weight 58 ≠ 0) → 4 + 1 + 1 = 6.
  assert.equal(sumBoxes(rows), 6);
  // With the money accessor (all bare price 0) → bare dropped → 2.
  assert.equal(sumBoxesMoney(rows), 2);
});

it("Test 13 — money accessor + bare with NO box sibling → KEPT (nothing to double-count)", () => {
  const rows: R[] = [
    { tracking: "9990009", weight: 12, userid: "PR900", famount: 3, price: 0 }, // lone bare, ftp 0
  ];
  // No box sibling in the group → not a header even with money 0 → kept.
  assert.equal(sumBoxesMoney(rows), 3);
  assert.equal(filterCountableForwarderRows(rows, accMoney).length, 1);
});

it("Test 14 — zero-weight classic header still dropped under BOTH accessors", () => {
  const rows: R[] = [
    { tracking: "1779955936",   weight: 0,   userid: "PR2503", famount: 5, price: 0 }, // classic หัวบิล
    { tracking: "1779955936-2", weight: 3.0, userid: "PR2503", famount: 1, price: 90 },
    { tracking: "1779955936-3", weight: 3.0, userid: "PR2503", famount: 1, price: 90 },
  ];
  assert.equal(sumBoxes(rows), 2);      // weight-0 rule drops it
  assert.equal(sumBoxesMoney(rows), 2); // money rule drops it too (price 0)
});

// ── DISJOINT-LOTS discriminator (owner + CS 2026-07-21 · 908007350691 = 6 กล่อง) ──

it("Test 15 — approxEqualValue: 2% rel + 0.5 abs floor", () => {
  assert.equal(approxEqualValue(100, 101), true);    // 1% → equal
  assert.equal(approxEqualValue(100, 103), false);   // 3% → different
  assert.equal(approxEqualValue(0.3, 0.1), true);    // abs floor (tiny parcels)
  assert.equal(approxEqualValue(0, 0), true);
  assert.equal(approxEqualValue(112.5, 10.5), false); // the 908007350691 shape
});

it("Test 16 — 908007350691: bare 5 กล่อง 112.5kg + live '-2' 10.5kg = ADDITIVE lot", () => {
  assert.equal(
    isAdditiveLotBare({ bareValue: 112.5, siblingValueSum: 10.5, bareHasOwnBox: true }),
    true,
  );
});

it("Test 17 — 60527103087 class: bare 624kg lot + '-2' 156kg lot = additive", () => {
  assert.equal(
    isAdditiveLotBare({ bareValue: 624, siblingValueSum: 156, bareHasOwnBox: true }),
    true,
  );
});

it("Test 18 — aggregate header (bare ≈ Σ siblings) → NOT additive (PR050 residue class)", () => {
  // bare = Σ of its boxes (36.5 = 16.5 + 20.0) → the classic double-count header.
  assert.equal(
    isAdditiveLotBare({ bareValue: 36.5, siblingValueSum: 36.5, bareHasOwnBox: true }),
    false,
  );
  // within tolerance (2%) still a header
  assert.equal(
    isAdditiveLotBare({ bareValue: 36.5, siblingValueSum: 36.0, bareHasOwnBox: true }),
    false,
  );
});

it("Test 19 — fail-closed: empty bare / no own box line → NOT additive", () => {
  assert.equal(isAdditiveLotBare({ bareValue: 0, siblingValueSum: 10.5, bareHasOwnBox: true }), false);
  assert.equal(isAdditiveLotBare({ bareValue: 112.5, siblingValueSum: 10.5, bareHasOwnBox: false }), false);
});

it("Test 20 — unweighed siblings (Σ=0) + no own box = classic split header → NOT additive", () => {
  // A freshly-split family whose boxes MOMO hasn't weighed yet: bare carries the
  // aggregate, sibs 0 — bareHasOwnBox=false keeps the proven drop-the-bare rule.
  assert.equal(isAdditiveLotBare({ bareValue: 249, siblingValueSum: 0, bareHasOwnBox: false }), false);
});

console.log(`\nMOMO bill-header: ${passed} assertions passed ✅`);
