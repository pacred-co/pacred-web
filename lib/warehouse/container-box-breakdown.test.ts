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
  groupBoxesWithDetail,
  baseOfTracking,
  rowCbm,
  type FwForBreakdown,
  type BoxDetailForGrouping,
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
    // Keep an explicitly-passed null (so the null-skip case is testable); only
    // default to "PR1" when userid is omitted entirely from the partial.
    userid: "userid" in p ? (p.userid ?? null) : "PR1",
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

it("collects distinct customer codes per dimension group (รหัสลูกค้า · ภูม 2026-06-30)", () => {
  const rows = [
    fw({ id: 1, famount: 6, famountcount: "2", fvolume: 0.06, fwidth: 50, flength: 40, fheight: 30, userid: "PR10" }),
    fw({ id: 2, famount: 3, famountcount: "2", fvolume: 0.024, fwidth: 50, flength: 40, fheight: 30, userid: "PR20" }), // same size, diff customer
    fw({ id: 3, famount: 2, famountcount: "2", fvolume: 0.01, fwidth: 20, flength: 20, fheight: 20, userid: "PR30" }), // diff size
    fw({ id: 4, famount: 1, famountcount: "2", fvolume: 0.01, fwidth: 20, flength: 20, fheight: 20, userid: "PR30" }), // dup customer → dedup
    fw({ id: 5, famount: 1, famountcount: "2", fvolume: 0.01, fwidth: 20, flength: 20, fheight: 20, userid: null }),   // null → skipped
  ];
  const groups = groupBoxesByDimension(rows);
  const big = groups.find((g) => g.width === 50)!;
  const small = groups.find((g) => g.width === 20)!;
  assert.deepEqual(big.userids, ["PR10", "PR20"]); // both, first-seen order
  assert.deepEqual(small.userids, ["PR30"]);        // deduped · null dropped
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

// ── v2: groupBoxesWithDetail — expand blank-dim MOMO rows via per-box detail ──
console.log("container-box-breakdown — baseOfTracking:");

it("baseOfTracking — strips -i and -i/n suffixes, keeps SEA-style intact", () => {
  assert.equal(baseOfTracking("1782103385-3"), "1782103385");
  assert.equal(baseOfTracking("1782103385-3/6"), "1782103385");
  assert.equal(baseOfTracking("1782103385"), "1782103385");
  assert.equal(baseOfTracking("CBX260620-SEA07"), "CBX260620-SEA07"); // SEA isn't digits
});

// per-box detail helper
function bd(p: Partial<BoxDetailForGrouping>): BoxDetailForGrouping {
  return {
    base_tracking: p.base_tracking ?? "T1",
    member_code: "member_code" in p ? (p.member_code ?? null) : "PR1",
    width: p.width ?? 0,
    length: p.length ?? 0,
    height: p.height ?? 0,
    cbm: p.cbm ?? 0,
    quantity: p.quantity ?? 1,
  };
}

console.log("container-box-breakdown — groupBoxesWithDetail (THE fix · owner ภูม 2026-07-02):");

it("THE bug case — a blank-dim MOMO row expands into its real distinct sizes (not one '—' bucket)", () => {
  // ONE tb_forwarder row (the base 1782103385) with BLANK dims + aggregate famount=6.
  const rows = [
    fw({ id: 1, famount: 6, famountcount: "1", fvolume: 0.5, fwidth: 0, flength: 0, fheight: 0, ftrackingchn: "1782103385", userid: "PR9" }),
  ];
  // 6 boxes, 3 distinct sizes (2× 204×61×80, 3× 194×125×166, 1× 75×90×40).
  const detail = new Map<string, BoxDetailForGrouping[]>([
    ["1782103385", [
      bd({ base_tracking: "1782103385", width: 204, length: 61, height: 80, cbm: 0.05, quantity: 1 }),
      bd({ base_tracking: "1782103385", width: 204, length: 61, height: 80, cbm: 0.05, quantity: 1 }),
      bd({ base_tracking: "1782103385", width: 194, length: 125, height: 166, cbm: 0.1, quantity: 1 }),
      bd({ base_tracking: "1782103385", width: 194, length: 125, height: 166, cbm: 0.1, quantity: 1 }),
      bd({ base_tracking: "1782103385", width: 194, length: 125, height: 166, cbm: 0.1, quantity: 1 }),
      bd({ base_tracking: "1782103385", width: 75, length: 90, height: 40, cbm: 0.02, quantity: 1 }),
    ]],
  ]);
  const groups = groupBoxesWithDetail(rows, detail);
  // 3 distinct real sizes — NOT one fake "—" bucket, NOT "1 ขนาด".
  assert.equal(groups.length, 3);
  const s204 = groups.find((g) => g.width === 204)!;
  const s194 = groups.find((g) => g.width === 194)!;
  const s75 = groups.find((g) => g.width === 75)!;
  assert.equal(s194.boxes, 3); // biggest group first
  assert.equal(s204.boxes, 2);
  assert.equal(s75.boxes, 1);
  assert.deepEqual(groups.map((g) => g.boxes), [3, 2, 1]); // sorted desc
});

it("a row that already carries real dims is grouped by its own size (v1 unchanged)", () => {
  const rows = [
    fw({ id: 1, famount: 6, famountcount: "2", fvolume: 0.06, fwidth: 50, flength: 40, fheight: 30, ftrackingchn: "MANUAL1" }),
  ];
  const groups = groupBoxesWithDetail(rows, new Map());
  assert.equal(groups.length, 1);
  assert.deepEqual({ w: groups[0].width, boxes: groups[0].boxes }, { w: 50, boxes: 6 });
});

it("a blank-dim row with NO detail stays the genuine 'ไม่ระบุขนาด' (0,0,0) bucket", () => {
  const rows = [
    fw({ id: 1, famount: 12, famountcount: "1", fvolume: 0.4, fwidth: 0, flength: 0, fheight: 0, ftrackingchn: "1782000000" }),
  ];
  const groups = groupBoxesWithDetail(rows, new Map()); // no detail
  assert.equal(groups.length, 1);
  assert.deepEqual({ w: groups[0].width, l: groups[0].length, h: groups[0].height }, { w: 0, l: 0, h: 0 });
  assert.equal(groups[0].boxes, 12); // aggregate famount
  assert.equal(Number(groups[0].cbm.toFixed(6)), 0.4); // MOMO total (famountcount='1')
});

it("MIXED container — real-dim rows + blank rows w/ detail + blank rows w/o detail all coexist", () => {
  const rows = [
    // A manual row with its own size.
    fw({ id: 1, famount: 2, famountcount: "2", fvolume: 0.1, fwidth: 50, flength: 40, fheight: 30, ftrackingchn: "MAN", userid: "PR1" }),
    // A blank MOMO row that HAS detail → expands.
    fw({ id: 2, famount: 3, famountcount: "1", fvolume: 0.3, fwidth: 0, flength: 0, fheight: 0, ftrackingchn: "AAA", userid: "PR2" }),
    // A blank MOMO row with NO detail → "ไม่ระบุขนาด".
    fw({ id: 3, famount: 5, famountcount: "1", fvolume: 0.5, fwidth: 0, flength: 0, fheight: 0, ftrackingchn: "BBB", userid: "PR3" }),
  ];
  const detail = new Map<string, BoxDetailForGrouping[]>([
    ["AAA", [
      bd({ base_tracking: "AAA", width: 60, length: 60, height: 60, cbm: 0.1, quantity: 2, member_code: "PR2" }),
      bd({ base_tracking: "AAA", width: 20, length: 20, height: 20, cbm: 0.05, quantity: 1, member_code: "PR2" }),
    ]],
  ]);
  const groups = groupBoxesWithDetail(rows, detail);
  // sizes present: 50×40×30 (manual, 2) · 60×60×60 (detail, 2) · 20×20×20 (detail, 1) · unsized (5)
  assert.equal(groups.length, 4);
  const unsized = groups.find((g) => g.width === 0)!;
  assert.equal(unsized.boxes, 5);
  const man = groups.find((g) => g.width === 50)!;
  assert.equal(man.boxes, 2);
  const big = groups.find((g) => g.width === 60)!;
  assert.equal(big.boxes, 2);
  const small = groups.find((g) => g.width === 20)!;
  assert.equal(small.boxes, 1);
  // Total boxes preserved: 2 + 2 + 1 + 5 = 10.
  assert.equal(groups.reduce((s, g) => s + g.boxes, 0), 10);
});

it("detail is matched by BASE tracking even when the tb_forwarder row stores a suffixed tracking", () => {
  const rows = [
    fw({ id: 1, famount: 4, famountcount: "1", fvolume: 0.4, fwidth: 0, flength: 0, fheight: 0, ftrackingchn: "1782103385-1", userid: "PR9" }),
  ];
  const detail = new Map<string, BoxDetailForGrouping[]>([
    ["1782103385", [
      bd({ base_tracking: "1782103385", width: 100, length: 100, height: 100, cbm: 0.2, quantity: 2 }),
      bd({ base_tracking: "1782103385", width: 30, length: 30, height: 30, cbm: 0.05, quantity: 2 }),
    ]],
  ]);
  const groups = groupBoxesWithDetail(rows, detail);
  assert.equal(groups.length, 2); // matched via base → expanded (not the "—" bucket)
  assert.ok(groups.every((g) => g.width > 0));
});

it("detail box with no size falls into 'ไม่ระบุขนาด'; a box's quantity drives its box count", () => {
  const rows = [
    fw({ id: 1, famount: 7, famountcount: "1", fvolume: 0.7, fwidth: 0, flength: 0, fheight: 0, ftrackingchn: "CCC" }),
  ];
  const detail = new Map<string, BoxDetailForGrouping[]>([
    ["CCC", [
      bd({ base_tracking: "CCC", width: 40, length: 40, height: 40, cbm: 0.06, quantity: 5 }), // 5 boxes this size
      bd({ base_tracking: "CCC", width: 0, length: 0, height: 0, cbm: 0.02, quantity: 2 }),    // 2 unsized
    ]],
  ]);
  const groups = groupBoxesWithDetail(rows, detail);
  const sized = groups.find((g) => g.width === 40)!;
  const unsized = groups.find((g) => g.width === 0)!;
  assert.equal(sized.boxes, 5);
  assert.equal(unsized.boxes, 2);
  assert.equal(Number(sized.cbm.toFixed(6)), 0.3); // 0.06 × 5
});

it("empty input → empty breakdown (v2)", () => {
  assert.deepEqual(groupBoxesWithDetail([], new Map()), []);
});

console.log(`\ncontainer-box-breakdown: ${passed} assertions passed ✅`);
