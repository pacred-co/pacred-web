/**
 * Unit tests for lib/utils/elapsed-thai.ts — the legacy diffDateTimeNow elapsed
 * string (function.php L1074-1093).
 *
 * Run: npx tsx lib/utils/elapsed-thai.test.ts
 *
 * The borrow logic (seconds→minutes→hours→days→months, with the "days in the prior
 * month" carry) is exactly the kind of thing a port fat-fingers, so the unit
 * boundaries + a month/year rollover are pinned here. Uses offsets from a fixed
 * reference so the assertions don't depend on the wall clock.
 */

import assert from "node:assert/strict";
import { diffDateTimeNow } from "./elapsed-thai";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// A local datetime string N units in the past, formatted like the DB ("YYYY-MM-DD HH:mm:ss").
function ago({ days = 0, hours = 0, minutes = 0, seconds = 0 }): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours, d.getMinutes() - minutes, d.getSeconds() - seconds, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ── empty / invalid → "" (caller renders nothing) ────────────────────
test("null / undefined / empty → empty string", () => {
  assert.equal(diffDateTimeNow(null), "");
  assert.equal(diffDateTimeNow(undefined), "");
  assert.equal(diffDateTimeNow(""), "");
});

test("unparseable → empty string", () => {
  assert.equal(diffDateTimeNow("not-a-date"), "");
});

// ── unit boundaries — which units appear ─────────────────────────────
test("< 1 hour → minutes + seconds only", () => {
  const out = diffDateTimeNow(ago({ minutes: 40, seconds: 48 }));
  assert.match(out, /^\d+ นาที \d+ วินาที$/);
  assert.ok(!out.includes("ชั่วโมง"));
});

test("< 1 day → hours + minutes + seconds", () => {
  const out = diffDateTimeNow(ago({ hours: 14, minutes: 40 }));
  assert.match(out, /^\d+ ชั่วโมง \d+ นาที \d+ วินาที$/);
  assert.ok(!out.includes("วัน"));
});

test('< 1 month → "X วัน Y ชั่วโมง …" (the reference-image shape)', () => {
  const out = diffDateTimeNow(ago({ days: 1, hours: 14, minutes: 40 }));
  assert.match(out, /^1 วัน \d+ ชั่วโมง \d+ นาที \d+ วินาที$/);
  assert.ok(!out.includes("เดือน"));
});

// ── the exact value (fixed offset, so seconds are deterministic) ─────
test("exact breakdown for a 1d 2h 3m 4s gap", () => {
  // No trailing space (the old copy in forwarder-row-view.tsx had one; HTML
  // collapsed it, so dropping it is cosmetically identical).
  assert.equal(diffDateTimeNow(ago({ days: 1, hours: 2, minutes: 3, seconds: 4 })), "1 วัน 2 ชั่วโมง 3 นาที 4 วินาที");
});

// ── no trailing whitespace (regression on the shared-lib move) ───────
test("no trailing space", () => {
  const out = diffDateTimeNow(ago({ minutes: 5, seconds: 5 }));
  assert.equal(out, out.trimEnd());
});

// ── direction-agnostic — a FUTURE timestamp still reports the gap ────
test("future timestamp reports the absolute gap (not empty)", () => {
  const d = new Date();
  d.setHours(d.getHours() + 3);
  const p = (n: number) => String(n).padStart(2, "0");
  const future = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  const out = diffDateTimeNow(future);
  assert.ok(out.includes("ชั่วโมง"), `expected an hours gap, got "${out}"`);
});

console.log(`\n${passed} pass, 0 fail`);
