/**
 * usd-order-pricing.test.ts — locks the money for a foreign-currency
 * ฝากสั่งซื้อ (owner P22353): USD price/piece + บาท/USD rate ⇄ ¥-equivalent,
 * with the ¥ staying the source of truth and the ฿ total = USD × บาท/USD.
 *
 * Run: tsx lib/forwarder/usd-order-pricing.test.ts
 */
import assert from "node:assert";
import {
  deriveYuanPerUnit,
  foreignToYuan,
  yuanToForeign,
  effRateFromForeignRate,
} from "./usd-order-pricing";

let pass = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

// Editor's roundUp2 (CEIL to 2dp) — mirror it here so the netThb assertions
// exercise the SAME accumulation the live calc uses.
function roundUp2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const eps = 1e-9 * Math.max(1, Math.abs(v * 100));
  const r = Math.ceil(v * 100 - eps) / 100;
  return r === 0 ? 0 : r;
}

console.log("usd-order-pricing.test.ts");

// ── P22353 round-trip: USD 544 ⇄ ¥3683.40 ──────────────────────────────
t("deriveYuanPerUnit(3683.40, 544) ≈ 6.7710 ¥/USD", () => {
  const r = deriveYuanPerUnit(3683.4, 544)!;
  assert.ok(Math.abs(r - 6.771) < 0.0005, `got ${r}`);
});
t("USD 544 → cprice ¥3683.40 (foreignToYuan round-trips exactly)", () => {
  const ratio = deriveYuanPerUnit(3683.4, 544)!;
  assert.strictEqual(foreignToYuan(544, ratio), 3683.4);
});
t("¥3683.40 → USD 544 default (yuanToForeign round-trips)", () => {
  const ratio = deriveYuanPerUnit(3683.4, 544)!;
  assert.strictEqual(yuanToForeign(3683.4, ratio), 544);
});

// ── effRate default collapses back to hRate (byte-identical money) ──────
t("default บาท/USD → effRate === hRate (5.10)", () => {
  const hRate = 5.1;
  const ratio = deriveYuanPerUnit(3683.4, 544)!;         // ¥/USD
  const bahtPerUnit = (3683.4 * hRate) / 544;            // the DEFAULT บาท/USD (≈34.53)
  assert.ok(Math.abs(bahtPerUnit - 34.53) < 0.01, `bahtPerUnit ${bahtPerUnit}`);
  const eff = effRateFromForeignRate(bahtPerUnit, ratio);
  assert.ok(Math.abs(eff - hRate) < 1e-9, `effRate ${eff}`);
});

// ── 2-line USD order: ฿ total = Σ USD × บาท/USD (≈37,605 · NOT 5,553) ────
// The bug: an operator types USD into the ¥ field → ¥ subtotal = 544+545 =
// 1089 → ×hRate 5.10 = ฿5,553.90 (5× short). The fix: the ¥ field holds the
// real 3683/3690, the USD input holds 544/545, and ฿ = USD × บาท/USD.
const HRATE = 5.1;
const line1 = { usd: 544 };
const line2 = { usd: 545 };
// Original ¥ per piece (what the order was actually opened at).
const ratioSeed = 3683.4 / 544;                          // 6.770955882…
const cprice1 = foreignToYuan(line1.usd, ratioSeed);     // 3683.40
const cprice2 = foreignToYuan(line2.usd, ratioSeed);     // 3690.17
// Order-level ratio + default rate, derived from the ORIGINAL rows.
const foreignSubtotal = line1.usd + line2.usd;           // 1089
const originalYuan = roundUp2(cprice1) + roundUp2(cprice2); // 7373.57
const yuanPerUnit = deriveYuanPerUnit(originalYuan, foreignSubtotal)!;
const bahtPerUnitDefault = (originalYuan * HRATE) / foreignSubtotal; // ≈34.5319

t("cprice2 = ¥3690.17 (545 × ratio)", () =>
  assert.strictEqual(cprice2, 3690.17));

t("฿ total (default rate) ≈ 37,605 · NOT the buggy 5,553.90", () => {
  const eff = effRateFromForeignRate(bahtPerUnitDefault, yuanPerUnit);
  // Live calc: sumChn (¥) is CEIL-accumulated, then ×effRate.
  const sumChn = roundUp2(roundUp2(0 + roundUp2(cprice1 * 1)) + roundUp2(cprice2 * 1));
  assert.strictEqual(sumChn, 7373.57);
  const netThb = roundUp2(sumChn * eff);
  assert.ok(Math.abs(netThb - 37605.21) < 0.02, `netThb ${netThb}`);
  assert.ok(Math.abs(netThb - 5553.9) > 1000, `should NOT be the ¥-field bug value`);
  // Invariant: ฿ ≈ Σ USD × บาท/USD.
  assert.ok(Math.abs(netThb - foreignSubtotal * bahtPerUnitDefault) < 0.05, "฿ = USD × rate");
});

t("editing บาท/USD 34.53 → 35 rescales ฿ up · keeps ¥ FIXED", () => {
  const sumChn = roundUp2(roundUp2(0 + roundUp2(cprice1 * 1)) + roundUp2(cprice2 * 1));
  const netDefault = roundUp2(sumChn * effRateFromForeignRate(bahtPerUnitDefault, yuanPerUnit));
  // Operator only changes the RATE — ¥ (cprice1/cprice2/sumChn) is untouched.
  const effRaised = effRateFromForeignRate(35, yuanPerUnit);
  const netRaised = roundUp2(sumChn * effRaised);
  assert.ok(netRaised > netDefault, `raised ${netRaised} !> default ${netDefault}`);
  // ¥ subtotal unchanged (the whole point: rate edit never touches the ¥).
  assert.strictEqual(sumChn, 7373.57);
  // ฿ tracks Σ USD × 35.
  assert.ok(Math.abs(netRaised - foreignSubtotal * 35) < 0.1, "฿ = USD × 35");
});

// ── ¥-order path stays a plain ¥ order (no foreign ratio) ───────────────
t("no foreign amount → deriveYuanPerUnit returns null (plain ¥ order)", () => {
  assert.strictEqual(deriveYuanPerUnit(1000, 0), null);
  assert.strictEqual(deriveYuanPerUnit(0, 100), null);
});
t("foreignToYuan / yuanToForeign guard non-positive ratio → 0", () => {
  assert.strictEqual(foreignToYuan(544, 0), 0);
  assert.strictEqual(yuanToForeign(3683.4, -1), 0);
  assert.strictEqual(effRateFromForeignRate(34.53, 0), 0);
});
t("negative / NaN foreign → 0 (not a currency crash)", () => {
  assert.strictEqual(foreignToYuan(-5, 6.77), 0);
  assert.strictEqual(foreignToYuan(NaN, 6.77), 0);
});

console.log(`\n${pass} assertions passed\n`);
