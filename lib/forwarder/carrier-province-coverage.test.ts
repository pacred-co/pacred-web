/**
 * Unit tests for lib/forwarder/carrier-province-coverage.ts — the GENERATED
 * carrier×province SOT (owner's workbook, 2026-07-14). Pure, no IO.
 *
 * These assertions are the acceptance criteria of the parse:
 *   - the "ทุกจังหวัด" expansion is really all 77 (Flash / J&T)
 *   - the "ภาคอีสานทุกจังหวัด" expansion is really the 20 Isaan (ธนามัย)
 *   - the "ไปทุกจังหวัดในอีสาน ยกเว้น บึงกาฬ ชัยภูมิ" expansion is 18 (บุญอนันต์)
 *   - a note-bearing cell kept its restriction (โคราช ไม่เข้าวังน้ำเขียว)
 *   - ZERO unresolved values: every province canonical, every carrier fshipby-mapped
 *
 * Run:  pnpm tsx lib/forwarder/carrier-province-coverage.test.ts  (wired into test:unit)
 */

import { EXTRA_CARRIER_COVERAGE } from "./carrier-extra";
import {
  CARRIER_PROVINCE_COVERAGE,
  ISAAN_PROVINCES,
  canonicalProvince,
  carrierProvinceNote,
  carriersForProvince,
  provincesForCarrier,
} from "./carrier-province-coverage";
import { THAI_PROVINCES, isThaiProvince } from "@/lib/thai-provinces";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assertTrue(label: string, cond: boolean) { assertEq(label, cond, true); }
function section(name: string) { console.log(`\n${name}`); }

const byCode = (code: string) => CARRIER_PROVINCE_COVERAGE.find((c) => c.code === code);
const sorted = (a: readonly string[]) => [...a].sort();

// ── the workbook parsed into 28 carriers ──
section("shape");
// The workbook parses to 28; owner-added carriers (lib/forwarder/carrier-extra.ts —
// e.g. "48" อ่าวไทยทรานสปอรต, 2026-07-21) are appended and counted separately so a new
// owner request never breaks this assertion.
const EXTRA_CODES: string[] = EXTRA_CARRIER_COVERAGE.map((c) => c.code);
const workbookOnly = CARRIER_PROVINCE_COVERAGE.filter((c) => !EXTRA_CODES.includes(c.code));
assertEq("28 carriers from the workbook", workbookOnly.length, 28);
assertEq("owner-added carriers are appended too", CARRIER_PROVINCE_COVERAGE.length, 28 + EXTRA_CODES.length);
assertTrue(
  "every carrier has a legacy fshipby code (no migration needed)",
  CARRIER_PROVINCE_COVERAGE.every((c) => c.code !== ""),
);
assertEq(
  "fshipby codes are unique",
  new Set(CARRIER_PROVINCE_COVERAGE.map((c) => c.code)).size,
  CARRIER_PROVINCE_COVERAGE.length,
);
assertTrue(
  "every carrier serves ≥1 province",
  CARRIER_PROVINCE_COVERAGE.every((c) => c.provinces.length > 0),
);

// ── ZERO unresolved values (the parse-report invariant) ──
section("zero unresolved values");
const badProvinces = CARRIER_PROVINCE_COVERAGE.flatMap((c) =>
  c.provinces.filter((p) => !isThaiProvince(p)).map((p) => `${c.name}:${p}`),
);
assertEq("every stored province is one of the canonical 77", badProvinces, []);
const covered = new Set(CARRIER_PROVINCE_COVERAGE.flatMap((c) => c.provinces));
assertEq("all 77 provinces have ≥1 carrier", THAI_PROVINCES.filter((p) => !covered.has(p)), []);

// ── "ทุกจังหวัด" → all 77 ──
section("ทุกจังหวัด expansion");
assertEq("Flash (2) = all 77", byCode("2")?.provinces.length, 77);
assertEq("J&T (24) = all 77", byCode("24")?.provinces.length, 77);
assertEq("Flash provinces === the canonical 77", sorted(byCode("2")!.provinces), sorted(THAI_PROVINCES));

// ── "ภาคอีสานทุกจังหวัด" → the 20 Isaan ──
section("ภาคอีสาน expansion");
assertEq("ธนามัย (13) = the 20 Isaan", sorted(byCode("13")!.provinces), sorted(ISAAN_PROVINCES));
assertEq("ธนามัย (13) count = 20", byCode("13")?.provinces.length, 20);

// ── "ไปทุกจังหวัดในอีสาน ยกเว้น บึงกาฬ ชัยภูมิ" → 18 ──
section("อีสาน ยกเว้น expansion");
assertEq("บุญอนันต์ (14) = 18 provinces", byCode("14")?.provinces.length, 18);
assertEq("บุญอนันต์ EXCLUDES บึงกาฬ", byCode("14")!.provinces.includes("บึงกาฬ"), false);
assertEq("บุญอนันต์ EXCLUDES ชัยภูมิ", byCode("14")!.provinces.includes("ชัยภูมิ"), false);
assertTrue("บุญอนันต์ INCLUDES ศรีสะเกษ", byCode("14")!.provinces.includes("ศรีสะเกษ"));

// ── notes: the restriction glued to a province cell survived ──
section("province restriction notes");
assertEq(
  "วันชนะ (17) · นครราชสีมา → ไม่เข้าวังน้ำเขียว",
  carrierProvinceNote("17", "นครราชสีมา"),
  "ไม่เข้าวังน้ำเขียว / บัวลาย / ลำทะเมนชัย",
);
assertEq("ธนาไพศาล (22) · จันทบุรี → ไม่เข้าสอยดาว", carrierProvinceNote("22", "จันทบุรี"), "ไม่เข้าสอยดาว");
assertEq("อาร์.ซี.เอ็กซเพรส (31) · นครปฐม → ส่งแค่บางเลน", carrierProvinceNote("31", "นครปฐม"), "ส่งแค่บางเลน");
assertEq("หาดใหญ่ทัวร์ (29) · ยะลา → ไม่ไป เบตง", carrierProvinceNote("29", "ยะลา"), "ไม่ไป เบตง / แว้ง / พื้นที่สีแดง");
assertEq("no note where there is none (Flash · โคราช)", carrierProvinceNote("2", "นครราชสีมา"), "");
// carrier-level notes (pure-note cells were kept, not dropped)
assertEq("S&J (6) carrier note", byCode("6")?.notes, ["เริ่มต้น 100"]);
assertEq("ธนาไพศาล (22) carrier note", byCode("22")?.notes, ["เริ่มต้น 30"]);

// ── canonicalProvince: typos + prefixes ──
section("canonicalProvince");
assertEq("ศรีสระเกษ → ศรีสะเกษ", canonicalProvince("ศรีสระเกษ"), "ศรีสะเกษ");
assertEq("เพชบูรณ์ → เพชรบูรณ์", canonicalProvince("เพชบูรณ์"), "เพชรบูรณ์");
assertEq("เพรชบุรี → เพชรบุรี", canonicalProvince("เพรชบุรี"), "เพชรบุรี");
assertEq("โคราช → นครราชสีมา", canonicalProvince("โคราช"), "นครราชสีมา");
assertEq("อยุธยา → พระนครศรีอยุธยา", canonicalProvince("อยุธยา"), "พระนครศรีอยุธยา");
assertEq("หนองบัว → หนองบัวลำภู", canonicalProvince("หนองบัว"), "หนองบัวลำภู");
assertEq("จังหวัด-prefix stripped", canonicalProvince("จังหวัด สุรินทร์"), "สุรินทร์");
assertEq("จ. prefix stripped", canonicalProvince("จ.สุรินทร์"), "สุรินทร์");
// the parser bug the report caught: an optional-dot `^จ\.?` ate the จ of จันทบุรี
assertEq("จันทบุรี NOT mangled by the จ-prefix strip", canonicalProvince("จันทบุรี"), "จันทบุรี");
assertEq("unknown → empty string", canonicalProvince("ไม่มีจังหวัดนี้"), "");
assertEq("null → empty string", canonicalProvince(null), "");

// ── carriersForProvince / provincesForCarrier ──
section("lookups");
const surin = carriersForProvince("สุรินทร์").map((c) => c.code);
assertTrue("สุรินทร์ → Flash (2)", surin.includes("2"));
assertTrue("สุรินทร์ → J&T (24)", surin.includes("24"));
assertTrue("สุรินทร์ → ธนามัย (13)", surin.includes("13"));
assertTrue("สุรินทร์ → จันทร์สว่าง (12)", surin.includes("12"));
assertTrue("สุรินทร์ → บุญอนันต์ (14)", surin.includes("14"));
assertTrue("สุรินทร์ → พี.เจ. (15)", surin.includes("15"));
assertEq("สุรินทร์ = exactly 6 workbook carriers", surin.filter((c: string) => !EXTRA_CODES.includes(c)).length, 6);
assertEq("สุรินทร์ does NOT get a southern carrier (สี่สหาย 32)", surin.includes("32"), false);
// the province the LEGACY table could never match (typo "ศรีสระเกษ")
const sisaket = carriersForProvince("ศรีสะเกษ").map((c) => c.code);
assertEq("ศรีสะเกษ = 6 workbook carriers (legacy typo made these unreachable)", sisaket.filter((c: string) => !EXTRA_CODES.includes(c)).length, 6);
assertTrue("ศรีสะเกษ → พี.เจ. (15)", sisaket.includes("15"));
assertEq("lookup by alias works (โคราช)", carriersForProvince("โคราช").length, carriersForProvince("นครราชสีมา").length);
assertEq("unknown province → []", carriersForProvince("ไม่มีจังหวัดนี้"), []);
assertEq("provincesForCarrier by code (13) = 20", provincesForCarrier("13").length, 20);
assertEq("provincesForCarrier by name = same", provincesForCarrier("ธนามัย ขนส่งด่วน").length, 20);
assertEq("provincesForCarrier unknown → []", provincesForCarrier("ไม่มีเจ้านี้"), []);

console.log(`\n${fail === 0 ? "✅" : "❌"} forwarder/carrier-province-coverage: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
