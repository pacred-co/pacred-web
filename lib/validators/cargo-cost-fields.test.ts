/**
 * Unit tests for the range-guarded CARGO cost/declared field schemas
 * (lib/validators/cargo-cost-fields.ts).
 *
 * Run with:  tsx lib/validators/cargo-cost-fields.test.ts
 *            (or `pnpm test:unit` for the whole suite)
 * Exits non-zero on any failure — matches the repo's tsx harness.
 *
 * The load-bearing checks:
 *   - RATE fields reject a fat-finger that the old generic ฿100M cap let through
 *     (the silent mis-valuation of declared_value_thb = amount × rate).
 *   - int32-overflow garbage is rejected with the explicit Thai message.
 *   - every legitimate AUTO-FILL output (GAP 1 seeds) still PASSES the guard —
 *     the guard must never reject a value the editor itself computed.
 */

import {
  cargoCostAmount,
  cargoDeclaredThb,
  cargoDeclaredCcy,
  cargoCnyRate,
  cargoCustomsFx,
  cargoDutyPct,
  nullableShortText,
  MAX_CARGO_AMOUNT,
  MAX_CARGO_CCY_AMOUNT,
  MAX_CNY_COST_RATE,
  MAX_CUSTOMS_FX_RATE,
} from "./cargo-cost-fields";
import {
  shopAutoDeclaredThb,
  importAutoDeclaredThb,
} from "../forwarder/cargo-cost-autofill";

let pass = 0;
let fail = 0;

function ok(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}`);
  }
}

/** Assert a schema parses `input` to exactly `expected`. */
function parsesTo(schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }, label: string, input: unknown, expected: unknown) {
  const r = schema.safeParse(input);
  ok(`${label} → ${JSON.stringify(expected)}`, r.success === true && r.data === expected);
}

/** Assert a schema REJECTS `input`. Optionally that the message contains `msgPart`. */
function rejects(
  schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } },
  label: string,
  input: unknown,
  msgPart?: string,
) {
  const r = schema.safeParse(input);
  const rejected = r.success === false;
  const msgOk = !msgPart || (r.success === false && (r.error?.issues?.[0]?.message ?? "").includes(msgPart));
  ok(`${label} rejected${msgPart ? ` (msg ~ "${msgPart}")` : ""}`, rejected && msgOk);
}

console.log("cargo-cost-fields: empty/clear → null");
parsesTo(cargoCostAmount, "amount ''", "", null);
parsesTo(cargoCostAmount, "amount undefined", undefined, null);
parsesTo(cargoCostAmount, "amount null", null, null);
parsesTo(cargoCnyRate, "rate ''", "", null);
parsesTo(cargoCustomsFx, "fx ''", "", null);
parsesTo(nullableShortText, "hs ''", "", null);

console.log("cargo-cost-fields: valid values pass (incl. PG-string coercion)");
parsesTo(cargoCostAmount, "amount '12500.50'", "12500.50", 12500.5);
parsesTo(cargoCostAmount, "amount 0", 0, 0);
parsesTo(cargoCnyRate, "cny rate 5.1", 5.1, 5.1);
parsesTo(cargoCnyRate, "cny rate '4.85'", "4.85", 4.85);
parsesTo(cargoCustomsFx, "customs fx 36.5 (USD)", 36.5, 36.5);
parsesTo(cargoCustomsFx, "customs fx 5.1 (CNY)", 5.1, 5.1);
parsesTo(cargoDutyPct, "duty 7%", 7, 7);
parsesTo(nullableShortText, "hs '8471.30.20'", "8471.30.20", "8471.30.20");

console.log("cargo-cost-fields: the rate hole the old ฿100M cap let through is now closed");
rejects(cargoCnyRate, "cny rate 500 (5→500 fat-finger)", 500);
rejects(cargoCnyRate, "cny rate 5000", 5000);
rejects(cargoCustomsFx, "customs fx 5000 (37→absurd)", 5000);
// The old generic schema (max 99,999,999) would have ACCEPTED all three above.
ok("MAX_CNY_COST_RATE is a tight rate bound, not ฿100M", MAX_CNY_COST_RATE === 100);
ok("MAX_CUSTOMS_FX_RATE is a tight rate bound, not ฿100M", MAX_CUSTOMS_FX_RATE === 1000);

console.log("cargo-cost-fields: negatives + int32-overflow garbage rejected");
rejects(cargoCostAmount, "amount -5", -5);
rejects(cargoCnyRate, "rate -1", -1);
rejects(cargoCostAmount, "amount int32 garbage -2146826265", -2146826265, "overflow");
rejects(cargoCustomsFx, "fx int32 garbage", -2146826265, "overflow");

console.log("cargo-cost-fields: amount ceiling enforced");
parsesTo(cargoCostAmount, "amount at ceiling", MAX_CARGO_AMOUNT, MAX_CARGO_AMOUNT);
rejects(cargoCostAmount, "amount over ceiling (1e12)", 1_000_000_000_000);
rejects(cargoDutyPct, "duty 150% over 100", 150);

console.log("cargo-cost-fields: foreign-currency declared AMOUNT allows weak-ccy magnitudes (THB stays capped)");
// ฿1M declared in IDR (≈0.0023 THB/IDR) ≈ 434M IDR — must NOT be rejected by the
// THB-sized 100M cap. The declared-ccy field gets the wider numeric(16,4) ceiling.
parsesTo(cargoDeclaredCcy, "declared 434,000,000 IDR", 434_000_000, 434_000_000);
parsesTo(cargoDeclaredCcy, "declared 125,000,000 JPY", 125_000_000, 125_000_000);
ok("MAX_CARGO_CCY_AMOUNT is column-sized (~1e12), not the THB cap", MAX_CARGO_CCY_AMOUNT === 999_999_999_999);
rejects(cargoDeclaredCcy, "declared ccy over column ceiling (1e13)", 10_000_000_000_000);
// The THB side keeps the tight ฿100M cap (a single ใบขน declared-THB over ฿100M is implausible).
rejects(cargoDeclaredThb, "declared THB over ฿100M", 200_000_000);
parsesTo(cargoDeclaredThb, "declared THB ฿5M ok", 5_000_000, 5_000_000);

console.log("cargo-cost-fields: every legitimate AUTO-FILL output passes the guard");
// GAP 1 seeds — representative magnitudes the editor itself computes. None may trip.
const autoCases: { label: string; v: number }[] = [
  { label: "shop declared ¥120 × 5.1 × 3", v: shopAutoDeclaredThb(120, 5.1, 3) },
  { label: "shop declared ¥9999 × 5.5 × 50", v: shopAutoDeclaredThb(9999, 5.5, 50) },
  { label: "import declared 250000 × 4/10", v: importAutoDeclaredThb(250000, 4, 10) },
  { label: "import declared 1.5M × 1/3", v: importAutoDeclaredThb(1_500_000, 1, 3) },
];
for (const c of autoCases) {
  const r = cargoDeclaredThb.safeParse(c.v);
  ok(`autofill declared passes guard: ${c.label} = ${c.v}`, r.success === true && r.data === c.v);
}
// A real cost yuan-rate (≈5) and customs FX (≈37) always pass.
ok("autofill cost rate 4.95 passes", cargoCnyRate.safeParse(4.95).success === true);
ok("autofill customs USD rate 36.75 passes", cargoCustomsFx.safeParse(36.75).success === true);

console.log(`\ncargo-cost-fields: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
