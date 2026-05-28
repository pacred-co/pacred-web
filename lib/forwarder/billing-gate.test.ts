/**
 * U1-3 — arrival→billing gate STUB tests (Wave 3 cleanup, 2026-05-20 ค่ำ).
 *
 * The original 14-case U1-3 test exercised the cargo_containers ↔ forwarders
 * gating logic. Under D1 Option A the cargo spine was retired in Wave 2 and
 * `getCargoBillingGate()` is now a stub that always returns
 * `{ blocked: false }`. The full test will be revived in Phase C when the
 * legacy "ตัดตู้" workflow is faithfully ported on top of tb_forwarder + tb_cnt.
 *
 * Until then this minimal test locks the stub contract: every call is
 * unblocked, regardless of input. Keeps the test runner script green.
 *
 * Run: pnpm tsx --tsconfig tsconfig.test.json lib/forwarder/billing-gate.test.ts
 */

import { getCargoBillingGate } from "./billing-gate";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}

async function main(): Promise<void> {
  console.log("\nU1-3 billing-gate STUB (Wave 3) — every call unblocked");

  // The stub ignores the client + f_no — pass a minimal fake.
  const fakeClient = {} as Parameters<typeof getCargoBillingGate>[0];

  const cases: string[] = [
    "F26050001",
    "F00000001",
    "",
    "any-arbitrary-string",
  ];
  for (const fNo of cases) {
    const r = await getCargoBillingGate(fakeClient, fNo);
    assert(`fNo="${fNo}" → blocked === false`, r.blocked === false);
  }

  console.log(`\n  ${pass} pass · ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
