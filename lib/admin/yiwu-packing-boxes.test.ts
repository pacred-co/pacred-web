import assert from "node:assert/strict";
import { yiwuPackingBoxesByOrderNo } from "./yiwu-packing-boxes";
import type { MomoPackingRow } from "./momo-packing-xlsx-parser";

let pass = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; } catch (e) { console.error(`FAIL: ${name}`); throw e; }
}
const row = (o: Partial<MomoPackingRow>): MomoPackingRow => ({
  tracking: "", baseTracking: "", code: null, productType: null, width: null, length: null,
  height: null, parcelCount: null, weightKg: null, cbm: null, totalWeight: null, totalCbm: null,
  cg: null, trans: null, smDate: null, branch: null, product: null, dum: null, remark: null, ...o,
});

// The real X9002653 case (grounded vs the ใบส่งของ): totalWeight/totalCbm are the group
// totals the grid needs; parcelCount is the box count; L/W/H are per-box.
t("maps a 单号 to its box-split rows using group totals", () => {
  const map = yiwuPackingBoxesByOrderNo([
    row({ baseTracking: "X9002653", parcelCount: 5, weightKg: 9, totalWeight: 45, length: 67, width: 51, height: 75, totalCbm: 1.281375, productType: "ผ้าทำความสะอาด" }),
    row({ baseTracking: "X9002653", parcelCount: 19, weightKg: 9, totalWeight: 171, length: 47, width: 62, height: 62, totalCbm: 3.432692 }),
  ]);
  assert.deepEqual(Object.keys(map), ["X9002653"]);
  const boxes = map["X9002653"]!;
  assert.equal(boxes.length, 2);
  assert.deepEqual(boxes[0], { boxCount: 5, weightKg: 45, lengthCm: 67, widthCm: 51, heightCm: 75, cbm: 1.281375, productType: "ผ้าทำความสะอาด" });
  assert.equal(boxes[1]!.weightKg, 171);
  assert.equal(boxes[1]!.cbm, 3.432692);
});

// fallback: no totalWeight → per-box weight × count; no totalCbm → L×W×H×count/1e6
t("falls back to per-box × count when totals absent", () => {
  const map = yiwuPackingBoxesByOrderNo([
    row({ tracking: "X900-1/2", parcelCount: 4, weightKg: 10, length: 50, width: 40, height: 30 }),
  ]);
  const b = map["X900"]![0]!;   // baseTracking empty → falls back to stripped tracking
  assert.equal(b.boxCount, 4);
  assert.equal(b.weightKg, 40);           // 10 × 4
  assert.equal(b.cbm, round(50 * 40 * 30 * 4 / 1e6)); // 0.24
});

// multiple 单号 grouped separately
t("groups multiple 单号 separately", () => {
  const map = yiwuPackingBoxesByOrderNo([
    row({ baseTracking: "A1", parcelCount: 1, totalWeight: 5, length: 10, width: 10, height: 10, totalCbm: 0.001 }),
    row({ baseTracking: "B2", parcelCount: 2, totalWeight: 8, length: 20, width: 20, height: 20, totalCbm: 0.016 }),
  ]);
  assert.equal(Object.keys(map).length, 2);
  assert.equal(map["A1"]!.length, 1);
  assert.equal(map["B2"]![0]!.weightKg, 8);
});

// blank base skipped, count floors to 1, product name kept
t("skips blank base + floors count", () => {
  const map = yiwuPackingBoxesByOrderNo([
    row({ baseTracking: "", tracking: "", parcelCount: 3 }),          // no base → skip
    row({ baseTracking: "Z9", parcelCount: 0, productType: "短裤" }), // count 0 → 1
  ]);
  assert.deepEqual(Object.keys(map), ["Z9"]);
  assert.equal(map["Z9"]![0]!.boxCount, 1);
  assert.equal(map["Z9"]![0]!.productType, "短裤");
});

function round(v: number) { return Math.round((v + Number.EPSILON) * 1e6) / 1e6; }

console.log(`yiwu-packing-boxes: ${pass} assertions passed`);
