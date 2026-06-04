/**
 * Unit tests for lib/thai-provinces.ts — the 77-province list + isThaiProvince
 * guard (used by ProvinceSelect + server-side address validation). Pure, no IO.
 *
 * Run:  pnpm tsx lib/thai-provinces.test.ts   (wired into pnpm test:unit)
 */

import { THAI_PROVINCES, isThaiProvince } from "./thai-provinces";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assertTrue(label: string, cond: boolean) { assertEq(label, cond, true); }
function section(name: string) { console.log(`\n${name}`); }

section("THAI_PROVINCES list");
assertEq("exactly 77 provinces (76 + Bangkok)", THAI_PROVINCES.length, 77);
assertTrue("includes กรุงเทพมหานคร", THAI_PROVINCES.includes("กรุงเทพมหานคร"));
assertTrue("includes สมุทรสาคร (Pacred HQ province)", THAI_PROVINCES.includes("สมุทรสาคร"));
assertTrue("includes พระนครศรีอยุธยา (full official name)", THAI_PROVINCES.includes("พระนครศรีอยุธยา"));
assertEq("no duplicates", new Set(THAI_PROVINCES).size, THAI_PROVINCES.length);
assertTrue("no empty entries", THAI_PROVINCES.every((p) => p.length > 0));

section("isThaiProvince guard");
assertEq("valid province → true", isThaiProvince("เชียงใหม่"), true);
assertEq("Bangkok → true", isThaiProvince("กรุงเทพมหานคร"), true);
assertEq("non-province → false", isThaiProvince("Tokyo"), false);
assertEq("empty → false", isThaiProvince(""), false);
assertEq("partial/abbreviated 'กทม' → false (must be the official name)", isThaiProvince("กทม"), false);

console.log(`\n${fail === 0 ? "✅" : "❌"} thai-provinces: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
