/**
 * Unit tests for the shop-order heartbeat-lock pure helpers
 * (lib/service-order/heartbeat-lock.ts).
 *
 * Each helper has a server caller (the lock-acquire action) and a client
 * caller (the banner countdown island). They MUST agree byte-for-byte so a
 * server "granted" never disagrees with a client "still locked" display.
 *
 * Run:  tsx lib/service-order/heartbeat-lock.test.ts   (wired into pnpm test:unit)
 */

import {
  isLockExpired,
  canAcquireLock,
  nextLockExpiry,
  secondsUntilExpiry,
  LOCK_TTL_MS,
  HEARTBEAT_INTERVAL_MS,
} from "./heartbeat-lock";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }
export {};

// Stable clock for deterministic tests — 2026-06-09 12:00:00 ICT.
const NOW = new Date("2026-06-09T05:00:00.000Z");
const NOW_MS = NOW.getTime();

section("=== Constants — heartbeat cadence safety margin ===");
assertEq("LOCK_TTL_MS is 60s", LOCK_TTL_MS, 60_000);
assertEq("HEARTBEAT_INTERVAL_MS is 50s", HEARTBEAT_INTERVAL_MS, 50_000);
assertEq("heartbeat < TTL (so the lock never lapses under active edit)", HEARTBEAT_INTERVAL_MS < LOCK_TTL_MS, true);

section("=== isLockExpired — the core compare ===");
assertEq("null hlockedat → expired (no lock)", isLockExpired(NOW, null), true);
assertEq("undefined hlockedat → expired", isLockExpired(NOW, undefined), true);
assertEq("expiry 1 minute in the future → NOT expired", isLockExpired(NOW, new Date(NOW_MS + 60_000)), false);
assertEq("expiry 1 second in the future → NOT expired", isLockExpired(NOW, new Date(NOW_MS + 1_000)), false);
assertEq("expiry exactly NOW → expired (<=)", isLockExpired(NOW, new Date(NOW_MS)), true);
assertEq("expiry 1 second in the past → expired", isLockExpired(NOW, new Date(NOW_MS - 1_000)), true);
assertEq("ISO string future → NOT expired", isLockExpired(NOW, "2026-06-09T05:00:30.000Z"), false);
assertEq("ISO string past → expired", isLockExpired(NOW, "2026-06-09T04:59:30.000Z"), true);
assertEq("malformed string → expired (defensive)", isLockExpired(NOW, "not a date"), true);

section("=== canAcquireLock — who can claim/refresh ===");
assertEq(
  "unlocked (no hlockedby) → anyone may acquire",
  canAcquireLock({ now: NOW, currentAdminId: "admin_pee", hlockedby: null, hlockedat: null }),
  true,
);
assertEq(
  "held by same admin (heartbeat path) → may refresh",
  canAcquireLock({
    now: NOW, currentAdminId: "admin_pee",
    hlockedby: "admin_pee", hlockedat: new Date(NOW_MS + 30_000),
  }),
  true,
);
assertEq(
  "held by different admin · still valid → DENIED",
  canAcquireLock({
    now: NOW, currentAdminId: "admin_may",
    hlockedby: "admin_pee", hlockedat: new Date(NOW_MS + 30_000),
  }),
  false,
);
assertEq(
  "held by different admin · expired → granted (take-over)",
  canAcquireLock({
    now: NOW, currentAdminId: "admin_may",
    hlockedby: "admin_pee", hlockedat: new Date(NOW_MS - 1_000),
  }),
  true,
);
assertEq(
  "held by different admin · hlockedat null → granted (zombie lock)",
  canAcquireLock({
    now: NOW, currentAdminId: "admin_may",
    hlockedby: "admin_pee", hlockedat: null,
  }),
  true,
);

section("=== nextLockExpiry — what to write on heartbeat ===");
assertEq(
  "exactly NOW + LOCK_TTL_MS",
  nextLockExpiry(NOW).getTime(),
  NOW_MS + 60_000,
);
assertEq(
  "is a Date instance",
  nextLockExpiry(NOW) instanceof Date,
  true,
);

section("=== secondsUntilExpiry — the UI countdown ===");
assertEq("null → 0 (no countdown)", secondsUntilExpiry(NOW, null), 0);
assertEq("undefined → 0", secondsUntilExpiry(NOW, undefined), 0);
assertEq(
  "exactly 60s in future → 60",
  secondsUntilExpiry(NOW, new Date(NOW_MS + 60_000)),
  60,
);
assertEq(
  "43.4s in future → 44 (ceil)",
  secondsUntilExpiry(NOW, new Date(NOW_MS + 43_400)),
  44,
);
assertEq(
  "43.0s in future → 43 (clean)",
  secondsUntilExpiry(NOW, new Date(NOW_MS + 43_000)),
  43,
);
assertEq(
  "1s in future → 1",
  secondsUntilExpiry(NOW, new Date(NOW_MS + 1_000)),
  1,
);
assertEq(
  "exactly NOW → 0 (just expired)",
  secondsUntilExpiry(NOW, new Date(NOW_MS)),
  0,
);
assertEq(
  "in the past → 0 (never negative — the banner switches messages instead)",
  secondsUntilExpiry(NOW, new Date(NOW_MS - 5_000)),
  0,
);
assertEq(
  "ISO string future → matches Date",
  secondsUntilExpiry(NOW, "2026-06-09T05:00:30.000Z"),
  30,
);
assertEq("malformed string → 0", secondsUntilExpiry(NOW, "garbage"), 0);

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
