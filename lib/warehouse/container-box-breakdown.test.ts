/**
 * ════════════════════════════════════════════════════════════════════════
 * Container box-dimension breakdown — unit tests (2026-06-19).
 *
 * Locks the rule the owner asked for (ปอน · expandable report-cnt row):
 *   group a container's tb_forwarder rows by (width, length, height); each
 *   distinct size = one breakdown row with Σ boxes (famount) + Σ CBM. A
 *   container with 9 boxes where 6 share size A and 3 share size B → 2 rows.
 *
 * Also locks `rowCbm` (the famountcount='1' MOMO-total vs per-box rule), which
 * must equal the cost engine + the import items table.
 *
 * SAFETY — pure · no DB · no IO. Runs in test:unit.
 * RUN:  pnpm tsx lib/warehouse/container-box-breakdown.test.ts
 * ════════════════════════════════════════════════════════════════════════
 */

import assert from "node:assert/strict";
import {
  groupBoxesByDimension,
  rowCbm,
  type FwForBreakdown,
} from "./container-box-breakdown";

let passed = 0;
function it(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// Build a forwarder-ish row; only the fields the breakdown reads matter.
function fw(p: Partial<FwForBreakdown>): FwForBreakdown {
  return {
    id: p.id ?? 1,
    famount: p.famount ?? 0,
    famountcount: p.famountcount ?? null,
    fvolume: p.fvolume ?? 0,
    fwidth: p.fwidth ?? 0,
    flength: p.flength ?? 0,
    fheight: p.fheight ?? 0,
    ftrackingchn: p.ftrackingchn ?? null,
    fweight: p.fweight ?? 0,
    userid: p.userid ?? "PR1",
  };
}

console.log("container-box-breakdown — rowCbm:");

it("rowCbm — famountcount='1' (MOMO) → fvolume is the TOTAL, never ×boxes", () => {
  assert.equal(rowCbm(1.728, 48, "1"), 1.728);
});
it("rowCbm — manual multi-box → fvolume × famount", () => {
  assert.equal(rowCbm(0.5, 6, "2"), 3.0);
});
it("rowCbm — manual single box (famount 0/1) → fvolume × 1", () => {
  assert.equal(rowCbm(0.25, 0, "2"), 0.25);
  assert.equal(rowCbm(0.25, 1, null), 0.25);
});

console.log("container-box-breakdown — groupBoxesByDimension (THE rule):");

it("THE owner case — 9 boxes = 6 of size A + 3 of size B → 2 rows", () => {
  const rows = [
    fw({ id: 1, famount: 6, famountcount: "2", fvolume: 0.06, fwidth: 50, flength: 40, fheight: 30, fweight: 5 }),
    fw({ id: 2, famount: 3, famountcount: "2", fvolume: 0.024, fwidth: 40, flength: 30, fheight: 20, fweight: 3 }),
  ];
  const groups = groupBoxesByDimension(rows);
  assert.equal(groups.length, 2);
  // Largest group first (6 boxes).
  assert.deepEqual(
    { w: groups[0].width, l: groups[0].length, h: groups[0].height, boxes: groups[0].boxes },
    { w: 50, l: 40, h: 30, boxes: 6 },
  );
  assert.equal(Number(groups[0].cbm.toFixed(6)), 0.36); // 0.06 × 6
  assert.deepEqual(
    { w: groups[1].width, l: groups[1].length, h: groups[1].height, boxes: groups[1].boxes },
    { w: 40, l: 30, h: 20, boxes: 3 },
  );
  assert.equal(Number(groups[1].cbm.toFixed(6)), 0.072); // 0.024 × 3
});

it("merges rows with the SAME dimension across different trackings", () => {
  const rows = [
    fw({ id: 1, famount: 2, famountcount: "2", fvolume: 0.1, fwidth: 60, flength: 50, fheight: 40 }),
    fw({ id: 2, famount: 4, famountcount: "2", fvolume: 0.1, fwidth: 60, flength: 50, fheight: 40 }),
  ];
  const groups = groupBoxesByDimension(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].boxes, 6); // 2 + 4
  assert.equal(Number(groups[0].cbm.toFixed(6)), 0.6); // 0.2 + 0.4
});

it("identical size → ONE row (not split)", () => {
  const rows = [
    fw({ id: 1, famount: 6, famountcount: "2", fvolume: 0.05, fwidth: 30, flength: 30, fheight: 30 }),
    fw({ id: 2, famount: 3, famountcount: "2", fvolume: 0.05, fwidth: 30, flength: 30, fheight: 30 }),
  ];
  const groups = groupBoxesByDimension(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].boxes, 9);
});

it("collects distinct trackings per dimension group (report-cnt #4 · B)", () => {
  const rows = [
    fw({ id: 1, famount: 6, famountcount: "2", fvolume: 0.06, fwidth: 50, flength: 40, fheight: 30, ftrackingchn: "TRK-A" }),
    fw({ id: 2, famount: 3, famountcount: "2", fvolume: 0.024, fwidth: 50, flength: 40, fheight: 30, ftrackingchn: "TRK-B" }), // same size, diff tracking
    fw({ id: 3, famount: 2, famountcount: "2", fvolume: 0.01, fwidth: 20, flength: 20, fheight: 20, ftrackingchn: "TRK-C" }), // diff size
    fw({ id: 4, famount: 1, famountcount: "2", fvolume: 0.01, fwidth: 20, flength: 20, fheight: 20, ftrackingchn: "TRK-C" }), // dup tracking → dedup
    fw({ id: 5, famount: 1, famountcount: "2", fvolume: 0.01, fwidth: 20, flength: 20, fheight: 20, ftrackingchn: null }),    // null → skipped
  ];
  const groups = groupBoxesByDimension(rows);
  const big = groups.find((g) => g.width === 50)!;
  const small = groups.find((g) => g.width === 20)!;
  assert.deepEqual(big.trackings, ["TRK-A", "TRK-B"]); // both, first-seen order
  assert.deepEqual(small.trackings, ["TRK-C"]);         // deduped · null dropped
});

it("no-dimension rows (MOMO total CBM) collapse to the (0,0,0) group", () => {
  const rows = [
    fw({ id: 1, famount: 48, famountcount: "1", fvolume: 1.728 }), // dims all 0
    fw({ id: 2, famount: 12, famountcount: "1", fvolume: 0.5 }),
  ];
  const groups = groupBoxesByDimension(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].width, 0);
  assert.equal(groups[0].boxes, 60); // 48 + 12
  assert.equal(Number(groups[0].cbm.toFixed(6)), 2.228); // 1.728 + 0.5 (MOMO totals, NOT ×boxes)
});

it("sorts groups by box count desc, then CBM desc", () => {
  const rows = [
    fw({ id: 1, famount: 1, famountcount: "2", fvolume: 0.01, fwidth: 10, flength: 10, fheight: 10 }),
    fw({ id: 2, famount: 5, famountcount: "2", fvolume: 0.01, fwidth: 20, flength: 20, fheight: 20 }),
    fw({ id: 3, famount: 3, famountcount: "2", fvolume: 0.01, fwidth: 30, flength: 30, fheight: 30 }),
  ];
  const groups = groupBoxesByDimension(rows);
  assert.deepEqual(groups.map((g) => g.boxes), [5, 3, 1]);
});

it("empty input → empty breakdown", () => {
  assert.deepEqual(groupBoxesByDimension([]), []);
});

console.log(`\ncontainer-box-breakdown: ${passed} assertions passed ✅`);
