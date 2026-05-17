/**
 * U1-6 — refund money-path validator unit tests.
 *
 * Covers the Zod contract surface for the refund workflow — the gate that
 * stops a malformed refund (wrong source, missing ref, thin reason,
 * over-cap amount) from ever reaching the DB / a wallet credit:
 *
 *   1. REFUND_SOURCES / REFUND_STATUSES / CUSTOMER_REFUND_SOURCES — enum sets
 *      + their *_LABEL maps (every key must have a Thai label)
 *   2. createRefundRequestSchema — customer side; source restricted to
 *      forwarder/service_order/yuan_payment, source_ref required,
 *      amount positive + capped, reason ≥10 chars
 *   3. adminCreateRefundSchema  — admin side; source='manual' allowed,
 *      source_ref required for non-manual (the .refine), reason ≥5 chars
 *   4. approveRefundSchema / markRefundPaidSchema — id-only uuid contract
 *   5. rejectRefundSchema       — id + rejected_reason ≥5 chars
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  REFUND_SOURCES,
  REFUND_SOURCE_LABEL,
  REFUND_STATUSES,
  REFUND_STATUS_LABEL,
  CUSTOMER_REFUND_SOURCES,
  createRefundRequestSchema,
  adminCreateRefundSchema,
  approveRefundSchema,
  rejectRefundSchema,
  markRefundPaidSchema,
} from "./refund";

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

console.log("refund validators (U1-6)");

// Valid RFC-4122 v4 UUIDs (Zod v4 .uuid() checks the version nibble).
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-9222-222222222222";

// ────────────────────────────────────────────────────────────
// (a) enum sets + label-map completeness
// ────────────────────────────────────────────────────────────
console.log("  (a) enum sets + label maps");
{
  assert("4 refund sources",          REFUND_SOURCES.length === 4);
  assert("sources include manual",    REFUND_SOURCES.includes("manual"));
  assert("4 refund statuses",         REFUND_STATUSES.length === 4);
  assert("statuses are the V1 set",
    ["pending", "approved", "rejected", "paid"].every((s) =>
      (REFUND_STATUSES as readonly string[]).includes(s)));

  // Customer sources = all sources MINUS manual.
  assert("3 customer sources",        CUSTOMER_REFUND_SOURCES.length === 3);
  assert("customer sources exclude manual",
    !(CUSTOMER_REFUND_SOURCES as readonly string[]).includes("manual"));

  // Every enum value must have a non-empty label (UI relies on it).
  assert("every source has a label",
    REFUND_SOURCES.every((s) => REFUND_SOURCE_LABEL[s]?.length > 0));
  assert("every status has a label",
    REFUND_STATUSES.every((s) => REFUND_STATUS_LABEL[s]?.length > 0));
}

// ────────────────────────────────────────────────────────────
// (b) createRefundRequestSchema — customer happy paths
// ────────────────────────────────────────────────────────────
console.log("  (b) createRefundRequestSchema — accepts valid input");
{
  const ok = createRefundRequestSchema.parse({
    source:     "forwarder",
    source_ref: "F26050001",
    amount_thb: 1500.5,
    reason:     "ตู้มาไม่ครบ ขาดไป 2 กล่อง ขอคืนเงินส่วนต่าง",
  });
  assert("forwarder refund parses",     ok.source === "forwarder");
  assert("amount preserved",            ok.amount_thb === 1500.5);

  const yuan = createRefundRequestSchema.parse({
    source:     "yuan_payment",
    source_ref: UUID_A,
    amount_thb: 300,
    reason:     "โอนหยวนซ้ำสองรอบ ขอคืนรอบที่เกิน",
  });
  assert("yuan_payment refund parses",  yuan.source === "yuan_payment");

  // Whitespace is trimmed on source_ref + reason.
  const trimmed = createRefundRequestSchema.parse({
    source:     "service_order",
    source_ref: "  H26050099  ",
    amount_thb: 50,
    reason:     "   สั่งผิดรายการ ต้องการยกเลิก   ",
  });
  assert("source_ref trimmed",          trimmed.source_ref === "H26050099");
  assert("reason trimmed",              trimmed.reason === "สั่งผิดรายการ ต้องการยกเลิก");
}

// ────────────────────────────────────────────────────────────
// (c) createRefundRequestSchema — rejections
// ────────────────────────────────────────────────────────────
console.log("  (c) createRefundRequestSchema — rejects bad input");
{
  const base = {
    source:     "forwarder" as const,
    source_ref: "F26050001",
    amount_thb: 100,
    reason:     "เหตุผลที่ยาวพอครับ ขอคืนเงิน",
  };
  // 'manual' is admin-only — the customer schema must reject it.
  assertThrows("rejects manual source",
    () => createRefundRequestSchema.parse({ ...base, source: "manual" }));
  assertThrows("rejects unknown source",
    () => createRefundRequestSchema.parse({ ...base, source: "credit_card" }));
  assertThrows("rejects empty source_ref",
    () => createRefundRequestSchema.parse({ ...base, source_ref: "" }));
  assertThrows("rejects whitespace-only source_ref",
    () => createRefundRequestSchema.parse({ ...base, source_ref: "   " }));
  assertThrows("rejects zero amount",
    () => createRefundRequestSchema.parse({ ...base, amount_thb: 0 }));
  assertThrows("rejects negative amount",
    () => createRefundRequestSchema.parse({ ...base, amount_thb: -1 }));
  assertThrows("rejects over-cap amount",
    () => createRefundRequestSchema.parse({ ...base, amount_thb: 10_000_000 }));
  // reason must be ≥10 chars after trim.
  assertThrows("rejects 9-char reason",
    () => createRefundRequestSchema.parse({ ...base, reason: "สั้นไปนะ" }));
  assertThrows("rejects whitespace-padded short reason",
    () => createRefundRequestSchema.parse({ ...base, reason: "  น้อย  " }));

  // Boundary: exactly 10 chars passes.
  const exactly10 = createRefundRequestSchema.parse({ ...base, reason: "1234567890" });
  assert("exactly 10-char reason passes", exactly10.reason.length === 10);
  // Boundary: exactly the cap amount passes.
  const atCap = createRefundRequestSchema.parse({ ...base, amount_thb: 9_999_999.99 });
  assert("amount at 9,999,999.99 cap passes", atCap.amount_thb === 9_999_999.99);
}

// ────────────────────────────────────────────────────────────
// (d) adminCreateRefundSchema — manual allowed, source_ref refine
// ────────────────────────────────────────────────────────────
console.log("  (d) adminCreateRefundSchema — manual + source_ref refine");
{
  // manual source: source_ref may be omitted entirely.
  const manual = adminCreateRefundSchema.parse({
    profile_id: UUID_A,
    source:     "manual",
    amount_thb: 200,
    reason:     "goodwill",
  });
  assert("manual without source_ref parses", manual.source === "manual");

  // manual source with an empty-string source_ref → parses fine.
  // NOTE: the schema's `.optional().or(z.literal("").transform(...))` left
  // branch (`z.string().trim().max(100)`) already accepts "" as a valid
  // ≤100-char string, so the `.or(z.literal(""))` fallback never fires —
  // an empty string parses straight through AS "" (not undefined). That is
  // harmless: the `.refine` below independently rejects "" for non-manual
  // sources, and a manual refund ignores source_ref entirely.
  const manualEmpty = adminCreateRefundSchema.parse({
    profile_id: UUID_A,
    source:     "manual",
    source_ref: "",
    amount_thb: 200,
    reason:     "goodwill",
  });
  assert("empty-string source_ref accepted for manual", manualEmpty.source === "manual");

  // Non-manual source WITH a ref → parses.
  const fwd = adminCreateRefundSchema.parse({
    profile_id: UUID_B,
    source:     "forwarder",
    source_ref: "F26050007",
    amount_thb: 999,
    reason:     "admin",
  });
  assert("non-manual with ref parses", fwd.source_ref === "F26050007");

  // The .refine — non-manual source WITHOUT a ref must throw.
  assertThrows("non-manual missing source_ref throws",
    () => adminCreateRefundSchema.parse({
      profile_id: UUID_B, source: "forwarder", amount_thb: 999, reason: "admin",
    }));
  assertThrows("non-manual empty source_ref throws",
    () => adminCreateRefundSchema.parse({
      profile_id: UUID_B, source: "service_order", source_ref: "", amount_thb: 999, reason: "admin",
    }));

  // Admin reason floor is 5 (lower than the customer's 10).
  assertThrows("rejects 4-char admin reason",
    () => adminCreateRefundSchema.parse({
      profile_id: UUID_A, source: "manual", amount_thb: 10, reason: "abcd",
    }));
  const reason5 = adminCreateRefundSchema.parse({
    profile_id: UUID_A, source: "manual", amount_thb: 10, reason: "abcde",
  });
  assert("exactly 5-char admin reason passes", reason5.reason === "abcde");

  // profile_id must be a uuid.
  assertThrows("rejects non-uuid profile_id",
    () => adminCreateRefundSchema.parse({
      profile_id: "nope", source: "manual", amount_thb: 10, reason: "valid",
    }));
}

// ────────────────────────────────────────────────────────────
// (e) approveRefundSchema / markRefundPaidSchema — id-only
// ────────────────────────────────────────────────────────────
console.log("  (e) approve / mark-paid — id-only uuid contract");
{
  assert("approve accepts a uuid",   approveRefundSchema.parse({ id: UUID_A }).id === UUID_A);
  assert("mark-paid accepts a uuid", markRefundPaidSchema.parse({ id: UUID_B }).id === UUID_B);
  assertThrows("approve rejects non-uuid",   () => approveRefundSchema.parse({ id: "x" }));
  assertThrows("mark-paid rejects non-uuid", () => markRefundPaidSchema.parse({ id: "" }));
  assertThrows("approve rejects missing id", () => approveRefundSchema.parse({}));
}

// ────────────────────────────────────────────────────────────
// (f) rejectRefundSchema — id + rejected_reason ≥5 chars
// ────────────────────────────────────────────────────────────
console.log("  (f) rejectRefundSchema — reason required");
{
  const ok = rejectRefundSchema.parse({ id: UUID_A, rejected_reason: "เอกสารไม่ครบ" });
  assert("valid reject parses", ok.rejected_reason === "เอกสารไม่ครบ");
  assertThrows("rejects empty reason",
    () => rejectRefundSchema.parse({ id: UUID_A, rejected_reason: "" }));
  assertThrows("rejects 4-char reason",
    () => rejectRefundSchema.parse({ id: UUID_A, rejected_reason: "abcd" }));
  assertThrows("rejects non-uuid id",
    () => rejectRefundSchema.parse({ id: "x", rejected_reason: "valid reason" }));
  // Trims before the length check.
  const trimmed = rejectRefundSchema.parse({ id: UUID_A, rejected_reason: "  ปฏิเสธ  " });
  assert("trims rejected_reason", trimmed.rejected_reason === "ปฏิเสธ");
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
