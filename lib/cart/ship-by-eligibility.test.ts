/**
 * Unit tests for lib/cart/ship-by-eligibility.ts.
 *
 * 🔴 owner 2026-07-14 — the ขนส่งเอกชน list is CLOSED to the owner's workbook
 * (`บริษัทขนส่ง_พื้นที่ขนส่ง(จังหวัด).xlsx` → carrier-province-coverage.ts). These tests lock:
 *   - a province returns ONLY the workbook couriers for that province;
 *   - a legacy-only courier (25 มังกรทอง · 39 MNB · 5 Nim · 11 ไปรษณีย์ · …) is offered NOWHERE;
 *   - the own-fleet + BKK-ZIP + maomao semantics did NOT regress.
 *
 * Run:  npx tsx lib/cart/ship-by-eligibility.test.ts   (wired into pnpm test:unit)
 */

import {
  ALL_WORKBOOK_CARRIER_OPTIONS,
  getPrivateCarrierOptionsForProvince,
  getShipByOptionsForAddress,
  isMaomaoEligibleForAddress,
} from "./ship-by-eligibility";
import { carriersForProvince } from "@/lib/forwarder/carrier-province-coverage";
import { EXTRA_CARRIER_COVERAGE } from "@/lib/forwarder/carrier-extra";

/** Carriers the owner added ahead of the workbook (all-province by default). */
const EXTRA_CODES: string[] = EXTRA_CARRIER_COVERAGE.map((c) => c.code);

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assertTrue(label: string, cond: boolean) { assertEq(label, cond, true); }
function section(name: string) { console.log(`\n${name}`); }

const ids = (opts: { id: string }[]) => opts.map((o) => o.id);
const has = (opts: { id: string }[], id: string) => ids(opts).includes(id);

/** Every carrier code the LEGACY api-shipBy.php table offered but the workbook does NOT.
 *  None of these may ever be offered again (owner: "ไม่ให้เลือกหรือให้ใส่ นอกเหนือจาก data ตรงนี้"). */
const RETIRED_CODES = [
  "1",  // DHL Express
  "4",  // Kerry Express
  "5",  // Nim Express
  "11", // ไปรษณีย์ไทย
  "25", // มังกรทองขนส่ง 2019
  "35", // ศิริสมบูรณ์
  "36", // นิวสอง อัศวินขนส่ง
  "37", // โชคสถาพรขนส่ง
  "38", // ทรัพย์สมบูรณ์ถาวร
  "39", // MNB Transport
  "40", // หจก.โชคพูลทรัพย์ขนส่ง 2014
  "41", // สิรินครขนส่ง
  "42", // พาณิชย์การขนส่ง KSD
  "43", // นวรรณขนส่ง
  "44", // กุญชรมณี ขนส่ง
  "45", // เอ็มพอร์ท โลจิสติกส์
  "46", // ซี.เอ็น.ทรานสปอร์ต
];

const ALL_77 = [
  "กระบี่","กรุงเทพมหานคร","กาญจนบุรี","กาฬสินธุ์","กำแพงเพชร","ขอนแก่น","จันทบุรี","ฉะเชิงเทรา",
  "ชลบุรี","ชัยนาท","ชัยภูมิ","ชุมพร","เชียงราย","เชียงใหม่","ตรัง","ตราด","ตาก","นครนายก","นครปฐม",
  "นครพนม","นครราชสีมา","นครศรีธรรมราช","นครสวรรค์","นนทบุรี","นราธิวาส","น่าน","บึงกาฬ","บุรีรัมย์",
  "ปทุมธานี","ประจวบคีรีขันธ์","ปราจีนบุรี","ปัตตานี","พระนครศรีอยุธยา","พะเยา","พังงา","พัทลุง","พิจิตร",
  "พิษณุโลก","เพชรบุรี","เพชรบูรณ์","แพร่","ภูเก็ต","มหาสารคาม","มุกดาหาร","แม่ฮ่องสอน","ยโสธร","ยะลา",
  "ร้อยเอ็ด","ระนอง","ระยอง","ราชบุรี","ลพบุรี","ลำปาง","ลำพูน","เลย","ศรีสะเกษ","สกลนคร","สงขลา","สตูล",
  "สมุทรปราการ","สมุทรสงคราม","สมุทรสาคร","สระแก้ว","สระบุรี","สิงห์บุรี","สุโขทัย","สุพรรณบุรี",
  "สุราษฎร์ธานี","สุรินทร์","หนองคาย","หนองบัวลำภู","อ่างทอง","อำนาจเจริญ","อุดรธานี","อุตรดิตถ์",
  "อุทัยธานี","อุบลราชธานี",
];

// ─────────────────────────────────────────────────────────────
section("CLOSED LIST — a province returns ONLY its workbook couriers");
// ─────────────────────────────────────────────────────────────
for (const prov of ["สุรินทร์", "เชียงใหม่", "ปัตตานี", "ชลบุรี", "พระนครศรีอยุธยา"]) {
  const got = getPrivateCarrierOptionsForProvince(prov);
  const want = carriersForProvince(prov).map((c) => c.code);
  assertEq(`${prov} → exactly the workbook set (${want.length})`, ids(got), want);
}

// Spot-check the actual carrier sets against the workbook (owner-readable).
// NB: the owner may add a carrier that serves ALL provinces before it reaches the
// workbook xlsx (lib/forwarder/carrier-extra.ts · e.g. "48" อ่าวไทยทรานสปอรต added
// 2026-07-21). Those show up in EVERY province by design, so the per-province
// spot-checks assert the workbook set is PRESENT (superset), and the extras are
// asserted separately below.
assertEq(
  "สุรินทร์ → Flash · J&T · ธนามัย · จันทร์สว่าง · บุญอนันต์ · พี.เจ.",
  ids(getPrivateCarrierOptionsForProvince("สุรินทร์")).filter((c) => !EXTRA_CODES.includes(c)).sort(),
  ["12", "13", "14", "15", "2", "24"].sort(),
);
assertEq(
  "เชียงใหม่ → Flash · J&T · SB สมใจ · นิ่มซี่เส็ง",
  ids(getPrivateCarrierOptionsForProvince("เชียงใหม่")).filter((c) => !EXTRA_CODES.includes(c)).sort(),
  ["2", "21", "24", "7"].sort(),
);
assertEq(
  "ปัตตานี → Flash · J&T · ทรัพย์ปรีชา · พัฒนา · หาดใหญ่ทัวร์ · แพปลา",
  ids(getPrivateCarrierOptionsForProvince("ปัตตานี")).filter((c) => !EXTRA_CODES.includes(c)).sort(),
  ["2", "24", "27", "28", "29", "33"].sort(),
);
assertTrue(
  "พระนครศรีอยุธยา → includes อาร์.ซี.เอ็กซเพรส (31) — the workbook FIXES the legacy amphoe bug",
  has(getPrivateCarrierOptionsForProvince("พระนครศรีอยุธยา"), "31"),
);
assertTrue(
  "สุพรรณบุรี/เมือง → อาร์.ซี.เอ็กซเพรส (31) is offered (legacy wrongly gated it to บางเลน/ลาดบัวหลวง)",
  has(getPrivateCarrierOptionsForProvince("สุพรรณบุรี"), "31"),
);

// ─────────────────────────────────────────────────────────────
section("RETIRED couriers are offered NOWHERE (all 77 provinces)");
// ─────────────────────────────────────────────────────────────
{
  const offenders: string[] = [];
  for (const prov of ALL_77) {
    const offered = ids(getPrivateCarrierOptionsForProvince(prov));
    for (const bad of RETIRED_CODES) {
      if (offered.includes(bad)) offenders.push(`${prov}:${bad}`);
    }
  }
  assertEq("no retired code in any province's private list", offenders, []);
}
{
  const offenders = ids(ALL_WORKBOOK_CARRIER_OPTIONS).filter((c) => RETIRED_CODES.includes(c));
  assertEq("ALL_WORKBOOK_CARRIER_OPTIONS holds no retired code", offenders, []);
  assertEq(
    "the workbook is 28 couriers (+ owner-added extras)",
    ALL_WORKBOOK_CARRIER_OPTIONS.filter((o) => !EXTRA_CODES.includes(o.id)).length,
    28,
  );
  // Every owner-added carrier IS offered — and in all 77 provinces while unrestricted.
  for (const code of EXTRA_CODES) {
    assertTrue(`extra carrier ${code} is in the closed list`, ids(ALL_WORKBOOK_CARRIER_OPTIONS).includes(code));
  }
}
{
  // The cart path (getShipByOptionsForAddress) must not leak one either.
  const offenders: string[] = [];
  for (const prov of ALL_77) {
    const offered = ids(getShipByOptionsForAddress({ userID: "PR1", zip: "50000", province: prov, amphoe: "" }));
    for (const bad of RETIRED_CODES) if (offered.includes(bad)) offenders.push(`${prov}:${bad}`);
  }
  assertEq("cart picker leaks no retired code either", offenders, []);
}

// ─────────────────────────────────────────────────────────────
section("Flash + J&T serve all 77 → a valid province is never empty");
// ─────────────────────────────────────────────────────────────
{
  const empty = ALL_77.filter((p) => getPrivateCarrierOptionsForProvince(p).length < 2);
  assertEq("every province has ≥2 couriers (Flash + J&T)", empty, []);
}

// ─────────────────────────────────────────────────────────────
section("province normalisation (what PROD actually stores)");
// ─────────────────────────────────────────────────────────────
assertEq("'จ.ชลบุรี' → same as ชลบุรี",
  ids(getPrivateCarrierOptionsForProvince("จ.ชลบุรี")),
  ids(getPrivateCarrierOptionsForProvince("ชลบุรี")));
assertEq("'กทม.' → same as กรุงเทพมหานคร",
  ids(getPrivateCarrierOptionsForProvince("กทม.")),
  ids(getPrivateCarrierOptionsForProvince("กรุงเทพมหานคร")));
assertEq("'กรุงเทพฯมหานคร' → same as กรุงเทพมหานคร",
  ids(getPrivateCarrierOptionsForProvince("กรุงเทพฯมหานคร")),
  ids(getPrivateCarrierOptionsForProvince("กรุงเทพมหานคร")));
assertEq("'จังหวัดตาก' → same as ตาก",
  ids(getPrivateCarrierOptionsForProvince("จังหวัดตาก")),
  ids(getPrivateCarrierOptionsForProvince("ตาก")));
assertEq("junk province ('NY' spam row) → [] (empty-state, never a free list)",
  getPrivateCarrierOptionsForProvince("NY"), []);
assertEq("blank province → []", getPrivateCarrierOptionsForProvince(""), []);
assertEq("unknown province → []", getPrivateCarrierOptionsForProvince("ไม่มีจังหวัดนี้"), []);

// ─────────────────────────────────────────────────────────────
section("restriction notes ride on the option (shown at the point of choice)");
// ─────────────────────────────────────────────────────────────
assertEq(
  "วันชนะ (17) in โคราช carries 'ไม่เข้าวังน้ำเขียว / บัวลาย / ลำทะเมนชัย'",
  getPrivateCarrierOptionsForProvince("นครราชสีมา").find((o) => o.id === "17")?.note,
  "ไม่เข้าวังน้ำเขียว / บัวลาย / ลำทะเมนชัย",
);
assertEq(
  "หาดใหญ่ทัวร์ (29) in ยะลา carries 'ไม่ไป เบตง / แว้ง / พื้นที่สีแดง'",
  getPrivateCarrierOptionsForProvince("ยะลา").find((o) => o.id === "29")?.note,
  "ไม่ไป เบตง / แว้ง / พื้นที่สีแดง",
);
assertEq(
  "อาร์.ซี.เอ็กซเพรส (31) in นครปฐม carries 'ส่งแค่บางเลน'",
  getPrivateCarrierOptionsForProvince("นครปฐม").find((o) => o.id === "31")?.note,
  "ส่งแค่บางเลน",
);
assertEq("Flash has no restriction note", getPrivateCarrierOptionsForProvince("นครราชสีมา").find((o) => o.id === "2")?.note, undefined);
assertEq(
  "ธนาไพศาล (22) carries its carrier-level note 'เริ่มต้น 30'",
  getPrivateCarrierOptionsForProvince("สระแก้ว").find((o) => o.id === "22")?.notes,
  ["เริ่มต้น 30"],
);

// ─────────────────────────────────────────────────────────────
section("NO REGRESSION — own-fleet / BKK-ZIP / maomao semantics");
// ─────────────────────────────────────────────────────────────
const bkk = getShipByOptionsForAddress({ userID: "PR1", zip: "10110", province: "กรุงเทพมหานคร", amphoe: "" });
assertEq("BKK metro ZIP → Flash only (unchanged legacy quirk)", bkk, [{ id: "2", name: "Flash Express" }]);

const upcountry = getShipByOptionsForAddress({ userID: "PR1", zip: "33000", province: "ศรีสะเกษ", amphoe: "เมืองศรีสะเกษ" });
assertTrue("ศรีสะเกษ includes Flash (2)", has(upcountry, "2"));
assertTrue("ศรีสะเกษ includes พี.เจ. (15) — unreachable under the legacy typo table", has(upcountry, "15"));
assertEq("ศรีสะเกษ drops the legacy-only สิรินคร (41)", has(upcountry, "41"), false);
assertEq("ศรีสะเกษ = exactly the workbook set",
  ids(upcountry).sort(), carriersForProvince("ศรีสะเกษ").map((c) => c.code).sort());

// PCSFAM: still "sees more" (bypasses the BKK Flash-only quirk) but is CLOSED to the workbook.
const fam = getShipByOptionsForAddress({ userID: "PCSFAM", zip: "10110", province: "กรุงเทพมหานคร", amphoe: "" });
assertTrue("PCSFAM in BKK bypasses the Flash-only quirk (sees the real list)", fam.length > 1);
assertEq("PCSFAM offers no retired code", ids(fam).filter((c) => RETIRED_CODES.includes(c)), []);
const famNoProv = getShipByOptionsForAddress({ userID: "PCSFAM", zip: "", province: "", amphoe: "" });
assertEq(
  "PCSFAM with no province → the whole workbook (28 + extras)",
  famNoProv.filter((o) => !EXTRA_CODES.includes(o.id)).length,
  28,
);

// maomao gate (checkPCSMaoMao.php) — untouched.
assertEq("warehouse pickup (addressID='PCS') → not maomao-eligible", isMaomaoEligibleForAddress({ addressID: "PCS", zip: "10110" }), false);
assertEq("null addressID → not eligible", isMaomaoEligibleForAddress({ addressID: null, zip: "10110" }), false);
assertEq("real address + BKK ZIP → eligible", isMaomaoEligibleForAddress({ addressID: "5521", zip: "10110" }), true);
assertEq("real address + upcountry ZIP → not eligible", isMaomaoEligibleForAddress({ addressID: "5521", zip: "50000" }), false);

console.log(`\n${fail === 0 ? "✅" : "❌"} cart/ship-by-eligibility: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
