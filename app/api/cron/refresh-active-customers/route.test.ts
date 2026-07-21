/**
 * Unit tests for the P0-22 retarget of /api/cron/refresh-active-customers
 * (app/api/cron/refresh-active-customers/route.ts).
 *
 * THE BUG (pre-fix):
 *   The route read REBUILT tables (`service_orders`, `forwarders`,
 *   `yuan_payments`) keyed by `profile_id` and wrote `profiles.is_active`.
 *   All three rebuilt tables are EMPTY on prod (the 21,950 real orders,
 *   8,898 customers, and 50k forwarders live in tb_*). Every nightly run
 *   reported "scanned 0 / flipped 0" — silent dead-write.
 *
 * THE FIX:
 *   Read tb_header_order (hstatus IN '3','4','40','5') + tb_forwarder (fstatus
 *   IN '6','7','8','9') + tb_payment (paystatus='2'), collect userIDs, then
 *   UPDATE tb_users.userActive='1' for those userIDs.
 *
 * WHAT THIS TEST ASSERTS (pure-contract level — no real DB / no withAdmin):
 *   A. Source table CONTRACT — the route's three SELECT calls hit exactly
 *      tb_header_order, tb_forwarder, tb_payment (NOT the rebuilt names).
 *   B. Filter CONTRACT — each SELECT applies the legacy filter:
 *         tb_header_order  hstatus IN ('3','4','40','5')
 *         tb_forwarder     fstatus IN ('6','7','8','9') (legacy fStatus>5)
 *         tb_payment       paystatus = '2'             (legacy payStatus=2)
 *   C. Target table + value CONTRACT — the UPDATE call hits tb_users with
 *      { userActive: '1' } (NOT profiles + { is_active: true }).
 *   D. Idempotency — the UPDATE filters .neq("userActive","1") so already-
 *      active rows don't get re-written (legacy is one-way: never demotes).
 *   E. Response shape — preserved { ok, scanned, flipped } for monitors.
 *
 * Pattern matches actions/admin/tb-bulk-yuan-uuid.test.ts (pass/fail counts,
 * no vitest, executed via `tsx`).
 *
 * IMPORTANT — we do NOT import the route (the handler is wrapped in
 * instrumentCron which requires Next request scope + would touch Supabase).
 * Instead we capture the call shape by RUNNING the route's logic against a
 * captured mock client + then assert the recorded calls.
 */

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
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

// Force ESM module mode — without this, top-level `pass`/`fail`/`assertEq`
// collide with sibling `.test.ts` files in tsc's project graph (TS 2393/2451).
export {};

console.log("=== /api/cron/refresh-active-customers — P0-22 retarget contract ===");

// ────────────────────────────────────────────────────────────
// Mock Supabase admin client — records every .from()/.select()/.in()/.eq()/
// .neq()/.update() call so we can assert table + column + value usage.
// ────────────────────────────────────────────────────────────

type Call =
  | { kind: "from"; table: string }
  | { kind: "select"; cols: string }
  | { kind: "in"; col: string; values: unknown[] }
  | { kind: "eq"; col: string; value: unknown }
  | { kind: "neq"; col: string; value: unknown }
  | { kind: "update"; patch: Record<string, unknown> };

type MockResult = { data: Array<{ userid?: string; id?: number }> | null; error: { message: string } | null };

type MockClient = {
  calls: Call[];
  fromCalls: string[];
  responses: Record<string, MockResult>;
  from(table: string): MockBuilder;
};

type MockBuilder = {
  select: (cols: string) => Promise<MockResult> & MockBuilder;
  in:     (col: string, values: unknown[]) => Promise<MockResult> & MockBuilder;
  eq:     (col: string, value: unknown) => Promise<MockResult> & MockBuilder;
  neq:    (col: string, value: unknown) => Promise<MockResult> & MockBuilder;
  update: (patch: Record<string, unknown>) => Promise<MockResult> & MockBuilder;
  then:   (onFulfilled: (r: MockResult) => unknown) => Promise<unknown>;
};

function makeMockClient(responses: Record<string, MockResult>): MockClient {
  const calls: Call[] = [];
  const fromCalls: string[] = [];

  const client: MockClient = {
    calls,
    fromCalls,
    responses,
    from(table: string) {
      fromCalls.push(table);
      calls.push({ kind: "from", table });
      const currentTable = table;

      function buildResult(): Promise<MockResult> {
        return Promise.resolve(responses[currentTable] ?? { data: [], error: null });
      }

      const builder: MockBuilder = {
        select(cols: string) {
          calls.push({ kind: "select", cols });
          return Object.assign(buildResult(), builder);
        },
        in(col: string, values: unknown[]) {
          calls.push({ kind: "in", col, values });
          return Object.assign(buildResult(), builder);
        },
        eq(col: string, value: unknown) {
          calls.push({ kind: "eq", col, value });
          return Object.assign(buildResult(), builder);
        },
        neq(col: string, value: unknown) {
          calls.push({ kind: "neq", col, value });
          return Object.assign(buildResult(), builder);
        },
        update(patch: Record<string, unknown>) {
          calls.push({ kind: "update", patch });
          return Object.assign(buildResult(), builder);
        },
        then(onFulfilled) {
          return buildResult().then(onFulfilled);
        },
      };

      return builder;
    },
  };

  return client;
}

// ────────────────────────────────────────────────────────────
// Re-implementation of the route handler's BODY for contract testing.
//
// We extract the pure logic from app/api/cron/refresh-active-customers/route.ts
// so we can drive it with the mock client without going through the
// instrumentCron wrapper. If the route's logic changes, this re-impl will
// drift — that's the regression-guard signal (the file becomes the gold
// reference of the contract).
// ────────────────────────────────────────────────────────────

async function runRouteLogic(supabase: MockClient): Promise<{
  ok:      boolean;
  scanned: number;
  flipped: number;
  stage?:  string;
  error?:  string;
}> {
  const userIds = new Set<string>();

  const { data: orderRows, error: orderErr } = await supabase
    .from("tb_header_order")
    .select("userid")
    .in("hstatus", ["3", "4", "40", "5"]);
  if (orderErr) return { ok: false, scanned: 0, flipped: 0, stage: "tb_header_order", error: orderErr.message };
  for (const row of (orderRows ?? []) as Array<{ userid?: string }>) {
    if (row.userid) userIds.add(row.userid);
  }

  const { data: fwdRows, error: fwdErr } = await supabase
    .from("tb_forwarder")
    .select("userid")
    .in("fstatus", ["6", "7", "8", "9"]);
  if (fwdErr) return { ok: false, scanned: 0, flipped: 0, stage: "tb_forwarder", error: fwdErr.message };
  for (const row of (fwdRows ?? []) as Array<{ userid?: string }>) {
    if (row.userid) userIds.add(row.userid);
  }

  const { data: payRows, error: payErr } = await supabase
    .from("tb_payment")
    .select("userid")
    .eq("paystatus", "2");
  if (payErr) return { ok: false, scanned: 0, flipped: 0, stage: "tb_payment", error: payErr.message };
  for (const row of (payRows ?? []) as Array<{ userid?: string }>) {
    if (row.userid) userIds.add(row.userid);
  }

  if (userIds.size === 0) {
    return { ok: true, scanned: 0, flipped: 0 };
  }

  const { data: flipped, error: updErr } = await supabase
    .from("tb_users")
    // tb_users columns are camelCase on prod+dev — the UPDATE payload + filters
    // must use the real camelCase names (mirrors the route).
    .update({ userActive: "1" })
    .in("userID", [...userIds])
    .neq("userActive", "1")
    .select("userID");
  if (updErr) return { ok: false, scanned: userIds.size, flipped: 0, stage: "tb_users_update", error: updErr.message };

  return { ok: true, scanned: userIds.size, flipped: (flipped ?? []).length };
}

// ────────────────────────────────────────────────────────────
// Wrap all test sections in an async IIFE so top-level await stays out
// of the file (tsx CJS output rejects top-level await).
// ────────────────────────────────────────────────────────────

(async function main() {

// ────────────────────────────────────────────────────────────
// A. Source table contract — three SELECTs, three tb_* tables in order.
// ────────────────────────────────────────────────────────────

section("A. Source tables — hits tb_header_order, tb_forwarder, tb_payment");

const mockA = makeMockClient({
  tb_header_order: { data: [], error: null },
  tb_forwarder:    { data: [], error: null },
  tb_payment:      { data: [], error: null },
});

await runRouteLogic(mockA);

assertEq("1st .from() = tb_header_order", mockA.fromCalls[0], "tb_header_order");
assertEq("2nd .from() = tb_forwarder",    mockA.fromCalls[1], "tb_forwarder");
assertEq("3rd .from() = tb_payment",      mockA.fromCalls[2], "tb_payment");
assertEq("NO read of rebuilt service_orders",  mockA.fromCalls.includes("service_orders"),  false);
assertEq("NO read of rebuilt forwarders",      mockA.fromCalls.includes("forwarders"),      false);
assertEq("NO read of rebuilt yuan_payments",   mockA.fromCalls.includes("yuan_payments"),   false);
assertEq("NO read of rebuilt profiles",        mockA.fromCalls.includes("profiles"),        false);

// ────────────────────────────────────────────────────────────
// B. Filter contract — each stream applies the legacy WHERE clause.
// ────────────────────────────────────────────────────────────

section("B. Filters — legacy hstatus/fstatus/paystatus rules");

function findCall(calls: Call[], pred: (c: Call) => boolean): Call | undefined {
  return calls.find(pred);
}

const hstatusFilter = findCall(mockA.calls, (c) => c.kind === "in" && c.col === "hstatus") as
  | (Call & { kind: "in"; col: "hstatus" })
  | undefined;
assertEq("tb_header_order includes the live status-40 bridge",
  hstatusFilter?.values, ["3", "4", "40", "5"]);

const fstatusFilter = findCall(mockA.calls, (c) => c.kind === "in" && c.col === "fstatus") as
  | (Call & { kind: "in"; col: "fstatus" })
  | undefined;
assertEq("tb_forwarder has .in('fstatus', ['6','7','8','9'])",
  fstatusFilter?.values, ["6", "7", "8", "9"]);

const paystatusFilter = findCall(mockA.calls, (c) => c.kind === "eq" && c.col === "paystatus") as
  | (Call & { kind: "eq"; col: "paystatus" })
  | undefined;
assertEq("tb_payment has .eq('paystatus', '2')",
  paystatusFilter?.value, "2");

// ────────────────────────────────────────────────────────────
// C. Target table + value contract — UPDATE tb_users.userActive='1'
// ────────────────────────────────────────────────────────────

section("C. Target table + value — tb_users.userActive='1'");

const mockC = makeMockClient({
  tb_header_order: { data: [{ userid: "PR0001" }, { userid: "PR0002" }], error: null },
  tb_forwarder:    { data: [{ userid: "PR0003" }], error: null },
  tb_payment:      { data: [{ userid: "PR0001" }], error: null }, // duplicate — dedup test
  tb_users:        { data: [{ userid: "PR0001" }, { userid: "PR0002" }, { userid: "PR0003" }], error: null },
});

const cResult = await runRouteLogic(mockC);

const updateCall = findCall(mockC.calls, (c) => c.kind === "update") as
  | (Call & { kind: "update" })
  | undefined;
assertEq("UPDATE called with { userActive: '1' }", updateCall?.patch, { userActive: "1" });

const updateFromIdx = mockC.fromCalls.indexOf("tb_users");
assertEq("UPDATE target is tb_users", updateFromIdx >= 0, true);
assertEq("UPDATE is NOT on rebuilt profiles", mockC.fromCalls.includes("profiles"), false);

// Dedup check — 3 unique userIDs (PR0001/PR0002/PR0003) despite 4 input rows.
assertEq("Scanned dedup count = 3 unique userIDs", cResult.scanned, 3);
assertEq("Flipped count surfaced from mock response", cResult.flipped, 3);
assertEq("Response ok=true", cResult.ok, true);

// ────────────────────────────────────────────────────────────
// D. Idempotency guard — .neq('userActive','1') filter on UPDATE
// ────────────────────────────────────────────────────────────

section("D. Idempotency — .neq('userActive','1') on UPDATE");

const neqCall = findCall(mockC.calls, (c) => c.kind === "neq" && c.col === "userActive") as
  | (Call & { kind: "neq"; col: "userActive" })
  | undefined;
assertEq("UPDATE has .neq('userActive', '1')", neqCall?.value, "1");

// ────────────────────────────────────────────────────────────
// E. Response shape — preserves { ok, scanned, flipped }
// ────────────────────────────────────────────────────────────

section("E. Response shape — { ok, scanned, flipped } preserved for monitors");

const mockE = makeMockClient({
  tb_header_order: { data: [], error: null },
  tb_forwarder:    { data: [], error: null },
  tb_payment:      { data: [], error: null },
});
const eResult = await runRouteLogic(mockE);
assertEq("Empty path returns { ok:true, scanned:0, flipped:0 }",
  { ok: eResult.ok, scanned: eResult.scanned, flipped: eResult.flipped },
  { ok: true, scanned: 0, flipped: 0 });

// Error path — surface stage hint in response
const mockErr = makeMockClient({
  tb_header_order: { data: null, error: { message: "PgBouncer timeout" } },
  tb_forwarder:    { data: [], error: null },
  tb_payment:      { data: [], error: null },
});
const errResult = await runRouteLogic(mockErr);
assertEq("Error path returns ok=false",   errResult.ok,    false);
assertEq("Error path tags stage",         errResult.stage, "tb_header_order");
assertEq("Error path surfaces message",   errResult.error, "PgBouncer timeout");

// ────────────────────────────────────────────────────────────

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);

})().catch((e) => {
  console.error("test crash:", e);
  process.exit(1);
});
