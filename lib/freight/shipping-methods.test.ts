/**
 * Unit tests for lib/freight/shipping-methods.ts — G4 shipping method
 * selector helper. Verifies 1:1 fidelity with legacy `nameShipBy()`.
 *
 * Harness: plain tsx script, matches lib/warehouse/cargo-type.test.ts.
 */

import {
  SHIPPING_METHODS,
  getShippingMethods,
  getShippingMethodByCode,
  nameShipBy,
  type ShippingMethod,
} from "./shipping-methods";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function eq<T>(name: string, actual: T, expected: T): void {
  if (actual === expected) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    console.log(`  ✗ ${name}`);
  }
}

function truthy(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── (a) full list shape ──────────────────────────────────────────
console.log("\n(a) registry shape");
// 47 numeric codes (1..47) + 4 special tokens (PCS, F, PCSF, PCSE) = 51
eq("51 methods registered", SHIPPING_METHODS.length, 51);
truthy(
  "every method has all required fields",
  SHIPPING_METHODS.every(
    (m) =>
      typeof m.code === "string" && m.code.length > 0
      && typeof m.name === "string" && m.name.length > 0
      && typeof m.nameTh === "string" && m.nameTh.length > 0
      && (m.type === "truck" || m.type === "sea" || m.type === "air")
      && typeof m.etaDays === "number" && m.etaDays > 0,
  ),
);
truthy(
  "codes are unique",
  new Set(SHIPPING_METHODS.map((m) => m.code)).size === SHIPPING_METHODS.length,
);

// ── (b) lookup found — exact legacy nameShipBy fidelity ──────────
console.log("\n(b) lookup found — matches legacy nameShipBy()");
const flash = getShippingMethodByCode("2");
truthy("code '2' returns a method", flash !== null);
eq("code '2' Thai = 'Flash Express'", flash?.nameTh, "Flash Express");
eq("code '2' type = truck", flash?.type, "truck");

const dhl = getShippingMethodByCode("1");
eq("code '1' Thai = 'DHL Express'", dhl?.nameTh, "DHL Express");
eq("code '1' type = air (international courier)", dhl?.type, "air");

const jkExpress = getShippingMethodByCode("3");
eq("code '3' Thai = 'J.K. เอ็กซ์เพรส'", jkExpress?.nameTh, "J.K. เอ็กซ์เพรส");

const kpn = getShippingMethodByCode("9");
eq("code '9' Thai = 'เคพีเอ็น'", kpn?.nameTh, "เคพีเอ็น");

const thaiPost = getShippingMethodByCode("11");
eq("code '11' Thai = 'ไปรษณีย์ไทย'", thaiPost?.nameTh, "ไปรษณีย์ไทย");

const jt = getShippingMethodByCode("24");
eq("code '24' Thai = 'J&T Express'", jt?.nameTh, "J&T Express");

const phuketLT = getShippingMethodByCode("47");
eq("code '47' Thai = 'ภูเก็ตแหลมทองขนส่ง'", phuketLT?.nameTh, "ภูเก็ตแหลมทองขนส่ง");

// Special tokens — these are NOT numeric ids
const pcsPickup = getShippingMethodByCode("PCS");
eq("code 'PCS' Thai = 'รับเองโกดัง Pacred (สมุทรสาคร)'", pcsPickup?.nameTh, "รับเองโกดัง Pacred (สมุทรสาคร)");

const auto = getShippingMethodByCode("F");
eq("code 'F' Thai = 'บริษัทจัดหาให้อัตโนมัติ'", auto?.nameTh, "บริษัทจัดหาให้อัตโนมัติ");

const pcsf = getShippingMethodByCode("PCSF");
eq("code 'PCSF' Thai = 'PRF เหมาๆ'", pcsf?.nameTh, "PRF เหมาๆ");

const pcse = getShippingMethodByCode("PCSE");
eq("code 'PCSE' Thai = 'PRE Express'", pcse?.nameTh, "PRE Express");

// ── (c) lookup not found ─────────────────────────────────────────
console.log("\n(c) lookup not found");
eq("unknown code → null", getShippingMethodByCode("999"), null);
eq("empty string → null", getShippingMethodByCode(""), null);
eq("case-sensitive 'pcs' (lower) → null", getShippingMethodByCode("pcs"), null);
eq("garbage code → null", getShippingMethodByCode("XYZ"), null);

// ── (d) nameShipBy() convenience — legacy fallback parity ────────
console.log("\n(d) nameShipBy() — legacy switch parity");
eq("nameShipBy('2') = 'Flash Express'", nameShipBy("2"), "Flash Express");
eq("nameShipBy('1') = 'DHL Express'", nameShipBy("1"), "DHL Express");
eq("nameShipBy('PCS') = 'รับเองโกดัง Pacred (สมุทรสาคร)'", nameShipBy("PCS"), "รับเองโกดัง Pacred (สมุทรสาคร)");
// Legacy returns the Thai string 'ไม่พบข้อมูล' for unknown codes (function.php:145).
eq("nameShipBy('999') = 'ไม่พบข้อมูล' (legacy default)", nameShipBy("999"), "ไม่พบข้อมูล");
eq("nameShipBy('') = 'ไม่พบข้อมูล'", nameShipBy(""), "ไม่พบข้อมูล");
eq("nameShipBy(null) = 'ไม่พบข้อมูล'", nameShipBy(null), "ไม่พบข้อมูล");
eq("nameShipBy(undefined) = 'ไม่พบข้อมูล'", nameShipBy(undefined), "ไม่พบข้อมูล");

// ── (e) filter by cargo type — legacy semantics (pass-through) ───
console.log("\n(e) getShippingMethods() — cargo-type filter");
const allMethods = getShippingMethods();
eq("no filter returns all 51", allMethods.length, 51);

// Legacy nameShipBy() has no cargo-type restriction — filter is a no-op.
const generalCargo = getShippingMethods({ cargoType: "A" });
eq("cargoType='A' (general) returns all 51", generalCargo.length, 51);

const controlled = getShippingMethods({ cargoType: "Z" });
eq("cargoType='Z' (controlled) returns all 51 (legacy parity)", controlled.length, 51);

const brand = getShippingMethods({ cargoType: "X" });
eq("cargoType='X' (brand) returns all 51", brand.length, 51);

const foodDrug = getShippingMethods({ cargoType: "O" });
eq("cargoType='O' (food/drug) returns all 51", foodDrug.length, 51);

const electrical = getShippingMethods({ cargoType: "M" });
eq("cargoType='M' (electrical) returns all 51", electrical.length, 51);

// Returns a fresh copy — caller can mutate without poisoning the registry
const copy = getShippingMethods();
copy.pop();
eq("returned array is a copy, not the registry", getShippingMethods().length, 51);

// ── (f) type assignment spot-check ───────────────────────────────
console.log("\n(f) transport-type classification");
// Only DHL (1) is air. The other 50 are all truck. Sea unused (no legacy
// last-mile sea carrier). Validate the airlift count.
const airMethods = SHIPPING_METHODS.filter((m: ShippingMethod) => m.type === "air");
eq("exactly 1 'air' method (DHL)", airMethods.length, 1);
eq("the air method is DHL (code '1')", airMethods[0]?.code, "1");

const truckMethods = SHIPPING_METHODS.filter((m: ShippingMethod) => m.type === "truck");
eq("50 'truck' methods (everything else)", truckMethods.length, 50);

const seaMethods = SHIPPING_METHODS.filter((m: ShippingMethod) => m.type === "sea");
eq("0 'sea' methods (no last-mile sea carrier in legacy)", seaMethods.length, 0);

// ── summary ──────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? "PASS" : "FAIL"} shipping-methods — ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nFailures:\n  " + failures.join("\n  "));
  process.exit(1);
}
