/**
 * Unit tests for `fireUserSalesEarnTriggerOnDelivery` (P1-5 earn-trigger).
 *
 * Scope: pure-helper exercise of the SUT against a fake SupabaseClient
 * that records every `.from()/.select()/.in()/.insert()` call so we can
 * assert:
 *
 *   1. For a forwarder whose customer's `tb_users.coid='THADA.VIP'`,
 *      ONE insert into `tb_user_sales` happens, with the correct shape:
 *      `{ useridmain: 'THADA.VIP', userid: <customerId>, idf: <fid>,
 *         date: <fdatestatus7>, usstatus: '1' }`.
 *   2. For a forwarder whose customer's `coid` is NOT in the 4-VIP
 *      whitelist, NO insert happens (skipped += 1).
 *   3. Idempotency — when `tb_user_sales` already has a row for the given
 *      `idf`, the SUT does not double-insert (skipped += 1).
 *   4. All 4 VIP teams trigger (THADA.VIP / SIN.VIP / OOAEOM.VIP / SWAN) —
 *      parametrized so a future drift drops the test loudly.
 *   5. Empty input → early no-op return.
 *   6. tb_forwarder rows whose userid is null are skipped (no NPE).
 *   7. Date fallback — if `fdatestatus7` is null on the forwarder, the
 *      helper falls back to NOW() (we just assert it's a valid ISO string).
 *
 * Pattern matches actions/admin/forwarders-bulk-tb.test.ts +
 * service-orders.test.ts (pass/fail counts, no vitest, executed via tsx).
 *
 * Run with:
 *   npx tsx actions/admin/earn-trigger-tb-user-sales.test.ts
 *
 * Server-only imports are tolerated under `tsx --conditions` here because
 * the SUT only uses `server-only` for the runtime guard (which `tsx` skips
 * — the import resolves but `import 'server-only'` doesn't throw outside
 * Next's bundler).
 */

import {
  fireUserSalesEarnTriggerOnDelivery,
  isVipCoid,
  VIP_COID_WHITELIST,
} from "./earn-trigger-tb-user-sales";

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

function assertTrue(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// Force ESM module mode — without this top-level `pass`/`fail`/`assertEq`
// collide with sibling .test.ts files in tsc's project graph (TS 2393/2451).
// Same pattern as actions/admin/forwarders-bulk-tb.test.ts L75.
export {};

console.log("=== fireUserSalesEarnTriggerOnDelivery · P1-5 earn-trigger ===");

// All top-level awaits are wrapped in this async IIFE — `tsx` runs the
// file in CJS mode (esbuild compiles `.ts` → CJS for the loader), and CJS
// disallows top-level await even with `export {}`. Wrapping in an async
// function is the same pattern other Pacred unit tests use to stay
// `tsx`-runnable without changing the loader config.
async function main() {

// ════════════════════════════════════════════════════════════════
// Fake SupabaseClient — captures every .from()/.select()/.in()/.insert()
// call. Returns a fixture per table. Just enough chain surface to mirror
// the SUT (no real PostgREST semantics).
// ════════════════════════════════════════════════════════════════

type InsertCall = { table: string; rows: unknown[] };
type SelectCall = { table: string; columns: string; in: { col: string; values: unknown[] } | null };

type Fixtures = {
  tb_forwarder?: Array<{ id: number; userid: string | null; fdatestatus7: string | null }>;
  tb_users?: Array<{ userid: string; coid: string }>;
  tb_user_sales?: Array<{ idf: number }>;
};

function buildFakeAdmin(fixtures: Fixtures) {
  const inserts: InsertCall[] = [];
  const selects: SelectCall[] = [];

  function makeChain(table: string, columns: string) {
    let inFilter: { col: string; values: unknown[] } | null = null;

    const thenable = {
      // .in(col, values) → returns thenable
      in(col: string, values: unknown[]) {
        inFilter = { col, values };
        selects.push({ table, columns, in: inFilter });
        return thenable;
      },
      // PostgREST-style thenable — when awaited, return the fixture rows.
      then(
        onFulfilled: (v: { data: unknown[] | null; error: { message: string } | null }) => unknown,
      ) {
        const rows = pickRows(fixtures, table, inFilter);
        return Promise.resolve(onFulfilled({ data: rows, error: null }));
      },
    };
    return thenable;
  }

  function pickRows(
    f: Fixtures,
    table: string,
    inFilter: { col: string; values: unknown[] } | null,
  ): unknown[] | null {
    let pool: unknown[] | undefined;
    if (table === "tb_forwarder") pool = f.tb_forwarder;
    else if (table === "tb_users") pool = f.tb_users;
    else if (table === "tb_user_sales") pool = f.tb_user_sales;

    if (!pool) return null;
    if (!inFilter) return pool;
    return pool.filter((row) => {
      const r = row as Record<string, unknown>;
      return inFilter.values.includes(r[inFilter.col]);
    });
  }

  return {
    inserts,
    selects,
    from(table: string) {
      return {
        select(columns: string) {
          return makeChain(table, columns);
        },
        insert(rows: unknown[]) {
          inserts.push({ table, rows });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

// ════════════════════════════════════════════════════════════════
// A. Sanity — VIP whitelist + isVipCoid guard
// ════════════════════════════════════════════════════════════════

section("A. Whitelist sanity");

assertEq("whitelist length = 4", VIP_COID_WHITELIST.length, 4);
assertEq("whitelist contents — exact", [...VIP_COID_WHITELIST], [
  "THADA.VIP",
  "SIN.VIP",
  "OOAEOM.VIP",
  "SWAN",
]);
assertTrue("isVipCoid('THADA.VIP')",  isVipCoid("THADA.VIP"));
assertTrue("isVipCoid('SIN.VIP')",    isVipCoid("SIN.VIP"));
assertTrue("isVipCoid('OOAEOM.VIP')", isVipCoid("OOAEOM.VIP"));
assertTrue("isVipCoid('SWAN')",       isVipCoid("SWAN"));
assertTrue("!isVipCoid('SWAN.VIP')",  !isVipCoid("SWAN.VIP"));    // legacy uses raw 'SWAN'
assertTrue("!isVipCoid('THADA')",     !isVipCoid("THADA"));       // urlRecom token, not coid
assertTrue("!isVipCoid('PCS')",       !isVipCoid("PCS"));         // default coid value
assertTrue("!isVipCoid(null)",        !isVipCoid(null));
assertTrue("!isVipCoid(undefined)",   !isVipCoid(undefined));

// ════════════════════════════════════════════════════════════════
// B. Empty input → no-op
// ════════════════════════════════════════════════════════════════

section("B. Empty input → no-op");

{
  const admin = buildFakeAdmin({});
  // Cast through unknown to bypass strict SupabaseClient type
  // (the fake only implements the surface the SUT touches).
  const res = await fireUserSalesEarnTriggerOnDelivery(
    admin as unknown as Parameters<typeof fireUserSalesEarnTriggerOnDelivery>[0],
    [],
  );
  assertEq("empty input → inserted=0", res.inserted, 0);
  assertEq("empty input → skipped=0", res.skipped, 0);
  assertEq("empty input → errors=[]", res.errors, []);
  assertEq("empty input → zero db calls (no inserts)", admin.inserts.length, 0);
  assertEq("empty input → zero db calls (no selects)", admin.selects.length, 0);
}

// ════════════════════════════════════════════════════════════════
// C. Single VIP forwarder → ONE insert with correct shape
// ════════════════════════════════════════════════════════════════

section("C. Single VIP forwarder (THADA.VIP) → ONE insert · shape verified");

{
  const admin = buildFakeAdmin({
    tb_forwarder: [
      { id: 51001, userid: "PR1234", fdatestatus7: "2026-05-30T10:00:00Z" },
    ],
    tb_users: [{ userid: "PR1234", coid: "THADA.VIP" }],
    tb_user_sales: [], // no existing rows
  });
  const res = await fireUserSalesEarnTriggerOnDelivery(
    admin as unknown as Parameters<typeof fireUserSalesEarnTriggerOnDelivery>[0],
    [51001],
  );
  assertEq("THADA.VIP → inserted=1", res.inserted, 1);
  assertEq("THADA.VIP → skipped=0", res.skipped, 0);
  assertEq("THADA.VIP → errors=[]", res.errors, []);
  assertEq("THADA.VIP → exactly 1 insert call", admin.inserts.length, 1);
  assertEq("THADA.VIP → insert table = tb_user_sales", admin.inserts[0]?.table, "tb_user_sales");
  assertEq("THADA.VIP → insert row count = 1", admin.inserts[0]?.rows.length, 1);
  const row = admin.inserts[0]?.rows[0] as Record<string, unknown>;
  assertEq("THADA.VIP → row.useridmain = THADA.VIP", row.useridmain, "THADA.VIP");
  assertEq("THADA.VIP → row.userid = PR1234",         row.userid,     "PR1234");
  assertEq("THADA.VIP → row.idf = 51001",             row.idf,        51001);
  assertEq("THADA.VIP → row.date = fdatestatus7",     row.date,       "2026-05-30T10:00:00Z");
  assertEq("THADA.VIP → row.usstatus = '1'",          row.usstatus,   "1");
}

// ════════════════════════════════════════════════════════════════
// D. Non-VIP forwarder → ZERO insert
// ════════════════════════════════════════════════════════════════

section("D. Non-VIP forwarder (coid='PCS') → ZERO insert");

{
  const admin = buildFakeAdmin({
    tb_forwarder: [
      { id: 51002, userid: "PR9999", fdatestatus7: "2026-05-30T10:00:00Z" },
    ],
    tb_users: [{ userid: "PR9999", coid: "PCS" }], // default, not VIP
    tb_user_sales: [],
  });
  const res = await fireUserSalesEarnTriggerOnDelivery(
    admin as unknown as Parameters<typeof fireUserSalesEarnTriggerOnDelivery>[0],
    [51002],
  );
  assertEq("non-VIP → inserted=0", res.inserted, 0);
  assertEq("non-VIP → skipped=1", res.skipped, 1);
  assertEq("non-VIP → errors=[]", res.errors, []);
  assertEq("non-VIP → ZERO insert calls", admin.inserts.length, 0);
}

// ════════════════════════════════════════════════════════════════
// E. Idempotency — existing tb_user_sales row → ZERO insert
// ════════════════════════════════════════════════════════════════

section("E. Idempotency — existing row → ZERO insert");

{
  const admin = buildFakeAdmin({
    tb_forwarder: [
      { id: 51003, userid: "PR888", fdatestatus7: "2026-05-30T10:00:00Z" },
    ],
    tb_users: [{ userid: "PR888", coid: "THADA.VIP" }],
    tb_user_sales: [{ idf: 51003 }], // ALREADY earned
  });
  const res = await fireUserSalesEarnTriggerOnDelivery(
    admin as unknown as Parameters<typeof fireUserSalesEarnTriggerOnDelivery>[0],
    [51003],
  );
  assertEq("idempotent → inserted=0", res.inserted, 0);
  assertEq("idempotent → skipped=1", res.skipped, 1);
  assertEq("idempotent → errors=[]", res.errors, []);
  assertEq("idempotent → ZERO insert calls", admin.inserts.length, 0);
}

// ════════════════════════════════════════════════════════════════
// F. Parametrized — all 4 VIP teams trigger
// ════════════════════════════════════════════════════════════════

section("F. Parametrized — all 4 VIP teams accrue");

const VIP_TEAMS: Array<{ coid: string; memberCode: string; fid: number }> = [
  { coid: "THADA.VIP",  memberCode: "PR888",  fid: 60001 },
  { coid: "SIN.VIP",    memberCode: "PR352",  fid: 60002 },
  { coid: "OOAEOM.VIP", memberCode: "PR2678", fid: 60003 },
  { coid: "SWAN",       memberCode: "PR4155", fid: 60004 },
];

for (const t of VIP_TEAMS) {
  const admin = buildFakeAdmin({
    tb_forwarder: [{ id: t.fid, userid: t.memberCode, fdatestatus7: "2026-05-30T10:00:00Z" }],
    tb_users:     [{ userid: t.memberCode, coid: t.coid }],
    tb_user_sales: [],
  });
  const res = await fireUserSalesEarnTriggerOnDelivery(
    admin as unknown as Parameters<typeof fireUserSalesEarnTriggerOnDelivery>[0],
    [t.fid],
  );
  assertEq(`${t.coid} → inserted=1`, res.inserted, 1);
  assertEq(`${t.coid} → useridmain = ${t.coid}`,
    (admin.inserts[0]?.rows[0] as Record<string, unknown>)?.useridmain,
    t.coid);
  assertEq(`${t.coid} → idf = ${t.fid}`,
    (admin.inserts[0]?.rows[0] as Record<string, unknown>)?.idf,
    t.fid);
}

// ════════════════════════════════════════════════════════════════
// G. Mixed batch — 1 VIP + 1 non-VIP + 1 already-earned + 1 null userid
// ════════════════════════════════════════════════════════════════

section("G. Mixed batch — accrues only the truly eligible row");

{
  const admin = buildFakeAdmin({
    tb_forwarder: [
      { id: 70001, userid: "PR888",  fdatestatus7: "2026-05-30T10:00:00Z" }, // THADA.VIP · new — INSERT
      { id: 70002, userid: "PR9999", fdatestatus7: "2026-05-30T10:00:00Z" }, // PCS · skip
      { id: 70003, userid: "PR352",  fdatestatus7: "2026-05-30T10:00:00Z" }, // SIN.VIP · already-earned · skip
      { id: 70004, userid: null,     fdatestatus7: "2026-05-30T10:00:00Z" }, // null userid · skip
    ],
    tb_users: [
      { userid: "PR888",  coid: "THADA.VIP" },
      { userid: "PR9999", coid: "PCS" },
      { userid: "PR352",  coid: "SIN.VIP" },
    ],
    tb_user_sales: [{ idf: 70003 }],
  });
  const res = await fireUserSalesEarnTriggerOnDelivery(
    admin as unknown as Parameters<typeof fireUserSalesEarnTriggerOnDelivery>[0],
    [70001, 70002, 70003, 70004],
  );
  assertEq("mixed → inserted=1 (only 70001)", res.inserted, 1);
  assertEq("mixed → skipped=3 (70002 + 70003 + 70004)", res.skipped, 3);
  assertEq("mixed → ONE insert call", admin.inserts.length, 1);
  assertEq("mixed → ONE row inserted", admin.inserts[0]?.rows.length, 1);
  assertEq("mixed → inserted row idf=70001",
    (admin.inserts[0]?.rows[0] as Record<string, unknown>)?.idf,
    70001);
}

// ════════════════════════════════════════════════════════════════
// H. Date fallback — null fdatestatus7 → fall back to NOW (valid ISO)
// ════════════════════════════════════════════════════════════════

section("H. Date fallback — null fdatestatus7 → NOW iso");

{
  const admin = buildFakeAdmin({
    tb_forwarder: [{ id: 80001, userid: "PR888", fdatestatus7: null }],
    tb_users:     [{ userid: "PR888", coid: "THADA.VIP" }],
    tb_user_sales: [],
  });
  const before = Date.now();
  const res = await fireUserSalesEarnTriggerOnDelivery(
    admin as unknown as Parameters<typeof fireUserSalesEarnTriggerOnDelivery>[0],
    [80001],
  );
  const after = Date.now();
  assertEq("null fdatestatus7 → still inserts", res.inserted, 1);
  const row = admin.inserts[0]?.rows[0] as Record<string, unknown>;
  const dateStr = row?.date as string;
  assertTrue("date is a non-empty string", typeof dateStr === "string" && dateStr.length > 0);
  assertTrue("date parses as a valid ISO", !Number.isNaN(new Date(dateStr).getTime()));
  const t = new Date(dateStr).getTime();
  assertTrue("date is within [before, after] window (= NOW fallback)", t >= before && t <= after);
}

// ════════════════════════════════════════════════════════════════
// I. De-dup input — passing same id twice → ONE row in the eventual INSERT
// ════════════════════════════════════════════════════════════════

section("I. De-dup input — duplicate ids → single insert row");

{
  const admin = buildFakeAdmin({
    tb_forwarder: [{ id: 90001, userid: "PR888", fdatestatus7: "2026-05-30T10:00:00Z" }],
    tb_users:     [{ userid: "PR888", coid: "THADA.VIP" }],
    tb_user_sales: [],
  });
  const res = await fireUserSalesEarnTriggerOnDelivery(
    admin as unknown as Parameters<typeof fireUserSalesEarnTriggerOnDelivery>[0],
    [90001, 90001, 90001], // intentionally duplicated
  );
  assertEq("dedup → inserted=1", res.inserted, 1);
  assertEq("dedup → ONE row in the insert call", admin.inserts[0]?.rows.length, 1);
}

// ════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════

console.log(`\n=== ${pass} passed · ${fail} failed ===`);
if (fail > 0) {
  process.exit(1);
}

}

main().catch((err) => {
  console.error("test runner threw:", err);
  process.exit(1);
});
