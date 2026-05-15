/**
 * Unit tests for auth Zod schemas.
 *
 * Locks the validation contract for signup/login forms — accept good
 * inputs, reject malformed. Critical: password length bounds, phone
 * length bounds, tax-ID 13-digit + postcode 5-digit regex (chat audit
 * mentioned juristic flow tax-ID gotchas), OTP required at the right
 * stages.
 *
 * Pattern matches lib/forwarder/calc-price.test.ts.
 */

import {
  passwordSchema,
  phoneSchema,
  signInSchema,
  registerPersonalSchema,
  registerJuristicStep1Schema,
  juristicStep2Schema,
  requestOtpSchema,
  confirmResetByPhoneSchema,
  resetByEmailSchema,
  updatePasswordSchema,
} from "./auth";

let pass = 0;
let fail = 0;

function assertOk(label: string, schema: { safeParse: (v: unknown) => { success: boolean } }, input: unknown) {
  const res = schema.safeParse(input);
  if (res.success) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: success\n    got: ${JSON.stringify(res)}`);
  }
}

function assertFail(label: string, schema: { safeParse: (v: unknown) => { success: boolean } }, input: unknown) {
  const res = schema.safeParse(input);
  if (!res.success) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: failure\n    got: success`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// ────────────────────────────────────────────────────────────
section("passwordSchema — 6..30 chars");
// ────────────────────────────────────────────────────────────

assertOk  ("'abc123' (6 chars, min)",   passwordSchema, "abc123");
assertOk  ("'abcdefghij' (10 chars)",   passwordSchema, "abcdefghij");
assertOk  ("30-char password (max)",    passwordSchema, "a".repeat(30));
assertFail("'abc12' (5 chars, too short)", passwordSchema, "abc12");
assertFail("31-char password (too long)",  passwordSchema, "a".repeat(31));
assertFail("empty string",              passwordSchema, "");
assertFail("non-string (number)",       passwordSchema, 123456);

// ────────────────────────────────────────────────────────────
section("phoneSchema — 8..20 chars");
// ────────────────────────────────────────────────────────────

assertOk  ("'08123456' (8 chars, min)",     phoneSchema, "08123456");
assertOk  ("'0812345678' (TH mobile)",       phoneSchema, "0812345678");
assertOk  ("'+66812345678' (E.164)",         phoneSchema, "+66812345678");
assertFail("'0812345' (7 chars, too short)", phoneSchema, "0812345");
assertFail("21-char (too long)",             phoneSchema, "0".repeat(21));

// ────────────────────────────────────────────────────────────
section("signInSchema — identifier + password");
// ────────────────────────────────────────────────────────────

assertOk  ("happy path email + password",       signInSchema, { identifier: "me@pacred.co", password: "secret" });
assertOk  ("happy path phone + password",       signInSchema, { identifier: "0812345678", password: "x" });
assertOk  ("happy path memberCode + password",  signInSchema, { identifier: "PR12345", password: "x" });
assertFail("identifier too short (2 chars)",    signInSchema, { identifier: "ab", password: "x" });
assertFail("missing password",                  signInSchema, { identifier: "me@pacred.co" });
assertFail("empty password",                    signInSchema, { identifier: "me@pacred.co", password: "" });
assertFail("missing identifier",                signInSchema, { password: "secret" });

// ────────────────────────────────────────────────────────────
section("registerPersonalSchema — full form");
// ────────────────────────────────────────────────────────────

const validPersonal = {
  firstName: "Pacred",
  lastName: "Customer",
  phone: "0812345678",
  password: "secret1",
  services: [],
  howKnow: null,
  otp: "123456",
  agreed: true,
};

assertOk  ("happy path (no email)",        registerPersonalSchema, validPersonal);
assertOk  ("with valid email",             registerPersonalSchema, { ...validPersonal, email: "x@pacred.co" });
assertOk  ("empty email allowed",          registerPersonalSchema, { ...validPersonal, email: "" });
assertOk  ("services array with values",   registerPersonalSchema, { ...validPersonal, services: ["import", "order"] });
assertFail("missing firstName",            registerPersonalSchema, { ...validPersonal, firstName: "" });
assertFail("missing OTP",                  registerPersonalSchema, { ...validPersonal, otp: "" });
assertFail("agreed=false (must accept TOS)", registerPersonalSchema, { ...validPersonal, agreed: false });
assertFail("invalid email format",         registerPersonalSchema, { ...validPersonal, email: "not-an-email" });
assertFail("invalid service ID",           registerPersonalSchema, { ...validPersonal, services: ["unknown_service"] });

// ────────────────────────────────────────────────────────────
section("registerJuristicStep1Schema — abbreviated personal step");
// ────────────────────────────────────────────────────────────

assertOk  ("happy path",                   registerJuristicStep1Schema, {
  phone: "0812345678", password: "secret1", services: [], otp: "123456",
});
assertFail("password too short",           registerJuristicStep1Schema, {
  phone: "0812345678", password: "x", otp: "123456",
});

// ────────────────────────────────────────────────────────────
section("juristicStep2Schema — tax-ID + address (chat audit emphasis)");
// ────────────────────────────────────────────────────────────

const validJuristic2 = {
  taxId: "0105564077716",  // valid 13-digit (Pacred's own)
  companyName: "บริษัท ทดสอบ จำกัด",
  addressLine: "1 ถนนทดสอบ",
};

assertOk  ("happy path (no optional fields)",  juristicStep2Schema, validJuristic2);
assertOk  ("with postcode 5 digits",           juristicStep2Schema, { ...validJuristic2, postcode: "10110" });
assertOk  ("empty postcode allowed",           juristicStep2Schema, { ...validJuristic2, postcode: "" });
assertOk  ("with full address breakdown",      juristicStep2Schema, {
  ...validJuristic2, subdistrict: "บางรัก", district: "บางรัก", province: "กรุงเทพ", postcode: "10500",
});
assertFail("tax-ID too short (12 digits)",     juristicStep2Schema, { ...validJuristic2, taxId: "010556407771" });
assertFail("tax-ID too long (14 digits)",      juristicStep2Schema, { ...validJuristic2, taxId: "01055640777160" });
assertFail("tax-ID with letters",              juristicStep2Schema, { ...validJuristic2, taxId: "0105564077A1B" });
assertFail("postcode 4 digits",                juristicStep2Schema, { ...validJuristic2, postcode: "1011" });
assertFail("postcode 6 digits",                juristicStep2Schema, { ...validJuristic2, postcode: "101100" });
assertFail("missing companyName",              juristicStep2Schema, { ...validJuristic2, companyName: "" });
assertFail("missing addressLine",              juristicStep2Schema, { ...validJuristic2, addressLine: "" });

// ────────────────────────────────────────────────────────────
section("requestOtpSchema — phone + purpose enum");
// ────────────────────────────────────────────────────────────

assertOk  ("purpose=register",   requestOtpSchema, { phone: "0812345678", purpose: "register" });
assertOk  ("purpose=login",      requestOtpSchema, { phone: "0812345678", purpose: "login" });
assertOk  ("purpose=reset",      requestOtpSchema, { phone: "0812345678", purpose: "reset" });
assertFail("purpose=invalid",    requestOtpSchema, { phone: "0812345678", purpose: "unknown" });
assertFail("missing purpose",    requestOtpSchema, { phone: "0812345678" });

// ────────────────────────────────────────────────────────────
section("confirmResetByPhoneSchema + resetByEmailSchema + updatePasswordSchema");
// ────────────────────────────────────────────────────────────

assertOk  ("confirm reset by phone happy",
  confirmResetByPhoneSchema,
  { phone: "0812345678", otp: "123456", password: "newpass1" });
assertFail("confirm reset weak password",
  confirmResetByPhoneSchema,
  { phone: "0812345678", otp: "123456", password: "x" });

assertOk  ("reset by email valid email",
  resetByEmailSchema, { email: "me@pacred.co" });
assertFail("reset by email malformed",
  resetByEmailSchema, { email: "not-an-email" });

assertOk  ("update password 8 chars",
  updatePasswordSchema, { password: "newpass1" });
assertFail("update password too short",
  updatePasswordSchema, { password: "x" });

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
