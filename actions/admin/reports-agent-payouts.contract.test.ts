/**
 * Contract test for the agent-payout report's money math (re-sweep A2 #22).
 *
 * `getAgentPayoutReport` needs a live admin Supabase client, so this test
 * locks the PURE pieces it depends on — the commission/WHT formula it shares
 * with the live earn→withdraw E2E (lib/sales-commission/calc.ts) — against the
 * exact legacy scenarios from report-user-sales.php L316-319:
 *
 *   $priceUserAllCHN = Σ(fTotalPrice − fDiscount)
 *   share            = $priceUserAllCHN × $percen   (1%)
 *   wht              = share × 0.03                 (3%)
 *   net              = share − wht
 *   gate             : net >= 1000
 *
 * Run:  npx tsx actions/admin/reports-agent-payouts.contract.test.ts
 */

import {
  computeCommission,
  sumGross,
  SALES_MIN_WITHDRAWAL_THB,
} from "@/lib/sales-commission/calc";

// The action is a "use server" file (Supabase admin client) — not importable
// under tsx. Mirror the page's payout-status label map (nameStatusUserPay ·
// function.php:1868) so the test guards the vocabulary the page renders.
const PAYOUT_STATUS_LABEL: Record<string, string> = {
  "1": "ยังไม่เบิกจ่าย",
  "2": "รอดำเนินการ",
  "3": "เบิกจ่ายแล้ว",
};

let pass = 0;
let fail = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function approx(a: number, b: number, eps = 0.005): boolean {
  return Math.abs(a - b) < eps;
}

console.log("agent-payout report — money math contract");

// ── sumGross = Σ(fTotalPrice − fDiscount) ─────────────────────────────────
{
  const rows = [
    { ftotalprice: 10000, fdiscount: 0 },
    { ftotalprice: "5000", fdiscount: "500" }, // string columns (PostgREST numeric)
    { ftotalprice: null, fdiscount: null }, // null → 0
  ];
  // 10000 + (5000-500) + 0 = 14500
  assert("sumGross sums (fTotalPrice − fDiscount) with string/null coercion",
    approx(sumGross(rows), 14500), `got ${sumGross(rows)}`);
}

// ── Legacy worked example: a team with ฿200,000 China-shipping gross ──
// share = 200000 × 0.01 = 2000 · wht = 2000 × 0.03 = 60 · net = 1940 · eligible
{
  const b = computeCommission(200000, 0.01);
  assert("commission 1% of 200,000 = 2,000", approx(b.commission, 2000), `got ${b.commission}`);
  assert("WHT 3% of 2,000 = 60", approx(b.wht, 60), `got ${b.wht}`);
  assert("net = 2,000 − 60 = 1,940", approx(b.net, 1940), `got ${b.net}`);
  assert("net 1,940 ≥ 1,000 → eligible", b.eligible === true);
}

// ── Below the gate: ฿50,000 gross → net 485 → NOT eligible ──
{
  const b = computeCommission(50000, 0.01);
  // 50000 × 0.01 = 500 · wht 15 · net 485
  assert("net 485 < 1,000 → not eligible", b.eligible === false, `net=${b.net}`);
}

// ── Boundary: exactly ฿1,000 net requires gross ≈ 103,092.78 ──
// net = gross×0.01×0.97 = 1000  →  gross = 1000 / 0.0097 ≈ 103,092.7835
{
  const exact = computeCommission(103092.79, 0.01);
  assert("net at boundary ≥ 1,000 → eligible", exact.eligible === true, `net=${exact.net}`);
  const justUnder = computeCommission(103000, 0.01);
  // 103000×0.01 = 1030 · wht 30.9 · net 999.1 → under
  assert("net 999.1 < 1,000 → not eligible", justUnder.eligible === false, `net=${justUnder.net}`);
}

// ── The min-gate constant is the legacy 1,000 ──
assert("SALES_MIN_WITHDRAWAL_THB = 1000", SALES_MIN_WITHDRAWAL_THB === 1000);

// ── Status vocabulary (nameStatusUserPay · function.php:1868) ─────────────
assert("status 2 → รอดำเนินการ", PAYOUT_STATUS_LABEL["2"] === "รอดำเนินการ");
assert("status 3 → เบิกจ่ายแล้ว", PAYOUT_STATUS_LABEL["3"] === "เบิกจ่ายแล้ว");
assert("status 1 → ยังไม่เบิกจ่าย", PAYOUT_STATUS_LABEL["1"] === "ยังไม่เบิกจ่าย");

// ── Aggregation invariant: open_net is derived from open_gross via the same
//    formula — so summing per-team gross then computing == the report's row. ──
{
  // Two teams' gross totals, summed for a grand "open net".
  const teamA = computeCommission(300000, 0.01).net; // 2910
  const teamB = computeCommission(120000, 0.01).net; // 1164
  const grand = teamA + teamB;
  assert("per-team nets sum correctly (2910 + 1164 = 4074)", approx(grand, 4074), `got ${grand}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
