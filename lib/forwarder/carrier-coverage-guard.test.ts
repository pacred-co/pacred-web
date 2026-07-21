/**
 * Unit tests for lib/forwarder/carrier-coverage-guard.ts — the CLOSED-LIST write gate.
 *
 * 🔴 owner 2026-07-14: "บังคับให้เลือกให้ใส่แค่ที่มีในไฟล์ที่ส่งให้เท่านั้น · ไม่ให้เลือกหรือให้ใส่
 * นอกเหนือจาก data ตรงนี้". This is the rule EVERY server action that writes fshipby / hshipby
 * runs — a UI filter alone cannot stop a raw action post, so these assertions are the real
 * contract.
 *
 * Run:  npx tsx lib/forwarder/carrier-coverage-guard.test.ts   (wired into pnpm test:unit)
 */

import { EXTRA_CARRIER_COVERAGE } from "./carrier-extra";
import {
  OWN_FLEET_SHIPBY,
  WORKBOOK_CARRIER_CODES,
  assertCarrierServesProvince,
  checkCarrierForProvince,
  findWorkbookCarrier,
  isOwnFleetCarrier,
  isWorkbookCarrier,
} from "./carrier-coverage-guard";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assertTrue(label: string, cond: boolean) { assertEq(label, cond, true); }
function section(name: string) { console.log(`\n${name}`); }

const ok = (c: string | null | undefined, p: string | null | undefined, prev?: string) =>
  checkCarrierForProvince(c, p, prev !== undefined ? { previous: prev } : undefined).ok;
const errOf = (c: string, p: string) => {
  const r = checkCarrierForProvince(c, p);
  return r.ok ? "" : r.error;
};

// ─────────────────────────────────────────────────────────────
section("the owner's spot-checks");
// ─────────────────────────────────────────────────────────────
// นิ่มซี่เส็ง (21) is a NORTHERN carrier — it runs เชียงใหม่ but never ปัตตานี.
assertEq("REFUSE  นิ่มซี่เส็ง (21) → ปัตตานี", ok("21", "ปัตตานี"), false);
assertEq("ACCEPT  นิ่มซี่เส็ง (21) → เชียงใหม่", ok("21", "เชียงใหม่"), true);
assertTrue("the refusal names the carrier + the province",
  errOf("21", "ปัตตานี").includes("นิ่มซี่เส็ง") && errOf("21", "ปัตตานี").includes("ปัตตานี"));
assertTrue("the refusal SUGGESTS who does run there",
  errOf("21", "ปัตตานี").includes("ทรัพย์ปรีชา") || errOf("21", "ปัตตานี").includes("Flash"));
// by NAME too (a few prod rows store the carrier name, not the code)
assertEq("REFUSE  by name: 'นิ่มซี่เส็งขนส่ง 1988' → ปัตตานี", ok("นิ่มซี่เส็งขนส่ง 1988", "ปัตตานี"), false);
assertEq("ACCEPT  by name: 'นิ่มซี่เส็งขนส่ง 1988' → เชียงใหม่", ok("นิ่มซี่เส็งขนส่ง 1988", "เชียงใหม่"), true);

// ─────────────────────────────────────────────────────────────
section("OWN-FLEET is exempt (Pacred's own delivery · valid anywhere)");
// ─────────────────────────────────────────────────────────────
for (const code of OWN_FLEET_SHIPBY) {
  assertTrue(`ACCEPT  ${code} → ปัตตานี (own fleet)`, ok(code, "ปัตตานี"));
  assertTrue(`ACCEPT  ${code} → เชียงใหม่ (own fleet)`, ok(code, "เชียงใหม่"));
  assertTrue(`isOwnFleetCarrier("${code}")`, isOwnFleetCarrier(code));
}
assertEq("Flash (2) is NOT own-fleet", isOwnFleetCarrier("2"), false);

// ─────────────────────────────────────────────────────────────
section("RETIRED / off-workbook couriers are refused everywhere");
// ─────────────────────────────────────────────────────────────
// 25 มังกรทอง · 39 MNB · 5 Nim · 11 ไปรษณีย์ · 1 DHL · 4 Kerry · 41 สิรินคร · 45 เอ็มพอร์ท …
for (const [code, where] of [
  ["25", "กรุงเทพมหานคร"], ["39", "เชียงราย"], ["5", "เชียงใหม่"], ["11", "ขอนแก่น"],
  ["1", "กรุงเทพมหานคร"], ["4", "ภูเก็ต"], ["41", "อุบลราชธานี"], ["45", "ลำปาง"],
  ["35", "ตาก"], ["42", "พิษณุโลก"], ["44", "ขอนแก่น"], ["46", "ระยอง"],
] as const) {
  assertEq(`REFUSE  legacy-only code ${code} → ${where}`, ok(code, where), false);
  assertEq(`  isWorkbookCarrier("${code}") === false`, isWorkbookCarrier(code), false);
}
// The prod free-text carriers staff used to TYPE — now refused on any NEW write.
for (const junk of ["สมใจสาย4", "เรียกรถขนส่ง", "รถรับจ้าง", "บุ๊ครถมารับ", "flash expess", "ขนส่งเจ๊แดง"]) {
  assertEq(`REFUSE  free text "${junk}"`, ok(junk, "ขอนแก่น"), false);
}
assertTrue("the closed-list refusal tells staff to pick from the list",
  errOf("สมใจสาย4", "ขอนแก่น").includes("ไม่อยู่ในรายชื่อ"));

// ─────────────────────────────────────────────────────────────
section("EXEMPTIONS — empty · unknown province · pure carry");
// ─────────────────────────────────────────────────────────────
assertTrue("ACCEPT  empty carrier (ยังไม่ระบุ — MOMO commit default)", ok("", "ขอนแก่น"));
assertTrue("ACCEPT  null carrier", ok(null, "ขอนแก่น"));
assertTrue("ACCEPT  workbook carrier + BLANK province (MOMO row with no address yet)", ok("13", ""));
assertTrue("ACCEPT  workbook carrier + junk province ('NY' spam row → not checkable)", ok("13", "NY"));
assertEq("REFUSE  off-workbook carrier even with NO province (closed list still holds)", ok("สมใจสาย4", ""), false);
// carry: re-writing the SAME stored value never blocks (legacy rows keep flowing).
assertTrue("ACCEPT  carry of a stored legacy free-text carrier (previous === value)",
  ok("สมใจสาย4", "ขอนแก่น", "สมใจสาย4"));
assertTrue("ACCEPT  carry of a stored out-of-province courier",
  ok("21", "ปัตตานี", "21"));
assertEq("REFUSE  a CHANGE away from a legacy value to another bad one",
  ok("เรียกรถขนส่ง", "ขอนแก่น", "สมใจสาย4"), false);

// ─────────────────────────────────────────────────────────────
section("province normalisation flows through the guard");
// ─────────────────────────────────────────────────────────────
assertTrue("ACCEPT  ธนามัย (13) → 'จ.ขอนแก่น'", ok("13", "จ.ขอนแก่น"));
assertTrue("ACCEPT  PL (23) → 'กทม.'", ok("23", "กทม."));
assertEq("REFUSE  นิ่มซี่เส็ง (21) → 'จ.ปัตตานี'", ok("21", "จ.ปัตตานี"), false);

// ─────────────────────────────────────────────────────────────
section("lookups + the throwing variant");
// ─────────────────────────────────────────────────────────────
// 28 from the workbook + owner-added carriers (lib/forwarder/carrier-extra.ts) — the
// guard's closed list must contain BOTH, else a carrier the owner just added is refused.
assertEq(
  "the closed list = workbook 28 + owner-added extras",
  WORKBOOK_CARRIER_CODES.size,
  28 + EXTRA_CARRIER_COVERAGE.length,
);
for (const c of EXTRA_CARRIER_COVERAGE) {
  assertTrue(`owner-added carrier ${c.code} (${c.name}) passes the guard`, WORKBOOK_CARRIER_CODES.has(c.code));
}
assertEq("findWorkbookCarrier('13').name", findWorkbookCarrier("13")?.name, "ธนามัย ขนส่งด่วน");
assertEq("findWorkbookCarrier('สมใจสาย4') → null", findWorkbookCarrier("สมใจสาย4"), null);
{
  let threw = false;
  try { assertCarrierServesProvince("21", "ปัตตานี"); } catch { threw = true; }
  assertTrue("assertCarrierServesProvince THROWS on a bad pair", threw);
}
{
  let threw = false;
  try { assertCarrierServesProvince("21", "เชียงใหม่"); } catch { threw = true; }
  assertEq("assertCarrierServesProvince does NOT throw on a good pair", threw, false);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} forwarder/carrier-coverage-guard: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
