/**
 * Unit tests for the forwarder price engine.
 *
 * No test runner wired up project-wide yet (per CLAUDE.md Phase H3), so
 * these are hand-runnable assertions. Run with:
 *
 *   pnpm tsx lib/forwarder/calc-price.test.ts
 *
 * Will exit non-zero on the first failed assertion.
 */

import { calcPrice, DEFAULT_SETTINGS, resolveRate } from "./calc-price";

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

// ── Waterfall: rate_custom_hs wins over rate_custom_user ──
{
  console.log("waterfall: custom_hs > custom_user > vip > general");
  const r = resolveRate("kg", {
    rate_custom_hs:   { kg: 100 },
    rate_custom_user: { kg: 200 },
    rate_vip:         { kg: 300 },
    rate_general:     { kg: { tier1: 400 } },
    weight_kg: 5,
    volume_cbm: 0.1,
    settings: DEFAULT_SETTINGS,
  });
  assertEq("custom_hs wins", r, { rate: 100, source: "custom_hs" });
}

// ── Waterfall: skip null custom_hs, take custom_user ──
{
  const r = resolveRate("kg", {
    rate_custom_hs:   null,
    rate_custom_user: { kg: 200 },
    rate_vip:         { kg: 300 },
    rate_general:     { kg: { tier1: 400 } },
    weight_kg: 5,
    volume_cbm: 0.1,
    settings: DEFAULT_SETTINGS,
  });
  assertEq("custom_user wins when custom_hs missing", r, { rate: 200, source: "custom_user" });
}

// ── General rate tier selection ──
{
  console.log("general rate tiers");
  const tiered = {
    rate_general: { kg: { tier1: 35, tier2: 32, tier3: 30 } },
    settings: DEFAULT_SETTINGS,
    volume_cbm: 0,
  };
  assertEq("kg=5 → tier1",  resolveRate("kg", { ...tiered, weight_kg: 5 }),  { rate: 35, source: "general", tier: 1 });
  assertEq("kg=30 → tier2", resolveRate("kg", { ...tiered, weight_kg: 30 }), { rate: 32, source: "general", tier: 2 });
  assertEq("kg=100 → tier3", resolveRate("kg", { ...tiered, weight_kg: 100 }), { rate: 30, source: "general", tier: 3 });
}

// ── Auto basis: pick higher between kg and cbm ──
{
  console.log("auto-basis higher-of");
  const input = {
    source_warehouse: "guangzhou" as const,
    transport_type: "truck" as const,
    product_type: "general" as const,
    rate_basis: "auto" as const,
    weight_kg: 10,        // × 35 = 350
    volume_cbm: 0.2,      // × 4500 = 900   ← higher, should be picked
    crate: false, crate_price: 0,
    qc: false, qc_price: 0,
    domestic_china_thb: 0,
    thailand_delivery_thb: 0,
    other_price: 0, price_update: 0, discount: 0,
    service_fee: 50,
    is_juristic: false,
    rate_general: {
      kg:  { tier1: 35,   tier2: 32,   tier3: 30 },
      cbm: { tier1: 4500, tier2: 4200, tier3: 3900 },
    },
    settings: DEFAULT_SETTINGS,
  };
  const r = calcPrice(input);
  assertEq("auto picks cbm", r.basis_used, "cbm");
  assertEq("transport_subtotal = 0.2 * 4500", r.transport_subtotal, 900);
  assertEq("total = 900 + 50 service", r.total_price, 950);
}

// ── Juristic discount kicks in ≥ 1000 ──
{
  console.log("juristic discount");
  const baseInput = {
    source_warehouse: "guangzhou" as const,
    transport_type: "truck" as const,
    product_type: "general" as const,
    rate_basis: "kg" as const,
    volume_cbm: 0,
    crate: false, crate_price: 0,
    qc: false, qc_price: 0,
    domestic_china_thb: 0,
    thailand_delivery_thb: 0,
    other_price: 0, price_update: 0, discount: 0,
    service_fee: 50,
    rate_general: { kg: { tier1: 35, tier2: 32, tier3: 30 } },
    settings: DEFAULT_SETTINGS,
  };
  // 35 kg → tier2 (since 35 ≥ 10), 35 × 32 = 1120 → over 1000 → 1% discount = 11.20
  const r1 = calcPrice({ ...baseInput, is_juristic: true,  weight_kg: 35 });
  assertEq("juristic ≥1000 → discount = 11.20", r1.juristic_discount, 11.2);
  const r2 = calcPrice({ ...baseInput, is_juristic: false, weight_kg: 35 });
  assertEq("personal → no juristic discount", r2.juristic_discount, 0);
  // 20 kg × 35 = 700 → under threshold → no discount even for juristic
  // (note: 20 kg is between 10 and 50, so tier2 = 32, so 20*32=640)
  const r3 = calcPrice({ ...baseInput, is_juristic: true, weight_kg: 20 });
  assertEq("juristic but subtotal <1000 → no discount", r3.juristic_discount, 0);
}

// ── Full breakdown with crate + qc + extras ──
{
  console.log("full breakdown");
  const r = calcPrice({
    source_warehouse: "guangzhou",
    transport_type: "truck",
    product_type: "general",
    rate_basis: "kg",
    weight_kg: 10,
    volume_cbm: 0,
    crate: true,  crate_price: 100,
    qc: true,     qc_price:    50,
    domestic_china_thb: 200,
    thailand_delivery_thb: 80,
    other_price: 30,
    price_update: 20,
    discount: 15,
    service_fee: 50,
    is_juristic: false,
    rate_general: { kg: { tier1: 35, tier2: 32, tier3: 30 } },
    settings: DEFAULT_SETTINGS,
  });
  // 10 kg × 35 = 350 (tier1, since 10 == threshold, geq means tier2 at boundary)
  // Actually threshold1 = 10, q >= 10 → tier2 = 32 × 10 = 320
  // Adders: + 50 svc + 100 crate + 50 qc + 200 cn + 80 th + 30 other + 20 update - 15 disc
  // = 320 + 50 + 100 + 50 + 200 + 80 + 30 + 20 - 15 = 835
  assertEq("transport_subtotal at tier boundary", r.transport_subtotal, 320);
  assertEq("total = 835", r.total_price, 835);
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
