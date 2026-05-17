/**
 * V-E9 — accounting-period validator + yyyymm-helper unit tests.
 *
 * Covers the Zod contract + the BKK-calendar date helpers for the monthly
 * closing workflow. A regression mis-derives "this month" or lets a bad
 * period code through to the DB:
 *
 *   1. ACCOUNTING_PERIOD_STATUSES — enum set + label map
 *   2. yyyymmSchema      — 6-digit YYYYMM, month 01..12, year 2020..2099
 *   3. currentYyyymm     — derives this month in Asia/Bangkok
 *   4. lastNYyyymm       — N months back, most-recent-first
 *   5. openPeriodSchema / markPeriodClosingSchema / closePeriodSchema
 *   6. reopenPeriodSchema — the high-friction reopened_reason ≥10 chars
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  ACCOUNTING_PERIOD_STATUSES,
  ACCOUNTING_PERIOD_STATUS_LABEL,
  yyyymmSchema,
  currentYyyymm,
  lastNYyyymm,
  openPeriodSchema,
  markPeriodClosingSchema,
  closePeriodSchema,
  reopenPeriodSchema,
} from "./accounting-period";

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

console.log("accounting-period validators (V-E9)");

// ────────────────────────────────────────────────────────────
// (a) status enum + label map
// ────────────────────────────────────────────────────────────
console.log("  (a) status enum + label map");
{
  assert("3 period statuses", ACCOUNTING_PERIOD_STATUSES.length === 3);
  assert("statuses are open/closing/closed",
    ["open", "closing", "closed"].every((s) =>
      (ACCOUNTING_PERIOD_STATUSES as readonly string[]).includes(s)));
  assert("every status has a label",
    ACCOUNTING_PERIOD_STATUSES.every((s) => ACCOUNTING_PERIOD_STATUS_LABEL[s]?.length > 0));
}

// ────────────────────────────────────────────────────────────
// (b) yyyymmSchema — format + bounds
// ────────────────────────────────────────────────────────────
console.log("  (b) yyyymmSchema — YYYYMM format + bounds");
{
  assert("202605 valid", yyyymmSchema.parse("202605") === "202605");
  assert("202601 (Jan) valid", yyyymmSchema.parse("202601") === "202601");
  assert("202612 (Dec) valid", yyyymmSchema.parse("202612") === "202612");
  assert("trims whitespace", yyyymmSchema.parse("  202607  ") === "202607");

  assertThrows("rejects month 00", () => yyyymmSchema.parse("202600"));
  assertThrows("rejects month 13", () => yyyymmSchema.parse("202613"));
  assertThrows("rejects 5-digit", () => yyyymmSchema.parse("20265"));
  assertThrows("rejects 7-digit", () => yyyymmSchema.parse("2026050"));
  assertThrows("rejects non-numeric", () => yyyymmSchema.parse("2026MM"));
  assertThrows("rejects YYYY-MM with dash", () => yyyymmSchema.parse("2026-05"));
  // Year bounds — refine rejects pre-2020 and post-2099.
  assertThrows("rejects year 2019", () => yyyymmSchema.parse("201912"));
  assertThrows("rejects year 2100", () => yyyymmSchema.parse("210001"));
  assert("year 2020 (lower bound) valid", yyyymmSchema.parse("202001") === "202001");
  assert("year 2099 (upper bound) valid", yyyymmSchema.parse("209912") === "209912");
}

// ────────────────────────────────────────────────────────────
// (c) currentYyyymm — BKK-calendar derivation
// ────────────────────────────────────────────────────────────
console.log("  (c) currentYyyymm — Asia/Bangkok month");
{
  // A fixed UTC instant well inside a BKK day.
  const may = currentYyyymm(new Date("2026-05-17T06:00:00Z"));
  assert("2026-05-17 → 202605", may === "202605");
  // 6 digits, no dash.
  assert("output is exactly 6 digits", /^\d{6}$/.test(may));
  // Jan.
  assert("2026-01-15 → 202601", currentYyyymm(new Date("2026-01-15T06:00:00Z")) === "202601");
  // Dec.
  assert("2026-12-31 12:00Z → 202612",
    currentYyyymm(new Date("2026-12-31T12:00:00Z")) === "202612");
  // BKK is UTC+7: 2026-05-31 18:00Z is already 2026-06-01 01:00 in Bangkok.
  assert("2026-05-31 18:00Z rolls to June in BKK",
    currentYyyymm(new Date("2026-05-31T18:00:00Z")) === "202606");
  // The schema must accept whatever currentYyyymm emits.
  assert("currentYyyymm output passes yyyymmSchema",
    yyyymmSchema.parse(currentYyyymm(new Date("2026-07-04T10:00:00Z"))) === "202607");
}

// ────────────────────────────────────────────────────────────
// (d) lastNYyyymm — N months back, most-recent-first
// ────────────────────────────────────────────────────────────
console.log("  (d) lastNYyyymm — rolling window");
{
  const ref = new Date("2026-05-17T06:00:00Z");
  const last3 = lastNYyyymm(3, ref);
  assert("returns N entries", last3.length === 3);
  assert("most-recent-first: [0] is this month", last3[0] === "202605");
  assert("[1] is last month", last3[1] === "202604");
  assert("[2] is two months ago", last3[2] === "202603");

  // Crossing a year boundary.
  const janRef = new Date("2026-01-15T06:00:00Z");
  const acrossYear = lastNYyyymm(3, janRef);
  assert("Jan window [0] = 202601", acrossYear[0] === "202601");
  assert("Jan window [1] = 202512 (prev year)", acrossYear[1] === "202512");
  assert("Jan window [2] = 202511", acrossYear[2] === "202511");

  // N = 1 → just this month.
  assert("N=1 → single entry", lastNYyyymm(1, ref).length === 1);
  // N = 0 → empty.
  assert("N=0 → empty array", lastNYyyymm(0, ref).length === 0);
  // Every entry must be a valid yyyymm.
  assert("every entry passes yyyymmSchema",
    lastNYyyymm(12, ref).every((m) => yyyymmSchema.safeParse(m).success));
}

// ────────────────────────────────────────────────────────────
// (e) open / mark-closing / close schemas
// ────────────────────────────────────────────────────────────
console.log("  (e) open / mark-closing / close schemas");
{
  assert("open period parses", openPeriodSchema.parse({ period_yyyymm: "202605" }).period_yyyymm === "202605");
  assertThrows("open rejects bad period", () => openPeriodSchema.parse({ period_yyyymm: "bad" }));

  assert("mark-closing parses",
    markPeriodClosingSchema.parse({ period_yyyymm: "202605" }).period_yyyymm === "202605");

  // close: closing_notes optional.
  const closeNoNotes = closePeriodSchema.parse({ period_yyyymm: "202605" });
  assert("close without notes parses", closeNoNotes.period_yyyymm === "202605");
  const closeNotes = closePeriodSchema.parse({
    period_yyyymm: "202605", closing_notes: "ภพ.30 reconciled",
  });
  assert("close with notes parses", closeNotes.closing_notes === "ภพ.30 reconciled");
  assertThrows("close rejects over-long notes",
    () => closePeriodSchema.parse({ period_yyyymm: "202605", closing_notes: "x".repeat(2001) }));
}

// ────────────────────────────────────────────────────────────
// (f) reopenPeriodSchema — high-friction reason ≥10 chars
// ────────────────────────────────────────────────────────────
console.log("  (f) reopenPeriodSchema — reason ≥10 chars");
{
  const ok = reopenPeriodSchema.parse({
    period_yyyymm: "202604",
    reopened_reason: "พบรายการตกหล่น ต้องบันทึกเพิ่ม 1 รายการ",
  });
  assert("valid reopen parses", ok.period_yyyymm === "202604");
  assertThrows("rejects 9-char reason",
    () => reopenPeriodSchema.parse({ period_yyyymm: "202604", reopened_reason: "สั้นไปนะ" }));
  assertThrows("rejects empty reason",
    () => reopenPeriodSchema.parse({ period_yyyymm: "202604", reopened_reason: "" }));
  assertThrows("rejects over-long reason",
    () => reopenPeriodSchema.parse({ period_yyyymm: "202604", reopened_reason: "x".repeat(501) }));
  // Boundary: exactly 10 chars passes.
  const exactly10 = reopenPeriodSchema.parse({ period_yyyymm: "202604", reopened_reason: "1234567890" });
  assert("exactly 10-char reason passes", exactly10.reopened_reason.length === 10);
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
