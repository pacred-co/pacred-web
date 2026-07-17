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
 *   "4" = ถึงไทยแล้ว     ← physical arrival = พร้อมแจ้งชำระ
 *   "5" = รอชำระเงิน      (แจ้งชำระไปแล้ว · รอลูกค้าจ่าย)
 *   "6" = เตรียมส่ง       (จ่ายแล้ว · เตรียมจัดส่ง)
 *   "7" = ส่งแล้ว         (จบงาน)
 * ภูม's screenshot showed fstatus=4 rows ("ถึงโกดังไทยแล้ว") that SHOULD
 * pass — the original "6" would have blocked them too. "4" is the right
 * answer.
 *
 * ── 2026-07-17 owner — ขอบบน (นโยบายเปลี่ยน · tests below updated) ─────
 * owner: "บางสถานะมัน ส่งแล้ว หรือ รอส่ง มันจะยังไม่ส่งแจ้งชำระในรอตรวจสอบอีก
 * ได้ไงหละครับ · มันควรจะเข้าไปแค่ รายการที่จะให้ลูกค้าชำระเงิน"
 *
 * เดิม gate มีแค่ขอบล่าง → 5/6/7 ผ่านเข้าคิวได้ (Test 3 เดิม lock พฤติกรรมนี้ไว้
 * ด้วยเหตุผล "delivered row can re-enter QA for dispute"). แต่คิวนี้มี consumer
 * เดียว = adminCallPriceUser ที่อ่าน `.eq("fstatus","4")` → แถว ≥5 แจ้งชำระไม่ได้
 * ตลอดกาล + ไม่เคยถูกลบออกจากคิว → **ค้างถาวร**.
 * prod 2026-07-17: คิว 168 แถว = fstatus 4 แค่ 8 · ค้าง 159 (5:27 · 6:112 · 7:20).
 * → นโยบายใหม่: ต้องเป็น '4' เป๊ะ. เคสเคลม/ของเสียหายของแถวที่ส่งแล้ว ใช้
 *   /admin/forwarders/exceptions (G7 · mig 0230) ไม่ใช่คิวแจ้งชำระ.
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
  addCheckIneligibleReason,
  addCheckIneligibleMessage,
  REPORT_CNT_ADD_CHECK_MIN_FSTATUS,
  REPORT_CNT_ADD_CHECK_MAX_FSTATUS,
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

it("Test 2 — MIXED batch (<4 และ >4) → ALL rejected (all-or-nothing) · แยกเหตุผล", () => {
  const result = evaluateReportCntAddCheckStatus([
    { id: 201, fstatus: "4", fidorco: "OK-ARRIVED" },       // eligible (ถึงไทย)
    { id: 202, fstatus: "3", fidorco: "BAD-IN-TRANSIT" },   // blocker — ยังไม่ถึงไทย
    { id: 203, fstatus: "7", fidorco: "BAD-DELIVERED" },    // blocker — ส่งแล้ว (2026-07-17)
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.blockedCount, 2);
  // เหตุผลต้องแยกถูกตัว — ห้ามบอก "ยังไม่ถึงไทย" กับแถวที่ส่งแล้ว
  assert.deepEqual(result.tooEarly.fidorcos, ["BAD-IN-TRANSIT"]);
  assert.deepEqual(result.alreadyBilled.fidorcos, ["BAD-DELIVERED"]);
  assert.equal(result.tooEarly.count, 1);
  assert.equal(result.alreadyBilled.count, 1);
});

it("Test 3 — 🔴 owner 2026-07-17: 5/6/7 (แจ้งชำระไปแล้ว) → REJECTED", () => {
  // เดิม test นี้ assert ok===true (ยอมรับ 5/6/7). owner สั่งกลับด้าน:
  // "มันควรจะเข้าไปแค่ รายการที่จะให้ลูกค้าชำระเงิน"
  const result = evaluateReportCntAddCheckStatus([
    { id: 302, fstatus: "5", fidorco: "AWAITING-PAY" },     // รอชำระเงิน = แจ้งไปแล้ว
    { id: 303, fstatus: "6", fidorco: "READY-TO-SHIP" },    // เตรียมส่ง = "รอส่ง"
    { id: 304, fstatus: "7", fidorco: "DELIVERED" },        // ส่งแล้ว
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.blockedCount, 3);
  assert.equal(result.alreadyBilled.count, 3);
  assert.equal(result.tooEarly.count, 0);
});

it("Test 3b — 🔴 MONEY: fstatus='4' (รายการที่ยังไม่เก็บเงิน) ยังผ่านเหมือนเดิม", () => {
  // invariant ที่ห้ามพัง — แถวที่ *ควร* เก็บเงินต้องไม่หลุดหายจากคิว
  const result = evaluateReportCntAddCheckStatus([
    { id: 311, fstatus: "4", fidorco: "BILLABLE-1" },
    { id: 312, fstatus: "4", fidorco: "BILLABLE-2" },
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

it("isRowEligibleForAddCheck — mirrors the batch gate per-row (owner 2026-07-17)", () => {
  assert.equal(isRowEligibleForAddCheck(null), false);
  assert.equal(isRowEligibleForAddCheck(""), false);
  assert.equal(isRowEligibleForAddCheck("1"), false);  // รอเข้าโกดังจีน
  assert.equal(isRowEligibleForAddCheck("2"), false);  // ถึงโกดังจีนแล้ว
  assert.equal(isRowEligibleForAddCheck("3"), false);  // กำลังส่งมาไทย — blocked
  assert.equal(isRowEligibleForAddCheck("4"), true);   // ถึงไทยแล้ว — the ONLY eligible state
  assert.equal(isRowEligibleForAddCheck("5"), false);  // รอชำระเงิน — แจ้งไปแล้ว
  assert.equal(isRowEligibleForAddCheck("6"), false);  // เตรียมส่ง — "รอส่ง" (owner named)
  assert.equal(isRowEligibleForAddCheck("7"), false);  // ส่งแล้ว — (owner named)
});

it("addCheckIneligibleReason — บอกเหตุผลถูกตัว (ไม่โกหก)", () => {
  assert.equal(addCheckIneligibleReason("4"), null);          // ผ่าน
  assert.equal(addCheckIneligibleReason("3"), "too_early");
  assert.equal(addCheckIneligibleReason("1"), "too_early");
  assert.equal(addCheckIneligibleReason(null), "too_early");  // fail-closed
  assert.equal(addCheckIneligibleReason(""), "too_early");
  assert.equal(addCheckIneligibleReason("5"), "already_billed");
  assert.equal(addCheckIneligibleReason("6"), "already_billed");
  assert.equal(addCheckIneligibleReason("7"), "already_billed");
});

it("addCheckIneligibleMessage — ข้อความไทยตรงเหตุผลจริง", () => {
  assert.equal(addCheckIneligibleMessage("4"), null);
  // แถวที่ส่งแล้ว ต้อง NOT บอกว่า "ยังไม่ถึงโกดังไทย" (= บทเรียน
  // wrong-error-message-hides-real-block)
  const sixMsg = addCheckIneligibleMessage("6") ?? "";
  assert.ok(sixMsg.includes("แจ้งชำระเงินไปแล้ว"), sixMsg);
  assert.ok(!sixMsg.includes("ยังไม่ถึงโกดังไทย"), sixMsg);
  assert.ok(sixMsg.includes("เตรียมส่ง"), sixMsg); // บอกสถานะปัจจุบัน
  const threeMsg = addCheckIneligibleMessage("3") ?? "";
  assert.ok(threeMsg.includes("ยังไม่ถึงโกดังไทย"), threeMsg);
  assert.ok(threeMsg.includes("กำลังส่งมาไทย"), threeMsg);
});

it("min/max constants both '4' (canary — change-detection)", () => {
  assert.equal(REPORT_CNT_ADD_CHECK_MIN_FSTATUS, "4");
  assert.equal(REPORT_CNT_ADD_CHECK_MAX_FSTATUS, "4");
  // invariant: คิวนี้ต้องตรงกับ consumer (adminCallPriceUser `.eq("fstatus","4")`)
  assert.equal(REPORT_CNT_ADD_CHECK_MIN_FSTATUS, REPORT_CNT_ADD_CHECK_MAX_FSTATUS);
});

it("threshold override (caller-provided min/max) — strict '6'-'7' window", () => {
  // Sanity-check the override knob — a caller can widen/shift the window.
  const result = evaluateReportCntAddCheckStatus(
    [
      { id: 701, fstatus: "4", fidorco: "JUST-ARRIVED" },   // < min → too_early
      { id: 702, fstatus: "6", fidorco: "READY-TO-SHIP" },  // in window → ok
    ],
    "6",
    "7",
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.blockedCount, 1);
  assert.deepEqual(result.blockedFidorcos, ["JUST-ARRIVED"]);
  assert.equal(result.tooEarly.count, 1);
});

console.log(`\n${passed} passed / 0 failed`);
