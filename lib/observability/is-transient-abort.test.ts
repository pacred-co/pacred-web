/**
 * Unit tests for the transient navigation-abort classifier
 * (lib/observability/is-transient-abort.ts).
 *
 * The contract has two halves and BOTH must hold:
 *   - genuine fetch-cancel / stream-abort shapes → true  (suppressed)
 *   - every real application error               → false (still reported)
 *
 * A false-positive here silently drops a real bug from /admin/incidents,
 * so the "must return false" half is the load-bearing one.
 *
 * Run with:  tsx lib/observability/is-transient-abort.test.ts
 */

import { isTransientAbortError } from "./is-transient-abort";

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

function err(message: string, name?: string): Error {
  const e = new Error(message);
  if (name) e.name = name;
  return e;
}

// ── SUPPRESS — genuine transient aborts (must be true) ──
section("transient aborts → true (suppressed)");
assertEq("Safari 'Load failed'", isTransientAbortError(err("Load failed")), true);
assertEq("Safari 'Load failed' mixed-case", isTransientAbortError(err("load FAILED")), true);
assertEq("Safari 'Load failed' padded", isTransientAbortError(err("  Load failed  ")), true);
assertEq("Chrome 'Failed to fetch'", isTransientAbortError(err("Failed to fetch")), true);
assertEq(
  "Firefox 'NetworkError when attempting to fetch resource.'",
  isTransientAbortError(err("NetworkError when attempting to fetch resource.")),
  true,
);
assertEq("Firefox 'Error in input stream'", isTransientAbortError(err("Error in input stream")), true);
assertEq("Next RSC 'Connection closed.'", isTransientAbortError(err("Connection closed.")), true);
assertEq("generic 'network error'", isTransientAbortError(err("network error")), true);
assertEq("iOS 'The network connection was lost.'", isTransientAbortError(err("The network connection was lost.")), true);
assertEq("WebKit 'cancelled'", isTransientAbortError(err("cancelled")), true);
assertEq("AbortController 'The operation was aborted.'", isTransientAbortError(err("The operation was aborted.")), true);
assertEq("fetch 'The user aborted a request.'", isTransientAbortError(err("The user aborted a request.")), true);
assertEq(
  "DOMException name AbortError (any message)",
  isTransientAbortError(err("signal is aborted without reason", "AbortError")),
  true,
);

// ── NEVER SUPPRESS — real application errors (must be false) ──
section("real errors → false (still reported)");
assertEq("ReferenceError shape 'X is not defined'", isTransientAbortError(err("fxRateMap is not defined")), false);
assertEq("ReferenceError 'useRef is not defined'", isTransientAbortError(err("useRef is not defined")), false);
assertEq("ReferenceError 'ShieldCheck is not defined'", isTransientAbortError(err("ShieldCheck is not defined")), false);
assertEq(
  "DOM removeChild error",
  isTransientAbortError(err("Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.")),
  false,
);
assertEq(
  "chunk-load failure (real — deploy/stale, worth seeing)",
  isTransientAbortError(err("Failed to load chunk /_next/static/chunks/abc.js from module 794878")),
  false,
);
assertEq(
  "server response error",
  isTransientAbortError(err("An unexpected response was received from the server.")),
  false,
);
assertEq(
  "next/image parse error",
  isTransientAbortError(err('Failed to parse src "user.jpg" on `next/image`')),
  false,
);
assertEq(
  "substring 'network' in a real message is NOT matched",
  isTransientAbortError(err("Payment network validation failed for provider")),
  false,
);
assertEq(
  "substring 'load failed' inside a longer real message is NOT matched",
  isTransientAbortError(err("Image load failed: decode error in gallery renderer")),
  false,
);
assertEq("generic TypeError", isTransientAbortError(err("Cannot read properties of undefined (reading 'map')")), false);
assertEq("empty message, no name", isTransientAbortError(err("")), false);
assertEq("whitespace-only message", isTransientAbortError(err("   ")), false);

// ── Edge inputs ──
section("edge inputs");
assertEq("null", isTransientAbortError(null), false);
assertEq("undefined", isTransientAbortError(undefined), false);

// ── Summary ──
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
