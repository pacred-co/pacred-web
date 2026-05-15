/**
 * Unit tests for smaller validator schemas — contact, security, orders.
 *
 * Batched into one file because each schema is small (3-8 fields).
 * Pattern matches lib/validators/auth.test.ts.
 */

import { contactMessageSchema } from "./contact";
import {
  changePasswordSchema,
  requestPhoneChangeSchema,
  confirmPhoneChangeSchema,
} from "./security";
import { createOrderSchema, SERVICE_TYPES, ORDER_STATUSES } from "./orders";

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

// ════════════════════════════════════════════════════════════════════
// CONTACT — public contact form (P-6)
// ════════════════════════════════════════════════════════════════════

const validContact = {
  name:    "Pacred Customer",
  contact: "me@pacred.co",
  message: "สอบถามค่าขนส่งจากกวางโจวมาไทย — น้ำหนัก 50 kg",
};

// ────────────────────────────────────────────────────────────
section("contactMessageSchema — required + bounds");
// ────────────────────────────────────────────────────────────

assertOk  ("happy path email contact",       contactMessageSchema, validContact);
assertOk  ("happy path phone contact",       contactMessageSchema, { ...validContact, contact: "0812345678" });
assertOk  ("with subject",                   contactMessageSchema, { ...validContact, subject: "ค่าขนส่ง" });
assertOk  ("empty subject transformed",      contactMessageSchema, { ...validContact, subject: "" });
assertOk  ("with captchaToken",              contactMessageSchema, { ...validContact, captchaToken: "abc123" });
assertOk  ("captchaToken null",              contactMessageSchema, { ...validContact, captchaToken: null });
assertOk  ("captchaToken omitted",           contactMessageSchema, validContact);

assertFail("missing name",                   contactMessageSchema, { ...validContact, name: "" });
assertFail("missing contact",                contactMessageSchema, { ...validContact, contact: "" });
assertFail("contact too short (2 chars)",    contactMessageSchema, { ...validContact, contact: "ab" });
assertFail("message too short (3 chars)",    contactMessageSchema, { ...validContact, message: "abc" });
assertFail("message empty",                  contactMessageSchema, { ...validContact, message: "" });
assertFail("name > 200 chars",               contactMessageSchema, { ...validContact, name: "x".repeat(201) });
assertFail("contact > 200 chars",            contactMessageSchema, { ...validContact, contact: "x".repeat(201) });
assertFail("message > 4000 chars",           contactMessageSchema, { ...validContact, message: "x".repeat(4001) });
assertFail("subject > 200 chars",            contactMessageSchema, { ...validContact, subject: "x".repeat(201) });

// ════════════════════════════════════════════════════════════════════
// SECURITY — password change + phone change
// ════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
section("changePasswordSchema — current + new + confirm");
// ────────────────────────────────────────────────────────────

const validPwChange = {
  currentPassword: "oldpass",
  newPassword:     "newpass1",
  confirmPassword: "newpass1",
};

assertOk  ("happy path",                     changePasswordSchema, validPwChange);
assertFail("mismatch new vs confirm",        changePasswordSchema, { ...validPwChange, confirmPassword: "different" });
assertFail("new same as current",            changePasswordSchema, {
  currentPassword: "samepass", newPassword: "samepass", confirmPassword: "samepass",
});
assertFail("missing currentPassword",        changePasswordSchema, { ...validPwChange, currentPassword: "" });
assertFail("newPassword too short",          changePasswordSchema, { ...validPwChange, newPassword: "x", confirmPassword: "x" });
assertFail("newPassword too long",           changePasswordSchema, {
  ...validPwChange, newPassword: "a".repeat(31), confirmPassword: "a".repeat(31),
});

// ────────────────────────────────────────────────────────────
section("requestPhoneChangeSchema — verify password + new phone");
// ────────────────────────────────────────────────────────────

const validPhoneReq = {
  currentPassword: "secret",
  newPhone:        "0812345678",
};

assertOk  ("happy path",                     requestPhoneChangeSchema, validPhoneReq);
assertFail("missing currentPassword",        requestPhoneChangeSchema, { ...validPhoneReq, currentPassword: "" });
assertFail("phone too short",                requestPhoneChangeSchema, { ...validPhoneReq, newPhone: "0123" });

// ────────────────────────────────────────────────────────────
section("confirmPhoneChangeSchema — phone + OTP");
// ────────────────────────────────────────────────────────────

assertOk  ("happy path",                     confirmPhoneChangeSchema, { newPhone: "0812345678", otp: "123456" });
assertFail("missing otp",                    confirmPhoneChangeSchema, { newPhone: "0812345678", otp: "" });
assertFail("missing newPhone",               confirmPhoneChangeSchema, { otp: "123456" });

// ════════════════════════════════════════════════════════════════════
// ORDERS — generic service-type order (separate from cart/forwarder)
// ════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
section("createOrderSchema — serviceType enum + description");
// ────────────────────────────────────────────────────────────

const validOrderCreate = {
  serviceType: "import" as const,
  description: "นำเข้าสินค้าจากจีน — รายละเอียดเพิ่มเติม",
};

assertOk  ("happy path import",              createOrderSchema, validOrderCreate);
assertOk  ("serviceType=export",             createOrderSchema, { ...validOrderCreate, serviceType: "export" });
assertOk  ("serviceType=clear",              createOrderSchema, { ...validOrderCreate, serviceType: "clear" });
assertOk  ("serviceType=customs",            createOrderSchema, { ...validOrderCreate, serviceType: "customs" });
assertOk  ("serviceType=order",              createOrderSchema, { ...validOrderCreate, serviceType: "order" });
assertOk  ("serviceType=payment",            createOrderSchema, { ...validOrderCreate, serviceType: "payment" });
assertOk  ("with origin/destination",        createOrderSchema, { ...validOrderCreate, origin: "Guangzhou", destination: "Bangkok" });
assertOk  ("origin null allowed",            createOrderSchema, { ...validOrderCreate, origin: null });

assertFail("serviceType invalid 'unknown'",  createOrderSchema, { ...validOrderCreate, serviceType: "unknown" });
assertFail("missing description",            createOrderSchema, { ...validOrderCreate, description: "" });
assertFail("description > 2000 chars",       createOrderSchema, { ...validOrderCreate, description: "x".repeat(2001) });

// ────────────────────────────────────────────────────────────
section("SERVICE_TYPES + ORDER_STATUSES constants");
// ────────────────────────────────────────────────────────────

if (SERVICE_TYPES.length === 6) { pass++; console.log("  ✓ SERVICE_TYPES has 6 entries (import/export/clear/customs/order/payment)"); }
else { fail++; console.error(`  ✗ SERVICE_TYPES length mismatch — got ${SERVICE_TYPES.length}, expected 6`); }

if (ORDER_STATUSES.length === 5) { pass++; console.log("  ✓ ORDER_STATUSES has 5 entries (pending/processing/shipped/delivered/cancelled)"); }
else { fail++; console.error(`  ✗ ORDER_STATUSES length mismatch — got ${ORDER_STATUSES.length}, expected 5`); }

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
