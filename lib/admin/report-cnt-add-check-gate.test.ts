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
 *   At /admin/report-cnt/GZS260605-1, rows labeled "กำลังส่งมาไทย"
 *   (fstatus=3) were ticked and the bottom "เพิ่มในรายการตรวจสอบแล้ว"
 *   button accepted them. QA inspecting goods that aren't in the
 *   warehouse yet is nonsense — the action now refuses the WHOLE
 *   batch when ANY row's fstatus is below the floor.
 *
 * Threshold = "4" ("ถึงไทยแล้ว" per lib/admin/forwarder-status.ts).
 * The original spec said "6" but per the canonical FSTATUS_CFG:
 *   "4" = ถึงไทยแล้ว     ← physical arrival = QA can start
 *   "5" = รอชำระเงิน      (still in TH warehouse, waiting payment)
 *   "6" = เตรียมส่ง       (post-QA, preparing delivery)
 *   "7" = ส่งแล้ว         (delivered · can re-enter QA for dispute)
 * ภูม's screenshot showed fstatus=4 rows ("ถึงโกดังไทยแล้ว") that SHOULD
 * pass — the original "6" would have blocked them too. "4" is the right
 * answer.
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

it("Test 1 — ALL rows with fstatus < 4 → returns blocked (never INSERTs)", () => {
  const result = evaluateReportCntAddCheckStatus([
    { id: 101, fstatus: "1", fidorco: "GZS-CO-1" },
    { id: 102, fstatus: "2", fidorco: "GZS-CO-2" },
    { id: 103, fstatus: "3", fidorco: "GZS-CO-3" },
    { id: 104, fstatus: "3", fidorco: null }, // กำลังส่งมาไทย (in transit)
    { id: 105, fstatus: "2", fidorco: "GZS-CO-5" },
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
  assert.deepEqual(result.sampleStatuses.sort(), ["1", "2", "3"].sort());
});

it("Test 2 — MIXED batch (some <4, some >=4) → ALL rejected (all-or-nothing)", () => {
  const result = evaluateReportCntAddCheckStatus([
    { id: 201, fstatus: "4", fidorco: "OK-ARRIVED" },      // eligible (ถึงไทย)
    { id: 202, fstatus: "3", fidorco: "BAD-IN-TRANSIT" },  // blocker
    { id: 203, fstatus: "7", fidorco: "OK-DELIVERED" },    // eligible
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.blockedCount, 1);
  assert.deepEqual(result.blockedFidorcos, ["BAD-IN-TRANSIT"]);
});

it("Test 3 — ALL rows with fstatus >= 4 → succeeds (gate returns ok)", () => {
  const result = evaluateReportCntAddCheckStatus([
    { id: 301, fstatus: "4", fidorco: "ARRIVED" },          // ถึงไทย
    { id: 302, fstatus: "5", fidorco: "AWAITING-PAY" },     // รอชำระ (still in TH)
    { id: 303, fstatus: "6", fidorco: "READY-TO-SHIP" },    // เตรียมส่ง
    { id: 304, fstatus: "7", fidorco: "DELIVERED" },        // ส่งแล้ว
  ]);
  assert.equal(result.ok, true);
});

it("Test 4 — boundary: fstatus exactly '4' is accepted", () => {
  const result = evaluateReportCntAddCheckStatus([
    { id: 401, fstatus: "4", fidorco: "EXACT-FOUR" },
  ]);
  assert.equal(result.ok, true);
});

it("Test 4b — boundary: fstatus exactly '3' is blocked (just below floor)", () => {
  const result = evaluateReportCntAddCheckStatus([
    { id: 411, fstatus: "3", fidorco: "EXACT-THREE" },
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.blockedCount, 1);
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
  assert.equal(isRowEligibleForAddCheck("1"), false);  // รอเข้าโกดังจีน
  assert.equal(isRowEligibleForAddCheck("2"), false);  // ถึงโกดังจีนแล้ว
  assert.equal(isRowEligibleForAddCheck("3"), false);  // กำลังส่งมาไทย — blocked
  assert.equal(isRowEligibleForAddCheck("4"), true);   // ถึงไทยแล้ว — boundary (eligible)
  assert.equal(isRowEligibleForAddCheck("5"), true);   // รอชำระเงิน — still in TH
  assert.equal(isRowEligibleForAddCheck("6"), true);   // เตรียมส่ง
  assert.equal(isRowEligibleForAddCheck("7"), true);   // ส่งแล้ว → can re-enter QA
});

it("min constant exported at '4' (canary — change-detection)", () => {
  assert.equal(REPORT_CNT_ADD_CHECK_MIN_FSTATUS, "4");
});

it("threshold override (caller-provided minFstatus) — strict '6' rejects arrival", () => {
  // Sanity-check the override knob — if a future caller wants to be
  // strict and only accept rows past payment ("6" = เตรียมส่ง), the
  // boundary row "4" should fail.
  const result = evaluateReportCntAddCheckStatus(
    [
      { id: 701, fstatus: "4", fidorco: "JUST-ARRIVED" },
      { id: 702, fstatus: "6", fidorco: "READY-TO-SHIP" },
    ],
    "6",
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.blockedCount, 1);
  assert.deepEqual(result.blockedFidorcos, ["JUST-ARRIVED"]);
});

console.log(`\n${passed} passed / 0 failed`);
