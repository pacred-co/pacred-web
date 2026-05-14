/**
 * Unit tests for the forwarder price engine (P-24).
 *
 * No vitest in the project (per §6 self-directed DECISION — keep using
 * the existing tsx test pattern that thai-number.test.ts uses, since
 * pnpm test already wires both files. Saves the dep + matches the
 * codebase convention).
 *
 * Run with:  pnpm tsx lib/forwarder/calc-price.test.ts
 *            (or `pnpm test` to run this + thai-number together)
 *
 * Exits non-zero if any assertion fails. Coverage targets the 7 areas
 * in Part O2 P-24 spec: (a) general rate fallback, (b) VIP override,
 * (c) custom rate per customer, (d) juristic 1% discount on ≥1000,
 * (e) +50 PCS service fee, (f) KG vs CBM higher wins, (g) free-shipping
 * (modelled via discount = subtotal since the engine has no explicit
 * promo flag yet).
 */

import { calcPrice, DEFAULT_SETTINGS, resolveRate, type CalcPriceInput } from "./calc-price";

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

// ── Builder for the bigger calcPrice input ──
type Partial2<T> = { [K in keyof T]?: T[K] };
function buildInput(overrides: Partial2<CalcPriceInput> = {}): CalcPriceInput {
  return {
    source_warehouse: "guangzhou",
    transport_type:   "truck",
    product_type:     "general",
    rate_basis:       "kg",
    weight_kg:        10,
    volume_cbm:       0,
    crate:            false,
    crate_price:      0,
    qc:               false,
    qc_price:         0,
    domestic_china_thb:    0,
    thailand_delivery_thb: 0,
    other_price:           0,
    price_update:          0,
    discount:              0,
    service_fee:           50,
    is_juristic:           false,
    rate_general: { kg: { tier1: 35, tier2: 32, tier3: 30 } },
    settings: DEFAULT_SETTINGS,
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════
// (a) General rate fallback + tier selection
// ════════════════════════════════════════════════════════════════════
section("(a) general rate — tier selection by quantity");
{
  const tiered = {
    rate_general: { kg: { tier1: 35, tier2: 32, tier3: 30 } },
    settings:     DEFAULT_SETTINGS,
    volume_cbm:   0,
  };
  // thresholds: tier_kg_threshold1 = 10, tier_kg_threshold2 = 50
  assertEq("kg=5  (under t1) → tier1=35", resolveRate("kg", { ...tiered, weight_kg: 5  }), { rate: 35, source: "general", tier: 1 });
  assertEq("kg=10 (== t1)    → tier2=32", resolveRate("kg", { ...tiered, weight_kg: 10 }), { rate: 32, source: "general", tier: 2 });
  assertEq("kg=49 (under t2) → tier2=32", resolveRate("kg", { ...tiered, weight_kg: 49 }), { rate: 32, source: "general", tier: 2 });
  assertEq("kg=50 (== t2)    → tier3=30", resolveRate("kg", { ...tiered, weight_kg: 50 }), { rate: 30, source: "general", tier: 3 });
  assertEq("kg=100 (over t2) → tier3=30", resolveRate("kg", { ...tiered, weight_kg: 100 }), { rate: 30, source: "general", tier: 3 });
}

section("(a) general rate — tier3 missing falls to tier2 at high quantity");
{
  // tier3 null/0 → fallback to tier2 even at q ≥ t2
  const r = resolveRate("kg", {
    rate_general: { kg: { tier1: 35, tier2: 32, tier3: null } },
    settings:     DEFAULT_SETTINGS,
    weight_kg:    100,
    volume_cbm:   0,
  });
  assertEq("kg=100 with tier3 null → tier2 fallback", r, { rate: 32, source: "general", tier: 2 });
}

section("(a) general rate — cbm tiers behave the same way");
{
  // thresholds: tier_cbm_threshold1 = 0.5, tier_cbm_threshold2 = 3
  const tiered = {
    rate_general: { cbm: { tier1: 5000, tier2: 4500, tier3: 4000 } },
    settings:     DEFAULT_SETTINGS,
    weight_kg:    0,
  };
  assertEq("cbm=0.3 → tier1=5000", resolveRate("cbm", { ...tiered, volume_cbm: 0.3 }), { rate: 5000, source: "general", tier: 1 });
  assertEq("cbm=1.0 → tier2=4500", resolveRate("cbm", { ...tiered, volume_cbm: 1.0 }), { rate: 4500, source: "general", tier: 2 });
  assertEq("cbm=3.0 → tier3=4000", resolveRate("cbm", { ...tiered, volume_cbm: 3.0 }), { rate: 4000, source: "general", tier: 3 });
}

// ════════════════════════════════════════════════════════════════════
// (b) VIP override — vip beats general but loses to custom
// ════════════════════════════════════════════════════════════════════
section("(b) VIP override");
{
  const r = resolveRate("kg", {
    rate_vip:     { kg: 28 },
    rate_general: { kg: { tier1: 35 } },
    settings:     DEFAULT_SETTINGS,
    weight_kg:    5,
    volume_cbm:   0,
  });
  assertEq("vip beats general", r, { rate: 28, source: "vip" });
}

section("(b) VIP zero/null → fall back to general");
{
  const r = resolveRate("kg", {
    rate_vip:     { kg: 0 },                // zero treated as "not set"
    rate_general: { kg: { tier1: 35 } },
    settings:     DEFAULT_SETTINGS,
    weight_kg:    5,
    volume_cbm:   0,
  });
  assertEq("vip=0 → fall to general tier1", r, { rate: 35, source: "general", tier: 1 });
}

section("(b) VIP set for kg only — querying cbm returns null");
{
  const r = resolveRate("cbm", {
    rate_vip:     { kg: 28 },
    settings:     DEFAULT_SETTINGS,
    weight_kg:    5,
    volume_cbm:   0.2,
  });
  assertEq("vip kg set, cbm asked → null", r, null);
}

// ════════════════════════════════════════════════════════════════════
// (c) Custom rate per customer (rate_custom_user + rate_custom_hs)
// ════════════════════════════════════════════════════════════════════
section("(c) custom rate waterfall: hs > user > vip > general");
{
  const everything = {
    rate_custom_hs:   { kg: 100 },
    rate_custom_user: { kg: 200 },
    rate_vip:         { kg: 300 },
    rate_general:     { kg: { tier1: 400 } },
    settings:         DEFAULT_SETTINGS,
    weight_kg:        5,
    volume_cbm:       0,
  };
  assertEq("all four set → custom_hs wins", resolveRate("kg", everything), { rate: 100, source: "custom_hs" });
}

section("(c) custom_hs missing → custom_user wins");
{
  const r = resolveRate("kg", {
    rate_custom_hs:   null,
    rate_custom_user: { kg: 200 },
    rate_vip:         { kg: 300 },
    rate_general:     { kg: { tier1: 400 } },
    settings:         DEFAULT_SETTINGS,
    weight_kg:        5,
    volume_cbm:       0,
  });
  assertEq("custom_user wins when hs missing", r, { rate: 200, source: "custom_user" });
}

section("(c) only custom_user set");
{
  const r = resolveRate("kg", {
    rate_custom_user: { kg: 22 },
    settings:         DEFAULT_SETTINGS,
    weight_kg:        5,
    volume_cbm:       0,
  });
  assertEq("custom_user wins solo", r, { rate: 22, source: "custom_user" });
}

section("(c) custom_user with zero rate → ignored, falls to general");
{
  const r = resolveRate("kg", {
    rate_custom_user: { kg: 0 },           // 0 = not set
    rate_general:     { kg: { tier1: 35 } },
    settings:         DEFAULT_SETTINGS,
    weight_kg:        5,
    volume_cbm:       0,
  });
  assertEq("custom_user=0 → general tier1", r, { rate: 35, source: "general", tier: 1 });
}

// ════════════════════════════════════════════════════════════════════
// (d) Juristic 1% discount on subtotal ≥ 1000
// ════════════════════════════════════════════════════════════════════
section("(d) juristic discount thresholds");
{
  // weight=35, tier2=32 → subtotal = 1120 → 1% = 11.20
  const r1 = calcPrice(buildInput({ is_juristic: true,  weight_kg: 35 }));
  assertEq("juristic subtotal=1120 ≥1000 → discount 11.20", r1.juristic_discount, 11.2);

  const r2 = calcPrice(buildInput({ is_juristic: false, weight_kg: 35 }));
  assertEq("personal even at 1120 → no discount", r2.juristic_discount, 0);

  // weight=20, tier2=32 → subtotal = 640 → under threshold
  const r3 = calcPrice(buildInput({ is_juristic: true,  weight_kg: 20 }));
  assertEq("juristic subtotal=640 <1000 → no discount", r3.juristic_discount, 0);
}

section("(d) juristic discount — boundary at exactly 1000");
{
  // Use custom_user rate to hit exactly 1000 (10 kg × 100)
  const at1000 = buildInput({
    is_juristic:      true,
    weight_kg:        10,
    rate_custom_user: { kg: 100 },
  });
  const r = calcPrice(at1000);
  assertEq("subtotal=1000 (== threshold) → discount = 10.00", r.juristic_discount, 10);
}

section("(d) juristic — large subtotal scales linearly");
{
  // 100 kg × custom 50 = 5000 → 1% = 50
  const r = calcPrice(buildInput({
    is_juristic:      true,
    weight_kg:        100,
    rate_custom_user: { kg: 50 },
  }));
  assertEq("subtotal=5000 → discount=50", r.juristic_discount, 50);
}

// ════════════════════════════════════════════════════════════════════
// (e) Service fee adder (+50 default Pacred handling)
// ════════════════════════════════════════════════════════════════════
section("(e) service fee adder");
{
  // 5 kg × tier1 35 = 175 transport, + 50 fee = 225
  const r = calcPrice(buildInput({ weight_kg: 5, service_fee: 50 }));
  assertEq("service_fee 50 included in total", r.total_price, 225);
  assertEq("service_fee passed through breakdown", r.service_fee, 50);
}

section("(e) service fee = 0 → not added");
{
  const r = calcPrice(buildInput({ weight_kg: 5, service_fee: 0 }));
  assertEq("service_fee 0 → total = 175", r.total_price, 175);
}

section("(e) service fee custom (100)");
{
  const r = calcPrice(buildInput({ weight_kg: 5, service_fee: 100 }));
  assertEq("service_fee 100 → total = 275", r.total_price, 275);
}

// ════════════════════════════════════════════════════════════════════
// (f) KG vs CBM — auto basis picks higher
// ════════════════════════════════════════════════════════════════════
section("(f) auto basis — cbm yields higher → cbm wins");
{
  const r = calcPrice(buildInput({
    rate_basis: "auto",
    weight_kg:  10,        // × 32 (tier2) = 320
    volume_cbm: 0.2,       // × 4500 (cbm tier1) = 900   ← higher
    rate_general: {
      kg:  { tier1: 35,   tier2: 32,   tier3: 30   },
      cbm: { tier1: 4500, tier2: 4200, tier3: 3900 },
    },
  }));
  assertEq("auto picks cbm basis", r.basis_used, "cbm");
  assertEq("auto cbm subtotal = 900", r.transport_subtotal, 900);
}

section("(f) auto basis — kg yields higher → kg wins");
{
  const r = calcPrice(buildInput({
    rate_basis: "auto",
    weight_kg:  100,       // × 30 (tier3) = 3000  ← higher
    volume_cbm: 0.1,       // × 4500 = 450
    rate_general: {
      kg:  { tier1: 35,   tier2: 32,   tier3: 30   },
      cbm: { tier1: 4500, tier2: 4200, tier3: 3900 },
    },
  }));
  assertEq("auto picks kg basis", r.basis_used, "kg");
  assertEq("auto kg subtotal = 3000", r.transport_subtotal, 3000);
}

section("(f) forced kg ignores higher cbm");
{
  const r = calcPrice(buildInput({
    rate_basis: "kg",
    weight_kg:  10,        // × 32 = 320
    volume_cbm: 5,         // would be 5 × 3900 = 19500 if used
    rate_general: {
      kg:  { tier1: 35,   tier2: 32,   tier3: 30   },
      cbm: { tier1: 4500, tier2: 4200, tier3: 3900 },
    },
  }));
  assertEq("forced kg → kg used", r.basis_used, "kg");
  assertEq("forced kg → cbm rate ignored", r.transport_subtotal, 320);
}

section("(f) forced cbm ignores higher kg");
{
  const r = calcPrice(buildInput({
    rate_basis: "cbm",
    weight_kg:  100,       // would be 100 × 30 = 3000 if used
    volume_cbm: 0.1,       // × 4500 = 450
    rate_general: {
      kg:  { tier1: 35,   tier2: 32,   tier3: 30   },
      cbm: { tier1: 4500, tier2: 4200, tier3: 3900 },
    },
  }));
  assertEq("forced cbm → cbm used", r.basis_used, "cbm");
  assertEq("forced cbm → kg rate ignored", r.transport_subtotal, 450);
}

// ════════════════════════════════════════════════════════════════════
// (g) Free-shipping (modelled via discount = subtotal)
// ════════════════════════════════════════════════════════════════════
section("(g) free-shipping equivalent — discount cancels transport");
{
  // 10 kg × 32 (tier2) = 320 transport, discount 320 → only adders left
  const r = calcPrice(buildInput({
    weight_kg: 10,
    discount:  320,
    service_fee: 50,
  }));
  assertEq("transport_subtotal preserved in breakdown", r.transport_subtotal, 320);
  assertEq("discount cancels transport, total = service_fee only", r.total_price, 50);
}

section("(g) free-shipping with extra adders");
{
  // transport 320, discount 320, + crate 100, + qc 50, + service 50 = 200
  const r = calcPrice(buildInput({
    weight_kg:    10,
    discount:     320,
    crate:        true, crate_price: 100,
    qc:           true, qc_price:    50,
    service_fee:  50,
  }));
  assertEq("free-ship + crate + qc + svc → total 200", r.total_price, 200);
}

// ════════════════════════════════════════════════════════════════════
// Adder permutations + edges
// ════════════════════════════════════════════════════════════════════
section("adders — crate/qc only when flag is true");
{
  // crate=false but crate_price set → ignored
  const r1 = calcPrice(buildInput({ weight_kg: 5, crate: false, crate_price: 999 }));
  assertEq("crate=false → crate_price ignored", r1.crate_price, 0);

  // qc=false but qc_price set → ignored
  const r2 = calcPrice(buildInput({ weight_kg: 5, qc: false, qc_price: 999 }));
  assertEq("qc=false → qc_price ignored", r2.qc_price, 0);

  // crate=true → applied
  const r3 = calcPrice(buildInput({ weight_kg: 5, crate: true, crate_price: 100 }));
  assertEq("crate=true → +100 to total", r3.total_price, 175 + 50 + 100);
}

section("adders — china/thailand/other/price_update sum correctly");
{
  const r = calcPrice(buildInput({
    weight_kg:             5,                                      // 175 transport
    domestic_china_thb:    200,
    thailand_delivery_thb: 80,
    other_price:           30,
    price_update:          20,
    discount:              15,
    service_fee:           50,
  }));
  // 175 + 50 + 200 + 80 + 30 + 20 - 15 = 540
  assertEq("all adders + discount → 540", r.total_price, 540);
}

section("edges — zero quantity yields zero transport");
{
  const r1 = calcPrice(buildInput({ weight_kg: 0, service_fee: 50 }));
  assertEq("kg=0 → transport=0, total=service_fee only", r1.total_price, 50);

  const r2 = calcPrice(buildInput({
    rate_basis: "cbm",
    weight_kg: 0,
    volume_cbm: 0,
    service_fee: 50,
    rate_general: { cbm: { tier1: 4500 } },
  }));
  assertEq("cbm=0 → transport=0, total=service_fee only", r2.total_price, 50);
}

section("edges — no rates anywhere → rate_used 0, total = adders");
{
  const r = calcPrice(buildInput({
    weight_kg:   5,
    service_fee: 50,
    rate_general: null,
  }));
  assertEq("no rates → rate_used = 0", r.rate_used, 0);
  assertEq("no rates → transport = 0", r.transport_subtotal, 0);
  assertEq("no rates → total = service_fee", r.total_price, 50);
}

section("breakdown — rate_source / rate_tier are surfaced");
{
  const r = calcPrice(buildInput({
    weight_kg: 100,        // tier3 territory
    rate_general: { kg: { tier1: 35, tier2: 32, tier3: 30 } },
  }));
  assertEq("rate_source = general", r.rate_source, "general");
  assertEq("rate_tier = 3", r.rate_tier, 3);

  const r2 = calcPrice(buildInput({
    weight_kg:        5,
    rate_custom_user: { kg: 22 },
  }));
  assertEq("custom_user → rate_source = custom_user", r2.rate_source, "custom_user");
  assertEq("custom_user → rate_tier undefined", r2.rate_tier, undefined);
}

// ── Summary ──
console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
