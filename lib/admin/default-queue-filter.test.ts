/**
 * G6 · default-queue-filter — pure function tests.
 *
 * Run:  pnpm tsx lib/admin/default-queue-filter.test.ts
 *   (and via `pnpm test:unit` once wired into package.json)
 */

import {
  getDefaultFilter,
  pickFilterRole,
  isCleanLanding,
  buildDefaultLandingRedirect,
  type FilterablePage,
} from "./default-queue-filter";

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

console.log("=== G6 · default-queue-filter ===");

// ── super always falls through unfiltered ───────────────────────────
const PAGES: FilterablePage[] = [
  "/admin/forwarders",
  "/admin/forwarder-check",
  "/admin/cnt-hs",
  "/admin/customers",
  "/admin/wallet",
];
for (const p of PAGES) {
  check(`super: no default on ${p}`, getDefaultFilter(p, "super") === null);
}

// ── /admin/forwarders role matrix ───────────────────────────────────
check(
  "warehouse → /admin/forwarders → ?status=3",
  getDefaultFilter("/admin/forwarders", "warehouse")?.get("status") === "3",
);
check(
  "accounting → /admin/forwarders → ?status=4",
  getDefaultFilter("/admin/forwarders", "accounting")?.get("status") === "4",
);
check(
  "sales → /admin/forwarders → ?status=1",
  getDefaultFilter("/admin/forwarders", "sales")?.get("status") === "1",
);
check(
  "sales_admin → /admin/forwarders → ?status=1",
  getDefaultFilter("/admin/forwarders", "sales_admin")?.get("status") === "1",
);
check(
  "interpreter → /admin/forwarders → ?status=1",
  getDefaultFilter("/admin/forwarders", "interpreter")?.get("status") === "1",
);
check(
  "qa → /admin/forwarders → ?status=1",
  getDefaultFilter("/admin/forwarders", "qa")?.get("status") === "1",
);
check(
  "ops → /admin/forwarders → null (no default)",
  getDefaultFilter("/admin/forwarders", "ops") === null,
);
check(
  "driver → /admin/forwarders → null (no default)",
  getDefaultFilter("/admin/forwarders", "driver") === null,
);

// ── /admin/forwarder-check — no per-role default ────────────────────
check(
  "accounting → /admin/forwarder-check → null",
  getDefaultFilter("/admin/forwarder-check", "accounting") === null,
);

// ── /admin/cnt-hs role matrix ───────────────────────────────────────
check(
  "interpreter → /admin/cnt-hs → ?q=1",
  getDefaultFilter("/admin/cnt-hs", "interpreter")?.get("q") === "1",
);
check(
  "accounting → /admin/cnt-hs → null",
  getDefaultFilter("/admin/cnt-hs", "accounting") === null,
);
check(
  "qa → /admin/cnt-hs → null",
  getDefaultFilter("/admin/cnt-hs", "qa") === null,
);

// ── /admin/customers — sales_admin self-book ────────────────────────
check(
  "sales_admin + legacy id → /admin/customers → ?adminidsale=<id>",
  getDefaultFilter("/admin/customers", "sales_admin", {
    legacyAdminId: "admin_pop",
  })?.get("adminidsale") === "admin_pop",
);
check(
  "sales_admin without legacy id → /admin/customers → null",
  getDefaultFilter("/admin/customers", "sales_admin", {
    legacyAdminId: null,
  }) === null,
);
check(
  "sales (Staff) → /admin/customers → null (team book)",
  getDefaultFilter("/admin/customers", "sales") === null,
);
check(
  "accounting → /admin/customers → null",
  getDefaultFilter("/admin/customers", "accounting") === null,
);

// ── /admin/wallet — accounting pending-topup queue ─────────────────
const walletForAccounting = getDefaultFilter("/admin/wallet", "accounting");
check(
  "accounting → /admin/wallet → view=tx",
  walletForAccounting?.get("view") === "tx",
);
check(
  "accounting → /admin/wallet → status=1",
  walletForAccounting?.get("status") === "1",
);
check(
  "ops → /admin/wallet → null (balance default)",
  getDefaultFilter("/admin/wallet", "ops") === null,
);

// ── pickFilterRole priority order ───────────────────────────────────
check(
  "pickFilterRole(['ops','accounting']) → accounting",
  pickFilterRole(["ops", "accounting"]) === "accounting",
);
check(
  "pickFilterRole(['warehouse','sales']) → warehouse",
  pickFilterRole(["warehouse", "sales"]) === "warehouse",
);
check(
  "pickFilterRole(['super','accounting','warehouse']) → super",
  pickFilterRole(["super", "accounting", "warehouse"]) === "super",
);
check("pickFilterRole([]) → null", pickFilterRole([]) === null);
check(
  "pickFilterRole(['freight_sales']) → null (Freight-only)",
  pickFilterRole(["freight_sales"]) === null,
);

// ── isCleanLanding — distinguishes user-passed vs none ──────────────
check(
  "isCleanLanding clean → true",
  isCleanLanding("/admin/forwarders", []),
);
check(
  "isCleanLanding with managed key → false",
  !isCleanLanding("/admin/forwarders", ["status"]),
);
check(
  "isCleanLanding with q (managed) → false",
  !isCleanLanding("/admin/forwarders", ["q"]),
);
check(
  "isCleanLanding with focus only (unmanaged) → true",
  isCleanLanding("/admin/forwarders", ["focus"]),
);
check(
  "isCleanLanding /admin/wallet with view=balance → false (managed)",
  !isCleanLanding("/admin/wallet", ["view"]),
);
check(
  "isCleanLanding /admin/customers with type → false",
  !isCleanLanding("/admin/customers", ["type"]),
);
check(
  "isCleanLanding /admin/cnt-hs with search → false",
  !isCleanLanding("/admin/cnt-hs", ["search"]),
);
check(
  "isCleanLanding with universal nofilter escape → false",
  !isCleanLanding("/admin/forwarders", ["nofilter"]),
);
check(
  "nofilter prevents redirect loop",
  buildDefaultLandingRedirect("/admin/forwarders", ["warehouse"], {
    nofilter: "1",
  }) === null,
);

// ── buildDefaultLandingRedirect — end-to-end URL assembly ──────────
check(
  "warehouse clean landing on /admin/forwarders → /admin/forwarders?status=3",
  buildDefaultLandingRedirect("/admin/forwarders", ["warehouse"], {}) ===
    "/admin/forwarders?status=3",
);
check(
  "warehouse with existing ?status=4 → null (respect user choice)",
  buildDefaultLandingRedirect("/admin/forwarders", ["warehouse"], {
    status: "4",
  }) === null,
);
check(
  "super on /admin/forwarders → null (executive unfiltered)",
  buildDefaultLandingRedirect("/admin/forwarders", ["super"], {}) === null,
);
check(
  "no role on /admin/forwarders → null",
  buildDefaultLandingRedirect("/admin/forwarders", [], {}) === null,
);
check(
  "accounting on /admin/wallet → /admin/wallet?view=tx&status=1",
  buildDefaultLandingRedirect("/admin/wallet", ["accounting"], {}) ===
    "/admin/wallet?view=tx&status=1",
);
check(
  "accounting on /admin/wallet?view=balance → null (explicit choice)",
  buildDefaultLandingRedirect("/admin/wallet", ["accounting"], {
    view: "balance",
  }) === null,
);
check(
  "interpreter on /admin/cnt-hs → /admin/cnt-hs?q=1",
  buildDefaultLandingRedirect("/admin/cnt-hs", ["interpreter"], {}) ===
    "/admin/cnt-hs?q=1",
);
check(
  "sales_admin on /admin/customers with legacyAdminId",
  buildDefaultLandingRedirect("/admin/customers", ["sales_admin"], {}, {
    legacyAdminId: "admin_pop",
  }) === "/admin/customers?adminidsale=admin_pop",
);
check(
  "sales_admin on /admin/customers without legacyAdminId → null",
  buildDefaultLandingRedirect("/admin/customers", ["sales_admin"], {}) === null,
);
check(
  "multi-role accounting+warehouse on /forwarders → accounting wins (priority)",
  buildDefaultLandingRedirect(
    "/admin/forwarders",
    ["accounting", "warehouse"],
    {},
  ) === "/admin/forwarders?status=4",
);
check(
  "ops-only on /admin/forwarders → null",
  buildDefaultLandingRedirect("/admin/forwarders", ["ops"], {}) === null,
);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
