/**
 * lib/auth/check-fstatus-transition — G5 transition gate test
 *
 * Wave 26 G5 (2026-05-28 ดึก) — covers the legacy owner-role matrix
 * documented in `docs/research/legacy-deep-dive/_SYNTHESIS.md` §3 + §4
 * and `docs/research/legacy-deep-dive/04-staff-workflow-by-role.md` §3.
 *
 * Run: pnpm tsx lib/auth/check-fstatus-transition.test.ts
 */

import {
  canFlipFstatus,
  canAnyRoleFlipFstatus,
} from "./check-fstatus-transition";

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, info?: unknown): void {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`, info ?? ""); }
}

console.log("\ncheck-fstatus-transition — G5 matrix");

// ── Override roles (super / manager) can do EVERYTHING ──
assert("super: 3→4",      canFlipFstatus("super",   "3", "4"));
assert("super: 4→5",      canFlipFstatus("super",   "4", "5"));
assert("super: 6→7",      canFlipFstatus("super",   "6", "7"));
assert("super: *→99",     canFlipFstatus("super",   "5", "99"));
assert("super: 99→3",     canFlipFstatus("super",   "99", "3"));
assert("super: 7→1 (reset)",  canFlipFstatus("super", "7", "1"));
assert("manager: 4→5",    canFlipFstatus("manager", "4", "5"));
assert("manager: 6→7",    canFlipFstatus("manager", "6", "7"));
assert("manager: *→99",   canFlipFstatus("manager", "4", "99"));
assert("manager: 99→4",   canFlipFstatus("manager", "99", "4"));

// ── God role `ultra` ("Ultra Admin Z", mig 0193) overrides EVERY transition ──
// Regression lock for the 2026-06-19 bug: an `ultra` admin (incl. both พี่ป๊อป)
// scanned a shipment IN to 15/15 but the 3→4 flip was silently blocked because
// `ultra` was missing from the override path (the ultra-RBAC sweep missed this
// pure-function gate). isGodRole(super/ultra) now grants the override.
assert("ultra: 3→4",      canFlipFstatus("ultra",   "3", "4"));
assert("ultra: 4→5",      canFlipFstatus("ultra",   "4", "5"));
assert("ultra: 6→7",      canFlipFstatus("ultra",   "6", "7"));
assert("ultra: *→99",     canFlipFstatus("ultra",   "5", "99"));
assert("ultra: 99→3",     canFlipFstatus("ultra",   "99", "3"));
assert("ultra: 7→1 (reset)",  canFlipFstatus("ultra", "7", "1"));
// The exact bug path: the barcode scan calls canAnyRoleFlipFstatus(['ultra'],'3','4').
assert("anyRole [ultra]: 3→4 (the scan-flip path)", canAnyRoleFlipFstatus(["ultra"], "3", "4"));

// ── Warehouse — owns *→4 + 1→2 / 2→3 sync ──
assert("warehouse: 3→4 (parity)",  canFlipFstatus("warehouse", "3", "4"));
assert("warehouse: 2→3 (sync)",    canFlipFstatus("warehouse", "2", "3"));
assert("warehouse: 1→2 (sync)",    canFlipFstatus("warehouse", "1", "2"));
assert("warehouse: 6→7 (driver fallback)", canFlipFstatus("warehouse", "6", "7"));

// ── Warehouse cannot do Accounting transitions ──
assert("warehouse: 4→5 DENIED",  !canFlipFstatus("warehouse", "4", "5"));
assert("warehouse: 5→6 DENIED",  !canFlipFstatus("warehouse", "5", "6"));
assert("warehouse: *→99 DENIED", !canFlipFstatus("warehouse", "4", "99"));
assert("warehouse: 99→3 DENIED", !canFlipFstatus("warehouse", "99", "3"));

// ── Accounting — owns 4→5 + 5→6 + rollback variants ──
assert("accounting: 4→5",     canFlipFstatus("accounting", "4", "5"));
assert("accounting: 5→6",     canFlipFstatus("accounting", "5", "6"));
assert("accounting: 6→5 (wallet reject)", canFlipFstatus("accounting", "6", "5"));

// ── Accounting cannot do Warehouse transitions ──
assert("accounting: 3→4 DENIED",  !canFlipFstatus("accounting", "3", "4"));
assert("accounting: 6→7 DENIED",  !canFlipFstatus("accounting", "6", "7"));
assert("accounting: *→99 DENIED", !canFlipFstatus("accounting", "5", "99"));

// ── Driver — owns 6→7 only ──
assert("driver: 6→7",      canFlipFstatus("driver", "6", "7"));
assert("driver: 3→4 DENIED",  !canFlipFstatus("driver", "3", "4"));
assert("driver: 4→5 DENIED",  !canFlipFstatus("driver", "4", "5"));
assert("driver: *→99 DENIED", !canFlipFstatus("driver", "6", "99"));

// ── Sales — owns NO transitions (initiator only — uses other actions) ──
assert("sales: 3→4 DENIED",   !canFlipFstatus("sales", "3", "4"));
assert("sales: 4→5 DENIED",   !canFlipFstatus("sales", "4", "5"));
assert("sales: 6→7 DENIED",   !canFlipFstatus("sales", "6", "7"));
assert("sales: *→99 DENIED",  !canFlipFstatus("sales", "5", "99"));

// ── QA — same as Sales — has approval queues but no fstatus flip ──
assert("qa: 4→5 DENIED",      !canFlipFstatus("qa", "4", "5"));
assert("qa: 6→7 DENIED",      !canFlipFstatus("qa", "6", "7"));

// ── Interpreter (CSPurchasing) — owns NO direct fstatus flips ──
assert("interpreter: 3→4 DENIED",  !canFlipFstatus("interpreter", "3", "4"));
assert("interpreter: 4→5 DENIED",  !canFlipFstatus("interpreter", "4", "5"));

// ── Same-status no-op is always allowed (degenerate) ──
assert("same status no-op (sales)",    canFlipFstatus("sales", "5", "5"));
assert("same status no-op (warehouse)", canFlipFstatus("warehouse", "4", "4"));

// ── 7→* terminal transitions blocked for everyone except override ──
assert("warehouse: 7→1 DENIED",   !canFlipFstatus("warehouse", "7", "1"));
assert("accounting: 7→6 DENIED",  !canFlipFstatus("accounting", "7", "6"));

// ── canAnyRoleFlipFstatus — OR over multiple roles ──
assert("any: [warehouse,accounting]: 3→4 (warehouse owns)",
  canAnyRoleFlipFstatus(["warehouse", "accounting"], "3", "4"));
assert("any: [warehouse,accounting]: 4→5 (accounting owns)",
  canAnyRoleFlipFstatus(["warehouse", "accounting"], "4", "5"));
assert("any: [sales,qa]: 3→4 DENIED (neither owns)",
  !canAnyRoleFlipFstatus(["sales", "qa"], "3", "4"));
assert("any: [driver,sales]: 6→7 (driver owns)",
  canAnyRoleFlipFstatus(["driver", "sales"], "6", "7"));
assert("any: [sales,super]: *→99 (super override)",
  canAnyRoleFlipFstatus(["sales", "super"], "5", "99"));
assert("any: [manager,sales]: 7→1 (manager override)",
  canAnyRoleFlipFstatus(["manager", "sales"], "7", "1"));
assert("any: []: 4→5 DENIED (no roles)",
  !canAnyRoleFlipFstatus([], "4", "5"));

// ── Forward path realistic flow (no override) ──
// warehouse + accounting together cover the China→TH→bill→pay pipeline
const warehouseAndAccounting = ["warehouse", "accounting"] as const;
assert("flow: 1→2 (warehouse)", canAnyRoleFlipFstatus(warehouseAndAccounting, "1", "2"));
assert("flow: 2→3 (warehouse)", canAnyRoleFlipFstatus(warehouseAndAccounting, "2", "3"));
assert("flow: 3→4 (warehouse)", canAnyRoleFlipFstatus(warehouseAndAccounting, "3", "4"));
assert("flow: 4→5 (accounting)", canAnyRoleFlipFstatus(warehouseAndAccounting, "4", "5"));
assert("flow: 5→6 (accounting)", canAnyRoleFlipFstatus(warehouseAndAccounting, "5", "6"));
// 6→7 needs driver → warehouse+accounting alone CAN do it (warehouse fallback per matrix)
assert("flow: 6→7 (warehouse fallback)", canAnyRoleFlipFstatus(warehouseAndAccounting, "6", "7"));
// But not 99 → that's super/manager only
assert("flow: *→99 DENIED (no super/manager)",
  !canAnyRoleFlipFstatus(warehouseAndAccounting, "5", "99"));

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
export {};
