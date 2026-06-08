/**
 * phase-access — Phase 2/3/4 admin-route gate (regression guard).
 *
 * Why this test exists (2026-06-08 · ภูม warehouse-handoff readiness):
 * The phase gate had stale entries for `/admin/barcode` and
 * `/admin/warehouse/qa-inspections` — both kept on the Phase 2/3/4
 * blocklist long after the underlying flows were built AND after the
 * sidebar (`lib/admin/sidebar-menu.ts`) had stopped phase-tagging them
 * (= visible to warehouse role). The result: warehouse staff saw the
 * sidebar links, clicked, and got bounced to /admin by `proxy.ts:150`.
 *
 * The fix removed those two entries. This test pins the per-role
 * expectation so the same stale-sync bug can't return — if anyone
 * re-adds `/admin/barcode` to PHASE_2_PLUS_ROUTES, this test fails.
 *
 * Run:  pnpm tsx lib/admin/phase-access.test.ts
 *   (also wired into `pnpm test:unit` via package.json)
 */

import { isPhase2PlusRoute, canAccessRoute } from "./phase-access";
import type { AdminRole } from "@/lib/auth/require-admin";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
    fail++;
  }
}

console.log("=== phase-access · per-role gate ===");

// ── §1. Warehouse-role daily-driver routes must NOT be on the block list ─
// (regression guard — these were the 2026-06-08 stale entries)
console.log("\n§1. Warehouse role can reach its daily routes");
const warehouseDailyRoutes = [
  "/admin/barcode",                       // toolbox parent
  "/admin/barcode/driver/import",         // บันทึกสินค้าเข้าโกดัง (the daily intake scan)
  "/admin/barcode/driver/all",            // search any tracking by scanner
  "/admin/barcode/cargo/all",             // search any tracking by camera
  "/admin/barcode/driver/prepare",        // เตรียมส่ง (type=6)
  "/admin/barcode/cargo/prepare",
  "/admin/barcode/driver/from",           // พิมพ์จากหน้ากล่อง
  "/admin/barcode/cargo/from",
  "/admin/warehouse/qa-inspections",      // QA inspection daily duty
  "/admin/warehouse/qa-inspections/new",
];
for (const route of warehouseDailyRoutes) {
  check(
    `warehouse can access ${route}`,
    canAccessRoute(route, "warehouse"),
    `canAccessRoute returned false — route is on PHASE_2_PLUS_ROUTES`,
  );
}

// ── §2. Routes that SHOULD stay blocked for warehouse (Phase 2+ not their
//        concern: customer financials / sales bonuses / extension tools) ─
console.log("\n§2. Warehouse stays blocked from non-warehouse phase-2 routes");
const stillBlockedForWarehouse = [
  "/admin/refunds",
  "/admin/commissions",
  "/admin/sales-payouts",
  "/admin/team-leaders",
  "/admin/withdrawal/freight-th",
  "/admin/cnt-hs",                         // container payments (accounting)
  "/admin/forwarders/container-cost-check",
  "/admin/reports/system",
  "/admin/carriers",
  "/admin/juristic-check",
  "/admin/warehouse/bulletin",             // explicitly super-only QA bulletin
  // /admin/drivers + /admin/driver-runs un-blocked round 2 — moved out of
  // this list (page-level requireAdmin enforces the real RBAC).
];
for (const route of stillBlockedForWarehouse) {
  check(
    `warehouse blocked from ${route}`,
    !canAccessRoute(route, "warehouse"),
    `canAccessRoute returned true — phase gate isn't blocking it`,
  );
}

// ── §3. Super bypass — super sees everything regardless of phase tier ──
console.log("\n§3. Super always passes the phase gate");
const everyClass: string[] = [
  ...warehouseDailyRoutes,
  ...stillBlockedForWarehouse,
];
for (const route of everyClass) {
  check(
    `super can access ${route}`,
    canAccessRoute(route, "super"),
    `super should always pass canAccessRoute`,
  );
}

// ── §4. The isPhase2PlusRoute itself — entries match comments ───────────
console.log("\n§4. isPhase2PlusRoute marks the right routes Phase 2+");
const shouldBePhase2Plus: string[] = [
  "/admin/refunds",
  "/admin/commissions",
  "/admin/warehouse/bulletin",
  "/admin/cnt-hs",
  "/admin/carriers",
];
for (const route of shouldBePhase2Plus) {
  check(
    `isPhase2PlusRoute("${route}") === true`,
    isPhase2PlusRoute(route),
  );
}

const shouldNOTBePhase2Plus: string[] = [
  // These were the 2026-06-08 stale entries (removed in this fix)
  "/admin/barcode",
  "/admin/barcode/driver/import",
  "/admin/warehouse/qa-inspections",
  // These are Phase-1 routes warehouse uses daily (sanity)
  "/admin/forwarders",
  "/admin/forwarders/warehouse-history",
  "/admin/forwarders/bulk-search",
  "/admin/report-cnt",
  "/admin/printAll",
];
for (const route of shouldNOTBePhase2Plus) {
  check(
    `isPhase2PlusRoute("${route}") === false`,
    !isPhase2PlusRoute(route),
  );
}

// ── §5. Locale-prefix stripping (en/) doesn't change behavior ─────────
console.log("\n§5. Locale prefix is stripped before matching");
check(
  `EN-prefixed /en/admin/barcode is not Phase 2+`,
  !isPhase2PlusRoute("/en/admin/barcode"),
);
check(
  `EN-prefixed /en/admin/refunds is Phase 2+`,
  isPhase2PlusRoute("/en/admin/refunds"),
);

// ── §6. Driver-mobile UI + driver-runs reachability ──────────────────
// 2026-06-08 round 2: /admin/drivers + /admin/driver-runs un-blocked from
// the Phase gate (page-level requireAdmin handles role policy: drivers/
// warehouse can navigate freely; the assign-driver tool still rejects
// non-ops at the page itself).
console.log("\n§6. Driver mobile UI + runs reachability (round 2)");
check(
  `driver can access /admin/drivers/work`,
  canAccessRoute("/admin/drivers/work", "driver" as AdminRole),
);
check(
  `driver can access /admin/driver-runs (Phase gate now permits)`,
  canAccessRoute("/admin/driver-runs", "driver" as AdminRole),
);
check(
  `driver can navigate to /admin/drivers (Phase gate now permits — page-level requireAdmin rejects later)`,
  canAccessRoute("/admin/drivers", "driver" as AdminRole),
);

// ── Result ────────────────────────────────────────────────────────────
console.log(`\n${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
