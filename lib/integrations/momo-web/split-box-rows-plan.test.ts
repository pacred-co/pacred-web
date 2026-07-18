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
check("REFUSES an already-priced row by DEFAULT (no allowPriced) — the cron never touches money", () => {
  const d = planBoxRowSplit(agg({ ftotalprice: 3439.77 }), bugCaseBoxes());
  assert.equal(d.split, false);
  if (!d.split) assert.equal(d.reason, "already_priced");
  // decision carries no `priced` on a refusal.
});

// ── PRICED split (opts.allowPriced) — the human-triggered button/backfill · money-NEUTRAL ──
check("PRICED split (#52142 REAL case: FOLDED famount=1 · รวมกล่อง): 2 boxes · Σ === aggregate", () => {
  // The real prod row is FOLDED: famountcount='1' (รวมกล่อง) → famount=1 (a combined marker),
  // while momo_box_detail has 2 real boxes (Σ qty=2). The qty guard must be RELAXED here.
  const a = agg({
    ftrackingchn: "908006917359", ftotalprice: 128.93, famount: 1, famountcount: "1",
    fweight: 50, fvolume: 0.02262, frefrate: 5700, frefprice: "2",
  });
  const boxes = [
    box({ boxTracking: "908006917359", weightKgPerPiece: 28.5, cbmPerPiece: 0.0138, quantity: 1, width: 30, length: 23, height: 20 }),
    box({ boxTracking: "908006917359-2", weightKgPerPiece: 21.5, cbmPerPiece: 0.00882, quantity: 1, width: 30, length: 21, height: 14 }),
  ];
  const d = planBoxRowSplit(a, boxes, { allowPriced: true });
  assert.equal(d.split, true);
  if (!d.split) return;
  assert.equal(d.priced, true, "flagged as a priced split");
  assert.equal(d.rows.length, 2);
  // anchor = bare base; sibling = -2. proportional by คิว: box2 = 128.93×0.00882/0.02262 = 50.27, anchor = 78.66.
  assert.equal(d.rows[0].ftrackingchn, "908006917359");
  assert.equal(d.rows[0].ftotalprice, 78.66, "anchor share");
  assert.equal(d.rows[1].ftrackingchn, "908006917359-2");
  assert.equal(d.rows[1].ftotalprice, 50.27, "sibling share");
  // 💰 the money-neutral invariant: Σ === the aggregate to the satang.
  const sumPrice = d.rows.reduce((s, r) => s + Number(r.ftotalprice ?? 0), 0);
  assert.equal(Number(sumPrice.toFixed(2)), a.ftotalprice, "Σ(ftotalprice) === aggregate");
  // frefrate/frefprice copied onto BOTH rows (display + future per-box edit).
  for (const r of d.rows) {
    assert.equal(r.frefrate, 5700);
    assert.equal(r.frefprice, "2");
  }
});

check("FOLDED qty-relax: famountcount='1' (รวมกล่อง · famount=1) SPLITS even though Σ box qty=2", () => {
  // The exact-qty guard must be RELAXED for a folded row (famount=1 is a combined marker, not
  // the real count) — else every folded MOMO aggregate is wrongly refused. Test BOTH signals.
  const boxes = bugCaseBoxes(); // 4 boxes, Σ qty = 4
  const byFlag = planBoxRowSplit(agg({ famount: 1, famountcount: "1" }), boxes, { allowPriced: true });
  assert.equal(byFlag.split, true, "famountcount='1' → relaxed");
  if (byFlag.split) {
    // per-box famount = its own qty; Σ = the real box count (4), restoring the folded marker.
    assert.equal(byFlag.rows.reduce((s, r) => s + r.famount, 0), 4);
  }
  const byFallback = planBoxRowSplit(agg({ famount: 1, famountcount: null }), boxes);
  assert.equal(byFallback.split, true, "famount≤1 with >1 box → treated as folded too");
});

check("NON-folded qty-mismatch STILL refuses (even with allowPriced) — a real box_detail disagreement", () => {
  // famount=10 · not folded (famountcount≠'1', famount>1) · box Σ qty=4 → genuine disagreement.
  const d = planBoxRowSplit(agg({ famount: 10, ftotalprice: 500 }), bugCaseBoxes(), { allowPriced: true });
  assert.equal(d.split, false);
  if (!d.split) assert.equal(d.reason, "qty_mismatch");
});

check("PRICED split: the ANCHOR absorbs the rounding remainder so Σ is EXACT (no satang drift)", () => {
  // 3 equal-คิว boxes of ฿100 total → naive 33.33×3 = 99.99 (drifts 0.01). Anchor absorbs → Σ 100.00.
  const a = agg({ ftrackingchn: "RND", ftotalprice: 100, famount: 3, fweight: 3, fvolume: 0.03, frefrate: 1, frefprice: "2" });
  const boxes = [
    box({ boxTracking: "RND", weightKgPerPiece: 1, cbmPerPiece: 0.01, quantity: 1 }),
    box({ boxTracking: "RND-2", weightKgPerPiece: 1, cbmPerPiece: 0.01, quantity: 1 }),
    box({ boxTracking: "RND-3", weightKgPerPiece: 1, cbmPerPiece: 0.01, quantity: 1 }),
  ];
  const d = planBoxRowSplit(a, boxes, { allowPriced: true });
  assert.ok(d.split);
  if (!d.split) return;
  assert.equal(d.rows[0].ftotalprice, 33.34, "anchor takes the +0.01 remainder");
  assert.equal(d.rows[1].ftotalprice, 33.33);
  assert.equal(d.rows[2].ftotalprice, 33.33);
  const sumPrice = d.rows.reduce((s, r) => s + Number(r.ftotalprice ?? 0), 0);
  assert.equal(Number(sumPrice.toFixed(2)), 100, "Σ === 100.00 exactly");
});

check("PRICED split still REFUSES a billed / reforder row even with allowPriced (hard guards hold)", () => {
  const boxes = bugCaseBoxes();
  const billed = planBoxRowSplit(agg({ ftotalprice: 500, fstatus: "5" }), boxes, { allowPriced: true });
  assert.equal(billed.split, false);
  if (!billed.split) assert.equal(billed.reason, "already_billed");
  const linked = planBoxRowSplit(agg({ ftotalprice: 500, reforder: "P22301" }), boxes, { allowPriced: true });
  assert.equal(linked.split, false);
  if (!linked.split) assert.equal(linked.reason, "has_reforder");
});

check("UNPRICED split sets NO per-box price (decision.priced=false → writer re-prices)", () => {
  const d = planBoxRowSplit(agg(), bugCaseBoxes()); // ftotalprice 0
  assert.ok(d.split);
  if (!d.split) return;
  assert.equal(d.priced, false);
  for (const r of d.rows) assert.equal(r.ftotalprice, undefined, "unpriced → no frozen price");
});

check("PRICED split falls back to WEIGHT proportion when the shipment has no คิว", () => {
  // a kg-only shipment (fvolume 0) → proportion by weight instead. Σ still exact.
  const a = agg({ ftrackingchn: "KG", ftotalprice: 200, famount: 2, fweight: 100, fvolume: 0, frefrate: 2, frefprice: "1" });
  const boxes = [
    box({ boxTracking: "KG", weightKgPerPiece: 60, cbmPerPiece: 0, quantity: 1 }),
    box({ boxTracking: "KG-2", weightKgPerPiece: 40, cbmPerPiece: 0, quantity: 1 }),
  ];
  const d = planBoxRowSplit(a, boxes, { allowPriced: true, relTolerance: 1 });
  assert.ok(d.split);
  if (!d.split) return;
  // 200 × 40/100 = 80 (sibling); anchor = 120.
  assert.equal(d.rows[1].ftotalprice, 80);
  assert.equal(d.rows[0].ftotalprice, 120);
  const sumPrice = d.rows.reduce((s, r) => s + Number(r.ftotalprice ?? 0), 0);
  assert.equal(Number(sumPrice.toFixed(2)), 200);
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

// ── DIMS FALLBACK — the folded-discovery mixed-convention bug (prod 760234506976 / fwd 52167) ──
// momo_box_detail mixes conventions across a folded MOMO row's boxes: the bare base stores
// weight/cbm PER-PIECE while the "-i" siblings store the box TOTAL. Multiplying every box by
// qty over-counts ×qty (Σ weight 1901.5 vs the true 172.5), so the stored-based guard wrongly
// REFUSES. But the DIMENSIONS are per-piece on EVERY box → Σ(w×l×h×qty) === the trusted
// aggregate fvolume, so the HUMAN button (allowPriced) reconstructs the split money-neutrally.
function foldedDiscoveryAgg(): AggregateRowInput {
  return agg({
    ftrackingchn: "760234506976", fstatus: "3", ftotalprice: 3017.34,
    famount: 1, famountcount: "1", fweight: 172.5, fvolume: 0.603468,
    frefrate: 5000, frefprice: "2",
  });
}
function foldedDiscoveryBoxes(): BoxDetailInput[] {
  // weightKgPerPiece/cbmPerPiece = the RAW stored momo_box_detail columns (mixed convention).
  return [
    box({ boxTracking: "760234506976",   weightKgPerPiece: 13,  cbmPerPiece: 0.0384,   quantity: 2,  width: 53, length: 29, height: 25 }),
    box({ boxTracking: "760234506976-2", weightKgPerPiece: 133, cbmPerPiece: 0.429226, quantity: 14, width: 43, length: 31, height: 23 }),
    box({ boxTracking: "760234506976-3", weightKgPerPiece: 5,   cbmPerPiece: 0.020832, quantity: 1,  width: 42, length: 31, height: 16 }),
    box({ boxTracking: "760234506976-4", weightKgPerPiece: 8.5, cbmPerPiece: 0.07656,  quantity: 1,  width: 60, length: 44, height: 29 }),
  ];
}

check("DIMS FALLBACK: priced human button SPLITS the folded-discovery row (52167) money-neutrally", () => {
  const a = foldedDiscoveryAgg();
  const d = planBoxRowSplit(a, foldedDiscoveryBoxes(), { allowPriced: true });
  assert.equal(d.split, true, "the human button now splits it (was weight_mismatch)");
  if (!d.split) return;
  assert.equal(d.priced, true);
  assert.equal(d.rows.length, 4, "4 box rows");
  // anchor keeps the bare base; siblings keep their suffixed tracking.
  assert.equal(d.rows[0].ftrackingchn, "760234506976");
  assert.deepEqual(d.rows.map((r) => r.ftrackingchn), ["760234506976", "760234506976-2", "760234506976-3", "760234506976-4"]);
  // 💰 money-neutral: Σ(ftotalprice) === the aggregate to the satang (bill byte-identical).
  const sumPrice = d.rows.reduce((s, r) => s + Number(r.ftotalprice ?? 0), 0);
  assert.equal(Number(sumPrice.toFixed(2)), a.ftotalprice, "Σ price === 3017.34");
  // Σ(fvolume) === the trusted aggregate คิว (the DIMS reconstruct it exactly).
  const sumCbm = d.rows.reduce((s, r) => s + r.fvolume, 0);
  assert.equal(Number(sumCbm.toFixed(6)), Number(a.fvolume.toFixed(6)), "Σ คิว === aggregate");
  // Σ(fweight) === the trusted aggregate weight (proportionally allocated, no ×qty blow-up).
  const sumWt = d.rows.reduce((s, r) => s + r.fweight, 0);
  assert.equal(Number(sumWt.toFixed(2)), a.fweight, "Σ weight === 172.5, NOT 1901.5");
  // famount restored to the REAL per-box pieces (the fold is undone) — Σ = 2+14+1+1 = 18.
  assert.deepEqual(d.rows.map((r) => r.famount), [2, 14, 1, 1]);
  assert.equal(d.rows.reduce((s, r) => s + r.famount, 0), 18);
  // each row carries its OWN dims (per-piece) so staff can fix a wrong box.
  assert.equal(d.rows[1].fwidth, 43);
  assert.equal(d.rows[1].flength, 31);
  assert.equal(d.rows[1].fheight, 23);
  // frefrate/frefprice copied for display + future per-box edit.
  for (const r of d.rows) { assert.equal(r.frefrate, 5000); assert.equal(r.frefprice, "2"); }
});

check("DIMS FALLBACK is HUMAN-ONLY: the cron (no allowPriced) leaves the folded-discovery row intact", () => {
  // The real 52167 is PRICED, so the cron refuses at the already_priced guard BEFORE the metric
  // guard — it never dims-reconstructs. (Proves the automatic pass can't surprise-split it.)
  const d = planBoxRowSplit(foldedDiscoveryAgg(), foldedDiscoveryBoxes());
  assert.equal(d.split, false, "cron path unchanged");
  if (!d.split) assert.equal(d.reason, "already_priced");
});

check("DIMS FALLBACK is HUMAN-ONLY: an UNPRICED cron pass still REFUSES weight_mismatch (no fallback)", () => {
  // An unpriced version reaches the metric guard; without allowPriced the fallback never fires.
  const a = { ...foldedDiscoveryAgg(), ftotalprice: 0 };
  const d = planBoxRowSplit(a, foldedDiscoveryBoxes());
  assert.equal(d.split, false, "cron path leaves it intact");
  if (!d.split) assert.equal(d.reason, "weight_mismatch");
});

check("DIMS FALLBACK needs the dims to reconcile: bad dims still REFUSE (no blind split)", () => {
  // Zero-out the dims → sumDimVol can't reconcile the aggregate → refuse even with allowPriced.
  const boxes = foldedDiscoveryBoxes().map((b) => ({ ...b, width: 0, length: 0, height: 0 }));
  const d = planBoxRowSplit(foldedDiscoveryAgg(), boxes, { allowPriced: true });
  assert.equal(d.split, false, "no reliable signal → don't split");
  if (!d.split) assert.ok(d.reason === "weight_mismatch" || d.reason === "cbm_mismatch");
});

check("NORMAL consistent boxes are UNCHANGED by the fallback (stored path still wins)", () => {
  // The #52142 consistent case must behave EXACTLY as before (stored metrics reconcile → no fallback).
  const a = agg({
    ftrackingchn: "908006917359", ftotalprice: 128.93, famount: 1, famountcount: "1",
    fweight: 50, fvolume: 0.02262, frefrate: 5700, frefprice: "2",
  });
  const boxes = [
    box({ boxTracking: "908006917359",   weightKgPerPiece: 28.5, cbmPerPiece: 0.0138,  quantity: 1, width: 30, length: 23, height: 20 }),
    box({ boxTracking: "908006917359-2", weightKgPerPiece: 21.5, cbmPerPiece: 0.00882, quantity: 1, width: 30, length: 21, height: 14 }),
  ];
  const d = planBoxRowSplit(a, boxes, { allowPriced: true });
  assert.ok(d.split);
  if (!d.split) return;
  // stored-based per-box price shares unchanged (78.66 / 50.27) — the fallback did not fire.
  assert.equal(d.rows[0].ftotalprice, 78.66);
  assert.equal(d.rows[1].ftotalprice, 50.27);
  // stored-based metrics unchanged (fweight 28.5 / 21.5, not a dims re-allocation).
  assert.equal(d.rows[0].fweight, 28.5);
  assert.equal(d.rows[1].fweight, 21.5);
});


// ═════════════════════════════════════════════════════════════════════════════
// planResidueAbsorb — heal «bare aggregate + "-1/n".."-n/n"» (2026-07-18 · PR050)
// ═════════════════════════════════════════════════════════════════════════════

import { planResidueAbsorb, type ResidueRowInput } from "./split-box-rows-plan";

/** A residue-group row. Defaults = unbilled, untouched. Override per-test. */
function rrow(p: Partial<ResidueRowInput> & { id: number; ftrackingchn: string }): ResidueRowInput {
  return {
    fstatus: "3", reforder: "", paydeposit: "0", advanceBillConfirmed: "0",
    fweight: 0, fvolume: 0, fwidth: 0, flength: 0, fheight: 0, famount: 0,
    famountcount: null, ftotalprice: 0, frefrate: 0, frefprice: "0", fcosttotalprice: 0,
    ...p,
  };
}

// The REAL PR050 519218029029 state (prod probe 2026-07-18).
const PR050_BARE = rrow({
  id: 52380, ftrackingchn: "519218029029", famount: 2, fweight: 36.5, fvolume: 0.071174,
  ftotalprice: 730, frefrate: 20, frefprice: "1", fcosttotalprice: 334.4,
});
const PR050_SIBS = [
  rrow({ id: 52477, ftrackingchn: "519218029029-1/2", famount: 1, fweight: 16.5, fvolume: 0.0356,  fwidth: 22, flength: 33, fheight: 49, fcosttotalprice: 334.52 }),
  rrow({ id: 52478, ftrackingchn: "519218029029-2/2", famount: 1, fweight: 20,   fvolume: 0.035574, fwidth: 22, flength: 33, fheight: 49, fcosttotalprice: 334.52 }),
];

check("residue: PR050 bare-priced absorb — Σ(sell) preserved exactly · box-1 deleted · anchor adopts box-1", () => {
  const d = planResidueAbsorb(PR050_BARE, PR050_SIBS, { allowPriced: true });
  assert.ok(d.absorb);
  if (!d.absorb) return;
  assert.equal(d.mode, "bare-priced");
  assert.equal(d.deleteSibId, 52477);                       // the "-1/2" row
  assert.deepEqual(d.surviveSibIds, [52478]);
  assert.equal(d.anchorPatch.fweight, 16.5);                // anchor = box 1
  assert.equal(d.anchorPatch.famount, 1);
  const sum = d.anchorPatch.ftotalprice + d.sibPatches.reduce((s, p) => s + p.ftotalprice, 0);
  assert.equal(Math.round(sum * 100) / 100, 730);           // Σ === the bare's frozen total
  assert.equal(d.sibPatches[0].id, 52478);
  assert.ok(d.sibPatches[0].ftotalprice > 0);
});

check("residue: priced bare WITHOUT allowPriced → refused (cron never moves money)", () => {
  const d = planResidueAbsorb(PR050_BARE, PR050_SIBS, {});
  assert.ok(!d.absorb && d.reason === "bare_priced_needs_optin");
});

check("residue: unpriced weighted bare absorbs on the cron path (no money to move)", () => {
  const bare = rrow({ ...PR050_BARE, id: 1, ftotalprice: 0, frefrate: 0 });
  const d = planResidueAbsorb(bare, PR050_SIBS, {});
  assert.ok(d.absorb);
  if (!d.absorb) return;
  assert.equal(d.mode, "unpriced");
  assert.equal(d.anchorPatch.ftotalprice, 0);
  assert.equal(d.sibPatches.length, 0);
});

check("residue: EMPTY bare (re-key header) — row-identity swap incl. box-1's own price", () => {
  const bare = rrow({ id: 10, ftrackingchn: "888073011722" });
  const sibs = [
    rrow({ id: 11, ftrackingchn: "888073011722-1/2", famount: 1, fweight: 4, fvolume: 0.01, ftotalprice: 55 }),
    rrow({ id: 12, ftrackingchn: "888073011722-2/2", famount: 1, fweight: 5, fvolume: 0.012 }),
  ];
  const d = planResidueAbsorb(bare, sibs, {});
  assert.ok(d.absorb);
  if (!d.absorb) return;
  assert.equal(d.mode, "empty-bare");
  assert.equal(d.anchorPatch.fweight, 4);
  assert.equal(d.anchorPatch.ftotalprice, 55);              // box-1's own sell moves verbatim
  assert.equal(d.deleteSibId, 11);
});

check("residue: PROPER split shape (bare anchor + '-2/n' only · no '-1/n') → refused no_box1_sib", () => {
  const bare = rrow({ id: 20, ftrackingchn: "908006917359", famount: 1, fweight: 28.5, fvolume: 0.0138 });
  const sibs = [rrow({ id: 21, ftrackingchn: "908006917359-2", famount: 1, fweight: 21.5, fvolume: 0.00882 })];
  const d = planResidueAbsorb(bare, sibs, {});
  assert.ok(!d.absorb && d.reason === "no_box1_sib");       // identical-weight twin can NEVER be destroyed
});

check("residue: any row billed/settled → refused (fstatus 5 · paydeposit · advance)", () => {
  const d1 = planResidueAbsorb(rrow({ ...PR050_BARE, fstatus: "5" }), PR050_SIBS, { allowPriced: true });
  assert.ok(!d1.absorb && d1.reason === "billed_or_settled");
  const d2 = planResidueAbsorb(PR050_BARE, [ { ...PR050_SIBS[0], paydeposit: "1" }, PR050_SIBS[1] ], { allowPriced: true });
  assert.ok(!d2.absorb && d2.reason === "billed_or_settled");
  const d3 = planResidueAbsorb(PR050_BARE, [ { ...PR050_SIBS[0], advanceBillConfirmed: "1" }, PR050_SIBS[1] ], { allowPriced: true });
  assert.ok(!d3.absorb && d3.reason === "billed_or_settled");
});

check("residue: sibling carries sell while bare weighted → refused sibs_priced (ambiguous money)", () => {
  const d = planResidueAbsorb(PR050_BARE, [ { ...PR050_SIBS[0], ftotalprice: 100 }, PR050_SIBS[1] ], { allowPriced: true });
  assert.ok(!d.absorb && d.reason === "sibs_priced");
});

check("residue: partial coverage (Σ sibs ≠ bare) → refused weight_mismatch/qty_mismatch", () => {
  const dQty = planResidueAbsorb(PR050_BARE, [PR050_SIBS[0]], { allowPriced: true });
  assert.ok(!dQty.absorb && dQty.reason === "qty_mismatch"); // 1 box vs famount 2
  const dW = planResidueAbsorb(
    rrow({ ...PR050_BARE, famount: 2, fweight: 99 }), PR050_SIBS, { allowPriced: true });
  assert.ok(!dW.absorb && dW.reason === "weight_mismatch");
});

check("residue: reforder-linked group → refused has_reforder", () => {
  const d = planResidueAbsorb(rrow({ ...PR050_BARE, reforder: "H123" }), PR050_SIBS, { allowPriced: true });
  assert.ok(!d.absorb && d.reason === "has_reforder");
});

console.log(`\n✅ split-box-rows-plan.test.ts — ${passed} checks passed`);
