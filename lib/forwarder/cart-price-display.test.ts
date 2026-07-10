/**
 * cart-price-display.test.ts — the cart/order price cell display helper.
 * Run: tsx lib/forwarder/cart-price-display.test.ts
 */
import assert from "node:assert";
import { formatCartPriceDisplay } from "./cart-price-display";

let pass = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log("cart-price-display.test.ts");

const RS = 5.1; // yuan SELL rate (tb_settings.rsdefault)

// ── Foreign (USD) → original primary + ¥/฿ small secondary ──────────────
t("USD → primary shows the ORIGINAL '$… USD'", () => {
  const d = formatCartPriceDisplay({
    inputCurrency: "USD",
    inputPrice: 3683.4,
    cpriceYuan: 24936.6, // the ¥-equiv pricing runs on
    rsDefault: RS,
  });
  assert.strictEqual(d.isForeign, true);
  assert.strictEqual(d.primary, "$3,683.40 USD");
  // secondary = ≈ ¥ (cprice) · ฿ (cprice × rs, whole baht)
  assert.strictEqual(d.secondary, "≈ ¥24,936.60 · ฿127,177");
});

t("EUR → € symbol + code", () => {
  const d = formatCartPriceDisplay({
    inputCurrency: "EUR",
    inputPrice: 100,
    cpriceYuan: 788,
    rsDefault: RS,
  });
  assert.strictEqual(d.isForeign, true);
  assert.strictEqual(d.primary, "€100.00 EUR");
  assert.strictEqual(d.secondary, "≈ ¥788.00 · ฿4,019");
});

t("THB → ฿ symbol + code (still foreign vs ¥)", () => {
  const d = formatCartPriceDisplay({
    inputCurrency: "THB",
    inputPrice: 500,
    cpriceYuan: 98.04,
    rsDefault: RS,
  });
  assert.strictEqual(d.isForeign, true);
  assert.strictEqual(d.primary, "฿500.00 THB");
});

// ── CNY / empty → ¥ primary (byte-identical to today) ───────────────────
t("CNY → primary '¥…', not foreign", () => {
  const d = formatCartPriceDisplay({
    inputCurrency: "CNY",
    inputPrice: 0,
    cpriceYuan: 12.5,
    rsDefault: RS,
  });
  assert.strictEqual(d.isForeign, false);
  assert.strictEqual(d.primary, "¥12.50");
  assert.strictEqual(d.secondary, "฿64"); // 12.5 × 5.1 = 63.75 → 64
});

t("empty currency → ¥ primary (existing yuan/marketplace row)", () => {
  const d = formatCartPriceDisplay({
    inputCurrency: "",
    inputPrice: 0,
    cpriceYuan: 30,
    rsDefault: RS,
  });
  assert.strictEqual(d.isForeign, false);
  assert.strictEqual(d.primary, "¥30.00");
});

t("null/undefined currency → ¥ primary", () => {
  const d = formatCartPriceDisplay({
    inputCurrency: null,
    inputPrice: undefined,
    cpriceYuan: 7,
    rsDefault: RS,
  });
  assert.strictEqual(d.isForeign, false);
  assert.strictEqual(d.primary, "¥7.00");
});

t("RMB / YUAN aliases → ¥ primary (fold to CNY)", () => {
  assert.strictEqual(
    formatCartPriceDisplay({ inputCurrency: "RMB", inputPrice: 0, cpriceYuan: 5, rsDefault: RS }).isForeign,
    false,
  );
  assert.strictEqual(
    formatCartPriceDisplay({ inputCurrency: "yuan", inputPrice: 0, cpriceYuan: 5, rsDefault: RS }).isForeign,
    false,
  );
});

// ── Line-total scaling (×amount) uses the same helper ───────────────────
t("line total (original × amount) — foreign primary scales", () => {
  const amount = 3;
  const d = formatCartPriceDisplay({
    inputCurrency: "USD",
    inputPrice: 3683.4 * amount, // 11050.20
    cpriceYuan: 24936.6 * amount, // 74809.80
    rsDefault: RS,
  });
  assert.strictEqual(d.primary, "$11,050.20 USD");
  assert.strictEqual(d.secondary, "≈ ¥74,809.80 · ฿381,530"); // 74809.8 × 5.1 = 381529.98 → 381,530
});

t("line total for a ¥ row scales ¥ primary", () => {
  const d = formatCartPriceDisplay({
    inputCurrency: "",
    inputPrice: 0,
    cpriceYuan: 12.5 * 4,
    rsDefault: RS,
  });
  assert.strictEqual(d.primary, "¥50.00");
});

console.log(`\n${pass} assertions passed\n`);
