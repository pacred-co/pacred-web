/**
 * Unit test for the ระบบแนะนำ vehicle-recommendation helper — locks the EXACT
 * legacy call.php thresholds (both weight AND volume must fit a tier · first match wins).
 *
 * Run: tsx "app/[locale]/(admin)/admin/drivers/new/vehicle-recommendation.test.ts"
 */

import assert from "node:assert/strict";
import {
  recommendVehicle,
  VEHICLE_RECOMMENDATION_EMPTY,
} from "./vehicle-recommendation";

let passed = 0;
function check(label: string, actual: string, expected: string) {
  assert.equal(actual, expected, `${label}: expected "${expected}", got "${actual}"`);
  passed++;
}

// ── Nothing selected → legacy default '-' ──────────────────────────────────
check("empty selection", recommendVehicle(0, 0, false), VEHICLE_RECOMMENDATION_EMPTY);
check("empty flag wins even with numbers", recommendVehicle(9999, 9999, false), "-");

// ── Tier 1: รถกระบะ (w ≤ 1800 AND v ≤ 6) ──────────────────────────────────
check("zero selected", recommendVehicle(0, 0, true), "รถกระบะ");
check("small load", recommendVehicle(500, 2, true), "รถกระบะ");
check("boundary w=1800 v=6", recommendVehicle(1800, 6, true), "รถกระบะ");
check("boundary w=1800 v=0", recommendVehicle(1800, 0, true), "รถกระบะ");
check("boundary w=0 v=6", recommendVehicle(0, 6, true), "รถกระบะ");

// ── Tier 2: 6 ล้อเล็ก (w ≤ 3500 AND v ≤ 12) — because a tier-1 axis overflowed ─
check("weight over 1800 → tier2", recommendVehicle(1801, 3, true), "6 ล้อเล็ก");
check("volume over 6 → tier2", recommendVehicle(1000, 6.01, true), "6 ล้อเล็ก");
check("boundary w=3500 v=12", recommendVehicle(3500, 12, true), "6 ล้อเล็ก");
check("weight fits t2, volume just over 6", recommendVehicle(3500, 6.5, true), "6 ล้อเล็ก");

// ── Tier 3: 6 ล้อใหญ่ (w ≤ 5000 AND v ≤ 30) ───────────────────────────────
check("weight over 3500 → tier3", recommendVehicle(3501, 5, true), "6 ล้อใหญ่");
check("volume over 12 → tier3", recommendVehicle(2000, 12.5, true), "6 ล้อใหญ่");
check("boundary w=5000 v=30", recommendVehicle(5000, 30, true), "6 ล้อใหญ่");
check("volume 25 weight 4000", recommendVehicle(4000, 25, true), "6 ล้อใหญ่");

// ── Beyond → มากกว่ารถที่กำหนด ─────────────────────────────────────────────
check("weight over 5000", recommendVehicle(5001, 10, true), "มากกว่ารถที่กำหนด");
check("volume over 30", recommendVehicle(3000, 30.01, true), "มากกว่ารถที่กำหนด");
check("both way over", recommendVehicle(9000, 99, true), "มากกว่ารถที่กำหนด");

// ── Legacy AND-semantics: one axis fits a low tier but the other forces up ──
// heavy but low-volume: w=4900 fits tier3 weight, v=2 fits tier1 volume → tier3
check("heavy low-volume → t3 (AND-gate)", recommendVehicle(4900, 2, true), "6 ล้อใหญ่");
// light but high-volume: w=100 fits tier1 weight, v=28 needs tier3 → tier3
check("light high-volume → t3 (AND-gate)", recommendVehicle(100, 28, true), "6 ล้อใหญ่");
// light but volume over 30 → beyond
check("light but volume>30 → beyond", recommendVehicle(100, 31, true), "มากกว่ารถที่กำหนด");

console.log(`✓ vehicle-recommendation: ${passed} assertions passed`);
