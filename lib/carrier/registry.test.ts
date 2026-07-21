/**
 * Unit tests for lib/carrier/registry.ts — the china-carrier catalogue (CTT /
 * Sang / MK / MX), the route-param guard, and the shared PCSE/PCSF transport
 * pricing rule (legacy api-sheets-*.php L78-86). Pure, no IO.
 *
 * Run:  pnpm tsx lib/carrier/registry.test.ts   (wired into pnpm test:unit)
 */

import { CARRIER_REGISTRY, isCarrierKey, computeTransportPrice } from "./registry";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assertTrue(label: string, cond: boolean) { assertEq(label, cond, true); }
function section(name: string) { console.log(`\n${name}`); }

// ── registry → warehouse code map (legacy fWarehouseName 1..4) ──
section("CARRIER_REGISTRY warehouse codes");
assertEq("sang → warehouse 1", CARRIER_REGISTRY.sang.warehouseCode, "1");
assertEq("ctt → warehouse 2", CARRIER_REGISTRY.ctt.warehouseCode, "2");
assertEq("mk → warehouse 3", CARRIER_REGISTRY.mk.warehouseCode, "3");
assertEq("mx → warehouse 4", CARRIER_REGISTRY.mx.warehouseCode, "4");
assertEq("exactly 4 carriers", Object.keys(CARRIER_REGISTRY).length, 4);
assertTrue("every carrier points at the shared workbook", Object.values(CARRIER_REGISTRY).every((c) => c.sheetUrl.includes("15g49hwP8dx1bOVbVKcp1V33I_o1gSLJYeqEIdRS4Mpk")));

// ── isCarrierKey route guard ──
section("isCarrierKey");
assertEq("ctt → true", isCarrierKey("ctt"), true);
assertEq("mx → true", isCarrierKey("mx"), true);
assertEq("unknown → false", isCarrierKey("dhl"), false);
assertEq("uppercase 'CTT' → false (case-sensitive route param)", isCarrierKey("CTT"), false);
assertEq("empty → false", isCarrierKey(""), false);

// ── computeTransportPrice — PCSE max(50, vol*120) / PCSF 0 / else 0 ──
section("computeTransportPrice");
assertEq("PCSE 1 CBM → 120", computeTransportPrice("PCSE", 1), 120);
assertEq("PCSE 0.5 CBM → 60", computeTransportPrice("PCSE", 0.5), 60);
// owner 2026-07-21: *"Pacred Express ไม่ต้องคิดขั้นต่ำแล้วครับ สามารถใส่ค่า 0 ได้เลย"*
// → ยกเลิกพื้น ฿50 · ราคา = คิว × 120 ตรงๆ (คิว 0 = ฿0 · ติดลบ clamp เป็น 0 ก่อน).
assertEq("PCSE 0.3 CBM → 36 (ไม่มีขั้นต่ำแล้ว)", computeTransportPrice("PCSE", 0.3), 36);
assertEq("PCSE 0 CBM → 0 (ใส่ ฿0 ได้)", computeTransportPrice("PCSE", 0), 0);
assertEq("PCSE negative CBM → 0 (clamp ก่อนคูณ)", computeTransportPrice("PCSE", -5), 0);
assertEq("PRE (รหัสใหม่) คิดเหมือน PCSE", computeTransportPrice("PRE", 1), 120);
assertEq("PCSF → 0 (free)", computeTransportPrice("PCSF", 10), 0);
assertEq("other ship-by → 0 (admin sets later)", computeTransportPrice("PCS", 10), 0);
assertEq("empty ship-by → 0", computeTransportPrice("", 10), 0);

console.log(`\n${fail === 0 ? "✅" : "❌"} carrier/registry: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
