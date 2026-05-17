/**
 * Unit tests for the admin-config validator schemas — org-contact (V-G5)
 * and tos-version (V-G4).
 *
 * Batched into one file because each schema is small; mirrors the
 * batching pattern in lib/validators/misc.test.ts. Both schemas are pure
 * Zod — safeParse in, success/failure out.
 *
 * Harness: plain tsx script, matches lib/validators/misc.test.ts.
 */

import {
  createOrgContactSchema,
  updateOrgContactSchema,
  deleteOrgContactSchema,
  ORG_CONTACT_KINDS,
  ORG_CONTACT_KIND_LABEL,
} from "./org-contact";
import {
  createTosVersionSchema,
  updateTosVersionSchema,
  TOS_SCOPES,
  TOS_SCOPE_LABEL,
} from "./tos-version";

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

function truthy(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// ════════════════════════════════════════════════════════════════════
// ORG CONTACT — V-G5 admin org contacts
// ════════════════════════════════════════════════════════════════════

const validOrgContact = {
  kind:  "email",
  label: "ฝ่ายขาย",
  value: "sales@pacred.co",
};

// ────────────────────────────────────────────────────────────
section("createOrgContactSchema — kind enum + required fields");
// ────────────────────────────────────────────────────────────

assertOk  ("happy path email kind",          createOrgContactSchema, validOrgContact);
assertOk  ("kind=domain",                     createOrgContactSchema, { ...validOrgContact, kind: "domain" });
assertOk  ("kind=line_oa",                    createOrgContactSchema, { ...validOrgContact, kind: "line_oa" });
assertOk  ("kind=phone",                      createOrgContactSchema, { ...validOrgContact, kind: "phone" });
assertOk  ("kind=wechat",                     createOrgContactSchema, { ...validOrgContact, kind: "wechat" });
assertOk  ("kind=social",                     createOrgContactSchema, { ...validOrgContact, kind: "social" });
assertOk  ("kind=address",                    createOrgContactSchema, { ...validOrgContact, kind: "address" });
assertOk  ("with department",                 createOrgContactSchema, { ...validOrgContact, department: "ขาย" });
assertOk  ("with display_order",              createOrgContactSchema, { ...validOrgContact, display_order: 5 });
assertOk  ("with notes",                      createOrgContactSchema, { ...validOrgContact, notes: "ติดต่อ 9-18น" });

assertFail("invalid kind 'fax'",              createOrgContactSchema, { ...validOrgContact, kind: "fax" });
assertFail("missing kind",                    createOrgContactSchema, { label: "x", value: "y" });
assertFail("empty label",                     createOrgContactSchema, { ...validOrgContact, label: "" });
assertFail("empty value",                     createOrgContactSchema, { ...validOrgContact, value: "" });
assertFail("label > 120 chars",               createOrgContactSchema, { ...validOrgContact, label: "x".repeat(121) });
assertFail("value > 500 chars",               createOrgContactSchema, { ...validOrgContact, value: "x".repeat(501) });
assertFail("department > 80 chars",           createOrgContactSchema, { ...validOrgContact, department: "x".repeat(81) });
assertFail("display_order negative",          createOrgContactSchema, { ...validOrgContact, display_order: -1 });
assertFail("display_order > 9999",            createOrgContactSchema, { ...validOrgContact, display_order: 10000 });
assertFail("display_order not integer",       createOrgContactSchema, { ...validOrgContact, display_order: 1.5 });
assertFail("notes > 1000 chars",              createOrgContactSchema, { ...validOrgContact, notes: "x".repeat(1001) });

// defaults applied
{
  const parsed = createOrgContactSchema.parse(validOrgContact);
  truthy("default is_active = true",     parsed.is_active === true);
  truthy("default display_order = 0",    parsed.display_order === 0);
}

// ────────────────────────────────────────────────────────────
section("updateOrgContactSchema — id required, fields optional");
// ────────────────────────────────────────────────────────────

// Structurally valid v4 UUID — Zod 4's .uuid() enforces the version
// nibble ([1-8]) and variant nibble ([89abAB]); an all-1s string fails.
const validUuid = "123e4567-e89b-42d3-a456-426614174000";

assertOk  ("id only (no other fields)",       updateOrgContactSchema, { id: validUuid });
assertOk  ("id + partial update",             updateOrgContactSchema, { id: validUuid, label: "ใหม่" });
assertOk  ("department nullable on update",   updateOrgContactSchema, { id: validUuid, department: null });
assertOk  ("notes nullable on update",        updateOrgContactSchema, { id: validUuid, notes: null });

assertFail("missing id",                      updateOrgContactSchema, { label: "ใหม่" });
assertFail("id not a uuid",                   updateOrgContactSchema, { id: "not-a-uuid" });
assertFail("empty label on update",           updateOrgContactSchema, { id: validUuid, label: "" });

// ────────────────────────────────────────────────────────────
section("deleteOrgContactSchema — uuid only");
// ────────────────────────────────────────────────────────────

assertOk  ("valid uuid",                      deleteOrgContactSchema, { id: validUuid });
assertFail("invalid uuid",                    deleteOrgContactSchema, { id: "abc" });
assertFail("missing id",                      deleteOrgContactSchema, {});

// ────────────────────────────────────────────────────────────
section("ORG_CONTACT_KINDS + label map");
// ────────────────────────────────────────────────────────────

truthy("ORG_CONTACT_KINDS has 7 entries", ORG_CONTACT_KINDS.length === 7);
truthy("every kind has a label", ORG_CONTACT_KINDS.every((k) => typeof ORG_CONTACT_KIND_LABEL[k] === "string" && ORG_CONTACT_KIND_LABEL[k].length > 0));

// ════════════════════════════════════════════════════════════════════
// TOS VERSION — V-G4 terms-of-service version management
// ════════════════════════════════════════════════════════════════════

const validTos = {
  version_no:     "v1.2.0",
  title:          "ข้อตกลงการใช้บริการ",
  body_md:        "# หัวข้อ\nเนื้อหา",
  effective_from: "2026-06-01",
};

// ────────────────────────────────────────────────────────────
section("createTosVersionSchema — version_no regex + date format");
// ────────────────────────────────────────────────────────────

assertOk  ("happy path",                      createTosVersionSchema, validTos);
assertOk  ("version_no with dots/dashes",     createTosVersionSchema, { ...validTos, version_no: "2026-05-rev_1" });
assertOk  ("applies_to=cargo_only",           createTosVersionSchema, { ...validTos, applies_to: "cargo_only" });
assertOk  ("applies_to=freight_only",         createTosVersionSchema, { ...validTos, applies_to: "freight_only" });
assertOk  ("is_active explicit true",         createTosVersionSchema, { ...validTos, is_active: true });

assertFail("version_no with space",           createTosVersionSchema, { ...validTos, version_no: "v 1" });
assertFail("version_no with slash",           createTosVersionSchema, { ...validTos, version_no: "v1/2" });
assertFail("empty version_no",                createTosVersionSchema, { ...validTos, version_no: "" });
assertFail("version_no > 40 chars",           createTosVersionSchema, { ...validTos, version_no: "x".repeat(41) });
assertFail("empty title",                     createTosVersionSchema, { ...validTos, title: "" });
assertFail("title > 200 chars",               createTosVersionSchema, { ...validTos, title: "x".repeat(201) });
assertFail("empty body_md",                   createTosVersionSchema, { ...validTos, body_md: "" });
assertFail("effective_from wrong format",     createTosVersionSchema, { ...validTos, effective_from: "01/06/2026" });
assertFail("effective_from not a date-ish",   createTosVersionSchema, { ...validTos, effective_from: "soon" });
assertFail("invalid applies_to",              createTosVersionSchema, { ...validTos, applies_to: "members_only" });

// defaults applied
{
  const parsed = createTosVersionSchema.parse(validTos);
  truthy("default applies_to = all",  parsed.applies_to === "all");
  truthy("default is_active = false", parsed.is_active === false);
}

// ────────────────────────────────────────────────────────────
section("updateTosVersionSchema — id required, fields optional");
// ────────────────────────────────────────────────────────────

assertOk  ("id only",                         updateTosVersionSchema, { id: validUuid });
assertOk  ("id + title",                      updateTosVersionSchema, { id: validUuid, title: "แก้ไข" });
assertOk  ("id + effective_from",             updateTosVersionSchema, { id: validUuid, effective_from: "2026-07-01" });

assertFail("missing id",                      updateTosVersionSchema, { title: "x" });
assertFail("id not uuid",                     updateTosVersionSchema, { id: "xyz" });
assertFail("bad effective_from on update",    updateTosVersionSchema, { id: validUuid, effective_from: "2026/07/01" });

// ────────────────────────────────────────────────────────────
section("TOS_SCOPES + label map");
// ────────────────────────────────────────────────────────────

truthy("TOS_SCOPES has 3 entries", TOS_SCOPES.length === 3);
truthy("every scope has a label", TOS_SCOPES.every((s) => typeof TOS_SCOPE_LABEL[s] === "string" && TOS_SCOPE_LABEL[s].length > 0));

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
