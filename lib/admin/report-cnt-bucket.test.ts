import assert from "node:assert/strict";
import { isContainerInBucket } from "./report-cnt-bucket";

// ── waiting tab: MIN(fstatus) < '4' ──────────────────────────────────────
assert.equal(isContainerInBucket("1", "waiting"), true, "1 → waiting");
assert.equal(isContainerInBucket("2", "waiting"), true, "2 → waiting");
assert.equal(isContainerInBucket("3", "waiting"), true, "3 → waiting");
assert.equal(isContainerInBucket("4", "waiting"), false, "4 → NOT waiting");
assert.equal(isContainerInBucket("5", "waiting"), false, "5 → NOT waiting");
assert.equal(isContainerInBucket("7", "waiting"), false, "7 → NOT waiting");

// ── succeed tab: MIN(fstatus) >= '4' ─────────────────────────────────────
assert.equal(isContainerInBucket("4", "succeed"), true, "4 → succeed");
assert.equal(isContainerInBucket("5", "succeed"), true, "5 → succeed");
assert.equal(isContainerInBucket("6", "succeed"), true, "6 → succeed");
assert.equal(isContainerInBucket("7", "succeed"), true, "7 → succeed");
assert.equal(isContainerInBucket("3", "succeed"), false, "3 → NOT succeed");
assert.equal(isContainerInBucket("1", "succeed"), false, "1 → NOT succeed");

// ── mutual exclusivity: a container is in EXACTLY one tab (1..7) ──────────
for (const s of ["1", "2", "3", "4", "5", "6", "7"]) {
  const w = isContainerInBucket(s, "waiting");
  const su = isContainerInBucket(s, "succeed");
  assert.equal(w !== su, true, `fstatus ${s}: exactly one bucket (w=${w} su=${su})`);
}

// ── empty/blank min → waiting (conservative), never succeed ───────────────
assert.equal(isContainerInBucket("", "waiting"), true, "empty → waiting");
assert.equal(isContainerInBucket("", "succeed"), false, "empty → NOT succeed");

// ── mixed-cabinet semantics: a ตู้ with rows {'2','5'} has MIN='2' → waiting
//    ONLY (no longer double-lists, no partial succeed sum). The caller passes
//    the container-wide MIN, so this is exercised at the '2' input above.
assert.equal(isContainerInBucket("2", "waiting"), true, "mixed {2,5} min=2 → waiting only");
assert.equal(isContainerInBucket("2", "succeed"), false, "mixed {2,5} min=2 → not succeed");

console.log("report-cnt-bucket.test.ts — all assertions passed");
