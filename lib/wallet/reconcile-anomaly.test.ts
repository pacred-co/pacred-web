/**
 * Unit tests for the wallet-reconcile anomaly predicate
 * (lib/wallet/reconcile-anomaly.ts) — the money-safety core of the
 * READ-ONLY /api/cron/wallet-reconcile scan.
 *
 * Why these matter: a FALSE-CLEAN verdict hides a real negative balance /
 * overdraft (money bug goes un-alerted); a FALSE-ALARM spams one incident
 * per clean wallet across 8,898 customers. So the two invariants
 * (stored<0, spendable<0), their 1-satang EPSILON boundary, and the
 * spendable derivation (reused sumAvailableBalance: settled − Σ pending
 * debits) are all asserted at the boundary.
 *
 * Run:  tsx lib/wallet/reconcile-anomaly.test.ts   (wired into pnpm test:unit)
 */

import {
  detectWalletAnomaly,
  compareOffendersWorstFirst,
  RECONCILE_EPSILON,
  type Offender,
  type PendingHsRow,
} from "./reconcile-anomaly";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// Force ESM module mode — keeps the shared `pass`/`fail` names from colliding
// with sibling .test.ts files in tsc's project graph (TS 2393/2451).
export {};

// Debit-type pending row (type ∈ {2,3,4,6,7}) → reduces spendable.
const debit = (amount: number | string): PendingHsRow => ({ amount, status: "1", type: "3" });
// Credit-type pending row (type ∈ {1,5}) → does NOT reduce spendable.
const credit = (amount: number | string): PendingHsRow => ({ amount, status: "1", type: "1" });

console.log("=== detectWalletAnomaly — wallet invariant predicate (stored<0 / spendable<0 + EPSILON) ===");

// ── (a) clean wallets — no reason ──────────────────────────────────────────
section("(a) clean → no reasons");
assertEq("positive stored, no pending → clean",
  detectWalletAnomaly(100, []), { stored: 100, spendable: 100, reasons: [] });
assertEq("exactly 0 stored → clean (0 is legitimate)",
  detectWalletAnomaly(0, []), { stored: 0, spendable: 0, reasons: [] });
assertEq("stored covers the pending debit exactly → spendable 0 → clean",
  detectWalletAnomaly(50, [debit(50)]), { stored: 50, spendable: 0, reasons: [] });
assertEq("null stored coerces to 0 → clean",
  detectWalletAnomaly(null, []), { stored: 0, spendable: 0, reasons: [] });
assertEq("pending CREDIT does not reduce spendable → clean",
  detectWalletAnomaly(10, [credit(1000)]), { stored: 10, spendable: 10, reasons: [] });

// ── (b) EPSILON boundary — the load-bearing threshold ──────────────────────
section("(b) EPSILON boundary (1 satang noise tolerated)");
assertEq("RECONCILE_EPSILON is 0.01", RECONCILE_EPSILON, 0.01);
assertEq("stored = −0.01 (exactly −EPSILON) → NOT flagged (float noise)",
  detectWalletAnomaly(-0.01, []).reasons, []);
// NOTE: a negative stored balance is ALSO a negative spendable (spendable =
// stored − Σ pending; with no pending, spendable === stored), so BOTH
// invariants fire. This is the route's real behavior (the two checks are
// independent) — asserted here so a future "only one reason" regression is caught.
assertEq("stored = −0.02 (just past −EPSILON) → BOTH (stored<0 ⇒ spendable<0)",
  detectWalletAnomaly(-0.02, []).reasons, ["stored_negative", "pending_overdraft"]);
assertEq("spendable = −0.01 (stored 49.99 − debit 50.00) → NOT flagged",
  detectWalletAnomaly(49.99, [debit(50)]).reasons, []);
assertEq("spendable = −0.02 (stored 49.98 − debit 50.00) → pending_overdraft",
  detectWalletAnomaly(49.98, [debit(50)]).reasons, ["pending_overdraft"]);

// ── (c) negative stored balance → stored_negative (+ spendable<0 follows) ──
section("(c) stored_negative invariant");
assertEq("stored −5, no pending → spendable also −5 → BOTH reasons",
  detectWalletAnomaly(-5, []), { stored: -5, spendable: -5, reasons: ["stored_negative", "pending_overdraft"] });
assertEq("negative stored is reported even with no pending rows (stored_negative present)",
  detectWalletAnomaly(-0.5, []).reasons.includes("stored_negative"), true);

// ── (d) pending overhang exceeds settled → pending_overdraft ───────────────
section("(d) pending_overdraft invariant");
assertEq("stored 100, pending debit 150 → spendable −50 → pending_overdraft",
  detectWalletAnomaly(100, [debit(150)]),
  { stored: 100, spendable: -50, reasons: ["pending_overdraft"] });
assertEq("stacked pending debits aggregate (40+40+40 > 100) → overdraft",
  detectWalletAnomaly(100, [debit(40), debit(40), debit(40)]).reasons, ["pending_overdraft"]);

// ── (e) BOTH invariants can fire on one wallet ─────────────────────────────
section("(e) both reasons");
assertEq("stored −10 + pending debit 5 → spendable −15 → BOTH reasons",
  detectWalletAnomaly(-10, [debit(5)]),
  { stored: -10, spendable: -15, reasons: ["stored_negative", "pending_overdraft"] });

// ── (f) coercion + rounding (PG numeric strings, float drift) ──────────────
section("(f) coercion + 2dp rounding");
assertEq("PG string stored '−3.00' → stored_negative (+ spendable<0 follows)",
  detectWalletAnomaly("-3.00", []).reasons, ["stored_negative", "pending_overdraft"]);
assertEq("string stored '250.50' + string debit '0.50' → spendable 250.00, clean",
  detectWalletAnomaly("250.50", [debit("0.50")]),
  { stored: 250.5, spendable: 250, reasons: [] });
assertEq("non-numeric stored coerces to 0 → clean",
  detectWalletAnomaly("abc", []), { stored: 0, spendable: 0, reasons: [] });

// ── (g) worst-first comparator ─────────────────────────────────────────────
section("(g) compareOffendersWorstFirst — deepest hole first");
const o = (userid: string, stored: number, spendable: number): Offender => ({ userid, stored, spendable, reasons: [] });
const sorted = [o("A", -5, -5), o("B", 100, -200), o("C", -50, -50)].sort(compareOffendersWorstFirst);
assertEq("B (−200 spendable) sorts before C (−50) before A (−5)",
  sorted.map((x) => x.userid), ["B", "C", "A"]);
assertEq("comparator ranks by the SMALLER of stored/spendable",
  [o("X", -1, 999), o("Y", 500, -2)].sort(compareOffendersWorstFirst).map((x) => x.userid),
  ["Y", "X"]); // Y's −2 spendable is worse than X's −1 stored

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
