/**
 * Unit tests for addresses Zod schema.
 *
 * Customer address book under /(protected)/addresses — Thai postal + phone
 * regexes shared with cart placeOrderSchema. Optional lat/long for delivery
 * geocoding.
 *
 * Pattern matches lib/validators/auth.test.ts.
 */

import { addressSchema } from "./addresses";

let pass = 0;
let fail = 0;

function assertOk(label: string, schema: { safeParse: (v: unknown) => { success: boolean } }, input: unknown) {
  const res = schema.safeParse(input);
  if (res.success) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: success\n    got: ${JSON.stringify(res)}`); }
}

function assertFail(label: string, schema: { safeParse: (v: unknown) => { success: boolean } }, input: unknown) {
  const res = schema.safeParse(input);
  if (!res.success) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: failure\n    got: success`); }
}

function section(name: string) {
  console.log(`\n${name}`);
}

const validAddress = {
  first_name:    "Pacred",
  last_name:     "Customer",
  phone:         "0812345678",
  address_line:  "1/1 ถนนทดสอบ",
  sub_district:  "บางรัก",
  district:      "บางรัก",
  province:      "กรุงเทพ",
  postal_code:   "10500",
};

// ────────────────────────────────────────────────────────────
section("addressSchema — required core fields");
// ────────────────────────────────────────────────────────────

assertOk  ("happy path minimal",          addressSchema, validAddress);
assertOk  ("with optional note",          addressSchema, { ...validAddress, note: "บ้านพ่อ ฝากรปภ" });
assertOk  ("with is_default=true",        addressSchema, { ...validAddress, is_default: true });
assertOk  ("with is_default=false",       addressSchema, { ...validAddress, is_default: false });

assertFail("missing first_name",          addressSchema, { ...validAddress, first_name: "" });
assertFail("missing last_name",           addressSchema, { ...validAddress, last_name: "" });
assertFail("missing address_line",        addressSchema, { ...validAddress, address_line: "" });
assertFail("missing sub_district",        addressSchema, { ...validAddress, sub_district: "" });
assertFail("missing district",            addressSchema, { ...validAddress, district: "" });
assertFail("missing province",            addressSchema, { ...validAddress, province: "" });

// ────────────────────────────────────────────────────────────
section("addressSchema — Thai phone regex");
// ────────────────────────────────────────────────────────────

assertOk  ("9-digit 081234567",           addressSchema, { ...validAddress, phone: "081234567" });
assertOk  ("10-digit 0812345678",         addressSchema, { ...validAddress, phone: "0812345678" });
assertOk  ("with optional phone2",        addressSchema, { ...validAddress, phone2: "0822334455" });
assertOk  ("empty phone2 transformed",    addressSchema, { ...validAddress, phone2: "" });
assertFail("phone too short",             addressSchema, { ...validAddress, phone: "01234567" });
assertFail("phone +66 prefix",            addressSchema, { ...validAddress, phone: "+66812345678" });
assertFail("phone with dashes",           addressSchema, { ...validAddress, phone: "081-234-5678" });
assertFail("phone2 malformed",            addressSchema, { ...validAddress, phone2: "12345" });

// ────────────────────────────────────────────────────────────
section("addressSchema — Thai postal regex");
// ────────────────────────────────────────────────────────────

assertOk  ("10500 BKK ok",                addressSchema, { ...validAddress, postal_code: "10500" });
assertOk  ("73110 Nakhon Pathom ok",      addressSchema, { ...validAddress, postal_code: "73110" });
assertFail("4-digit '1050'",              addressSchema, { ...validAddress, postal_code: "1050" });
assertFail("6-digit '105000'",            addressSchema, { ...validAddress, postal_code: "105000" });
assertFail("with letter 'A1050'",         addressSchema, { ...validAddress, postal_code: "A1050" });

// ────────────────────────────────────────────────────────────
section("addressSchema — optional geocoding (lat/long bounds)");
// ────────────────────────────────────────────────────────────

assertOk  ("BKK latitude 13.7",           addressSchema, { ...validAddress, latitude: 13.7, longitude: 100.5 });
assertOk  ("max latitude 90",             addressSchema, { ...validAddress, latitude: 90 });
assertOk  ("min latitude -90",            addressSchema, { ...validAddress, latitude: -90 });
assertOk  ("max longitude 180",           addressSchema, { ...validAddress, longitude: 180 });
assertOk  ("min longitude -180",          addressSchema, { ...validAddress, longitude: -180 });

assertFail("latitude > 90",               addressSchema, { ...validAddress, latitude: 91 });
assertFail("latitude < -90",              addressSchema, { ...validAddress, latitude: -91 });
assertFail("longitude > 180",             addressSchema, { ...validAddress, longitude: 181 });
assertFail("longitude < -180",            addressSchema, { ...validAddress, longitude: -181 });

// ────────────────────────────────────────────────────────────
section("addressSchema — text length bounds");
// ────────────────────────────────────────────────────────────

assertFail("first_name > 200",            addressSchema, { ...validAddress, first_name: "x".repeat(201) });
assertFail("address_line > 500",          addressSchema, { ...validAddress, address_line: "x".repeat(501) });
assertFail("note > 500",                  addressSchema, { ...validAddress, note: "x".repeat(501) });
assertFail("district > 255",              addressSchema, { ...validAddress, district: "x".repeat(256) });

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
