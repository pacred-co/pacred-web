/**
 * Unit tests for lib/forwarder/comparison-guard.ts — the server-side ค่าเทียบ
 * write-guard (ภูม's warehouse-cannot-edit + ≤350 cap, enforced for crafted
 * POSTs to adminUpdateForwarderDimensions). Run: tsx lib/forwarder/comparison-guard.test.ts
 */
import assert from "node:assert";
import { resolveComparisonInput, validateComparisonPricePair, COMPARISON_CAP } from "./comparison-guard";
import type { AdminRole } from "@/lib/auth/require-admin";

let pass = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

const r = (...xs: string[]) => xs as AdminRole[];

console.log("comparison-guard.test.ts");

// ── cap constant ────────────────────────────────────────────────────────
t("COMPARISON_CAP is 350 (matches client MAX_COMPARISON)", () =>
  assert.strictEqual(COMPARISON_CAP, 350));

// ── warehouse (non-god) CANNOT edit → override dropped ──────────────────
t("warehouse override dropped → stored value seeds (switch+value undefined)", () => {
  const out = resolveComparisonInput(r("warehouse"), "1", 200);
  assert.strictEqual(out.switchInput, undefined);
  assert.strictEqual(out.valueInput, undefined);
  assert.strictEqual(out.error, undefined);
});
t("warehouse turning OFF ค่าเทียบ is also dropped (no warehouse mutation)", () => {
  const out = resolveComparisonInput(r("warehouse"), "0", 0);
  assert.strictEqual(out.switchInput, undefined);
  assert.strictEqual(out.valueInput, undefined);
});

// ── god roles bypass the warehouse block ────────────────────────────────
t("ultra + warehouse → CAN edit (god bypass)", () => {
  const out = resolveComparisonInput(r("warehouse", "ultra"), "1", 200);
  assert.strictEqual(out.switchInput, "1");
  assert.strictEqual(out.valueInput, 200);
  assert.strictEqual(out.error, undefined);
});
t("super + warehouse → CAN edit (god bypass)", () => {
  const out = resolveComparisonInput(r("warehouse", "super"), "1", 250);
  assert.strictEqual(out.switchInput, "1");
  assert.strictEqual(out.valueInput, 250);
});

// ── non-warehouse admins CAN edit ───────────────────────────────────────
t("ops can edit ค่าเทียบ", () => {
  const out = resolveComparisonInput(r("ops"), "1", 250);
  assert.strictEqual(out.switchInput, "1");
  assert.strictEqual(out.valueInput, 250);
});
t("accounting can edit ค่าเทียบ", () => {
  const out = resolveComparisonInput(r("accounting"), "1", 150);
  assert.strictEqual(out.valueInput, 150);
});

// ── cap enforcement (only when an editable override is ON) ───────────────
t("ops override > 350 → rejected with error", () => {
  const out = resolveComparisonInput(r("ops"), "1", 500);
  assert.ok(out.error && out.error.includes("350"));
  assert.ok(out.error.includes("500"));
});
t("override exactly 350 → allowed (boundary)", () => {
  const out = resolveComparisonInput(r("ops"), "1", 350);
  assert.strictEqual(out.error, undefined);
  assert.strictEqual(out.valueInput, 350);
});
t("over-cap value but switch OFF ('0') → no error (value not applied)", () => {
  const out = resolveComparisonInput(r("ops"), "0", 9999);
  assert.strictEqual(out.error, undefined);
});
t("warehouse over-cap override → dropped FIRST, so no error (no leak of stored)", () => {
  const out = resolveComparisonInput(r("warehouse"), "1", 9999);
  assert.strictEqual(out.switchInput, undefined);
  assert.strictEqual(out.error, undefined);
});

// ── caller didn't send the field → pass-through undefined (seed from stored) ─
t("undefined override → undefined pass-through (re-price keeps stored)", () => {
  const out = resolveComparisonInput(r("ops"), undefined, undefined);
  assert.strictEqual(out.switchInput, undefined);
  assert.strictEqual(out.valueInput, undefined);
});
t("null roles → treated as no-warehouse → can edit", () => {
  const out = resolveComparisonInput(null, "1", 100);
  assert.strictEqual(out.switchInput, "1");
  assert.strictEqual(out.valueInput, 100);
});

// ── LOCKED PAIR (owner 2026-07-06) — custom price XOR ค่าเทียบ rejected ──────
t("both OFF → ok (uses system/auto rate)", () =>
  assert.strictEqual(validateComparisonPricePair(false, false, 0), null));
t("both ON with ค่าเทียบ 250 → ok", () =>
  assert.strictEqual(validateComparisonPricePair(true, true, 250), null));
t("both ON with ค่าเทียบ 350 (max) → ok", () =>
  assert.strictEqual(validateComparisonPricePair(true, true, 350), null));
t("price ON but ค่าเทียบ OFF → rejected (XOR)", () => {
  const err = validateComparisonPricePair(true, false, 0);
  assert.ok(err && err.includes("พร้อมกัน"));
});
t("ค่าเทียบ ON but price OFF → rejected (XOR)", () => {
  const err = validateComparisonPricePair(false, true, 250);
  assert.ok(err && err.includes("พร้อมกัน"));
});
t("both ON but ค่าเทียบ = 0 → rejected (need > 0)", () => {
  const err = validateComparisonPricePair(true, true, 0);
  assert.ok(err && err.includes("ค่าเทียบ"));
});
t("both ON but ค่าเทียบ undefined → rejected (need > 0)", () => {
  const err = validateComparisonPricePair(true, true, undefined);
  assert.ok(err !== null);
});

console.log(`\n  ${pass} passed · 0 failed\n`);
