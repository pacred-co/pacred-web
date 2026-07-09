/**
 * currency-convert.test.ts — ¥-equivalent normalisation for the cart
 * price-per-piece currency selector.
 * Run: tsx lib/forwarder/currency-convert.test.ts
 */
import assert from "node:assert";
import { toYuanEquivalent, normalizeCurrency, type FxRateMap } from "./currency-convert";

let pass = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log("currency-convert.test.ts");

// The live customs.fx_rates pool (THB per 1 unit).
const FX: FxRateMap = {
  CNY: 4.8408,
  USD: 32.7768,
  EUR: 38.2224,
  JPY: 0.208312,
};

// ── CNY = identity (byte-identical · zero regression) ───────────────────
t("CNY 100 → ¥100 exactly (identity)", () => {
  const r = toYuanEquivalent(100, "CNY", FX);
  assert.strictEqual(r.yuan, 100);
  assert.strictEqual(r.flagged, false);
});
t("CNY 12.5 → ¥12.5 identity (no float drift)", () =>
  assert.strictEqual(toYuanEquivalent(12.5, "CNY", FX).yuan, 12.5));
t("empty currency → CNY identity", () =>
  assert.strictEqual(toYuanEquivalent(88, "", FX).yuan, 88));
t("RMB alias → CNY identity", () =>
  assert.strictEqual(toYuanEquivalent(10, "RMB", FX).yuan, 10));
t("YUAN alias → CNY identity", () =>
  assert.strictEqual(toYuanEquivalent(10, "yuan", FX).yuan, 10));

// ── USD → ¥-equiv via the pool ──────────────────────────────────────────
// 10 × 32.7768 / 4.8408 = 67.709… → 67.71
t("USD 10 → ¥67.71 (× USD/CNY)", () => {
  const r = toYuanEquivalent(10, "USD", FX);
  assert.strictEqual(r.yuan, 67.71);
  assert.strictEqual(r.flagged, false);
});
t("usd lowercase + padding → same convert", () =>
  assert.strictEqual(toYuanEquivalent(10, " usd ", FX).yuan, 67.71));

// ── THB → rate 1 (THB-per-THB) ──────────────────────────────────────────
// 100 × 1 / 4.8408 = 20.657… → 20.66
t("THB 100 → ¥20.66 (÷ CNY rate)", () => {
  const r = toYuanEquivalent(100, "THB", FX);
  assert.strictEqual(r.yuan, 20.66);
  assert.strictEqual(r.flagged, false);
});

// ── EUR round-trip ──────────────────────────────────────────────────────
// 5 × 38.2224 / 4.8408 = 39.479… → 39.48
t("EUR 5 → ¥39.48", () =>
  assert.strictEqual(toYuanEquivalent(5, "EUR", FX).yuan, 39.48));

// ── weak currency (JPY) ─────────────────────────────────────────────────
// 1000 × 0.208312 / 4.8408 = 43.033… → 43.03
t("JPY 1000 → ¥43.03", () =>
  assert.strictEqual(toYuanEquivalent(1000, "JPY", FX).yuan, 43.03));

// ── unknown currency → CNY-as-entered + FLAG ────────────────────────────
t("unknown 'XYZ' → CNY-as-entered + flagged", () => {
  const r = toYuanEquivalent(50, "XYZ", FX);
  assert.strictEqual(r.yuan, 50);
  assert.strictEqual(r.flagged, true);
});

// ── missing CNY anchor → CNY-as-entered + FLAG (never mis-convert) ───────
t("missing CNY anchor → fallback + flagged", () => {
  const r = toYuanEquivalent(10, "USD", { USD: 32 });
  assert.strictEqual(r.yuan, 10);
  assert.strictEqual(r.flagged, true);
});

// ── invalid amount → 0 (not a currency problem) ─────────────────────────
t("negative amount → 0", () => {
  const r = toYuanEquivalent(-5, "USD", FX);
  assert.strictEqual(r.yuan, 0);
  assert.strictEqual(r.flagged, false);
});
t("NaN amount → 0", () =>
  assert.strictEqual(toYuanEquivalent(Number.NaN, "USD", FX).yuan, 0));

// ── normalizeCurrency direct ────────────────────────────────────────────
t("normalizeCurrency folds RMB/YUAN/¥ → CNY", () => {
  assert.strictEqual(normalizeCurrency("rmb"), "CNY");
  assert.strictEqual(normalizeCurrency(" YUAN "), "CNY");
  assert.strictEqual(normalizeCurrency("¥"), "CNY");
  assert.strictEqual(normalizeCurrency("usd"), "USD");
  assert.strictEqual(normalizeCurrency(null), "");
});

console.log(`\n${pass} passed`);
