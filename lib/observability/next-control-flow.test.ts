/**
 * Unit tests for the Next.js control-flow sentinel detector
 * (lib/observability/next-control-flow.ts).
 *
 * Contract: a notFound()/redirect()/HTTP-error sentinel (an object whose
 * string `digest` starts with "NEXT_") must be detected → true, so
 * withObservability re-throws it untouched instead of filing a
 * failed_action incident. A REAL programming bug (no NEXT_ digest) must be
 * false so it is still captured. Both halves are load-bearing.
 *
 * Run with:  tsx lib/observability/next-control-flow.test.ts
 */

import { isNextControlFlowError } from "./next-control-flow";

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

// ── control-flow sentinels → true (re-thrown, never captured) ──
section("NEXT control-flow → true (re-throw untouched)");
assertEq(
  "redirect() digest",
  isNextControlFlowError({ digest: "NEXT_REDIRECT;replace;/login;307;" }),
  true,
);
assertEq("notFound() digest", isNextControlFlowError({ digest: "NEXT_NOT_FOUND" }), true);
assertEq(
  "HTTP-error digest (the createBillingRunInvoice incident)",
  isNextControlFlowError({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }),
  true,
);
{
  const e = new Error("boom") as Error & { digest?: string };
  e.digest = "NEXT_NOT_FOUND";
  assertEq("Error instance with .digest NEXT_NOT_FOUND", isNextControlFlowError(e), true);
}

// ── real errors / non-sentinels → false (still captured) ──
section("real errors → false (still captured as incidents)");
assertEq("plain Error, no digest", isNextControlFlowError(new Error("boom")), false);
assertEq("non-NEXT digest string", isNextControlFlowError({ digest: "SOMETHING_ELSE" }), false);
assertEq("numeric digest (non-string)", isNextControlFlowError({ digest: 123 }), false);
assertEq(
  "bare string 'NEXT_REDIRECT' (not an object)",
  isNextControlFlowError("NEXT_REDIRECT"),
  false,
);
assertEq("null", isNextControlFlowError(null), false);
assertEq("undefined", isNextControlFlowError(undefined), false);
assertEq("plain object, no digest", isNextControlFlowError({}), false);

// ── Summary ──
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
