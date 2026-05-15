// Unit tests for lib/warehouse/cargo-type.ts — V-D2 canonical cargo-type
// mapping. Matches Pacred test conventions (no framework; tsx-driven asserts).

import {
  CARGO_TYPE_VALUES,
  CARGO_TYPE_LABEL_TH,
  CARGO_TYPE_CLEARANCE_NOTE,
  isCargoType,
  toCanonicalCargoType,
} from "./cargo-type";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function eq<T>(name: string, actual: T, expected: T): void {
  if (actual === expected) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    console.log(`  ✗ ${name}`);
  }
}

function truthy(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── (a) PCS API codes (A/M/X/O/Z) → canonical ────────────────────
console.log("\n(a) PCS API legacy codes → canonical");
eq("A → general",     toCanonicalCargoType("A"), "general");
eq("M → electrical",  toCanonicalCargoType("M"), "electrical");
eq("X → brand",       toCanonicalCargoType("X"), "brand");
eq("O → food_drug",   toCanonicalCargoType("O"), "food_drug");
eq("Z → controlled",  toCanonicalCargoType("Z"), "controlled");

// ── (b) China manifest codes (G/T/F) → canonical ─────────────────
console.log("\n(b) China manifest legacy codes → canonical");
eq("G → general",     toCanonicalCargoType("G"), "general");
eq("T → electrical",  toCanonicalCargoType("T"), "electrical");
eq("F → food_drug",   toCanonicalCargoType("F"), "food_drug");

// ── (c) case-insensitivity ───────────────────────────────────────
console.log("\n(c) case-insensitive");
eq("'a' → general",   toCanonicalCargoType("a"), "general");
eq("'t' → electrical",toCanonicalCargoType("t"), "electrical");

// ── (d) full legacy label form "普通货物/ทั่วไป/A" ───────────────
console.log("\n(d) full legacy label form (trailing /-token)");
eq("普通货物/ทั่วไป/A → general",   toCanonicalCargoType("普通货物/ทั่วไป/A"), "general");
eq("电器/มอก./M → electrical",     toCanonicalCargoType("电器/มอก./M"), "electrical");
eq("名牌/พิเศษ/X → brand",          toCanonicalCargoType("名牌/พิเศษ/X"), "brand");
eq("药和食物/อย./O → food_drug",    toCanonicalCargoType("药和食物/อย./O"), "food_drug");
eq("管制货品/ควบคุม/Z → controlled",toCanonicalCargoType("管制货品/ควบคุม/Z"), "controlled");
eq("manifest 药和食物/อย./F → food_drug", toCanonicalCargoType("药和食物/อย./F"), "food_drug");

// ── (e) already-canonical passes through ─────────────────────────
console.log("\n(e) already-canonical input");
eq("general → general",       toCanonicalCargoType("general"), "general");
eq("CONTROLLED → controlled", toCanonicalCargoType("CONTROLLED"), "controlled");

// ── (f) unknown / empty → null ───────────────────────────────────
console.log("\n(f) unknown / empty → null");
eq("'' → null",       toCanonicalCargoType(""), null);
eq("'  ' → null",     toCanonicalCargoType("  "), null);
eq("null → null",     toCanonicalCargoType(null), null);
eq("undefined → null",toCanonicalCargoType(undefined), null);
eq("'Q' (unknown) → null", toCanonicalCargoType("Q"), null);
eq("'xyz' (unknown) → null", toCanonicalCargoType("xyz"), null);

// ── (g) isCargoType guard ────────────────────────────────────────
console.log("\n(g) isCargoType type guard");
truthy("isCargoType('general') true",  isCargoType("general"));
truthy("isCargoType('brand') true",    isCargoType("brand"));
truthy("isCargoType('A') false",       !isCargoType("A"));
truthy("isCargoType('xyz') false",     !isCargoType("xyz"));
truthy("isCargoType(null) false",      !isCargoType(null));
truthy("isCargoType(5) false",         !isCargoType(5));

// ── (h) metadata completeness ────────────────────────────────────
console.log("\n(h) metadata completeness");
eq("5 canonical values", CARGO_TYPE_VALUES.length, 5);
truthy("TH label for every type",
  CARGO_TYPE_VALUES.every((t) => typeof CARGO_TYPE_LABEL_TH[t] === "string" && CARGO_TYPE_LABEL_TH[t].length > 0));
truthy("clearance note key for every type",
  CARGO_TYPE_VALUES.every((t) => typeof CARGO_TYPE_CLEARANCE_NOTE[t] === "string"));

// ── summary ──────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? "✅" : "❌"} cargo-type — ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nFailures:\n  " + failures.join("\n  "));
  process.exit(1);
}
