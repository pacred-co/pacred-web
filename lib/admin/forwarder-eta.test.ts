/**
 * Unit tests for lib/admin/forwarder-eta.ts — the "จะมาถึงไทย" arrival window
 * (legacy forwarder.php L595-609: +2d ทางรถ · +4d เรือ/แอร์).
 *
 * Run: npx tsx lib/admin/forwarder-eta.test.ts
 *
 * Pure logic — no DB. These exist because the rule CANNOT be eyeballed on dev:
 * every dev tb_forwarder row has fdatetothai = null, so the window never renders
 * there. The mode branch (2 vs 4 days) and the `0000-00-00` sentinel are exactly
 * the kind of legacy detail a port silently gets wrong, so they are locked here.
 */

import assert from "node:assert/strict";
import { resolveEtaWindow, formatEtaWindowThai } from "./forwarder-eta";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ── the mode branch — the load-bearing legacy rule ───────────────────
test('ทางรถ (type "1") → a 2-day window', () => {
  const w = resolveEtaWindow("2026-07-04", "1");
  assert.ok(w);
  assert.equal(w.days, 2);
  assert.equal(dayOf(w.from), "2026-07-04");
  assert.equal(dayOf(w.to), "2026-07-06");
});

test('ทางเรือ (type "2") → a 4-day window', () => {
  const w = resolveEtaWindow("2026-07-04", "2");
  assert.ok(w);
  assert.equal(w.days, 4);
  assert.equal(dayOf(w.to), "2026-07-08");
});

test('ทางอากาศ (type "3") → 4 days (only "1" is the short window)', () => {
  const w = resolveEtaWindow("2026-07-04", "3");
  assert.ok(w);
  assert.equal(w.days, 4);
});

test("unknown / null transport type falls back to the 4-day window", () => {
  assert.equal(resolveEtaWindow("2026-07-04", null)?.days, 4);
  assert.equal(resolveEtaWindow("2026-07-04", "")?.days, 4);
  assert.equal(resolveEtaWindow("2026-07-04", "99")?.days, 4);
});

// ── "no ETA yet" — must render nothing, never an epoch/Invalid Date ──
test("null / empty / whitespace → null", () => {
  assert.equal(resolveEtaWindow(null, "1"), null);
  assert.equal(resolveEtaWindow(undefined, "1"), null);
  assert.equal(resolveEtaWindow("", "1"), null);
  assert.equal(resolveEtaWindow("   ", "1"), null);
});

test("the legacy 0000-00-00 sentinel → null (not a year-0 date)", () => {
  assert.equal(resolveEtaWindow("0000-00-00", "1"), null);
  assert.equal(resolveEtaWindow("0000-00-00 00:00:00", "1"), null);
});

test("unparseable value → null", () => {
  assert.equal(resolveEtaWindow("not-a-date", "1"), null);
});

// ── month/year rollover — setDate must carry, not clamp ──────────────
test("window crosses a month end", () => {
  const w = resolveEtaWindow("2026-06-29", "2");
  assert.equal(dayOf(w!.to), "2026-07-03");
});

test("window crosses a year end", () => {
  const w = resolveEtaWindow("2026-12-30", "2");
  assert.equal(dayOf(w!.to), "2027-01-03");
});

test("window crosses a leap day", () => {
  const w = resolveEtaWindow("2028-02-27", "1");
  assert.equal(dayOf(w!.to), "2028-02-29");
});

// ── a datetime value still yields the right calendar day ────────────
test("a full timestamp is truncated to its date (no UTC off-by-one)", () => {
  const w = resolveEtaWindow("2026-07-04 23:30:00", "1");
  assert.equal(dayOf(w!.from), "2026-07-04");
  assert.equal(dayOf(w!.to), "2026-07-06");
});

// ── the rendered string ─────────────────────────────────────────────
test('formatEtaWindowThai renders "<from> ถึง <to>" in BE short-year', () => {
  assert.equal(formatEtaWindowThai("2026-07-04", "2"), "04/07/69 ถึง 08/07/69");
  assert.equal(formatEtaWindowThai("2026-07-04", "1"), "04/07/69 ถึง 06/07/69");
});

test("formatEtaWindowThai returns null when there is no ETA", () => {
  assert.equal(formatEtaWindowThai(null, "1"), null);
  assert.equal(formatEtaWindowThai("0000-00-00", "1"), null);
});

console.log(`\n${passed} pass, 0 fail`);
