/**
 * Unit tests for lib/admin/customer-identity.ts — the pure validators + legacy
 * code maps behind the admin customer-identity (P0-17) + juristic (P0-18)
 * flows. The full server actions (adminUpdateUserIdentity / verifyJuristic /
 * adminConvertToJuristic) do cookies + Supabase mutation so they can't be
 * unit-tested without a stack of mocks; the load-bearing logic — the identity
 * field-map schema, the convert schema, and the corporatestatus code map —
 * lives here as pure functions/schemas. Test those exhaustively.
 *
 * Run with:  pnpm tsx lib/admin/customer-identity.test.ts
 * Pattern matches lib/legacy-paystatus-map.test.ts.
 */

import {
  CORP_STATUS,
  corporateStatusLabel,
  updateUserIdentitySchema,
  convertToJuristicSchema,
} from "./customer-identity";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function eq<T>(name: string, actual: T, expected: T): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    console.log(`  ✗ ${name}`);
  }
}
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(`${name}${detail ? `\n      ${detail}` : ""}`); console.log(`  ✗ ${name}`); }
}

// ── corporatestatus code map (legacy statusComp fidelity) ──────────────────
console.log("\ncorporatestatus codes (function.php:530 statusComp)");
eq("PENDING = '1'", CORP_STATUS.PENDING, "1");
eq("VERIFIED = '2'", CORP_STATUS.VERIFIED, "2");
eq("REJECTED = '3'", CORP_STATUS.REJECTED, "3");
eq("label '1' → รอตรวจสอบ", corporateStatusLabel("1"), "รอตรวจสอบ");
eq("label '2' → อนุมัติแล้ว", corporateStatusLabel("2"), "อนุมัติแล้ว");
eq("label '3' → ไม่ผ่าน", corporateStatusLabel("3"), "ไม่ผ่าน");
eq("label unknown → ไม่พบข้อมูล", corporateStatusLabel("9"), "ไม่พบข้อมูล");
eq("label null → ไม่พบข้อมูล", corporateStatusLabel(null), "ไม่พบข้อมูล");

// ── identity schema — happy path (legacy editUser field map) ───────────────
console.log("\nupdateUserIdentitySchema — valid input");
{
  const r = updateUserIdentitySchema.safeParse({
    userid: "PR124", userName: "สมชาย", userLastName: "ใจดี",
    userEmail: "Test@Example.com", userTel: "0812345678",
    userSex: "male", userBirthday: "1990-05-20", userLineID: "somchai", userFacebook: "fb.me/somchai",
  });
  ok("accepts full valid identity", r.success, r.success ? "" : JSON.stringify(r.error.issues));
  if (r.success) {
    eq("email lowercased", r.data.userEmail, "test@example.com");
    eq("optional sex retained", r.data.userSex, "male");
    eq("blank-default lineid present", r.data.userLineID, "somchai");
  }
}
{
  // Minimal: only the required NOT-NULL fields + blank optionals.
  const r = updateUserIdentitySchema.safeParse({
    userid: "PR1", userName: "A", userLastName: "B", userEmail: "", userTel: "0891234567",
  });
  ok("accepts minimal (email '' allowed, optionals default)", r.success, r.success ? "" : JSON.stringify(r.error.issues));
  if (r.success) {
    eq("email '' kept (clears column)", r.data.userEmail, "");
    eq("sex defaults to ''", r.data.userSex, "");
    eq("birthday defaults to '' (none provided)", r.data.userBirthday ?? "", "");
    eq("lineid defaults to ''", r.data.userLineID, "");
    eq("facebook defaults to ''", r.data.userFacebook, "");
  }
}

// ── identity schema — legacy guards (required + format) ────────────────────
console.log("\nupdateUserIdentitySchema — rejects invalid (legacy guards)");
ok("rejects empty userName (required)", !updateUserIdentitySchema.safeParse({
  userid: "PR1", userName: "", userLastName: "B", userEmail: "", userTel: "0891234567",
}).success);
ok("rejects empty userLastName (required)", !updateUserIdentitySchema.safeParse({
  userid: "PR1", userName: "A", userLastName: "", userEmail: "", userTel: "0891234567",
}).success);
ok("rejects bad email", !updateUserIdentitySchema.safeParse({
  userid: "PR1", userName: "A", userLastName: "B", userEmail: "not-an-email", userTel: "0891234567",
}).success);
ok("rejects 8-digit tel", !updateUserIdentitySchema.safeParse({
  userid: "PR1", userName: "A", userLastName: "B", userEmail: "", userTel: "08123456",
}).success);
ok("rejects tel with dashes", !updateUserIdentitySchema.safeParse({
  userid: "PR1", userName: "A", userLastName: "B", userEmail: "", userTel: "081-234-5678",
}).success);
ok("accepts 9-digit tel (landline)", updateUserIdentitySchema.safeParse({
  userid: "PR1", userName: "A", userLastName: "B", userEmail: "", userTel: "021234567",
}).success);
ok("rejects bad birthday format", !updateUserIdentitySchema.safeParse({
  userid: "PR1", userName: "A", userLastName: "B", userEmail: "", userTel: "0891234567", userBirthday: "20/05/1990",
}).success);
ok("rejects invalid sex enum", !updateUserIdentitySchema.safeParse({
  userid: "PR1", userName: "A", userLastName: "B", userEmail: "", userTel: "0891234567", userSex: "other",
}).success);

// ── convert-to-juristic schema (legacy update-corporate) ───────────────────
console.log("\nconvertToJuristicSchema — tax id + company");
{
  const r = convertToJuristicSchema.safeParse({
    userid: "PR124", tax_id: "0105564077716", company_name: "บริษัท แพคเรด จำกัด", company_address: "",
  });
  ok("accepts valid 13-digit tax id", r.success, r.success ? "" : JSON.stringify(r.error.issues));
  if (r.success) {
    eq("mark_verified defaults true", r.data.mark_verified, true);
    eq("blank address → undefined", r.data.company_address, undefined);
  }
}
ok("rejects 12-digit tax id", !convertToJuristicSchema.safeParse({
  userid: "PR1", tax_id: "010556407771", company_name: "X",
}).success);
ok("rejects non-numeric tax id", !convertToJuristicSchema.safeParse({
  userid: "PR1", tax_id: "01055640777AB", company_name: "X",
}).success);
ok("rejects empty company_name", !convertToJuristicSchema.safeParse({
  userid: "PR1", tax_id: "0105564077716", company_name: "",
}).success);
{
  const r = convertToJuristicSchema.safeParse({
    userid: "PR1", tax_id: "0105564077716", company_name: "X", mark_verified: false,
  });
  ok("mark_verified=false respected", r.success && r.data.mark_verified === false);
}

// ── summary ────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
