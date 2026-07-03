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
  resolveBillingIdentity,
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
    // 2026-06-05 (ภูม flag #2) — schema preprocess normalizes English→Thai.
    // Input "male" → output "ชาย" (canonical legacy SOT).
    eq("sex normalized English→Thai", r.data.userSex, "ชาย");
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
// 2026-06-05 (ภูม flag #2) — schema preprocess maps any non-male/female/Thai
// input → "" (acceptable, treated as "ไม่ระบุ"). So "other" → "" → accepted.
{
  const r = updateUserIdentitySchema.safeParse({
    userid: "PR1", userName: "A", userLastName: "B", userEmail: "", userTel: "0891234567", userSex: "other",
  });
  ok("unknown sex value normalizes to '' (not rejected)", r.success && r.data?.userSex === "");
}
// Verify Thai input accepted too
{
  const r = updateUserIdentitySchema.safeParse({
    userid: "PR1", userName: "A", userLastName: "B", userEmail: "", userTel: "0891234567", userSex: "หญิง",
  });
  ok("accepts Thai 'หญิง' directly", r.success && r.data?.userSex === "หญิง");
}

// ── resolveBillingIdentity — juristic vs person display/billing identity ───
console.log("\nresolveBillingIdentity (2026-07-03 SOT)");
{
  // Personal customer — no corp row, userCompany not '1'.
  const r = resolveBillingIdentity({ userCompany: "0", userName: "PEA", userLastName: "PEA", corp: null });
  eq("person: not juristic", r.isJuristic, false);
  eq("person: name = person full name", r.name, "PEA PEA");
  eq("person: taxId ''", r.taxId, "");
  eq("person: registeredAddress ''", r.registeredAddress, "");
  eq("person: personName = person full name", r.personName, "PEA PEA");
}
{
  // Juristic via userCompany='1' + full corp row (the PR075 "HOME CAMERA" case).
  const r = resolveBillingIdentity({
    userCompany: "1", userName: "PEA", userLastName: "PEA",
    corp: { corporatename: "HOME CAMERA CO.,LTD.", corporatenumber: "0105564077716", corporateaddress: "123 ถ.สุขุมวิท กทม." },
  });
  eq("juristic: isJuristic", r.isJuristic, true);
  eq("juristic: name = COMPANY name (not person)", r.name, "HOME CAMERA CO.,LTD.");
  eq("juristic: taxId = corporatenumber", r.taxId, "0105564077716");
  eq("juristic: registeredAddress = corporateaddress", r.registeredAddress, "123 ถ.สุขุมวิท กทม.");
  eq("juristic: personName stays the contact person", r.personName, "PEA PEA");
}
{
  // Juristic via corp tax-id only (migrated row lost userCompany) — the union.
  const r = resolveBillingIdentity({
    userCompany: null, userName: "สมชาย", userLastName: "ใจดี",
    corp: { corporatename: "บ.เอบีซี จก.", corporatenumber: "0994000123456", corporateaddress: "" },
  });
  eq("union: taxId-only → juristic", r.isJuristic, true);
  eq("union: name = company", r.name, "บ.เอบีซี จก.");
  eq("union: registeredAddress '' (none stored) → falls back to caller", r.registeredAddress, "");
}
{
  // Juristic flag but blank corp name → fall back to the person name (never blank).
  const r = resolveBillingIdentity({
    userCompany: "1", userName: "สมหญิง", userLastName: "รักดี",
    corp: { corporatename: "", corporatenumber: "0105500000001", corporateaddress: "x" },
  });
  eq("juristic blank corp name → person fallback", r.name, "สมหญิง รักดี");
  eq("juristic blank corp name still juristic", r.isJuristic, true);
}
{
  // Whitespace-only corp tax-id must NOT flip a person to juristic.
  const r = resolveBillingIdentity({
    userCompany: "0", userName: "A", userLastName: "B",
    corp: { corporatename: "  ", corporatenumber: "   ", corporateaddress: "  " },
  });
  eq("whitespace corpnumber → not juristic", r.isJuristic, false);
  eq("whitespace → person name", r.name, "A B");
}
{
  // Null/undefined name halves — never crash, trim to a clean string.
  const r = resolveBillingIdentity({ userCompany: null, userName: null, userLastName: undefined, corp: null });
  eq("null name halves → '' (no crash)", r.name, "");
  eq("null name halves → not juristic", r.isJuristic, false);
}

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
