/**
 * Unit tests — MOMO box-count SELF-HEAL plan + the money-safe corroboration guard
 * (owner 2026-07-16 · money-critical).
 *
 * Mirrors the real data-fix cases (verified prod):
 *   1. 1783582989 (PR086) — zero the leftover aggregate BARE (fweight 58 = Σ 4 boxes,
 *      price 0) once its 4 siblings already cover the shipment; and, from the PRE-fix
 *      state, fix the "-3/4" detail row that copied the aggregate.
 *   2. MOMO-มั่ว weight (weight_kg×qty = a ×N tonnage vs the stored fweight) → REVIEW/skip.
 *   3. PRICED-ANCHOR model (519218029029/PR050 · bare price 730) → REVIEW/skip.
 *   4. BILLED row (fstatus 5/6/7) → skip.
 *   5. HEALTHY / properly-split base → no-op.
 *
 * Run: tsx lib/integrations/momo-web/box-detail-reconcile-plan.test.ts
 */

import assert from "node:assert/strict";
import {
  planBoxDetailReconcile,
  trueBoxTotals,
  baseOf,
  suffixOf,
  type ReconcileForwarderRow,
  type ReconcileBox,
} from "./box-detail-reconcile-plan";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/** A tb_forwarder row (money-relevant fields). Override per-test. */
function fwd(p: Partial<ReconcileForwarderRow> & { id: number; ftrackingchn: string }): ReconcileForwarderRow {
  return {
    fstatus: "3",
    famount: 1,
    famountcount: null,
    fweight: 0,
    fvolume: 0,
    fwidth: 0,
    flength: 0,
    fheight: 0,
    ftotalprice: 0,
    frefrate: 0,
    frefprice: "2",
    ...p,
  };
}

/** A momo_box_detail box (per-piece metrics). */
function box(p: Partial<ReconcileBox> & { boxTracking: string }): ReconcileBox {
  return {
    width: 0,
    length: 0,
    height: 0,
    weightKg: 0,
    cbm: 0,
    quantity: 1,
    ...p,
  };
}

console.log("box-detail-reconcile-plan.test.ts");

// ── helpers ──
check("baseOf / suffixOf strip and read the split suffix", () => {
  assert.equal(baseOf("1783582989-3/4"), "1783582989");
  assert.equal(baseOf("1783582989"), "1783582989");
  assert.equal(suffixOf("1783582989-3/4"), 3);
  assert.equal(suffixOf("1783582989"), 0);
});

check("trueBoxTotals — Σ over real boxes (suffix>0), bare header dropped", () => {
  const boxes: ReconcileBox[] = [
    box({ boxTracking: "T", weightKg: 999 }),                    // bare header → dropped
    box({ boxTracking: "T-1/2", weightKg: 17, width: 51, length: 30, height: 48, quantity: 1 }),
    box({ boxTracking: "T-2/2", weightKg: 5, width: 50, length: 40, height: 30, quantity: 2 }),
  ];
  const t = trueBoxTotals(boxes);
  assert.equal(t.fweight, 27);   // 17 (single piece) + 5×2 (legacy fallback — see below)
  assert.equal(t.count, 2);
  assert.equal(t.famount, 3);    // 1 + 2
  // T-2/2 has qty 2 but NO cbm → the dims can't prove per-piece vs line-total, so its
  // contribution used the LEGACY ×qty reading and the box is counted as `undecided`.
  // A non-zero `undecided` makes this Σ untrustworthy as a money corroboration → the
  // plan refuses to zero a bare on it (fail-safe · prod 2026-07-17: 0 across 80 bases).
  assert.equal(t.undecided, 1);
});

check("trueBoxTotals — a fully-decided group reports undecided = 0", () => {
  const boxes: ReconcileBox[] = [
    box({ boxTracking: "T-1/2", weightKg: 17, cbm: 0.07344, width: 51, length: 30, height: 48, quantity: 1 }),
    box({ boxTracking: "T-2/2", weightKg: 5, cbm: 0.06, width: 50, length: 40, height: 30, quantity: 2 }),
  ];
  const t = trueBoxTotals(boxes);
  assert.equal(t.undecided, 0);
  assert.equal(t.fweight, 27);   // 17 + 5×2 (cbm 0.06 == dims → per-piece → ×qty)
});

// ── 1a. LEFTOVER aggregate BARE — zero it (the 1783582989/52559 stranded case) ──
check("zeroes a leftover aggregate BARE (fweight = Σ boxes · price 0 · siblings cover the shipment)", () => {
  const boxes: ReconcileBox[] = [
    box({ boxTracking: "1783582989-1/4", weightKg: 17, width: 51, length: 30, height: 48 }),
    box({ boxTracking: "1783582989-2/4", weightKg: 14, width: 35, length: 32, height: 38 }),
    box({ boxTracking: "1783582989-3/4", weightKg: 13.5, width: 32, length: 28, height: 38 }),
    box({ boxTracking: "1783582989-4/4", weightKg: 13.5, width: 32, length: 28, height: 38 }),
  ];
  // the bare carries the aggregate; the 4 siblings are ALREADY correct (post detail-fix).
  const group: ReconcileForwarderRow[] = [
    fwd({ id: 52559, ftrackingchn: "1783582989", famount: 4, fweight: 58, fvolume: 0.184056, ftotalprice: 0 }),
    fwd({ id: 52556, ftrackingchn: "1783582989-1/4", famount: 1, fweight: 17, fvolume: 0.07344, ftotalprice: 359.86, fwidth: 51, flength: 30, fheight: 48 }),
    fwd({ id: 52557, ftrackingchn: "1783582989-2/4", famount: 1, fweight: 14, fvolume: 0.04256, ftotalprice: 238, fwidth: 35, flength: 32, fheight: 38 }),
    fwd({ id: 52436, ftrackingchn: "1783582989-3/4", famount: 1, fweight: 13.5, fvolume: 0.034048, ftotalprice: 229.5, fwidth: 32, flength: 28, fheight: 38 }),
    fwd({ id: 52437, ftrackingchn: "1783582989-4/4", famount: 1, fweight: 13.5, fvolume: 0.034048, ftotalprice: 229.5, fwidth: 32, flength: 28, fheight: 38 }),
  ];
  const plan = planBoxDetailReconcile(group, boxes);
  assert.equal(plan.detailFixes.length, 0);     // siblings already correct
  assert.equal(plan.bareZeroes.length, 1);
  assert.equal(plan.bareZeroes[0].id, 52559);
  assert.equal(plan.bareZeroes[0].trueSum.fweight, 58);
  assert.equal(plan.reviews.length, 0);
});

// ── 1b. CORRUPT "-N/M" DETAIL that copied the aggregate — fix it (the PRE-fix 52436) ──
check("fixes a '-N/M' detail row that copied the bare aggregate (price re-derived · twin-corroborated)", () => {
  const boxes: ReconcileBox[] = [
    box({ boxTracking: "1783582989-1/4", weightKg: 17, width: 51, length: 30, height: 48 }),
    box({ boxTracking: "1783582989-2/4", weightKg: 14, width: 35, length: 32, height: 38 }),
    box({ boxTracking: "1783582989-3/4", weightKg: 13.5, width: 32, length: 28, height: 38 }),
    box({ boxTracking: "1783582989-4/4", weightKg: 13.5, width: 32, length: 28, height: 38 }),
  ];
  // PRE-fix: -3/4 (52436) WRONGLY carries the aggregate (famount 4, fweight 58, price 986);
  // its identical-dims twin -4/4 (52437) is already correct at the box truth (price 229.5).
  // frefprice='1' (kg) so the re-price basis = box weight 13.5 × frefrate 17 = 229.5 (== twin).
  const group: ReconcileForwarderRow[] = [
    fwd({ id: 52559, ftrackingchn: "1783582989", famount: 4, fweight: 58, fvolume: 0.184056, ftotalprice: 0 }),
    fwd({ id: 52556, ftrackingchn: "1783582989-1/4", famount: 1, fweight: 17, fvolume: 0.07344, ftotalprice: 289, frefprice: "1", frefrate: 17, fwidth: 51, flength: 30, fheight: 48 }),
    fwd({ id: 52557, ftrackingchn: "1783582989-2/4", famount: 1, fweight: 14, fvolume: 0.04256, ftotalprice: 238, frefprice: "1", frefrate: 17, fwidth: 35, flength: 32, fheight: 38 }),
    fwd({ id: 52436, ftrackingchn: "1783582989-3/4", famount: 4, fweight: 58, fvolume: 0.184056, ftotalprice: 986, frefprice: "1", frefrate: 17, fwidth: 32, flength: 28, fheight: 38 }),
    fwd({ id: 52437, ftrackingchn: "1783582989-4/4", famount: 1, fweight: 13.5, fvolume: 0.034048, ftotalprice: 229.5, frefprice: "1", frefrate: 17, fwidth: 32, flength: 28, fheight: 38 }),
  ];
  const plan = planBoxDetailReconcile(group, boxes);
  assert.equal(plan.detailFixes.length, 1);
  const fix = plan.detailFixes[0];
  assert.equal(fix.id, 52436);
  assert.equal(fix.truth.famount, 1);
  assert.equal(fix.truth.fweight, 13.5);
  assert.equal(fix.truth.fvolume, 0.034048);
  assert.deepEqual([fix.truth.fwidth, fix.truth.flength, fix.truth.fheight], [32, 28, 38]);
  assert.equal(fix.priced, true);
  assert.equal(fix.newPrice, 229.5);       // 13.5 × 17
  assert.equal(fix.twinId, 52437);         // corroborated by the identical-dims twin
  assert.equal(fix.twinPrice, 229.5);
  // the bare is NOT zeroed THIS run (a sibling still carries the aggregate → siblings
  // don't yet cover the shipment); it converges on the NEXT cron after 52436 is fixed.
  assert.equal(plan.bareZeroes.length, 0);
  assert.ok(plan.reviews.some((r) => r.kind === "aggregate_bare_siblings_dont_cover" && r.id === 52559));
});

// ── 2. LINE-TOTAL box — the dims decide · the old "MOMO มั่ว" verdict was a FALSE alarm ──
//
// 🔎 CORRECTED 2026-07-17 (owner "GZE260627-1 น้ำหนักมั่ว"). This case used to assert
// `weight_vol_only_momo_suspect` — but its fixture OMITTED `cbm`, the one field that
// decides the row. The REAL prod box (read-only probe) carries cbm 1.67321, and
// 371×22×20.5 = 0.167321/กล่อง × 10 = 1.67321 → the values are the LINE TOTAL, so the
// truth is 800 kg — NOT 800×10. MOMO was never "มั่ว" here; our blind ×qty was.
// (Verified: MOMO mixes BOTH conventions inside ONE shipment — base 1782555393 has
// per-piece boxes [bare, -5] and line-total boxes [-2, -4] side by side.)
check("LINE-TOTAL box (prod 1782555393-4): truth = 800 kg (NOT 800×10) → a correct row is left alone", () => {
  const boxes: ReconcileBox[] = [
    box({ boxTracking: "1782555393-4", weightKg: 800, cbm: 1.67321, width: 371, length: 22, height: 20.5, quantity: 10 }),
  ];
  // a row already carrying the TRUE line total → nothing to heal, nothing to flag.
  const group: ReconcileForwarderRow[] = [
    fwd({ id: 52196, ftrackingchn: "1782555393-4", famount: 10, fweight: 800, fvolume: 1.67321, ftotalprice: 6400, frefprice: "1", frefrate: 8, fwidth: 371, flength: 22, fheight: 20.5 }),
  ];
  const plan = planBoxDetailReconcile(group, boxes);
  assert.equal(plan.detailFixes.length, 0);
  assert.equal(plan.bareZeroes.length, 0);
  assert.equal(plan.reviews.length, 0);   // ← was a false "weight_vol_only_momo_suspect"
});

// ── 2b. The CORRUPTED shape the ×qty bug actually left on prod → still REFUSED here ──
check("the ×qty-corrupted row (fweight 8000 · famount right) is NOT auto-healed → review (backfill's job)", () => {
  // prod fid 52196 TODAY: fweight 8000 = 800×10 · fvolume 16.7321 = 1.67321×10.
  // The decider proves the truth is 800/1.67321, but the corruption shape is
  // "famount correct · weight wrong" — which this plan deliberately never auto-writes
  // (an unattended cron must not move a money basis on that signature). It stays a
  // REVIEW; scripts/momo-weight-qty-backfill-2026-07-17.mjs fixes it under owner sign-off.
  const boxes: ReconcileBox[] = [
    box({ boxTracking: "1782555393-4", weightKg: 800, cbm: 1.67321, width: 371, length: 22, height: 20.5, quantity: 10 }),
  ];
  const group: ReconcileForwarderRow[] = [
    fwd({ id: 52196, ftrackingchn: "1782555393-4", famount: 10, fweight: 8000, fvolume: 16.7321, ftotalprice: 6400, frefprice: "1", frefrate: 8, fwidth: 371, flength: 22, fheight: 20.5 }),
  ];
  const plan = planBoxDetailReconcile(group, boxes);
  assert.equal(plan.detailFixes.length, 0);
  assert.equal(plan.reviews.length, 1);
  assert.equal(plan.reviews[0].kind, "weight_vol_only_momo_suspect");
  assert.equal(plan.reviews[0].id, 52196);
});

// ── 2c. FAIL-SAFE — an unprovable convention is never guessed into a money basis ──
check("a box whose dims can't prove per-piece-vs-line-total → box_basis_undecidable review, no fix", () => {
  // no dims → resolveMomoBoxBasis returns decided:false → refuse (never write a guess).
  const boxes: ReconcileBox[] = [
    box({ boxTracking: "AGG-1/2", weightKg: 10, cbm: 0.35, quantity: 4 }),
    box({ boxTracking: "AGG-2/2", weightKg: 10, cbm: 0.35, quantity: 4 }),
  ];
  const group: ReconcileForwarderRow[] = [
    fwd({ id: 1, ftrackingchn: "AGG", famount: 8, fweight: 80, fvolume: 2.8, ftotalprice: 0 }),
    fwd({ id: 2, ftrackingchn: "AGG-1/2", famount: 8, fweight: 80, fvolume: 2.8, ftotalprice: 0 }),
  ];
  const plan = planBoxDetailReconcile(group, boxes);
  assert.equal(plan.detailFixes.length, 0);
  assert.equal(plan.bareZeroes.length, 0);   // Σ is a guess → never zero a basis on it
  assert.ok(plan.reviews.some((r) => r.kind === "box_basis_undecidable" && r.id === 2));
});

// ── 3. PRICED-ANCHOR model — the bare carries money → never touch (519218029029/PR050) ──
check("REFUSES the priced-anchor model (bare carries money) — detail NOT fixed, bare NOT zeroed", () => {
  const boxes: ReconcileBox[] = [
    box({ boxTracking: "519218029029-1/2", weightKg: 16.5, width: 22, length: 33, height: 49 }),
    box({ boxTracking: "519218029029-2/2", weightKg: 20, width: 22, length: 33, height: 49 }),
  ];
  // bare 52380 carries money (730 = a priced anchor); both "-N/M" rows wrongly copy the aggregate (36.5).
  const group: ReconcileForwarderRow[] = [
    fwd({ id: 52380, ftrackingchn: "519218029029", famount: 2, fweight: 36.5, fvolume: 0.071148, ftotalprice: 730 }),
    fwd({ id: 52477, ftrackingchn: "519218029029-1/2", famount: 2, fweight: 36.5, fvolume: 0.071174, ftotalprice: 0, fwidth: 22, flength: 33, fheight: 49 }),
    fwd({ id: 52478, ftrackingchn: "519218029029-2/2", famount: 2, fweight: 36.5, fvolume: 0.071174, ftotalprice: 0, fwidth: 22, flength: 33, fheight: 49 }),
  ];
  const plan = planBoxDetailReconcile(group, boxes);
  assert.equal(plan.detailFixes.length, 0);
  assert.equal(plan.bareZeroes.length, 0);
  // both detail rows → review as priced-anchor (money decision · owner)
  assert.equal(plan.reviews.filter((r) => r.kind === "priced_anchor_bare").length, 2);
});

// ── 4. BILLED rows are untouchable ──
check("skips BILLED rows (fstatus 5/6/7) — never heals a row in/through billing", () => {
  const boxes: ReconcileBox[] = [
    box({ boxTracking: "AGG-1/2", weightKg: 10, width: 30, length: 30, height: 30 }),
    box({ boxTracking: "AGG-2/2", weightKg: 10, width: 30, length: 30, height: 30 }),
  ];
  // a billed aggregate bare + a billed corrupt detail — both must be untouched.
  const group: ReconcileForwarderRow[] = [
    fwd({ id: 1, ftrackingchn: "AGG", fstatus: "6", famount: 2, fweight: 20, fvolume: 0.054, ftotalprice: 0 }),
    fwd({ id: 2, ftrackingchn: "AGG-1/2", fstatus: "6", famount: 2, fweight: 20, fvolume: 0.054, ftotalprice: 500, fwidth: 30, flength: 30, fheight: 30 }),
    fwd({ id: 3, ftrackingchn: "AGG-2/2", fstatus: "6", famount: 1, fweight: 10, fvolume: 0.027, ftotalprice: 250, fwidth: 30, flength: 30, fheight: 30 }),
  ];
  const plan = planBoxDetailReconcile(group, boxes);
  assert.equal(plan.detailFixes.length, 0);
  assert.equal(plan.bareZeroes.length, 0);
  assert.equal(plan.reviews.length, 0);   // billed → silently skipped, not spammed
});

// ── 5. HEALTHY / properly-split base — no-op ──
check("no-op on a properly-split base (bare = box-1 anchor · siblings = boxes 2..N)", () => {
  const boxes: ReconcileBox[] = [
    box({ boxTracking: "OK-1/3", weightKg: 10, width: 40, length: 40, height: 40 }),
    box({ boxTracking: "OK-2/3", weightKg: 12, width: 45, length: 40, height: 40 }),
    box({ boxTracking: "OK-3/3", weightKg: 8, width: 30, length: 30, height: 30 }),
  ];
  // the split model: bare keeps box-1's OWN metrics (NOT the aggregate); siblings = boxes 2,3.
  const group: ReconcileForwarderRow[] = [
    fwd({ id: 10, ftrackingchn: "OK", famount: 1, fweight: 10, fvolume: 0.064, ftotalprice: 300, fwidth: 40, flength: 40, fheight: 40 }),
    fwd({ id: 11, ftrackingchn: "OK-2/3", famount: 1, fweight: 12, fvolume: 0.072, ftotalprice: 360, fwidth: 45, flength: 40, fheight: 40 }),
    fwd({ id: 12, ftrackingchn: "OK-3/3", famount: 1, fweight: 8, fvolume: 0.027, ftotalprice: 240, fwidth: 30, flength: 30, fheight: 30 }),
  ];
  const plan = planBoxDetailReconcile(group, boxes);
  assert.equal(plan.detailFixes.length, 0);
  assert.equal(plan.bareZeroes.length, 0);   // bare fweight 10 ≠ Σ 30 → not an aggregate → left
  assert.equal(plan.reviews.length, 0);
});

check("no-op on an already-zeroed bare (idempotent)", () => {
  const boxes: ReconcileBox[] = [
    box({ boxTracking: "Z-1/2", weightKg: 5, width: 20, length: 20, height: 20 }),
    box({ boxTracking: "Z-2/2", weightKg: 5, width: 20, length: 20, height: 20 }),
  ];
  const group: ReconcileForwarderRow[] = [
    fwd({ id: 20, ftrackingchn: "Z", famount: 0, fweight: 0, fvolume: 0, ftotalprice: 0 }),
    fwd({ id: 21, ftrackingchn: "Z-1/2", famount: 1, fweight: 5, fvolume: 0.008, ftotalprice: 100, fwidth: 20, flength: 20, fheight: 20 }),
    fwd({ id: 22, ftrackingchn: "Z-2/2", famount: 1, fweight: 5, fvolume: 0.008, ftotalprice: 100, fwidth: 20, flength: 20, fheight: 20 }),
  ];
  const plan = planBoxDetailReconcile(group, boxes);
  assert.equal(plan.bareZeroes.length, 0);
  assert.equal(plan.detailFixes.length, 0);
  assert.equal(plan.reviews.length, 0);
});

check("UNPRICED aggregate-on-detail fix (price left to the writer's engine · newPrice 0)", () => {
  const boxes: ReconcileBox[] = [
    box({ boxTracking: "U-1/2", weightKg: 10, width: 40, length: 40, height: 40 }),
    box({ boxTracking: "U-2/2", weightKg: 6, width: 30, length: 30, height: 30 }),
  ];
  // -2/2 copies the aggregate but is UNPRICED (0) → fixed metrics, engine re-prices later.
  const group: ReconcileForwarderRow[] = [
    fwd({ id: 30, ftrackingchn: "U", famount: 2, fweight: 16, fvolume: 0.091, ftotalprice: 0 }),
    fwd({ id: 31, ftrackingchn: "U-1/2", famount: 1, fweight: 10, fvolume: 0.064, ftotalprice: 0, fwidth: 40, flength: 40, fheight: 40 }),
    fwd({ id: 32, ftrackingchn: "U-2/2", famount: 2, fweight: 16, fvolume: 0.091, ftotalprice: 0, fwidth: 30, flength: 30, fheight: 30 }),
  ];
  const plan = planBoxDetailReconcile(group, boxes);
  assert.equal(plan.detailFixes.length, 1);
  assert.equal(plan.detailFixes[0].id, 32);
  assert.equal(plan.detailFixes[0].priced, false);
  assert.equal(plan.detailFixes[0].newPrice, 0);
  assert.equal(plan.detailFixes[0].truth.fweight, 6);
});

check("priced aggregate-on-detail with NO corroborating twin → review (never guess money)", () => {
  const boxes: ReconcileBox[] = [
    box({ boxTracking: "NT-1/2", weightKg: 10, width: 40, length: 40, height: 40 }),
    box({ boxTracking: "NT-2/2", weightKg: 6, width: 30, length: 25, height: 20 }),  // unique dims → no twin
  ];
  const group: ReconcileForwarderRow[] = [
    fwd({ id: 40, ftrackingchn: "NT", famount: 2, fweight: 16, fvolume: 0.079, ftotalprice: 0 }),
    fwd({ id: 41, ftrackingchn: "NT-1/2", famount: 1, fweight: 10, fvolume: 0.064, ftotalprice: 200, frefprice: "1", frefrate: 20, fwidth: 40, flength: 40, fheight: 40 }),
    fwd({ id: 42, ftrackingchn: "NT-2/2", famount: 2, fweight: 16, fvolume: 0.079, ftotalprice: 320, frefprice: "1", frefrate: 20, fwidth: 30, flength: 25, fheight: 20 }),
  ];
  const plan = planBoxDetailReconcile(group, boxes);
  assert.equal(plan.detailFixes.length, 0);
  assert.ok(plan.reviews.some((r) => r.kind === "priced_no_twin_corroboration" && r.id === 42));
});

console.log(`\nbox-detail-reconcile-plan.test.ts — ${passed} checks passed`);
