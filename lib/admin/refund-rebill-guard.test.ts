/**
 * Unit tests for lib/admin/refund-rebill-guard.ts — the refund/re-bill guard
 * (legacy forwarder.php:1290 "ePayRe", ported). A payment row (tb_wallet_hs
 * typenew ∈ {5,6}, reforder=fid) must BLOCK a flip-to-รอชำระเงิน/เครดิต.
 * Uses a tiny fake Supabase query-builder so the rule runs without a DB.
 */
import { assertNotRefunded } from "./refund-rebill-guard";

let pass = 0, fail = 0;
const ok = (label: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.error(`  ✗ ${label}`); } };

// Fake admin: .from().select().eq().in().limit() → resolves {data, error}.
// `eqCalls`/`inCalls` record the filters so a test can assert the scoping.
const eqCalls: Array<[string, unknown]> = [];
const inCalls: Array<[string, unknown]> = [];
function fakeAdmin(result: { data: unknown[] | null; error: unknown }) {
  eqCalls.length = 0;
  inCalls.length = 0;
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "limit"]) {
    chain[m] = (...args: unknown[]) => {
      if (m === "eq") eqCalls.push([args[0] as string, args[1]]);
      if (m === "in") inCalls.push([args[0] as string, args[1]]);
      return chain;
    };
  }
  chain.then = (res: (v: { data: unknown[] | null; error: unknown }) => void) => res(result);
  return { from: () => chain } as unknown as Parameters<typeof assertNotRefunded>[0];
}

console.log("refund-rebill-guard:");

(async () => {
  // 1. no payment row → ok:true (safe to flip)
  const r1 = await assertNotRefunded(fakeAdmin({ data: [], error: null }), 51999);
  ok("no payment row → { ok: true } (safe)", r1.ok === true);

  // 2. a payment row present → ok:false (block the re-bill)
  const r2 = await assertNotRefunded(fakeAdmin({ data: [{ id: 42 }], error: null }), 51999);
  ok("payment row present → { ok: false } (blocks flip-to-5/credit)", r2.ok === false);

  // 3. query error → FAIL CLOSED (ok:false)
  const r3 = await assertNotRefunded(fakeAdmin({ data: null, error: { code: "X", message: "boom" } }), 51999);
  ok("query error → fail-closed { ok: false }", r3.ok === false);

  // 4. filters: .eq("reforder", String(fid)) + .in("typenew", ["5","6"])
  await assertNotRefunded(fakeAdmin({ data: [], error: null }), 51999);
  ok("scoped with .eq('reforder', String(fid))", eqCalls.some(([c, v]) => c === "reforder" && v === "51999"));
  ok("scoped with .in('typenew', ['5','6'])", inCalls.some(([c, v]) => c === "typenew" && Array.isArray(v) && (v as string[]).join(",") === "5,6"));

  console.log(`\nrefund-rebill-guard: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
})();
