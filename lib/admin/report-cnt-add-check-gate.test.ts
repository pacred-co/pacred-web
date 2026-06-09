/**
 * ════════════════════════════════════════════════════════════════════════
 * report-cnt "เพิ่มในรายการตรวจสอบแล้ว" — fstatus status-gate (2026-06-09).
 *
 * Locks the accept/reject decision that
 *   actions/admin/report-cnt-detail.ts::adminReportCntAddCheck
 * applies BEFORE inserting tb_check_forwarder rows. The action delegates
 * the per-row check to `evaluateReportCntAddCheckStatus` in
 *   lib/admin/report-cnt-add-check-gate.ts
 * so importing that pure module here exercises the EXACT predicate the
 * action runs (no mirror-vs-action drift risk like the bill-to-customer
 * test had to live with).
 *
 * Bug context — ภูม-reported 2026-06-09:
 *   At /admin/report-cnt/GZS260605-1, a row labeled "ยังไม่ถึงไทย" was
 *   ticked and the bottom "เพิ่มในรายการตรวจสอบแล้ว" button accepted
 *   it. QA inspecting goods that aren't in the warehouse yet is nonsense
 *   — the action now refuses the WHOLE batch when ANY row's fstatus
 *   is below the floor.
 *
 * SAFETY — pure predicate · no DB · no IO. Runs in test:unit.
 *
 * RUN:  pnpm tsx lib/admin/report-cnt-add-check-gate.test.ts
 * ════════════════════════════════════════════════════════════════════════
 */

import assert from "node:assert/strict";
import {
  evaluateReportCntAddCheckStatus,
  isRowEligibleForAddCheck,
  REPORT_CNT_ADD_CHECK_MIN_FSTATUS,
} from "./report-cnt-add-check-gate";

let passed = 0;
function it(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("report-cnt add-check fstatus gate:");

it("Test 1 — ALL rows with fstatus < 6 → returns blocked (never INSERTs)", () => {
  const result = evaluateReportCntAddCheckStatus([
    { id: 101, fstatus: "1", fidorco: "GZS-CO-1" },
    { id: 102, fstatus: "2", fidorco: "GZS-CO-2" },
    { id: 103, fstatus: "3", fidorco: "GZS-CO-3" },
    { id: 104, fstatus: "4", fidorco: null }, // arrived TH warehouse but below the QA floor
    { id: 105, fstatus: "5", fidorco: "GZS-CO-5" },
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return; // type-narrow
  assert.equal(result.blockedCount, 5);
  // First 5 blocked rows sampled
  assert.deepEqual(result.blockedFidorcos, [
    "GZS-CO-1",
    "GZS-CO-2",
    "GZS-CO-3",
    "#104", // null fidorco → "#<id>" fallback
    "GZS-CO-5",
  ]);
  // sampleStatuses dedup'd, capped at 5
  assert.deepEqual(result.sampleStatuses.sort(), ["1", "2", "3", "4", "5"].sort());
});

it("Test 2 — MIXED batch (some <6, some >=6) → ALL rejected (all-or-nothing)", () => {
  const result = evaluateReportCntAddCheckStatus([
    { id: 201, fstatus: "6", fidorco: "OK-1" },           // eligible
    { id: 202, fstatus: "3", fidorco: "BAD-IN-TRANSIT" }, // blocker
    { id: 203, fstatus: "7", fidorco: "OK-DELIVERED" },   // eligible
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.blockedCount, 1);
  assert.deepEqual(result.blockedFidorcos, ["BAD-IN-TRANSIT"]);
});

it("Test 3 — ALL rows with fstatus >= 6 → succeeds (gate returns ok)", () => {
  const result = evaluateReportCntAddCheckStatus([
    { id: 301, fstatus: "6", fidorco: "A" },
    { id: 302, fstatus: "7", fidorco: "B" },
  ]);
  assert.equal(result.ok, true);
});

it("Test 4 — boundary: fstatus exactly '6' is accepted", () => {
  const result = evaluateReportCntAddCheckStatus([
    { id: 401, fstatus: "6", fidorco: "EXACT-SIX" },
  ]);
  assert.equal(result.ok, true);
});

it("NULL fstatus → blocked (treated as <min · defensive)", () => {
  const result = evaluateReportCntAddCheckStatus([
    { id: 501, fstatus: null, fidorco: "NULL-STATUS" },
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.blockedCount, 1);
  assert.deepEqual(result.blockedFidorcos, ["NULL-STATUS"]);
  assert.deepEqual(result.sampleStatuses, ["(ว่าง)"]);
});

it("empty-string fstatus → blocked (same as null)", () => {
  const result = evaluateReportCntAddCheckStatus([
    { id: 502, fstatus: "", fidorco: "EMPTY" },
    { id: 503, fstatus: "   ", fidorco: "WHITESPACE" },
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.blockedCount, 2);
});

it("blockedFidorcos capped at 5 even when more rows are blocked", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: 600 + i,
    fstatus: "1",
    fidorco: `MANY-${i}`,
  }));
  const result = evaluateReportCntAddCheckStatus(rows);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.blockedCount, 12); // true total, not capped
  assert.equal(result.blockedFidorcos.length, 5); // sample capped
});

it("isRowEligibleForAddCheck — mirrors the batch gate per-row", () => {
  assert.equal(isRowEligibleForAddCheck(null), false);
  assert.equal(isRowEligibleForAddCheck(""), false);
  assert.equal(isRowEligibleForAddCheck("1"), false);
  assert.equal(isRowEligibleForAddCheck("3"), false); // "กำลังส่งมาไทย" — blocked
  assert.equal(isRowEligibleForAddCheck("4"), false); // "ถึงไทยแล้ว" but below QA floor
  assert.equal(isRowEligibleForAddCheck("5"), false);
  assert.equal(isRowEligibleForAddCheck("6"), true);  // boundary
  assert.equal(isRowEligibleForAddCheck("7"), true);  // ส่งแล้ว → can re-enter QA
});

it("min constant exported at '6' (canary — change-detection)", () => {
  assert.equal(REPORT_CNT_ADD_CHECK_MIN_FSTATUS, "6");
});

it("threshold override (caller-provided minFstatus) — accept '4' onwards", () => {
  // Sanity-check the override knob — if ภูม drops the floor to '4',
  // arrival-stage rows should pass without code surgery.
  const result = evaluateReportCntAddCheckStatus(
    [
      { id: 701, fstatus: "4", fidorco: "ARRIVED" },
      { id: 702, fstatus: "3", fidorco: "STILL-IN-TRANSIT" },
    ],
    "4",
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.blockedCount, 1);
  assert.deepEqual(result.blockedFidorcos, ["STILL-IN-TRANSIT"]);
});

console.log(`\n${passed} passed / 0 failed`);
