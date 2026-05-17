/**
 * Unit tests for computeContainerMargin (U2-2).
 *
 * Locks the math: revenue = sum(forwarders.total_price by DISTINCT
 * forwarder_f_no), cost = sum(container_disbursements.amount_thb),
 * margin = revenue − cost, margin_pct = margin/revenue (null when 0).
 *
 * Mocks the Supabase chain {from().select().eq().in().not()...} surface
 * the helper actually uses — no DB roundtrip.
 *
 * Pattern matches lib/wallet/balance.test.ts (pass/fail counts, no vitest).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeContainerMargin } from "./container-margin";

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

type RowSet = {
  shipments:      Array<{ forwarder_f_no: string | null }>;
  forwarders:     Array<{ total_price: number | string | null }>;
  disbursements:  Array<{ amount_thb: number | string }>;
  shipmentsErr?: { message: string };
  forwardersErr?: { message: string };
  disbursementsErr?: { message: string };
};

/** Tiny mock of the chainable Supabase client surface this helper touches. */
function mockClient(rows: RowSet): SupabaseClient {
  return {
    from(table: string) {
      if (table === "cargo_shipments") {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                returns: async () => ({
                  data: rows.shipmentsErr ? null : rows.shipments,
                  error: rows.shipmentsErr ?? null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "forwarders") {
        return {
          select: () => ({
            in: () => ({
              returns: async () => ({
                data: rows.forwardersErr ? null : rows.forwarders,
                error: rows.forwardersErr ?? null,
              }),
            }),
          }),
        };
      }
      if (table === "container_disbursements") {
        return {
          select: () => ({
            eq: () => ({
              returns: async () => ({
                data: rows.disbursementsErr ? null : rows.disbursements,
                error: rows.disbursementsErr ?? null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table in mock: ${table}`);
    },
  } as unknown as SupabaseClient;
}

// All cases run inside main() — tsx transforms a .test.ts as CJS, which
// rejects top-level await; an async wrapper is the repo test convention.
async function main() {
// ────────────────────────────────────────────────────────────
section("empty container");
// ────────────────────────────────────────────────────────────

{
  const res = await computeContainerMargin(
    mockClient({ shipments: [], forwarders: [], disbursements: [] }),
    "cnt-1",
  );
  assertEq("ok=true", res.ok, true);
  if (res.ok) {
    assertEq("revenue=0",      res.data.total_revenue_thb, 0);
    assertEq("cost=0",         res.data.total_cost_thb,    0);
    assertEq("margin=0",       res.data.margin_thb,        0);
    assertEq("margin_pct=null (no revenue)", res.data.margin_pct, null);
    assertEq("forwarder_count=0", res.data.details.revenue.forwarder_count, 0);
    assertEq("disbursement_count=0", res.data.details.cost.disbursement_count, 0);
  }
}

// ────────────────────────────────────────────────────────────
section("revenue side — DISTINCT forwarders");
// ────────────────────────────────────────────────────────────

{
  // Two shipments from forwarder F001 + one from F002 → 2 distinct
  // forwarders, each with one price row.
  const res = await computeContainerMargin(
    mockClient({
      shipments: [
        { forwarder_f_no: "F001" },
        { forwarder_f_no: "F001" },  // same forwarder — must not double-count
        { forwarder_f_no: "F002" },
        { forwarder_f_no: null  },   // standalone shipment, skipped
      ],
      forwarders: [
        { total_price: 1500 },
        { total_price: 800  },
      ],
      disbursements: [],
    }),
    "cnt-2",
  );
  assertEq("ok=true", res.ok, true);
  if (res.ok) {
    assertEq("revenue = 1500 + 800",  res.data.total_revenue_thb, 2300);
    assertEq("forwarder_count=2 distinct", res.data.details.revenue.forwarder_count, 2);
  }
}

// ────────────────────────────────────────────────────────────
section("cost side — sum of disbursements");
// ────────────────────────────────────────────────────────────

{
  const res = await computeContainerMargin(
    mockClient({
      shipments: [],
      forwarders: [],
      disbursements: [
        { amount_thb: 5000  },   // freight
        { amount_thb: 850.5 },   // customs duty
        { amount_thb: 200   },   // handling
      ],
    }),
    "cnt-3",
  );
  assertEq("ok=true", res.ok, true);
  if (res.ok) {
    assertEq("cost = 5000 + 850.5 + 200", res.data.total_cost_thb, 6050.5);
    assertEq("disbursement_count=3", res.data.details.cost.disbursement_count, 3);
  }
}

// ────────────────────────────────────────────────────────────
section("margin math — positive / negative / pct");
// ────────────────────────────────────────────────────────────

{
  const res = await computeContainerMargin(
    mockClient({
      shipments:    [{ forwarder_f_no: "F100" }],
      forwarders:   [{ total_price: 10000 }],
      disbursements:[{ amount_thb: 7500 }],
    }),
    "cnt-pos",
  );
  if (res.ok) {
    assertEq("revenue=10000", res.data.total_revenue_thb, 10000);
    assertEq("cost=7500",     res.data.total_cost_thb,    7500);
    assertEq("margin=2500",   res.data.margin_thb,        2500);
    assertEq("margin_pct=25", res.data.margin_pct,        25);
  }
}
{
  // Billed below cost — margin is negative, pct stays computed.
  const res = await computeContainerMargin(
    mockClient({
      shipments:    [{ forwarder_f_no: "F100" }],
      forwarders:   [{ total_price: 1000 }],
      disbursements:[{ amount_thb: 1500 }],
    }),
    "cnt-neg",
  );
  if (res.ok) {
    assertEq("margin_thb=-500",  res.data.margin_thb,  -500);
    assertEq("margin_pct=-50",   res.data.margin_pct,  -50);
  }
}

// ────────────────────────────────────────────────────────────
section("numeric robustness — string numerics + float drift");
// ────────────────────────────────────────────────────────────

{
  const res = await computeContainerMargin(
    mockClient({
      shipments:    [{ forwarder_f_no: "F100" }],
      forwarders:   [{ total_price: "1000.50" }],   // PostgREST numeric string
      disbursements:[
        { amount_thb: "0.10" },
        { amount_thb: "0.20" },
      ],
    }),
    "cnt-floats",
  );
  if (res.ok) {
    assertEq("string numerics parsed",       res.data.total_revenue_thb, 1000.5);
    assertEq("float drift rounded to 2dp",   res.data.total_cost_thb,    0.3);
    assertEq("margin = 1000.5 - 0.3",        res.data.margin_thb,        1000.2);
  }
}

// ────────────────────────────────────────────────────────────
section("error propagation");
// ────────────────────────────────────────────────────────────

{
  const res = await computeContainerMargin(
    mockClient({
      shipments: [], forwarders: [], disbursements: [],
      shipmentsErr: { message: "permission denied" },
    }),
    "cnt-err",
  );
  assertEq("ok=false on shipments error", res.ok, false);
  if (!res.ok) {
    assertEq("error includes table prefix", res.error.startsWith("cargo_shipments: "), true);
  }
}
{
  const res = await computeContainerMargin(
    mockClient({
      shipments:    [{ forwarder_f_no: "F100" }],
      forwarders:   [],
      disbursements:[],
      forwardersErr: { message: "rls fail" },
    }),
    "cnt-err2",
  );
  assertEq("ok=false on forwarders error", res.ok, false);
}
{
  const res = await computeContainerMargin(
    mockClient({
      shipments: [], forwarders: [], disbursements: [],
      disbursementsErr: { message: "table missing" },
    }),
    "cnt-err3",
  );
  assertEq("ok=false on disbursements error", res.ok, false);
}

}
// ────────────────────────────────────────────────────────────
main()
  .then(() => {
    console.log(`\n  ${pass} pass · ${fail} fail`);
    if (fail > 0) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
