import assert from "node:assert/strict";
import {
  ADVANCE_TO_FSTATUS,
  ADVANCEABLE_FROM_FSTATUS,
  isContainerDeparted,
  isAdvanceableForwarder,
  normalizeEtd,
  selectAdvanceableForwarders,
  todayYmd,
} from "./departed-container-plan";

let passed = 0;
function it(name: string, fn: () => void) { fn(); passed += 1; console.log(`  ✓ ${name}`); }

console.log("departed-container-plan — forward-only + departed-only logic:");

const NOW = new Date("2026-07-01T08:00:00Z"); // today = 2026-07-01

// ── constants are the load-bearing safety contract ──
it("ADVANCE_TO_FSTATUS is '3' (กำลังส่งมาไทย)", () => {
  assert.equal(ADVANCE_TO_FSTATUS, "3");
});
it("ADVANCEABLE_FROM_FSTATUS is exactly ['1','2'] (forward-only source set)", () => {
  assert.deepEqual([...ADVANCEABLE_FROM_FSTATUS], ["1", "2"]);
});

// ── todayYmd / normalizeEtd ──
it("todayYmd returns the injected date as yyyy-mm-dd", () => {
  assert.equal(todayYmd(NOW), "2026-07-01");
});
it("normalizeEtd: blank / null / '0000-00-00' → null; real date → yyyy-mm-dd", () => {
  assert.equal(normalizeEtd(null), null);
  assert.equal(normalizeEtd(""), null);
  assert.equal(normalizeEtd("   "), null);
  assert.equal(normalizeEtd("0000-00-00"), null);
  assert.equal(normalizeEtd("0000-00-00 00:00:00"), null);
  assert.equal(normalizeEtd("2026-06-25"), "2026-06-25");
  assert.equal(normalizeEtd("2026-06-25 10:30:00"), "2026-06-25"); // timestamptz → date only
});

// ── isContainerDeparted — the DEPARTED signal (ETD strictly in the past) ──
it("ETD in the past → departed", () => {
  assert.equal(isContainerDeparted("2026-06-25", NOW), true);
  assert.equal(isContainerDeparted("2026-06-30", NOW), true); // yesterday
});
it("ETD == today → NOT departed (ship leaves during the day; strict <)", () => {
  assert.equal(isContainerDeparted("2026-07-01", NOW), false);
  assert.equal(isContainerDeparted("2026-07-01 23:59:00", NOW), false);
});
it("ETD in the future → NOT departed", () => {
  assert.equal(isContainerDeparted("2026-07-05", NOW), false);
  assert.equal(isContainerDeparted("2026-12-31", NOW), false);
});
it("null / blank / '0000-00-00' ETD → NOT departed", () => {
  assert.equal(isContainerDeparted(null, NOW), false);
  assert.equal(isContainerDeparted(undefined, NOW), false);
  assert.equal(isContainerDeparted("", NOW), false);
  assert.equal(isContainerDeparted("0000-00-00", NOW), false);
});

// ── isAdvanceableForwarder — forward-only per row ──
it("fstatus '1' and '2' are advanceable", () => {
  assert.equal(isAdvanceableForwarder({ id: 1, fstatus: "1" }), true);
  assert.equal(isAdvanceableForwarder({ id: 2, fstatus: "2" }), true);
});
it("fstatus '3'..'7' + '99' + '0' are NOT advanceable (never demote)", () => {
  for (const s of ["3", "4", "5", "6", "7", "99", "0"]) {
    assert.equal(isAdvanceableForwarder({ id: 1, fstatus: s }), false, `fstatus ${s} must not advance`);
  }
});
it("null / blank / unknown fstatus is NOT advanceable", () => {
  assert.equal(isAdvanceableForwarder({ id: 1, fstatus: null }), false);
  assert.equal(isAdvanceableForwarder({ id: 1, fstatus: "" }), false);
  assert.equal(isAdvanceableForwarder({ id: 1, fstatus: "x" }), false);
});
it("fstatus with surrounding whitespace is trimmed before the check", () => {
  assert.equal(isAdvanceableForwarder({ id: 1, fstatus: " 1 " }), true);
  assert.equal(isAdvanceableForwarder({ id: 1, fstatus: " 3 " }), false);
});

// ── selectAdvanceableForwarders — the plan filter ──
it("selectAdvanceableForwarders keeps ONLY '1'/'2' rows, never 3+", () => {
  const rows = [
    { id: 10, fstatus: "1" },
    { id: 11, fstatus: "2" },
    { id: 12, fstatus: "3" }, // already in-transit — must be excluded
    { id: 13, fstatus: "4" }, // arrived TH — must be excluded
    { id: 14, fstatus: "5" }, // billing — must be excluded
    { id: 15, fstatus: "7" }, // delivered — must be excluded
    { id: 16, fstatus: null },
  ];
  const kept = selectAdvanceableForwarders(rows);
  assert.deepEqual(kept.map((r) => r.id), [10, 11]);
});
it("selectAdvanceableForwarders on an all-past-3 container advances nothing (idempotent re-run)", () => {
  const rows = [
    { id: 20, fstatus: "3" },
    { id: 21, fstatus: "3" },
    { id: 22, fstatus: "5" },
  ];
  assert.deepEqual(selectAdvanceableForwarders(rows), []);
});
it("selectAdvanceableForwarders preserves extra row fields (typed passthrough)", () => {
  const rows = [
    { id: 30, fstatus: "1", ftrackingchn: "TRK-1" },
    { id: 31, fstatus: "3", ftrackingchn: "TRK-3" },
  ];
  const kept = selectAdvanceableForwarders(rows);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].ftrackingchn, "TRK-1");
});

console.log(`\n${passed} assertions passed ✓`);
