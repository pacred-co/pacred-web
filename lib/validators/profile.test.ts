/**
 * Unit tests for profile Zod schemas.
 *
 * Covers /profile edit form + /complete-profile flow + corporate juristic
 * + notification channel toggles (used by P-15 sales-daily-digest cron).
 *
 * Pattern matches lib/validators/auth.test.ts.
 */

import {
  profileBasicSchema,
  corporateSchema,
  notifyChannelsSchema,
  completeProfileSchema,
} from "./profile";

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

// ────────────────────────────────────────────────────────────
section("profileBasicSchema — required + Thai phone regex");
// ────────────────────────────────────────────────────────────

const validBasic = {
  first_name: "Pacred",
  last_name:  "Customer",
  phone:      "0812345678",
};

assertOk  ("happy path minimal",           profileBasicSchema, validBasic);
assertOk  ("with optional email",          profileBasicSchema, { ...validBasic, email: "me@pacred.co" });
assertOk  ("empty email transformed to undefined", profileBasicSchema, { ...validBasic, email: "" });
assertOk  ("with sex=male",                profileBasicSchema, { ...validBasic, sex: "male" });
assertOk  ("with birthday YYYY-MM-DD",     profileBasicSchema, { ...validBasic, birthday: "1990-05-16" });
assertOk  ("empty birthday transformed",   profileBasicSchema, { ...validBasic, birthday: "" });
assertOk  ("with shop_user=true",          profileBasicSchema, { ...validBasic, shop_user: true });
assertOk  ("with freight_type=cargo",      profileBasicSchema, { ...validBasic, freight_type: "cargo" });

assertFail("missing first_name",           profileBasicSchema, { ...validBasic, first_name: "" });
assertFail("missing last_name",            profileBasicSchema, { ...validBasic, last_name: "" });
assertFail("phone too short '081234567'",  profileBasicSchema, { ...validBasic, phone: "01234567" });
assertFail("phone no leading 0",           profileBasicSchema, { ...validBasic, phone: "812345678" });
assertFail("phone with dashes",            profileBasicSchema, { ...validBasic, phone: "081-234-5678" });
assertFail("phone with + prefix",          profileBasicSchema, { ...validBasic, phone: "+66812345678" });
assertFail("invalid email format",         profileBasicSchema, { ...validBasic, email: "not-email" });
assertFail("birthday malformed",           profileBasicSchema, { ...validBasic, birthday: "1990/05/16" });
assertFail("invalid sex enum",             profileBasicSchema, { ...validBasic, sex: "unknown" });
assertFail("invalid freight_type",         profileBasicSchema, { ...validBasic, freight_type: "air" });

// ────────────────────────────────────────────────────────────
section("corporateSchema — tax-ID 13 digits + company info");
// ────────────────────────────────────────────────────────────

const validCorp = {
  tax_id:          "0105564077716",  // Pacred's own tax-ID
  company_name:    "บริษัท ทดสอบ จำกัด",
  company_address: "1/1 ถนนทดสอบ",
};

assertOk  ("happy path Pacred tax-ID",     corporateSchema, validCorp);
assertOk  ("alt 13-digit tax-ID",          corporateSchema, { ...validCorp, tax_id: "1234567890123" });

assertFail("tax-ID 12 digits",             corporateSchema, { ...validCorp, tax_id: "010556407771" });
assertFail("tax-ID 14 digits",             corporateSchema, { ...validCorp, tax_id: "01055640777160" });
assertFail("tax-ID with letters",          corporateSchema, { ...validCorp, tax_id: "0105564077A16" });
assertFail("tax-ID with dashes",           corporateSchema, { ...validCorp, tax_id: "0105-5640-7771-6" });
assertFail("tax-ID with spaces",           corporateSchema, { ...validCorp, tax_id: "010 5564 077716" });
assertFail("missing company_name",         corporateSchema, { ...validCorp, company_name: "" });
assertFail("missing company_address",      corporateSchema, { ...validCorp, company_address: "" });
assertFail("company_name > 300 chars",     corporateSchema, { ...validCorp, company_name: "x".repeat(301) });
assertFail("company_address > 1000 chars", corporateSchema, { ...validCorp, company_address: "x".repeat(1001) });

// ────────────────────────────────────────────────────────────
section("notifyChannelsSchema — admin opt-in for P-15 digest");
// ────────────────────────────────────────────────────────────

assertOk  ("both channels on",             notifyChannelsSchema, { line: true, email: true });
assertOk  ("line on, email off",           notifyChannelsSchema, { line: true, email: false });
assertOk  ("both off",                     notifyChannelsSchema, { line: false, email: false });
assertOk  ("with daily_digest=true (admin opt-in)",
  notifyChannelsSchema, { line: true, email: true, daily_digest: true });
assertOk  ("with daily_digest=false",
  notifyChannelsSchema, { line: true, email: true, daily_digest: false });
assertOk  ("daily_digest omitted (default off)",
  notifyChannelsSchema, { line: true, email: true });

assertFail("missing line",                 notifyChannelsSchema, { email: true });
assertFail("missing email",                notifyChannelsSchema, { line: true });
assertFail("line non-boolean (string)",    notifyChannelsSchema, { line: "true", email: true });

// ────────────────────────────────────────────────────────────
section("completeProfileSchema — required + agreed=true");
// ────────────────────────────────────────────────────────────

const validComplete = {
  first_name: "Pacred",
  last_name:  "Customer",
  phone:      "0812345678",
  agreed:     true,
};

assertOk  ("happy path minimal",           completeProfileSchema, validComplete);
assertOk  ("with sex + birthday",          completeProfileSchema, {
  ...validComplete, sex: "female", birthday: "1992-01-15",
});
assertOk  ("empty birthday transformed",   completeProfileSchema, { ...validComplete, birthday: "" });

assertFail("agreed=false (must accept TOS)", completeProfileSchema, { ...validComplete, agreed: false });
assertFail("missing agreed",                 completeProfileSchema, {
  first_name: validComplete.first_name,
  last_name:  validComplete.last_name,
  phone:      validComplete.phone,
});
assertFail("missing first_name",             completeProfileSchema, { ...validComplete, first_name: "" });
assertFail("phone too short",                completeProfileSchema, { ...validComplete, phone: "01234567" });
assertFail("birthday malformed",             completeProfileSchema, { ...validComplete, birthday: "16/05/1990" });

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
