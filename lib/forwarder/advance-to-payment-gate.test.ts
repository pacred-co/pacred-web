/**
 * advance-to-payment gate — locks the exact 3-way AND that decides whether
 * `adminUpdateForwarderDimensions` auto-advances ถึงไทยแล้ว(4) → รอชำระเงิน(5).
 *
 * MIRRORS the inline predicate in `actions/admin/forwarders-edit.ts`
 * (the `advancedToFive` const):
 *
 *   const advancedToFive =
 *     d.advanceToPayment !== false &&      // ภูม 2026-07-01 · dims-only opt-out
 *     String(before.fstatus ?? "") === "4" &&
 *     newFTotalPrice > 0;
 *
 * The gate can't be exported from that "use server" file (a non-async export
 * there reaches the client as a server-action ref), so this test re-states the
 * predicate verbatim and asserts every branch. The point ภูม cares about: the
 * warehouse "💾 บันทึกขนาด (ยังไม่ส่งรอชำระ)" button sends advanceToPayment=false,
 * which MUST keep fstatus put — even when the freight rate is already > 0.
 *
 * Run: tsx "app/[locale]/(admin)/admin/forwarders/[fNo]/advance-to-payment-gate.test.ts"
 */

import assert from "node:assert/strict";

// Verbatim copy of the inline gate (keep in lockstep with forwarders-edit.ts).
function advancesToFive(
  advanceToPayment: boolean | undefined,
  fstatus: string | null,
  newFTotalPrice: number,
): boolean {
  return (
    advanceToPayment !== false &&
    String(fstatus ?? "") === "4" &&
    newFTotalPrice > 0
  );
}

let passed = 0;
function check(label: string, actual: boolean, expected: boolean) {
  assert.equal(actual, expected, `${label}: expected ${expected}, got ${actual}`);
  passed++;
}

// ── Legacy behaviour preserved (advanceToPayment omitted = undefined) ────────
// The existing "บันทึก + ส่งไปรอชำระเงิน" button + edit-form + rate-fallback all
// omit the flag → must behave EXACTLY as before.
check("undefined + status 4 + rate>0 → advances", advancesToFive(undefined, "4", 4083.96), true);
check("undefined + status 4 + rate=0 → stays (เซลยังไม่ตั้งเรท)", advancesToFive(undefined, "4", 0), false);
check("undefined + status 5 + rate>0 → stays (already billing)", advancesToFive(undefined, "5", 500), false);
check("undefined + status 6 + rate>0 → stays (เตรียมส่ง)", advancesToFive(undefined, "6", 500), false);
check("undefined + status 2 + rate>0 → stays (ถึงโกดังจีน)", advancesToFive(undefined, "2", 500), false);
check("undefined + null status + rate>0 → stays", advancesToFive(undefined, null, 500), false);

// ── advanceToPayment=true — same as legacy (explicit "ส่งไปรอชำระ" button) ────
check("true + status 4 + rate>0 → advances", advancesToFive(true, "4", 100), true);
check("true + status 4 + rate=0 → stays", advancesToFive(true, "4", 0), false);
check("true + status 5 + rate>0 → stays", advancesToFive(true, "5", 100), false);

// ── advanceToPayment=false — the DIMS-ONLY save (ภูม 2026-07-01) ─────────────
// The whole point: NEVER advance, regardless of status/rate. Warehouse saves the
// measurements while the seller may not have set the rate.
check("false + status 4 + rate>0 → STAYS (dims-only · rate ready)", advancesToFive(false, "4", 4083.96), false);
check("false + status 4 + rate=0 → STAYS (dims-only · no rate)", advancesToFive(false, "4", 0), false);
check("false + status 5 + rate>0 → STAYS", advancesToFive(false, "5", 500), false);
check("false + null status + rate>0 → STAYS", advancesToFive(false, null, 500), false);

console.log(`✓ advance-to-payment-gate: ${passed} assertions passed`);
