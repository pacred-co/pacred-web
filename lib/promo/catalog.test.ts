/**
 * Unit tests for lib/promo/catalog.ts — the legacy tagPro() promo catalog:
 * code resolution, active-window math, and the discount calc (rate-override +
 * flat shipping). Pure, no IO. Dates are passed explicitly (deterministic).
 *
 * Run:  pnpm tsx lib/promo/catalog.test.ts   (wired into pnpm test:unit)
 */

import {
  resolveLegacyPromoCode, isActive, calcLegacyPromoDiscount, PROMO_CATALOG,
} from "./catalog";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assertTrue(label: string, cond: boolean) { assertEq(label, cond, true); }
function section(name: string) { console.log(`\n${name}`); }

const must = (code: string) => {
  const p = resolveLegacyPromoCode(code);
  if (!p) throw new Error(`fixture promo "${code}" not found`);
  return p;
};

// ── resolveLegacyPromoCode — case-insensitive alias match ──
section("resolveLegacyPromoCode");
assertEq("PCSF → id -1", resolveLegacyPromoCode("PCSF")?.id, -1);
assertEq("lowercase 'f' → PCSF (uppercased)", resolveLegacyPromoCode("f")?.id, -1);
assertEq("'freeship' → PCSF", resolveLegacyPromoCode("freeship")?.id, -1);
assertEq("whitespace trimmed: '  pro33  ' → 77", resolveLegacyPromoCode("  pro33  ")?.id, 77);
assertEq("'valentine' → 19", resolveLegacyPromoCode("valentine")?.id, 19);
assertEq("'PR80' → 80", resolveLegacyPromoCode("PR80")?.id, 80);
assertEq("unknown code → null", resolveLegacyPromoCode("NOPE"), null);

// ── isActive — inclusive window, null = open-ended ──
section("isActive");
assertTrue("evergreen (PCSF) active at any date", isActive(new Date("2026-01-01T00:00:00Z"), must("PCSF")));
const pro33 = must("PRO33"); // window 2026-03-03T17:00:01Z → 2026-03-06T16:59:59Z
assertTrue("3.3 active mid-window (2026-03-05)", isActive(new Date("2026-03-05T00:00:00Z"), pro33));
assertEq("3.3 NOT active before window", isActive(new Date("2026-03-01T00:00:00Z"), pro33), false);
assertEq("3.3 NOT active after window", isActive(new Date("2026-03-08T00:00:00Z"), pro33), false);
assertTrue("3.3 active exactly at activeFrom (inclusive)", isActive(new Date("2026-03-03T17:00:01Z"), pro33));

// ── calcLegacyPromoDiscount — shipping flat vs rate-override ──
section("calcLegacyPromoDiscount");
assertEq("PCSF → flat 50฿ shipping discount (any cart)",
  calcLegacyPromoDiscount(must("PCSF"), 1000, 5.0), { discount: 50, discountType: "fixed" });
assertEq("Pro80 (4.92) on ฿500 cart @ baseline 5.00 → saves ฿8",
  calcLegacyPromoDiscount(must("PR80"), 500, 5.0), { discount: 8, discountType: "fixed" });
assertEq("Pro33 (4.70) on ฿470 cart @ baseline 5.00 → saves ฿28.20",
  calcLegacyPromoDiscount(must("PRO33"), 470, 5.0), { discount: 28.2, discountType: "fixed" });
assertEq("Valentine (5.10 > baseline 5.00) → override worse → no discount",
  calcLegacyPromoDiscount(must("VALENTINE"), 1000, 5.0), { discount: 0, discountType: "fixed" });
assertEq("baseline rate 0 → no discount (defensive)",
  calcLegacyPromoDiscount(must("PR80"), 500, 0), { discount: 0, discountType: "fixed" });
assertEq("empty cart → no rate discount",
  calcLegacyPromoDiscount(must("PR80"), 0, 5.0), { discount: 0, discountType: "fixed" });

// ── catalog integrity ──
section("catalog integrity");
assertEq("catalog has 4 entries", PROMO_CATALOG.length, 4);
assertTrue("every promo has at least one alias", PROMO_CATALOG.every((p) => p.aliases.length > 0));
assertTrue("PCSF is the only shipping-discount promo", PROMO_CATALOG.filter((p) => p.shippingDiscountThb > 0).length === 1);

console.log(`\n${fail === 0 ? "✅" : "❌"} promo/catalog: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
