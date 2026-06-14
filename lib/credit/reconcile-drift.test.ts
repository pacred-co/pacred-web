/**
 * Unit tests for the credit-AR drift predicate
 * (lib/credit/reconcile-drift.ts) — the core of the READ-ONLY
 * /api/cron/credit-reconcile scan (port of reset-credit-forwarder.php).
 *
 * Why these matter: a FALSE-CLEAN verdict hides a real AR mismatch (a
 * customer billed/shown a credit balance that no longer matches their open
 * orders); a FALSE-ALARM spams one incident per clean customer. So the
 * drift formula (Σ canonical per-row outstanding − stored), its 1-satang
 * EPSILON boundary, the missing-row⇒0 rule, the juristic-1% inclusion, and
 * the worst-first ranking are all asserted at the boundary.
 *
 * Run:  tsx lib/credit/reconcile-drift.test.ts   (wired into pnpm test:unit)
 */

import {
  computeCreditDrift,
  compareDriftWorstFirst,
  CREDIT_RECONCILE_EPSILON,
  type CreditOrderRow,
  type CreditOffender,
} from "./reconcile-drift";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// Force ESM module mode — keeps the shared `pass`/`fail` names from colliding
// with sibling .test.ts files in tsc's project graph (TS 2393/2451).
export {};

// A fCredit='1' order whose canonical outstanding = `total` baht, built from
// a single ftotalprice with everything else 0 (non-juristic by default).
const order = (total: number, juristic = false): CreditOrderRow => ({
  ftotalprice:           total,
  ftransportprice:       0,
  fpriceupdate:          0,
  fshippingservice:      0,
  pricecrate:            0,
  ftransportpricechnthb: 0,
  priceother:            0,
  fdiscount:             0,
  fusercompany:          juristic ? "1" : "",
});

console.log("=== computeCreditDrift — credit-AR drift predicate (Σ outstanding vs stored creditvalue) ===");

// ── (a) clean (no drift) ───────────────────────────────────────────────────
section("(a) clean → drifted=false");
assertEq("Σ matches stored exactly → no drift",
  computeCreditDrift([order(1000), order(500)], 1500),
  { expected: 1500, actual: 1500, delta: 0, orderCount: 2, drifted: false });
assertEq("no orders + no stored → expected 0, no drift",
  computeCreditDrift([], 0),
  { expected: 0, actual: 0, delta: 0, orderCount: 0, drifted: false });
assertEq("no orders + missing tb_credit row (null stored ⇒ 0) → no drift",
  computeCreditDrift([], null),
  { expected: 0, actual: 0, delta: 0, orderCount: 0, drifted: false });
assertEq("stored as PG string equal to Σ → no drift",
  computeCreditDrift([order(1234.56)], "1234.56"),
  { expected: 1234.56, actual: 1234.56, delta: 0, orderCount: 1, drifted: false });

// ── (b) the STALE case — stored>0 but zero open orders ──────────────────────
section("(b) stale stored balance (expected 0, actual>0) → drift");
assertEq("orders all settled (none fCredit='1') but creditvalue stuck → drift",
  computeCreditDrift([], 800),
  { expected: 0, actual: 800, delta: -800, orderCount: 0, drifted: true });

// ── (c) under-recorded AR — Σ > stored ──────────────────────────────────────
section("(c) under-recorded (Σ > stored) → positive delta");
assertEq("two open orders but stored too low → positive drift",
  computeCreditDrift([order(1000), order(500)], 900),
  { expected: 1500, actual: 900, delta: 600, orderCount: 2, drifted: true });
assertEq("open order but no tb_credit row at all (stored ⇒ 0) → full drift",
  computeCreditDrift([order(750)], null),
  { expected: 750, actual: 0, delta: 750, orderCount: 1, drifted: true });

// ── (d) EPSILON boundary — float noise is NOT a drift ───────────────────────
section("(d) EPSILON boundary (|delta| ≤ 0.01 = noise)");
assertEq("delta exactly at epsilon (0.01) → NOT drifted (boundary clean)",
  computeCreditDrift([order(1000)], 999.99).drifted, false);
assertEq("delta just past epsilon (0.02) → drifted",
  computeCreditDrift([order(1000)], 999.98).drifted, true);
assertEq("epsilon constant is 0.01", CREDIT_RECONCILE_EPSILON, 0.01);

// ── (e) the juristic 1% definitional difference vs legacy ───────────────────
section("(e) juristic 1% — canonical outstanding (Pacred) vs raw legacy SUM");
// A juristic ฿10,000 order → canonical outstanding = 10,000 − 1% = ฿9,900.
// Legacy reset-credit-forwarder.php would compute ฿10,000 (no 1%). We sum the
// CANONICAL value, so expected=9900. If tb_credit still holds the legacy
// ฿10,000 that is a real ~1% drift this cron correctly surfaces.
assertEq("juristic order → expected uses canonical (incl. 1% allowance)",
  computeCreditDrift([order(10_000, true)], 9900),
  { expected: 9900, actual: 9900, delta: 0, orderCount: 1, drifted: false });
assertEq("juristic order vs legacy-style stored ฿10,000 → ~1% drift surfaced",
  computeCreditDrift([order(10_000, true)], 10_000),
  { expected: 9900, actual: 10_000, delta: -100, orderCount: 1, drifted: true });

// ── (f) over-discounted order never goes negative (clamp at 0) ──────────────
section("(f) over-discounted order → outstanding clamps at 0");
const overDiscounted: CreditOrderRow = { ...order(100), fdiscount: 500 };
assertEq("order discounted below 0 contributes 0, not negative",
  computeCreditDrift([overDiscounted, order(300)], 300),
  { expected: 300, actual: 300, delta: 0, orderCount: 2, drifted: false });

// ── (g) worst-first comparator — largest |delta| first ──────────────────────
section("(g) compareDriftWorstFirst — largest absolute drift sorts first");
const off = (userid: string, delta: number): CreditOffender =>
  ({ userid, expected: 0, actual: 0, delta, orderCount: 0 });
{
  const sorted = [off("a", 50), off("b", -900), off("c", 300)].sort(compareDriftWorstFirst);
  assertEq("biggest |delta| (b:-900) first, then c:300, then a:50",
    sorted.map((o) => o.userid), ["b", "c", "a"]);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} credit reconcile-drift: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
