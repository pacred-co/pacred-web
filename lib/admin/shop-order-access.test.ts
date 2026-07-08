import assert from "node:assert/strict";
import { canEditShopOrder, SHOP_ORDER_EDIT_ROLES } from "./shop-order-access";
import type { AdminRole } from "@/lib/auth/require-admin";

// ── god-nav tiers always pass (CEO/Manager/ITDT legacy → ultra/super/normies) ──
assert.equal(canEditShopOrder(["ultra"]), true, "ultra (god) → can edit");
assert.equal(canEditShopOrder(["super"]), true, "super (god) → can edit");
assert.equal(canEditShopOrder(["normies"]), true, "normies (god-nav) → can edit");

// ── office function-roles pass (the legacy 8 depts) ──
assert.equal(canEditShopOrder(["manager"]), true, "Manager → can edit");
assert.equal(canEditShopOrder(["qa"]), true, "QAAndQC → can edit");
assert.equal(canEditShopOrder(["accounting"]), true, "Accounting → can edit");
assert.equal(canEditShopOrder(["sales"]), true, "SaleCargo → can edit");
assert.equal(canEditShopOrder(["sales_admin"]), true, "CS/Sales manager → can edit");
assert.equal(canEditShopOrder(["interpreter"]), true, "ล่ามจีน (CSPurchasing) → can edit");
assert.equal(canEditShopOrder(["purchaser"]), true, "ผู้สั่งซื้อ → can edit");
assert.equal(canEditShopOrder(["purchaser_lead"]), true, "หัวหน้าสั่งซื้อ → can edit");
assert.equal(canEditShopOrder(["pricing"]), true, "pricing (office) → can edit");
assert.equal(canEditShopOrder(["ops"]), true, "ops (office) → can edit");

// ── the field departments legacy BLOCKS (warehouse/driver) ──
assert.equal(canEditShopOrder(["warehouse"]), false, "bare warehouse → BLOCKED (legacy L528)");
assert.equal(canEditShopOrder(["driver"]), false, "bare driver → BLOCKED (legacy L528)");

// ── the Freight lane is not a cargo shop-order editor ──
assert.equal(canEditShopOrder(["freight_import_doc"]), false, "bare freight role → BLOCKED");
assert.equal(canEditShopOrder(["freight_sales"]), false, "bare freight sales → BLOCKED");

// ── mixed: a warehouse worker who ALSO holds an office/god role passes ──
assert.equal(canEditShopOrder(["warehouse", "super"]), true, "warehouse+god → can edit (god wins)");
assert.equal(canEditShopOrder(["driver", "accounting"]), true, "driver+accounting → can edit (office wins)");

// ── empty / null ──
assert.equal(canEditShopOrder([]), false, "no roles → cannot edit");
assert.equal(canEditShopOrder(null), false, "null roles → cannot edit");
assert.equal(canEditShopOrder(undefined), false, "undefined roles → cannot edit");

// ── the allowlist never accidentally contains a field role ──
for (const blocked of ["warehouse", "driver"] as const) {
  assert.ok(
    !(SHOP_ORDER_EDIT_ROLES as readonly AdminRole[]).includes(blocked),
    `${blocked} must NOT be in SHOP_ORDER_EDIT_ROLES`,
  );
}

console.log("shop-order-access.test.ts — all assertions passed");
