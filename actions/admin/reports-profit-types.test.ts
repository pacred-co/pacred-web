/**
 * Tests for forwarderRowProfit + marginPct (audit SF-4) — the canonical
 * per-forwarder-row money derivation shared by the full profit report and the
 * exec cockpit. Locks: revenue = ftotalprice ONLY (no ftransport/fpriceupdate
 * double-count), precomputed-profit-wins fallback, safe margin %.
 *
 * Run: npx tsx actions/admin/reports-profit-types.test.ts
 */

import { forwarderRowProfit, marginPct, type ForwarderProfitCols } from "./reports-profit-types";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}
const r = (o: Partial<ForwarderProfitCols>): ForwarderProfitCols => ({
  ftotalprice: null, fcosttotalprice: null, fdiscount: null, fprofittotal: null, ...o,
});

console.log("reports-profit-types: forwarderRowProfit + marginPct (SF-4)");

// ── revenue = ftotalprice ONLY ──
eq("revenue = ftotalprice", forwarderRowProfit(r({ ftotalprice: 10000 })).revenue, 10000);

// ── precomputed fprofittotal wins when non-zero ──
eq("precomputed profit wins",
   forwarderRowProfit(r({ ftotalprice: 10000, fcosttotalprice: 7000, fdiscount: 500, fprofittotal: 2500 })).profit,
   2500);

// ── fallback: revenue − discount − cost when fprofittotal = 0 ──
eq("fallback profit = revenue − discount − cost",
   forwarderRowProfit(r({ ftotalprice: 10000, fcosttotalprice: 7000, fdiscount: 500, fprofittotal: 0 })).profit,
   10000 - 500 - 7000);

// ── negative precomputed profit is RESPECTED (!== 0, not > 0) ──
eq("negative precomputed profit respected (loss-making order)",
   forwarderRowProfit(r({ ftotalprice: 10000, fcosttotalprice: 12000, fprofittotal: -2000 })).profit,
   -2000);

// ── string-typed numerics (Postgres numeric → string) coerce ──
eq("string numerics coerce",
   forwarderRowProfit(r({ ftotalprice: "8000", fcosttotalprice: "5000", fdiscount: "0", fprofittotal: "0" })).profit,
   3000);

// ── all-null → zeros (no NaN) ──
eq("all-null → revenue 0", forwarderRowProfit(r({})).revenue, 0);
eq("all-null → profit 0 (no NaN)", forwarderRowProfit(r({})).profit, 0);

// ── cost echoed ──
eq("cost = fcosttotalprice", forwarderRowProfit(r({ fcosttotalprice: 7000 })).cost, 7000);

// ── marginPct ──
eq("marginPct 25/100 = 25", marginPct(25, 100), 25);
eq("marginPct 0 revenue → 0 (no divide-by-zero)", marginPct(50, 0), 0);
eq("marginPct negative profit → negative %", marginPct(-20, 100), -20);

console.log(`\n${fail === 0 ? "✅" : "❌"} reports-profit-types: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
