/**
 * Tier A5 (2026-05-29) — unit tests for the legacy ↔ Pacred paystatus map.
 *
 * The full `adminUpdateYuanPayment` server action does cookies + Supabase
 * mutation so it can't be unit-tested without a stack of mocks; the
 * load-bearing logic — the transition allow-list + the legacy/Pacred
 * status map + the wallet-refund tie-breaker — lives in pure functions
 * in `lib/legacy-paystatus-map.ts`. Test those exhaustively.
 *
 * Run with:
 *   pnpm tsx lib/legacy-paystatus-map.test.ts
 *   (or `pnpm test:unit` once wired into package.json)
 */

import {
  isYuanTransitionAllowed,
  paystatusToPacred,
  pacredToPaystatus,
  YUAN_STATUSES,
  YUAN_STATUS_LABEL,
} from "@/lib/legacy-paystatus-map";

let failed = 0;
let passed = 0;

const PASS_MARK = "OK";
const FAIL_MARK = "FAIL";

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  ${PASS_MARK} ${label}`);
    passed++;
  } else {
    console.log(
      `  ${FAIL_MARK} ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`,
    );
    failed++;
  }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

console.log("=== legacy-paystatus-map tests (Tier A5) ===");

// ────────────────────────────────────────────────────────────
// (a) paystatusToPacred — DB → Pacred mapping
// ────────────────────────────────────────────────────────────
group("(a) paystatusToPacred", () => {
  assertEq(paystatusToPacred("1", false), "pending",   "'1' → pending");
  assertEq(paystatusToPacred("1", true),  "pending",   "'1' → pending (refund flag ignored on pending)");
  assertEq(paystatusToPacred("2", false), "completed", "'2' → completed");
  assertEq(paystatusToPacred("2", true),  "completed", "'2' → completed (refund flag ignored on completed)");
  assertEq(paystatusToPacred("3", false), "failed",    "'3' WITHOUT refund row → failed");
  assertEq(paystatusToPacred("3", true),  "refunded",  "'3' WITH refund row → refunded");
  assertEq(paystatusToPacred("",  false), "pending",   "empty → pending (defensive default)");
  assertEq(paystatusToPacred("9", false), "pending",   "unknown code → pending (defensive default)");
});

// ────────────────────────────────────────────────────────────
// (b) pacredToPaystatus — Pacred → DB mapping
// ────────────────────────────────────────────────────────────
group("(b) pacredToPaystatus", () => {
  assertEq(pacredToPaystatus("pending"),    "1",  "pending → '1'");
  assertEq(pacredToPaystatus("processing"), null, "processing → null (UI-only, no DB write)");
  assertEq(pacredToPaystatus("completed"),  "2",  "completed → '2'");
  assertEq(pacredToPaystatus("failed"),     "3",  "failed → '3'");
  assertEq(pacredToPaystatus("refunded"),   "3",  "refunded → '3'");
});

// ────────────────────────────────────────────────────────────
// (c) Roundtrip — every paystatus must roundtrip through the pair
// ────────────────────────────────────────────────────────────
group("(c) DB → Pacred → DB roundtrips", () => {
  // '1' → pending → '1'
  assertEq(
    pacredToPaystatus(paystatusToPacred("1", false)),
    "1",
    "'1' roundtrip",
  );
  // '2' → completed → '2'
  assertEq(
    pacredToPaystatus(paystatusToPacred("2", false)),
    "2",
    "'2' roundtrip",
  );
  // '3' (no refund) → failed → '3'
  assertEq(
    pacredToPaystatus(paystatusToPacred("3", false)),
    "3",
    "'3' (failed) roundtrip",
  );
  // '3' (refunded) → refunded → '3'
  assertEq(
    pacredToPaystatus(paystatusToPacred("3", true)),
    "3",
    "'3' (refunded) roundtrip",
  );
});

// ────────────────────────────────────────────────────────────
// (d) isYuanTransitionAllowed — money-safety allow-list
// ────────────────────────────────────────────────────────────
group("(d.1) self-transition (no-op re-save) is always allowed", () => {
  for (const s of YUAN_STATUSES) {
    assertEq(isYuanTransitionAllowed(s, s), true, `${s} → ${s}`);
  }
});

group("(d.2) permitted forward transitions", () => {
  // pending → any non-pending
  assertEq(isYuanTransitionAllowed("pending", "processing"), true,  "pending → processing");
  assertEq(isYuanTransitionAllowed("pending", "completed"),  true,  "pending → completed");
  assertEq(isYuanTransitionAllowed("pending", "failed"),     true,  "pending → failed");
  assertEq(isYuanTransitionAllowed("pending", "refunded"),   true,  "pending → refunded");
  // processing → terminal states
  assertEq(isYuanTransitionAllowed("processing", "completed"), true, "processing → completed");
  assertEq(isYuanTransitionAllowed("processing", "failed"),    true, "processing → failed");
  assertEq(isYuanTransitionAllowed("processing", "refunded"),  true, "processing → refunded");
  // completed → refunded (the only allowed completed exit)
  assertEq(isYuanTransitionAllowed("completed", "refunded"),   true, "completed → refunded");
  // failed → pending (retry only)
  assertEq(isYuanTransitionAllowed("failed", "pending"),       true, "failed → pending (retry)");
});

group("(d.3) FORBIDDEN transitions — would create money holes", () => {
  // refunded is terminal — nothing exits it
  assertEq(isYuanTransitionAllowed("refunded", "pending"),    false, "refunded → pending FORBIDDEN");
  assertEq(isYuanTransitionAllowed("refunded", "processing"), false, "refunded → processing FORBIDDEN");
  assertEq(isYuanTransitionAllowed("refunded", "completed"),  false, "refunded → completed FORBIDDEN (the W-3 money hole)");
  assertEq(isYuanTransitionAllowed("refunded", "failed"),     false, "refunded → failed FORBIDDEN");
  // failed cannot skip to completed or processing without wallet re-debit
  assertEq(isYuanTransitionAllowed("failed", "completed"),  false, "failed → completed FORBIDDEN");
  assertEq(isYuanTransitionAllowed("failed", "processing"), false, "failed → processing FORBIDDEN");
  assertEq(isYuanTransitionAllowed("failed", "refunded"),   false, "failed → refunded FORBIDDEN (no money to return)");
  // completed cannot rewind
  assertEq(isYuanTransitionAllowed("completed", "pending"),    false, "completed → pending FORBIDDEN");
  assertEq(isYuanTransitionAllowed("completed", "processing"), false, "completed → processing FORBIDDEN");
  assertEq(isYuanTransitionAllowed("completed", "failed"),     false, "completed → failed FORBIDDEN");
  // processing cannot rewind to pending (cleaner — pending is the create state)
  assertEq(isYuanTransitionAllowed("processing", "pending"),   false, "processing → pending FORBIDDEN");
});

// ────────────────────────────────────────────────────────────
// (e) STATUS_LABEL covers every status (no missing key)
// ────────────────────────────────────────────────────────────
group("(e) YUAN_STATUS_LABEL covers every status", () => {
  for (const s of YUAN_STATUSES) {
    const label = YUAN_STATUS_LABEL[s];
    assertEq(
      typeof label === "string" && label.length > 0,
      true,
      `${s} has a non-empty Thai label (${label})`,
    );
  }
});

// ────────────────────────────────────────────────────────────
// (f) Tier A5 specific — paystatus='3' tie-breaker is the ONLY
//     difference between failed and refunded on the DB-read path.
//     Verify the tie-breaker is truly the refund row.
// ────────────────────────────────────────────────────────────
group("(f) refund-row tie-breaker (Tier A5 invariant)", () => {
  // The same DB row reads as `failed` OR `refunded` depending on whether
  // the caller found a matching tb_wallet_hs type='5' row. This is the
  // only place the function is sensitive to the second arg.
  assertEq(
    paystatusToPacred("3", false) !== paystatusToPacred("3", true),
    true,
    "'3' resolution differs between refund-found vs not-found",
  );
  // The tie-breaker MUST NOT leak to other states.
  for (const code of ["1", "2", "", "9"]) {
    assertEq(
      paystatusToPacred(code, false),
      paystatusToPacred(code, true),
      `paystatus='${code}' is insensitive to refund flag`,
    );
  }
});

// ────────────────────────────────────────────────────────────
// summary
// ────────────────────────────────────────────────────────────
console.log(`\n${passed} pass, ${failed} fail`);
if (failed > 0) process.exit(1);
