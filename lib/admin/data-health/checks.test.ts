/**
 * Unit tests — data-health summariser (the pure part of the invariant monitor).
 * Run: tsx lib/admin/data-health/checks.test.ts
 */
import assert from "node:assert/strict";
import { summarizeHealth, type HealthCheckResult } from "./checks";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const mk = (p: Partial<HealthCheckResult> & { id: string; severity: HealthCheckResult["severity"]; ok: boolean }): HealthCheckResult => ({
  title: p.id, why: "", action: "", count: p.ok ? 0 : 1, sample: [], ...p,
});

check("all ok → green · zero counts", () => {
  const r = summarizeHealth([mk({ id: "a", severity: "red", ok: true }), mk({ id: "b", severity: "warn", ok: true })], "t");
  assert.equal(r.green, true);
  assert.equal(r.redCount, 0);
  assert.equal(r.warnCount, 0);
});

check("failing red → NOT green · counted", () => {
  const r = summarizeHealth([mk({ id: "a", severity: "red", ok: false }), mk({ id: "b", severity: "warn", ok: false })], "t");
  assert.equal(r.green, false);
  assert.equal(r.redCount, 1);
  assert.equal(r.warnCount, 1);
});

check("warn/info failures alone stay green (red = the on-green gate)", () => {
  const r = summarizeHealth([mk({ id: "a", severity: "warn", ok: false }), mk({ id: "b", severity: "info", ok: false })], "t");
  assert.equal(r.green, true);
  assert.equal(r.warnCount, 1);
  assert.equal(r.infoCount, 1);
});

check("a check that ERRORED reports not-ok (fail-visible, never silent green)", () => {
  const r = summarizeHealth([mk({ id: "a", severity: "red", ok: false, error: "boom", count: 0 })], "t");
  assert.equal(r.green, false);
  assert.equal(r.redCount, 1);
});

console.log(`\n✅ data-health/checks.test.ts — ${passed} checks passed`);
