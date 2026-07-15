/**
 * Tests for deriveMomoBoxConsistency — the "MOMO มั่ว" 🚩 detector.
 * Fixtures use REAL prod data (fwd 52137/52132/52167 · probed 2026-07-15) + a
 * cross-check that the verdict AGREES with planBoxRowSplit's weight/cbm_mismatch.
 * RUN: pnpm tsx lib/admin/momo-box-consistency.test.ts
 */
import assert from "node:assert";
import { deriveMomoBoxConsistency, type BoxConsistencyInput } from "./momo-box-consistency";
import { planBoxRowSplit } from "@/lib/integrations/momo-web/split-box-rows-plan";

let passed = 0;
function t(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`); process.exitCode = 1; }
}

// ── REAL prod fixture: fwd 52137 (1782555393, PR067) — MOMO มั่ว, dims don't reconcile ──
// aggregate fweight=150 / fvolume=0.33696, but box_detail sums to ~20,141kg / ~40 คิว
// (box -2 claims 3,580kg/piece for a 1.75-คิว box). The auto-split refused it (weight_mismatch).
const F52137: { agg: { fweight: number; fvolume: number }; boxes: BoxConsistencyInput[] } = {
  agg: { fweight: 150, fvolume: 0.33696 },
  boxes: [
    { boxTracking: "1782555393",   weightKgPerPiece: 50,     cbmPerPiece: 0.1123,  width: 320, length: 27,  height: 13,  quantity: 3 },
    { boxTracking: "1782555393-2", weightKgPerPiece: 3580.5, cbmPerPiece: 5.2668,  width: 190, length: 77,  height: 120, quantity: 3 },
    { boxTracking: "1782555393-3", weightKgPerPiece: 350,    cbmPerPiece: 1.99485, width: 117, length: 110, height: 155, quantity: 1 },
    { boxTracking: "1782555393-4", weightKgPerPiece: 800,    cbmPerPiece: 1.67321, width: 371, length: 22,  height: 20.5, quantity: 10 },
    { boxTracking: "1782555393-5", weightKgPerPiece: 60,     cbmPerPiece: 0.3145,  width: 126, length: 48,  height: 52,  quantity: 15 },
  ],
};

t("52137 (real): garbage · weight · dims can't reconcile", () => {
  const v = deriveMomoBoxConsistency(F52137.agg, F52137.boxes);
  assert.equal(v.garbage, true);
  assert.equal(v.reason, "weight");
  assert.equal(v.dimsReconcilable, false);
  assert.equal(v.boxCount, 5);
  assert.ok(v.boxWeightSum > 20000, `boxWeightSum ${v.boxWeightSum}`);
  assert.equal(v.aggWeight, 150);
});

t("52137: verdict AGREES with planBoxRowSplit (weight_mismatch)", () => {
  // Normalize the aggregate so only guards 5-7 (multi-box + weight/cbm) can fire:
  // unbilled, no reforder, unpriced, bare base, famount = Σ box pieces (so no qty_mismatch).
  const sumQty = F52137.boxes.reduce((s, b) => s + Math.max(1, Math.round(b.quantity)), 0);
  const decision = planBoxRowSplit(
    { id: 1, ftrackingchn: "1782555393", fstatus: "3", reforder: "", ftotalprice: 0,
      famount: sumQty, famountcount: "1", fweight: F52137.agg.fweight, fvolume: F52137.agg.fvolume },
    F52137.boxes.map((b) => ({ boxTracking: b.boxTracking, weightKgPerPiece: b.weightKgPerPiece, cbmPerPiece: b.cbmPerPiece, width: b.width, length: b.length, height: b.height, quantity: b.quantity })),
    { allowPriced: true },
  );
  assert.equal(decision.split, false);
  if (!decision.split) assert.ok(["weight_mismatch", "cbm_mismatch"].includes(decision.reason), `reason=${decision.reason}`);
  // my detector says garbage → the split refuses on the same money-basis guard.
  assert.equal(deriveMomoBoxConsistency(F52137.agg, F52137.boxes).garbage, true);
});

t("consistent: Σ box == aggregate → not garbage", () => {
  const v = deriveMomoBoxConsistency(
    { fweight: 100, fvolume: 1.0 },
    [
      { boxTracking: "a",   weightKgPerPiece: 50, cbmPerPiece: 0.5, width: 100, length: 100, height: 50, quantity: 1 },
      { boxTracking: "a-2", weightKgPerPiece: 50, cbmPerPiece: 0.5, width: 100, length: 100, height: 50, quantity: 1 },
    ],
  );
  assert.equal(v.garbage, false);
  assert.equal(v.reason, null);
});

t("single box: nothing to cross-check → not garbage", () => {
  const v = deriveMomoBoxConsistency(
    { fweight: 50, fvolume: 0.5 },
    [{ boxTracking: "a", weightKgPerPiece: 999, cbmPerPiece: 9, width: 0, length: 0, height: 0, quantity: 1 }],
  );
  assert.equal(v.garbage, false);
  assert.equal(v.boxCount, 1);
});

t("dims-fix: stored weight/คิว wrong BUT dims reconcile fvolume → not garbage", () => {
  // stored per-piece weight/cbm are garbage (Σ 1900kg / 19 คิว) but each box's dims
  // (100×100×50 = 0.5 m³) sum to the aggregate fvolume 1.0 → the human split button fixes it.
  const v = deriveMomoBoxConsistency(
    { fweight: 100, fvolume: 1.0 },
    [
      { boxTracking: "a",   weightKgPerPiece: 900,  cbmPerPiece: 9,  width: 100, length: 100, height: 50, quantity: 1 },
      { boxTracking: "a-2", weightKgPerPiece: 1000, cbmPerPiece: 10, width: 100, length: 100, height: 50, quantity: 1 },
    ],
  );
  assert.equal(v.garbage, false, "dims reconcile → not flagged");
  assert.equal(v.dimsReconcilable, true);
});

t("cbm mismatch with NO dims → garbage · cbm", () => {
  const v = deriveMomoBoxConsistency(
    { fweight: 100, fvolume: 1.0 },
    [
      { boxTracking: "a",   weightKgPerPiece: 50, cbmPerPiece: 5, width: 0, length: 0, height: 0, quantity: 1 },
      { boxTracking: "a-2", weightKgPerPiece: 50, cbmPerPiece: 5, width: 0, length: 0, height: 0, quantity: 1 },
    ],
  );
  assert.equal(v.garbage, true);
  assert.equal(v.reason, "cbm"); // weight Σ (100) matches; cbm Σ (10) doesn't; no dims to save it.
});

t("empty boxes → not garbage", () => {
  const v = deriveMomoBoxConsistency({ fweight: 100, fvolume: 1 }, []);
  assert.equal(v.garbage, false);
  assert.equal(v.boxCount, 0);
});

console.log(`\nmomo-box-consistency: ${passed} passed`);
