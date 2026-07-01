/**
 * Unit tests — MOMO Live status propagation pure helpers.
 *
 * Focus: the FORWARD-ONLY rule (the money/status-safety invariant) + the board→fstatus
 * map + the date-column pairing. No DB, no MOMO login — pure functions only.
 *
 * Run: tsx lib/integrations/momo-web/live-status-plan.test.ts
 */

import assert from "node:assert/strict";
import {
  liveStatusToFstatus,
  fstatusRank,
  isForwardAdvance,
  fdateColumnForFstatus,
  PROPAGATABLE_LIVE_STATUSES,
} from "./live-status-plan";
import { MOMO_LIVE_STATUSES } from "./types";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("MOMO Live status-plan — board→fstatus map");

check("each Live board maps to its faithful fstatus", () => {
  assert.equal(liveStatusToFstatus("waiting"), "1");
  assert.equal(liveStatusToFstatus("arrival_kodang"), "2");
  assert.equal(liveStatusToFstatus("sending_thai"), "3");
  assert.equal(liveStatusToFstatus("wait_pay"), "5");
  assert.equal(liveStatusToFstatus("sending"), "6");
  assert.equal(liveStatusToFstatus("done"), "7");
});

check("null/undefined board → null (skip)", () => {
  assert.equal(liveStatusToFstatus(null), null);
  assert.equal(liveStatusToFstatus(undefined), null);
});

check("every canonical Live board has a mapping (no board silently dropped)", () => {
  for (const st of MOMO_LIVE_STATUSES) {
    assert.notEqual(liveStatusToFstatus(st), null, `board ${st} must map to an fstatus`);
  }
});

check("PROPAGATABLE_LIVE_STATUSES = every board (all currently map)", () => {
  assert.deepEqual([...PROPAGATABLE_LIVE_STATUSES], [...MOMO_LIVE_STATUSES]);
});

console.log("MOMO Live status-plan — FORWARD-ONLY rank");

check("rank orders the flow 1<2<3<4<5<6<7", () => {
  const ranks = ["1", "2", "3", "4", "5", "6", "7"].map(fstatusRank);
  for (let i = 1; i < ranks.length; i++) {
    assert.ok(ranks[i] > ranks[i - 1], `rank must be strictly increasing at ${i}`);
  }
});

check("unknown / empty fstatus → rank 0 (never overwrites a known status)", () => {
  assert.equal(fstatusRank(null), 0);
  assert.equal(fstatusRank(undefined), 0);
  assert.equal(fstatusRank(""), 0);
  assert.equal(fstatusRank("banana"), 0);
});

check("isForwardAdvance: advances only when strictly newer", () => {
  // strictly forward → true
  assert.equal(isForwardAdvance("1", "2"), true);
  assert.equal(isForwardAdvance("2", "3"), true);
  assert.equal(isForwardAdvance("3", "5"), true); // MOMO wait_pay skips '4'
  assert.equal(isForwardAdvance("1", "7"), true);
  // equal → NOT an advance (idempotent no-op)
  assert.equal(isForwardAdvance("3", "3"), false);
  // backward → NEVER (no demotion)
  assert.equal(isForwardAdvance("5", "3"), false);
  assert.equal(isForwardAdvance("7", "1"), false);
  assert.equal(isForwardAdvance("6", "5"), false);
});

check("isForwardAdvance: a row with NO current status can be set from any known target", () => {
  assert.equal(isForwardAdvance(null, "1"), true);
  assert.equal(isForwardAdvance("", "3"), true);
});

check("isForwardAdvance: an UNKNOWN target never advances (guards a bad map)", () => {
  assert.equal(isForwardAdvance("1", "banana"), false);
  assert.equal(isForwardAdvance(null, ""), false);
  assert.equal(isForwardAdvance("1", null), false);
});

check("isForwardAdvance: never demotes below a settled status (5/6/7)", () => {
  // a parcel already at wait_pay('5')/sending('6')/done('7') is never pulled back to an
  // earlier board — protects an admin who already moved the row forward manually.
  for (const settled of ["5", "6", "7"]) {
    for (const earlier of ["1", "2", "3"]) {
      assert.equal(
        isForwardAdvance(settled, earlier),
        false,
        `must NOT demote ${settled} → ${earlier}`,
      );
    }
  }
});

console.log("MOMO Live status-plan — fdate column pairing");

check("fstatus → fdatestatusN column pairing", () => {
  assert.equal(fdateColumnForFstatus("2"), "fdatestatus2");
  assert.equal(fdateColumnForFstatus("3"), "fdatestatus3");
  assert.equal(fdateColumnForFstatus("5"), "fdatetothai");
  assert.equal(fdateColumnForFstatus("6"), "fdatestatus6");
  assert.equal(fdateColumnForFstatus("7"), "fdatestatus7");
});

check("fstatus with no dedicated date column → null", () => {
  assert.equal(fdateColumnForFstatus("1"), null);
  assert.equal(fdateColumnForFstatus("4"), null);
  assert.equal(fdateColumnForFstatus("99"), null);
});

console.log(`\n✅ all ${passed} MOMO Live status-plan assertions passed`);
