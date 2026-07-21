import assert from "node:assert/strict";
import { customerAddressFingerprint, customerAddressSchema, parseCustomerAddressRow, planMainAddress } from "./customer-address-book";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const base = {
  addressname: "สมชาย",
  addresslastname: "ใจดี",
  addresstel: "0812345678",
  addresstel2: "",
  addressno: "99/1 ถนนสุขุมวิท",
  addresssubdistrict: "คลองเตย",
  addressdistrict: "คลองเตย",
  addressprovince: "กรุงเทพมหานคร",
  addresszipcode: "10110",
  addressnote: "",
};

console.log("customer-address-book");

test("canonicalises a real Thai province alias and whitespace", () => {
  const parsed = customerAddressSchema.parse({ ...base, addressprovince: " จังหวัดกรุงเทพฯ ", addressno: " 99/1   ถนนสุขุมวิท " });
  assert.equal(parsed.addressprovince, "กรุงเทพมหานคร");
  assert.equal(parsed.addressno, "99/1 ถนนสุขุมวิท");
});

test("rejects incomplete/invalid reusable addresses", () => {
  assert.equal(customerAddressSchema.safeParse({ ...base, addresstel: "" }).success, false);
  assert.equal(customerAddressSchema.safeParse({ ...base, addresszipcode: "1011" }).success, false);
  assert.equal(customerAddressSchema.safeParse({ ...base, addressprovince: "ไม่ใช่จังหวัด" }).success, false);
  assert.equal(customerAddressSchema.safeParse({ ...base, addresstel2: "081234567890" }).success, false);
});

test("fills nullable UI fields without weakening required delivery data", () => {
  const parsed = customerAddressSchema.parse({ ...base, addresstel2: undefined, addressnote: undefined });
  assert.equal(parsed.addresstel2, "");
  assert.equal(parsed.addressnote, "");
});

test("legacy DB rows are accepted only when delivery-complete", () => {
  const nullableOptional = parseCustomerAddressRow({ ...base, addresstel2: null, addressnote: null });
  assert.equal(nullableOptional.error, null);
  assert.equal(nullableOptional.data?.addresstel2, "");
  const incomplete = parseCustomerAddressRow({ ...base, addresslastname: "" });
  assert.equal(incomplete.data, null);
  assert.match(incomplete.error ?? "", /นามสกุล/);
});

test("fingerprint reuses the same core address despite note/phone-2 changes", () => {
  const a = customerAddressSchema.parse(base);
  const b = customerAddressSchema.parse({ ...base, addresstel2: "0899999999", addressnote: "โทรก่อนส่ง" });
  assert.equal(customerAddressFingerprint(a), customerAddressFingerprint(b));
});

test("first address becomes default", () => {
  assert.deepEqual(planMainAddress([], new Set([11]), 11, false), {
    keepRowId: null,
    targetAddressId: 11,
    deleteRowIds: [],
    isCandidateDefault: true,
  });
});

test("valid existing default is preserved unless staff explicitly replaces it", () => {
  const preserved = planMainAddress([{ id: 5, addressid: 10 }], new Set([10, 11]), 11, false);
  assert.equal(preserved.targetAddressId, 10);
  assert.equal(preserved.isCandidateDefault, false);
  const forced = planMainAddress([{ id: 5, addressid: 10 }], new Set([10, 11]), 11, true);
  assert.equal(forced.targetAddressId, 11);
  assert.equal(forced.isCandidateDefault, true);
});

test("dangling and duplicate main pointers converge deterministically", () => {
  const plan = planMainAddress(
    [{ id: 9, addressid: 999 }, { id: 4, addressid: 10 }, { id: 7, addressid: 11 }],
    new Set([10, 11, 12]),
    12,
    false,
  );
  assert.deepEqual(plan, {
    keepRowId: 4,
    targetAddressId: 10,
    deleteRowIds: [7, 9],
    isCandidateDefault: false,
  });
});

console.log(`\n${passed} pass · 0 fail`);
