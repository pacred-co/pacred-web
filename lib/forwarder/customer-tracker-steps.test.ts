/**
 * Unit tests — customer ฝากนำเข้า 8-step tracker (computeSteps).
 *
 * Anchored on the owner/ภูม 2026-07-08 bug: PR207 / order 52304 (fstatus=3 ·
 * fdatestatus3 stamped · fdatestatus4 null) was lighting step 4 "สินค้าถึงไทย"
 * as active for the customer while the goods were still กำลังส่งมาไทย.
 *
 * Step indices: 0 รอเข้าโกดังจีน · 1 ถึงโกดังจีน · 2 กำลังส่งมาไทย · 3 สินค้าถึงไทย ·
 *               4 รอชำระเงิน · 5 เตรียมส่ง · 6 กำลังจัดส่ง · 7 ส่งแล้ว
 *
 * Run: tsx lib/forwarder/customer-tracker-steps.test.ts
 */

import assert from "node:assert/strict";
import { computeSteps, hasRealStamp } from "./customer-tracker-steps";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const D = "2026-07-07T17:00:00.000Z"; // a real stamp
const none = null;

console.log("customer-tracker-steps.test.ts");

// ── hasRealStamp ──
check("hasRealStamp: null / empty / zero-date = false · real ISO = true", () => {
  assert.equal(hasRealStamp(null), false);
  assert.equal(hasRealStamp(""), false);
  assert.equal(hasRealStamp("0000-00-00 00:00:00"), false);
  assert.equal(hasRealStamp(D), true);
  assert.equal(hasRealStamp("2026-07-02 17:00:00"), true); // space-separated (legacy)
});

// ── THE BUG (52304) ──
check("🐛 52304: fstatus=3 · ส่งมาไทย stamped · ถึงไทย NULL → step 3 active, step 4 BLANK", () => {
  const out = computeSteps("3", 0, { s2: D, s3: D, s4: none });
  assert.deepEqual(out, ["visited", "visited", "active", "", "", "", "", ""]);
  assert.equal(out[2], "active", "กำลังส่งมาไทย = the current phase");
  assert.notEqual(out[3], "active", "สินค้าถึงไทย must NOT be active (goods not arrived)");
  assert.equal(out[3], "", "สินค้าถึงไทย stays blank until it truly arrives");
});

// ── the rest of the physical journey ──
check("brand-new order (fstatus=1 · no stamps) → step 1 active", () => {
  assert.deepEqual(computeSteps("1", 0, { s2: none, s3: none, s4: none }),
    ["active", "", "", "", "", "", "", ""]);
});
check("at the China warehouse (fstatus=2 · only ถึงโกดังจีน stamped) → step 2 active", () => {
  assert.deepEqual(computeSteps("2", 0, { s2: D, s3: none, s4: none }),
    ["visited", "active", "", "", "", "", "", ""]);
});
check("arrived Thailand, not yet billed (fstatus=4 · all 3 physical stamped) → step 4 active", () => {
  assert.deepEqual(computeSteps("4", 0, { s2: D, s3: D, s4: D }),
    ["visited", "visited", "visited", "active", "", "", "", ""]);
});

// ── money / dispatch tail ──
check("รอชำระเงิน (fstatus=5) → step 5 active · physical all visited", () => {
  assert.deepEqual(computeSteps("5", 0, { s2: D, s3: D, s4: D }),
    ["visited", "visited", "visited", "visited", "active", "", "", ""]);
});
check("เตรียมส่ง — no driver yet (fstatus=6 · fidDriver=0) → step 6 active", () => {
  assert.deepEqual(computeSteps("6", 0, { s2: D, s3: D, s4: D }),
    ["visited", "visited", "visited", "visited", "visited", "active", "", ""]);
});
check("กำลังจัดส่ง — driver assigned (fstatus=6 · fidDriver=1) → step 6.1 active", () => {
  assert.deepEqual(computeSteps("6", 1, { s2: D, s3: D, s4: D }),
    ["visited", "visited", "visited", "visited", "visited", "visited", "active", ""]);
});
check("ส่งแล้ว (fstatus=7) → step 7 active · all earlier visited", () => {
  assert.deepEqual(computeSteps("7", 0, { s2: D, s3: D, s4: D }),
    ["visited", "visited", "visited", "visited", "visited", "visited", "visited", "active"]);
});

// ── the credit-order safety (why the timeline is date-driven, not fstatus-driven) ──
check("CREDIT order flipped to fstatus=6 BEFORE arrival (ถึงไทย NULL) → step 4 NOT done · dispatch active", () => {
  // credit-grant moves fstatus to 6 while the goods are still in transit (no fdatestatus4).
  const out = computeSteps("6", 0, { s2: D, s3: D, s4: none });
  assert.equal(out[3], "", "สินค้าถึงไทย stays blank (goods have NOT physically arrived)");
  assert.equal(out[5], "active", "the dispatch phase (fstatus=6) is the active head");
});

console.log(`\n✅ customer-tracker-steps.test.ts — ${passed} checks passed`);
