/**
 * Unit tests for lib/freight-commission/calc-v2.ts — the FREIGHT staff-commission
 * math (AX JOB: freight 1% · customs 5% · doc 5% − 3% WHT · flat 20฿/shipment;
 * withdrawal WHT 15% on > 5,000฿ per Revenue Code §50(1)). Pure, no IO.
 *
 * Run:  pnpm tsx lib/freight-commission/calc-v2.test.ts   (wired into pnpm test:unit)
 */

import {
  computeFreightCommission,
  computeFreightWithdrawalNumbers,
  round2,
  FREIGHT_WITHDRAWAL_WHT_RATE_PCT,
  FREIGHT_WITHDRAWAL_WHT_THRESHOLD_THB,
  type FreightCommissionTier,
} from "./calc-v2";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// ── The seeded AX-JOB tiers (mig 0167), here owner-confirmed for the math tests ──
const tiersConfirmed: FreightCommissionTier[] = [
  { service_kind: "freight_quote",   rate_pct: 1, flat_thb: null, wht_pct: 3, is_owner_confirmed: true },
  { service_kind: "freight_customs", rate_pct: 5, flat_thb: null, wht_pct: 3, is_owner_confirmed: true },
  { service_kind: "freight_doc",     rate_pct: 5, flat_thb: null, wht_pct: 3, is_owner_confirmed: true },
  { service_kind: "freight_flat",    rate_pct: null, flat_thb: 20, wht_pct: 0, is_owner_confirmed: true },
];

// ── constants ──
section("constants");
assertEq("withdrawal WHT rate = 15%", FREIGHT_WITHDRAWAL_WHT_RATE_PCT, 15);
assertEq("withdrawal WHT threshold = 5,000", FREIGHT_WITHDRAWAL_WHT_THRESHOLD_THB, 5000);

// ── round2 ──
section("round2");
assertEq("round2 NaN → 0", round2(NaN), 0);
assertEq("round2 1.005 → 1.01", round2(1.005), 1.01);
assertEq("round2 123.456 → 123.46", round2(123.456), 123.46);

// ── computeFreightCommission — per-scope split + 3% WHT ──
section("computeFreightCommission");
{
  // freight 100,000 @ 1% = 1000 gross · wht 30 · net 970
  const r = computeFreightCommission({ tiers: tiersConfirmed, bases: { freightThb: 100000 } });
  assertEq("freight 100k @1% → gross 1000 / wht 30 / net 970",
    { gross: r.gross_thb, wht: r.wht_thb, net: r.net_thb, lines: r.lines.length },
    { gross: 1000, wht: 30, net: 970, lines: 1 });
}
{
  // customs 50,000 @ 5% = 2500 · wht 75 · net 2425
  const r = computeFreightCommission({ tiers: tiersConfirmed, bases: { customsThb: 50000 } });
  assertEq("customs 50k @5% → gross 2500 / wht 75 / net 2425",
    { gross: r.gross_thb, wht: r.wht_thb, net: r.net_thb },
    { gross: 2500, wht: 75, net: 2425 });
}
{
  // doc 20,000 @ 5% = 1000 · wht 30 · net 970
  const r = computeFreightCommission({ tiers: tiersConfirmed, bases: { docThb: 20000 } });
  assertEq("doc 20k @5% → gross 1000 / wht 30 / net 970",
    { gross: r.gross_thb, wht: r.wht_thb, net: r.net_thb },
    { gross: 1000, wht: 30, net: 970 });
}
{
  // flat 20฿ × 3 shipments = 60 gross · wht 0 (flat tier wht_pct=0) · net 60
  const r = computeFreightCommission({ tiers: tiersConfirmed, bases: { shipmentCount: 3 } });
  assertEq("flat 20฿ × 3 → gross 60 / wht 0 / net 60",
    { gross: r.gross_thb, wht: r.wht_thb, net: r.net_thb },
    { gross: 60, wht: 0, net: 60 });
}
{
  // combined freight+customs+doc — gross 1000+2500+1000=4500 · wht 30+75+30=135 · net 4365
  const r = computeFreightCommission({
    tiers: tiersConfirmed,
    bases: { freightThb: 100000, customsThb: 50000, docThb: 20000 },
  });
  assertEq("combined 3 lines → gross 4500 / wht 135 / net 4365 / 3 lines / base 170000",
    { gross: r.gross_thb, wht: r.wht_thb, net: r.net_thb, lines: r.lines.length, base: r.base_thb },
    { gross: 4500, wht: 135, net: 4365, lines: 3, base: 170000 });
}
{
  // blended WHT % — all lines at 3% → blended 3%
  const r = computeFreightCommission({
    tiers: tiersConfirmed,
    bases: { freightThb: 100000, customsThb: 50000 },
  });
  assertEq("blended WHT% = 3 when every line is 3%", r.blended_wht_pct, 3);
}
{
  // zero base scopes contribute nothing → empty result
  const r = computeFreightCommission({ tiers: tiersConfirmed, bases: {} });
  assertEq("no bases → empty / all zero",
    { gross: r.gross_thb, wht: r.wht_thb, net: r.net_thb, lines: r.lines.length },
    { gross: 0, wht: 0, net: 0, lines: 0 });
}
{
  // pending-owner-confirm flag propagates from an unconfirmed tier
  const unconfirmed: FreightCommissionTier[] = [
    { service_kind: "freight_quote", rate_pct: 1, flat_thb: null, wht_pct: 3, is_owner_confirmed: false },
  ];
  const r = computeFreightCommission({ tiers: unconfirmed, bases: { freightThb: 100000 } });
  assertEq("unconfirmed tier → any_pending_owner_confirm true + line flagged",
    { any: r.any_pending_owner_confirm, linePending: r.lines[0]?.pending_owner_confirm },
    { any: true, linePending: true });
}
{
  // a scope with no matching tier is silently skipped (no crash)
  const onlyFreight: FreightCommissionTier[] = [
    { service_kind: "freight_quote", rate_pct: 1, flat_thb: null, wht_pct: 3, is_owner_confirmed: true },
  ];
  const r = computeFreightCommission({ tiers: onlyFreight, bases: { customsThb: 50000, docThb: 20000 } });
  assertEq("bases with no matching tier → 0 lines", r.lines.length, 0);
}
{
  // rounding: freight 12,345.67 @ 1% = 123.4567 → 123.46 gross · wht 3.7038→3.7 · net 119.76
  const r = computeFreightCommission({ tiers: tiersConfirmed, bases: { freightThb: 12345.67 } });
  assertEq("rounds each money figure to 2dp",
    { gross: r.gross_thb, wht: r.wht_thb, net: r.net_thb },
    { gross: 123.46, wht: 3.7, net: 119.76 });
}

// ── computeFreightWithdrawalNumbers — WHT 15% on > 5,000 (§50(1)) ──
section("computeFreightWithdrawalNumbers");
assertEq("gross 4,000 (≤5k) → no WHT / net 4000",
  computeFreightWithdrawalNumbers({ gross_thb: 4000 }),
  { wht_thb: 0, net_thb: 4000, wht_rate_pct: 15 });
assertEq("gross 5,000 (boundary, not >5k) → no WHT",
  computeFreightWithdrawalNumbers({ gross_thb: 5000 }),
  { wht_thb: 0, net_thb: 5000, wht_rate_pct: 15 });
assertEq("gross 10,000 (>5k) → WHT 1500 / net 8500",
  computeFreightWithdrawalNumbers({ gross_thb: 10000 }),
  { wht_thb: 1500, net_thb: 8500, wht_rate_pct: 15 });
assertEq("gross 8,000 @ override 0% → no WHT (taxable elsewhere)",
  computeFreightWithdrawalNumbers({ gross_thb: 8000, wht_rate_pct: 0 }),
  { wht_thb: 0, net_thb: 8000, wht_rate_pct: 0 });
assertEq("gross 6,000 @ override 3% → WHT 180 / net 5820",
  computeFreightWithdrawalNumbers({ gross_thb: 6000, wht_rate_pct: 3 }),
  { wht_thb: 180, net_thb: 5820, wht_rate_pct: 3 });
assertEq("gross 12,345.67 (>5k) → WHT 1851.85 / net 10493.82",
  computeFreightWithdrawalNumbers({ gross_thb: 12345.67 }),
  { wht_thb: 1851.85, net_thb: 10493.82, wht_rate_pct: 15 });

console.log(`\n${fail === 0 ? "✅" : "❌"} freight-commission/calc-v2: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
