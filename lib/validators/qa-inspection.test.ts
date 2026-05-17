/**
 * V-E10 — QA/QC intake-inspection validator unit tests.
 *
 * Covers the contract surface for the warehouse inspection flow:
 *
 *   1. QA_OUTCOMES / QA_DAMAGE  — the locked enum sets
 *   2. createQaInspectionSchema — Zod contract + the 3 refinements:
 *        a. exactly-one parent (cargo XOR freight shipment)
 *        b. waived_reason ≥5 chars required when outcome='waived'
 *        c. damage_level required when outcome ∈ {fail_minor, fail_major}
 *      (a bad refine here lets a malformed inspection reach the DB and
 *       slip past the V-E7 billing gate)
 *   3. updateQaInspectionSchema — only notes mutable; outcome immutable
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  QA_OUTCOMES,
  QA_DAMAGE,
  createQaInspectionSchema,
  updateQaInspectionSchema,
} from "./qa-inspection";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}
function assertThrows(label: string, fn: () => unknown): void {
  try {
    fn();
    fail++; console.error("  ✗", label, "(expected to throw, didn't)");
  } catch {
    pass++; console.log("  ✓", label);
  }
}

console.log("qa-inspection validators (V-E10)");

// Valid RFC-4122 v4 UUIDs (Zod v4 .uuid() checks the version nibble).
const CARGO_ID   = "11111111-1111-4111-8111-111111111111";
const FREIGHT_ID = "22222222-2222-4222-9222-222222222222";
const INSPECT_ID = "33333333-3333-4333-a333-333333333333";

// ────────────────────────────────────────────────────────────
// (a) enum sets
// ────────────────────────────────────────────────────────────
console.log("  (a) QA_OUTCOMES / QA_DAMAGE — locked sets");
{
  assert("4 outcomes",               QA_OUTCOMES.length === 4);
  assert("outcomes are pass/fail_minor/fail_major/waived",
    (QA_OUTCOMES as readonly string[]).includes("pass") &&
    (QA_OUTCOMES as readonly string[]).includes("fail_minor") &&
    (QA_OUTCOMES as readonly string[]).includes("fail_major") &&
    (QA_OUTCOMES as readonly string[]).includes("waived"));
  assert("4 damage levels",          QA_DAMAGE.length === 4);
  assert("damage levels are none/cosmetic/partial/total",
    (QA_DAMAGE as readonly string[]).includes("none") &&
    (QA_DAMAGE as readonly string[]).includes("cosmetic") &&
    (QA_DAMAGE as readonly string[]).includes("partial") &&
    (QA_DAMAGE as readonly string[]).includes("total"));
}

// ────────────────────────────────────────────────────────────
// (b) createQaInspectionSchema — happy paths
// ────────────────────────────────────────────────────────────
console.log("  (b) createQaInspectionSchema — accepts valid input");
{
  // Simple pass — cargo parent only.
  const ok = createQaInspectionSchema.parse({
    cargo_shipment_id: CARGO_ID,
    outcome:           "pass",
  });
  assert("cargo pass parses",            ok.outcome === "pass");
  assert("missing_items defaults to 0",  ok.missing_items === 0);

  // fail_minor WITH damage_level.
  const failMinor = createQaInspectionSchema.parse({
    cargo_shipment_id: CARGO_ID,
    outcome:           "fail_minor",
    damage_level:      "cosmetic",
    notes:             "กล่องบุบเล็กน้อย",
  });
  assert("fail_minor + damage parses",   failMinor.damage_level === "cosmetic");

  // fail_major WITH damage_level + missing items.
  const failMajor = createQaInspectionSchema.parse({
    cargo_shipment_id: CARGO_ID,
    outcome:           "fail_major",
    damage_level:      "total",
    missing_items:     3,
  });
  assert("fail_major + damage parses",   failMajor.damage_level === "total");
  assert("missing_items preserved",      failMajor.missing_items === 3);

  // waived WITH reason ≥5 chars.
  const waived = createQaInspectionSchema.parse({
    cargo_shipment_id: CARGO_ID,
    outcome:           "waived",
    waived_reason:     "ลูกค้ายอมรับสภาพ",
  });
  assert("waived + reason parses",       waived.outcome === "waived");

  // freight parent (the OTHER side of the XOR).
  const freight = createQaInspectionSchema.parse({
    freight_shipment_id: FREIGHT_ID,
    outcome:             "pass",
  });
  assert("freight parent parses",        freight.freight_shipment_id === FREIGHT_ID);
}

// ────────────────────────────────────────────────────────────
// (c) refinement A — exactly one parent shipment (XOR)
// ────────────────────────────────────────────────────────────
console.log("  (c) refine — exactly one parent shipment");
{
  assertThrows("rejects NO parent",
    () => createQaInspectionSchema.parse({ outcome: "pass" }));
  assertThrows("rejects BOTH parents",
    () => createQaInspectionSchema.parse({
      cargo_shipment_id:   CARGO_ID,
      freight_shipment_id: FREIGHT_ID,
      outcome:             "pass",
    }));
}

// ────────────────────────────────────────────────────────────
// (d) refinement B — waived_reason required for outcome='waived'
// ────────────────────────────────────────────────────────────
console.log("  (d) refine — waived_reason required when waived");
{
  assertThrows("rejects waived with NO reason",
    () => createQaInspectionSchema.parse({ cargo_shipment_id: CARGO_ID, outcome: "waived" }));
  assertThrows("rejects waived with <5 char reason",
    () => createQaInspectionSchema.parse({ cargo_shipment_id: CARGO_ID, outcome: "waived", waived_reason: "ok" }));
  // A non-waived outcome does NOT need waived_reason.
  const ok = createQaInspectionSchema.parse({ cargo_shipment_id: CARGO_ID, outcome: "pass" });
  assert("pass without waived_reason OK", ok.outcome === "pass");
}

// ────────────────────────────────────────────────────────────
// (e) refinement C — damage_level required for fail_* outcomes
// ────────────────────────────────────────────────────────────
console.log("  (e) refine — damage_level required when fail_*");
{
  assertThrows("rejects fail_minor with NO damage_level",
    () => createQaInspectionSchema.parse({ cargo_shipment_id: CARGO_ID, outcome: "fail_minor" }));
  assertThrows("rejects fail_major with NO damage_level",
    () => createQaInspectionSchema.parse({ cargo_shipment_id: CARGO_ID, outcome: "fail_major" }));
  // pass / waived do NOT need damage_level.
  const passOk = createQaInspectionSchema.parse({ cargo_shipment_id: CARGO_ID, outcome: "pass" });
  assert("pass without damage_level OK",  passOk.outcome === "pass");
}

// ────────────────────────────────────────────────────────────
// (f) createQaInspectionSchema — field-level rejections
// ────────────────────────────────────────────────────────────
console.log("  (f) createQaInspectionSchema — field rejections");
{
  assertThrows("rejects bogus outcome",
    () => createQaInspectionSchema.parse({ cargo_shipment_id: CARGO_ID, outcome: "broken" }));
  assertThrows("rejects bogus damage_level",
    () => createQaInspectionSchema.parse({ cargo_shipment_id: CARGO_ID, outcome: "fail_minor", damage_level: "smashed" }));
  assertThrows("rejects negative missing_items",
    () => createQaInspectionSchema.parse({ cargo_shipment_id: CARGO_ID, outcome: "pass", missing_items: -1 }));
  assertThrows("rejects non-integer missing_items",
    () => createQaInspectionSchema.parse({ cargo_shipment_id: CARGO_ID, outcome: "pass", missing_items: 1.5 }));
  assertThrows("rejects non-uuid cargo id",
    () => createQaInspectionSchema.parse({ cargo_shipment_id: "not-a-uuid", outcome: "pass" }));
}

// ────────────────────────────────────────────────────────────
// (g) updateQaInspectionSchema — only notes mutable
// ────────────────────────────────────────────────────────────
console.log("  (g) updateQaInspectionSchema — notes-only update");
{
  const ok = updateQaInspectionSchema.parse({ id: INSPECT_ID, notes: "เพิ่มหมายเหตุ" });
  assert("valid notes update parses",     ok.notes === "เพิ่มหมายเหตุ");

  // notes is optional (e.g. clearing).
  const noNotes = updateQaInspectionSchema.parse({ id: INSPECT_ID });
  assert("notes optional on update",      noNotes.id === INSPECT_ID);

  assertThrows("rejects non-uuid id",     () => updateQaInspectionSchema.parse({ id: "x", notes: "n" }));
  // outcome is NOT a field on the update schema — Zod strips unknown keys,
  // so the parsed result must not carry it.
  const stripped = updateQaInspectionSchema.parse({ id: INSPECT_ID, outcome: "pass" } as Record<string, unknown>);
  assert("outcome stripped from update",  !("outcome" in stripped));
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
