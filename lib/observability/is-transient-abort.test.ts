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

import { isTransientAbortError, isChunkLoadError } from "./is-transient-abort";
import {
  isServerActionDispatchError,
  describeActionDispatchError,
} from "./action-dispatch-error";

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

// ── isChunkLoadError — deploy-churn (must be true; suppressed + auto-heal) ──
// The two predicates are INDEPENDENT — chunk-load must be false for
// isTransientAbortError (asserted above at "chunk-load failure (real …)")
// and true here; they are OR'd only at the client-report skip.
section("chunk-load → true (deploy churn — auto-heal + suppress)");
assertEq(
  "name ChunkLoadError (any message)",
  isChunkLoadError(err("anything at all", "ChunkLoadError")),
  true,
);
assertEq(
  "prod incident shape with ?dpl=",
  isChunkLoadError(err("Failed to load chunk /_next/static/chunks/794878.js?dpl=dpl_ABC from module 794878")),
  true,
);
assertEq("webpack 'Loading chunk 794878 failed.'", isChunkLoadError(err("Loading chunk 794878 failed.")), true);
assertEq("'Loading CSS chunk 12 failed.'", isChunkLoadError(err("Loading CSS chunk 12 failed.")), true);
assertEq(
  "'error loading dynamically imported module'",
  isChunkLoadError(err("error loading dynamically imported module: https://x/page.js")),
  true,
);
assertEq(
  "'Failed to fetch dynamically imported module'",
  isChunkLoadError(err("Failed to fetch dynamically imported module: https://x/page.js")),
  true,
);
assertEq("case-insensitive 'FAILED TO LOAD CHUNK …'", isChunkLoadError(err("FAILED TO LOAD CHUNK 794878")), true);

section("chunk-load → false (real bugs — must NOT auto-heal/suppress)");
assertEq("ReferenceError 'fxRateMap is not defined'", isChunkLoadError(err("fxRateMap is not defined")), false);
assertEq(
  "TypeError 'Cannot read properties of undefined (reading map)'",
  isChunkLoadError(err("Cannot read properties of undefined (reading 'map')")),
  false,
);
assertEq(
  "transient-abort 'Failed to fetch' is NOT a chunk-load (orthogonal)",
  isChunkLoadError(err("Failed to fetch")),
  false,
);
assertEq(
  "server response error",
  isChunkLoadError(err("An unexpected response was received from the server.")),
  false,
);
assertEq("empty message, no name", isChunkLoadError(err("")), false);
assertEq("null", isChunkLoadError(null), false);
assertEq("undefined", isChunkLoadError(undefined), false);

// ── isServerActionDispatchError — the CALL-SITE classifier ──
// Orthogonal to the two predicates above: those decide "do we FILE an
// incident"; this one decides "does the call site know the server's answer".
// It deliberately RETURNS TRUE for all three families (unexpected-response,
// transient abort, chunk-load) because to a caller they mean the same thing.
section("isServerActionDispatchError → true (dispatch transport failed)");
assertEq(
  "Next reducer 'An unexpected response was received from the server.'",
  isServerActionDispatchError(err("An unexpected response was received from the server.")),
  true,
);
assertEq(
  "same message without the trailing period",
  isServerActionDispatchError(err("An unexpected response was received from the server")),
  true,
);
assertEq(
  "case/whitespace insensitive",
  isServerActionDispatchError(err("  AN UNEXPECTED RESPONSE WAS RECEIVED FROM THE SERVER.  ")),
  true,
);
assertEq("cancelled fetch 'Failed to fetch'", isServerActionDispatchError(err("Failed to fetch")), true);
assertEq("AbortError by name", isServerActionDispatchError(err("whatever", "AbortError")), true);
assertEq("chunk-load (deploy churn)", isServerActionDispatchError(err("x", "ChunkLoadError")), true);

section("isServerActionDispatchError → false (a REAL error must not be masked)");
assertEq("ReferenceError", isServerActionDispatchError(err("fxRateMap is not defined")), false);
assertEq(
  "TypeError",
  isServerActionDispatchError(err("Cannot read properties of undefined (reading 'map')")),
  false,
);
assertEq(
  "substring inside a longer real message is NOT matched",
  isServerActionDispatchError(err("Parse failed: an unexpected response was received from the server. line 4")),
  false,
);
assertEq("empty message", isServerActionDispatchError(err("")), false);
assertEq("null", isServerActionDispatchError(null), false);
assertEq("undefined", isServerActionDispatchError(undefined), false);
assertEq("a string, not an Error", isServerActionDispatchError("boom"), false);

// ── describeActionDispatchError — MONEY-SAFE copy ──
// A mutating action whose dispatch failed has an UNKNOWN outcome; the copy
// must never invite a blind retry (that is how a double-charge happens).
section("describeActionDispatchError");
assertEq(
  "read-path copy invites a retry",
  describeActionDispatchError(err("An unexpected response was received from the server.")).includes("ลองอีกครั้ง"),
  true,
);
assertEq(
  "MONEY: mutating copy does NOT invite a retry",
  describeActionDispatchError(err("An unexpected response was received from the server."), { mutating: true })
    .includes("ลองอีกครั้ง"),
  false,
);
assertEq(
  "MONEY: mutating copy tells staff to CHECK the status first",
  describeActionDispatchError(err("Failed to fetch"), { mutating: true }).includes("ตรวจสอบสถานะ"),
  true,
);
assertEq(
  "a real error keeps its own message (never masked)",
  describeActionDispatchError(err("fxRateMap is not defined")),
  "fxRateMap is not defined",
);
assertEq(
  "a non-Error throw gets generic copy",
  describeActionDispatchError("boom"),
  "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง",
);

// ── Summary ──
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
