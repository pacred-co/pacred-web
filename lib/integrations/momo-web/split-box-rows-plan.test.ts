/**
 * Unit tests — MOMO box-split → sibling rows PLAN + the money-neutral guard
 * (owner/ภูม 2026-07-02 · money-critical).
 *
 * Focus (the guard that keeps the split money-safe):
 *   1. planBoxRowSplit SPLITS a money-neutral aggregate (unbilled · unpriced · Σ boxes
 *      == famount/fweight/fvolume) → N rows; the FIRST keeps the BARE base (anchor,
 *      suffix 0 = เหมาๆ anchor + committed_forwarder_id link), the rest get "-i/n".
 *   2. Σ of the plan rows' weight/cbm/pieces == the aggregate (money-neutral).
 *   3. REFUSES every unsafe case with the right reason: billed (5/6/7) · has reforder ·
 *      already priced · not multi-box · qty/weight/cbm mismatch · already-suffixed base.
 *   4. baseOf / suffixOf helpers (the group key + anchor detection).
 *
 * Run: tsx lib/integrations/momo-web/split-box-rows-plan.test.ts
 */

import assert from "node:assert/strict";
import {
  planBoxRowSplit,
  baseOf,
  suffixOf,
  type BoxDetailInput,
  type AggregateRowInput,
} from "./split-box-rows-plan";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/** A splittable aggregate (unbilled · unpriced · bare base). Override per-test. */
function agg(p: Partial<AggregateRowInput> = {}): AggregateRowInput {
  return {
    id: 100,
    ftrackingchn: "1781675788",
    fstatus: "3",
    reforder: "",
    ftotalprice: 0,
    famount: 4,
    fweight: 3316,
    fvolume: 2.641512,
    ...p,
  };
}

/** A momo_box_detail box (per-PIECE metrics). */
function box(p: Partial<BoxDetailInput>): BoxDetailInput {
  return {
    boxTracking: "",
    weightKgPerPiece: 0,
    cbmPerPiece: 0,
    width: 0,
    length: 0,
    height: 0,
    quantity: 1,
    ...p,
  };
}

// The 4-box bug case (VERIFIED on prod: base 1781675788, all qty=1).
function bugCaseBoxes(): BoxDetailInput[] {
  return [
    box({ boxTracking: "1781675788-1/4", weightKgPerPiece: 398, cbmPerPiece: 0.6555, width: 115, length: 76, height: 75 }),
    box({ boxTracking: "1781675788-2/4", weightKgPerPiece: 628, cbmPerPiece: 0.502512, width: 116, length: 76, height: 57 }),
    box({ boxTracking: "1781675788-3/4", weightKgPerPiece: 1145, cbmPerPiece: 0.74175, width: 115, length: 75, height: 86 }),
    box({ boxTracking: "1781675788-4/4", weightKgPerPiece: 1145, cbmPerPiece: 0.74175, width: 115, length: 75, height: 86 }),
  ];
}

console.log("split-box-rows-plan.test.ts");

// ── helpers ──
check("baseOf strips -i/n and -i suffixes; leaves non-numeric suffixes", () => {
  assert.equal(baseOf("1781675788-1/4"), "1781675788");
  assert.equal(baseOf("1781675788-3"), "1781675788");
  assert.equal(baseOf("1781675788"), "1781675788");
  assert.equal(baseOf("CBX260620-SEA07"), "CBX260620-SEA07"); // SEA isn't digits
  assert.equal(baseOf("  800117017081-2/3 "), "800117017081"); // trims
});
check("suffixOf returns the box number, 0 for a bare base", () => {
  assert.equal(suffixOf("1781675788"), 0);
  assert.equal(suffixOf("1781675788-1/4"), 1);
  assert.equal(suffixOf("1781675788-3"), 3);
  assert.equal(suffixOf("X90012661-2"), 2);
});

// ── the money-neutral SPLIT ──
check("splits the 4-box bug case into 4 rows (anchor keeps bare base)", () => {
  const d = planBoxRowSplit(agg(), bugCaseBoxes());
  assert.equal(d.split, true);
  if (!d.split) return;
  assert.equal(d.rows.length, 4, "one row per box");
  // anchor is the first, keeps the BARE base tracking.
  assert.equal(d.rows[0].isAnchor, true);
  assert.equal(d.rows[0].ftrackingchn, "1781675788", "anchor = bare base (suffix 0)");
  assert.equal(suffixOf(d.rows[0].ftrackingchn), 0);
  // the rest are suffixed siblings, NOT anchors.
  for (let i = 1; i < 4; i++) {
    assert.equal(d.rows[i].isAnchor, false);
    assert.ok(suffixOf(d.rows[i].ftrackingchn) > 0, `row ${i} carries a suffix`);
  }
  assert.deepEqual(
    d.rows.map((r) => r.ftrackingchn),
    ["1781675788", "1781675788-2/4", "1781675788-3/4", "1781675788-4/4"],
  );
});

check("each box row carries its OWN box TOTAL (per-piece × qty) + dims", () => {
  const d = planBoxRowSplit(agg(), bugCaseBoxes());
  assert.ok(d.split);
  if (!d.split) return;
  // qty=1 for every box → TOTAL == per-piece.
  assert.equal(d.rows[0].fweight, 398);
  assert.equal(d.rows[0].fvolume, 0.6555);
  assert.equal(d.rows[0].fwidth, 115);
  assert.equal(d.rows[0].flength, 76);
  assert.equal(d.rows[0].fheight, 75);
  assert.equal(d.rows[0].famount, 1);
  assert.equal(d.rows[2].fweight, 1145);
});

check("MONEY-NEUTRAL: Σ of the split rows == the aggregate famount/fweight/fvolume", () => {
  const a = agg();
  const d = planBoxRowSplit(a, bugCaseBoxes());
  assert.ok(d.split);
  if (!d.split) return;
  const sumWt = d.rows.reduce((s, r) => s + r.fweight, 0);
  const sumCbm = d.rows.reduce((s, r) => s + r.fvolume, 0);
  const sumQty = d.rows.reduce((s, r) => s + r.famount, 0);
  assert.equal(sumQty, a.famount, "pieces preserved exactly");
  assert.equal(Number(sumWt.toFixed(2)), a.fweight, "weight preserved");
  assert.equal(Number(sumCbm.toFixed(6)), Number(a.fvolume.toFixed(6)), "คิว preserved");
});

check("multiplies pieces when a box has qty>1 (TOTAL = per-piece × qty)", () => {
  // A box of 10 pieces at 18.5kg/pc, 0.1494คิว/pc → TOTAL 185kg, 1.494คิว, 10 pieces.
  const boxes = [
    box({ boxTracking: "T-1/2", weightKgPerPiece: 18.5, cbmPerPiece: 0.1494, quantity: 10, width: 83, length: 60, height: 30 }),
    box({ boxTracking: "T-2/2", weightKgPerPiece: 5, cbmPerPiece: 0.05, quantity: 2, width: 50, length: 33, height: 31 }),
  ];
  // aggregate: 12 pieces · 185+10=195kg · 1.494+0.1=1.594คิว
  const d = planBoxRowSplit(agg({ ftrackingchn: "T", famount: 12, fweight: 195, fvolume: 1.594 }), boxes);
  assert.ok(d.split);
  if (!d.split) return;
  assert.equal(d.rows[0].fweight, 185);
  assert.equal(d.rows[0].fvolume, 1.494);
  assert.equal(d.rows[0].famount, 10);
  assert.equal(d.rows[1].fweight, 10);
  assert.equal(d.rows[1].famount, 2);
});

// ── the money-safety REFUSALS ──
check("REFUSES a billed aggregate (fstatus 5/6/7)", () => {
  for (const st of ["5", "6", "7"]) {
    const d = planBoxRowSplit(agg({ fstatus: st }), bugCaseBoxes());
    assert.equal(d.split, false);
    if (!d.split) assert.equal(d.reason, "already_billed", `fstatus ${st}`);
  }
});
check("ALLOWS unbilled stages 1/2/3/4", () => {
  for (const st of ["1", "2", "3", "4"]) {
    const d = planBoxRowSplit(agg({ fstatus: st }), bugCaseBoxes());
    assert.equal(d.split, true, `fstatus ${st} should split`);
  }
});
check("REFUSES a row linked to a ฝากสั่งซื้อ order (reforder set)", () => {
  const d = planBoxRowSplit(agg({ reforder: "P22301" }), bugCaseBoxes());
  assert.equal(d.split, false);
  if (!d.split) assert.equal(d.reason, "has_reforder");
});
check("REFUSES an already-priced row (ftotalprice > 0) — never re-price money", () => {
  const d = planBoxRowSplit(agg({ ftotalprice: 3439.77 }), bugCaseBoxes());
  assert.equal(d.split, false);
  if (!d.split) assert.equal(d.reason, "already_priced");
});
check("REFUSES when ≤1 box (nothing to split)", () => {
  const d = planBoxRowSplit(agg({ famount: 1, fweight: 398, fvolume: 0.6555 }), [bugCaseBoxes()[0]]);
  assert.equal(d.split, false);
  if (!d.split) assert.equal(d.reason, "not_multi_box");
});
check("REFUSES a suffixed aggregate (already a sibling)", () => {
  const d = planBoxRowSplit(agg({ ftrackingchn: "1781675788-1/4" }), bugCaseBoxes());
  assert.equal(d.split, false);
  if (!d.split) assert.equal(d.reason, "not_bare_base");
});
check("REFUSES when Σ pieces ≠ famount (would change pieces)", () => {
  // box Σ qty = 4 but aggregate says famount=10 (the AMT_MISMATCH prod case) → refuse.
  const d = planBoxRowSplit(agg({ famount: 10 }), bugCaseBoxes());
  assert.equal(d.split, false);
  if (!d.split) assert.equal(d.reason, "qty_mismatch");
});
check("REFUSES when Σ weight disagrees with fweight beyond tolerance (money basis)", () => {
  // box Σ weight = 3316 but aggregate fweight=172.5 (the 760234506976 prod case) → refuse.
  const d = planBoxRowSplit(agg({ fweight: 172.5 }), bugCaseBoxes());
  assert.equal(d.split, false);
  if (!d.split) assert.equal(d.reason, "weight_mismatch");
});
check("REFUSES when Σ คิว disagrees with fvolume beyond tolerance", () => {
  const d = planBoxRowSplit(agg({ fvolume: 0.2 }), bugCaseBoxes());
  assert.equal(d.split, false);
  if (!d.split) assert.equal(d.reason, "cbm_mismatch");
});
check("ACCEPTS a small rounding diff within tolerance (real prod 0.5% cbm drift)", () => {
  // 1782453952: box Σ cbm 11.255662 vs aggregate 11.199926 (~0.5%) → still splits.
  const boxes = [
    box({ boxTracking: "T-1", weightKgPerPiece: 5, cbmPerPiece: 5.6, quantity: 1 }),
    box({ boxTracking: "T-2", weightKgPerPiece: 5, cbmPerPiece: 5.655662, quantity: 1 }),
  ];
  const d = planBoxRowSplit(agg({ ftrackingchn: "T", famount: 2, fweight: 10, fvolume: 11.199926 }), boxes);
  assert.equal(d.split, true, "0.5% cbm drift is within the 2% tolerance");
});

// ── de-dupe + ordering ──
check("de-dupes repeated box trackings + sorts by suffix (deterministic anchor)", () => {
  const boxes = [
    box({ boxTracking: "T-3/3", weightKgPerPiece: 3, cbmPerPiece: 0.03 }),
    box({ boxTracking: "T-1/3", weightKgPerPiece: 1, cbmPerPiece: 0.01 }),
    box({ boxTracking: "T-1/3", weightKgPerPiece: 1, cbmPerPiece: 0.01 }), // dup
    box({ boxTracking: "T-2/3", weightKgPerPiece: 2, cbmPerPiece: 0.02 }),
  ];
  const d = planBoxRowSplit(agg({ ftrackingchn: "T", famount: 3, fweight: 6, fvolume: 0.06 }), boxes);
  assert.ok(d.split);
  if (!d.split) return;
  assert.equal(d.rows.length, 3, "duplicate box collapsed");
  // anchor = the lowest suffix (T-1/3 → becomes bare base "T").
  assert.equal(d.rows[0].ftrackingchn, "T");
  assert.equal(d.rows[0].fweight, 1, "anchor carries box -1's metric");
  assert.deepEqual(d.rows.map((r) => r.ftrackingchn), ["T", "T-2/3", "T-3/3"]);
});

console.log(`\n✅ split-box-rows-plan.test.ts — ${passed} checks passed`);
