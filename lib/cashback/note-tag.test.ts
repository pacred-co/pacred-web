/**
 * Unit tests for lib/cashback/note-tag.ts — the ADR-0025 cashback-at-checkout
 * note helpers (ref-id namespacing + the [CB:<amount>] carry tag round-trip).
 * Pure, no IO.
 *
 * Run:  pnpm tsx lib/cashback/note-tag.test.ts   (wired into pnpm test:unit)
 */

import { cashbackRefId, appendCashbackNoteTag, parseCashbackNoteTag } from "./note-tag";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// ── cashbackRefId — namespaced idempotency anchor ──
section("cashbackRefId");
assertEq("forwarder", cashbackRefId("forwarder", "51976"), "forwarder:51976");
assertEq("shop", cashbackRefId("shop", "H123"), "shop:H123");
assertEq("yuan", cashbackRefId("yuan", "Y9"), "yuan:Y9");

// ── appendCashbackNoteTag — adds [CB:amt] only when amt > 0 ──
section("appendCashbackNoteTag");
assertEq("empty note → just the tag", appendCashbackNoteTag("", 100), "[CB:100]");
assertEq("existing note → note + space + tag", appendCashbackNoteTag("โอนผ่านวอลเลต", 100), "โอนผ่านวอลเลต [CB:100]");
assertEq("zero applied → note unchanged (no tag)", appendCashbackNoteTag("x", 0), "x");
assertEq("negative applied → note unchanged", appendCashbackNoteTag("x", -5), "x");
assertEq("decimal applied kept (2dp)", appendCashbackNoteTag("", 12.5), "[CB:12.5]");
assertEq("rounds to 2dp", appendCashbackNoteTag("", 50.999), "[CB:51]");

// ── parseCashbackNoteTag — reads the carried amount back (0 if absent) ──
section("parseCashbackNoteTag");
assertEq("reads decimal tag", parseCashbackNoteTag("[CB:123.45]"), 123.45);
assertEq("reads tag embedded mid-note", parseCashbackNoteTag("เครดิตคืน [CB:50] เพิ่มเติม"), 50);
assertEq("no tag → 0", parseCashbackNoteTag("no cashback here"), 0);
assertEq("null → 0", parseCashbackNoteTag(null), 0);
assertEq("undefined → 0", parseCashbackNoteTag(undefined), 0);
assertEq("[CB:0] → 0 (not > 0)", parseCashbackNoteTag("[CB:0]"), 0);
assertEq("malformed [CB:abc] → 0", parseCashbackNoteTag("[CB:abc]"), 0);

// ── round-trip ──
section("round-trip");
assertEq("append then parse returns the rounded amount",
  parseCashbackNoteTag(appendCashbackNoteTag("bill #9", 250.75)), 250.75);

console.log(`\n${fail === 0 ? "✅" : "❌"} cashback/note-tag: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
