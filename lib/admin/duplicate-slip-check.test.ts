/**
 * Unit tests for lib/admin/duplicate-slip-check.ts — the BLOCKING dup-slip gate
 * (owner 2026-06-19, the legacy verify "ชั้น 1" Pacred had dropped to advisory).
 * Uses a tiny fake Supabase query-builder so the rule is exercised without a DB.
 */
import { findDuplicateSlips } from "./duplicate-slip-check";

let pass = 0, fail = 0;
const ok = (label: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.error(`  ✗ ${label}`); } };

// Fake admin: .from().select().eq().neq().neq().in().gte().lte() → resolves {data, error}.
// `eqCalls` records every .eq(col,val) so a test can assert the userid scoping.
const eqCalls: Array<[string, unknown]> = [];
function fakeAdmin(result: { data: unknown[] | null; error: unknown }) {
  eqCalls.length = 0;
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "in", "gte", "lte"]) {
    chain[m] = (...args: unknown[]) => { if (m === "eq") eqCalls.push([args[0] as string, args[1]]); return chain; };
  }
  chain.then = (res: (v: { data: unknown[] | null; error: unknown }) => void) => res(result);
  return { from: () => chain } as unknown as Parameters<typeof findDuplicateSlips>[0];
}

console.log("duplicate-slip-check:");

// 1. dateslip null → no check, [] (the date-gate handles the empty case)
(async () => {
  const r = await findDuplicateSlips(fakeAdmin({ data: [{ id: 9 }], error: null }), { id: 1, amount: 100, dateslip: null });
  ok("dateslip null → [] (skip)", r.length === 0);

  // 2. invalid date → []
  const r2 = await findDuplicateSlips(fakeAdmin({ data: [{ id: 9 }], error: null }), { id: 1, amount: 100, dateslip: "not-a-date" });
  ok("invalid date → []", r2.length === 0);

  // 3. a real same-day same-amount match → returned (BLOCK)
  const r3 = await findDuplicateSlips(fakeAdmin({ data: [{ id: 42, status: "2", amount: 100 }], error: null }), { id: 1, amount: 100, dateslip: "2026-06-19T03:00:00Z" });
  ok("duplicate found → returned (blocks approve)", r3.length === 1 && r3[0].id === 42);

  // 4. no match → [] (safe to approve)
  const r4 = await findDuplicateSlips(fakeAdmin({ data: [], error: null }), { id: 1, amount: 100, dateslip: "2026-06-19T03:00:00Z" });
  ok("no duplicate → [] (safe)", r4.length === 0);

  // 5. query error → FAIL CLOSED (sentinel match so the approve is blocked)
  const r5 = await findDuplicateSlips(fakeAdmin({ data: null, error: { code: "X", message: "boom" } }), { id: 1, amount: 100, dateslip: "2026-06-19T03:00:00Z" });
  ok("query error → fail-closed (blocks)", r5.length === 1 && r5[0].id === -1);

  // 6. userid present → scoped with .eq("userid", ...) (no cross-customer block)
  await findDuplicateSlips(fakeAdmin({ data: [], error: null }), { id: 1, userid: "PR321", amount: 100, dateslip: "2026-06-19T03:00:00Z" });
  ok("userid present → .eq('userid') applied", eqCalls.some(([c, v]) => c === "userid" && v === "PR321"));

  // 7. userid absent → NO userid filter (back-compat)
  await findDuplicateSlips(fakeAdmin({ data: [], error: null }), { id: 1, amount: 100, dateslip: "2026-06-19T03:00:00Z" });
  ok("userid absent → no .eq('userid')", !eqCalls.some(([c]) => c === "userid"));

  console.log(`\nduplicate-slip-check: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
})();
