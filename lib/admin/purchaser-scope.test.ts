/**
 * Unit tests for the per-order purchaser scope rule (lib/admin/purchaser-scope.ts)
 * — owner ④ · re-keyed to the POSITION/WORKSPACE axis (mig 0242). The core rule
 * that decides whether the ฝากสั่งซื้อ + ฝากนำเข้า lists hard-scope a viewer to
 * their OWN assigned orders, now driven by (workspaceRole, roles).
 *
 * Run: tsx lib/admin/purchaser-scope.test.ts   (or `pnpm test:unit`)
 * Exits non-zero on any failure.
 */

import type { AdminRole } from "@/lib/auth/require-admin";
import {
  isPurchaserScoped,
  canReassignPurchaser,
} from "./purchaser-scope";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}
const R = (...r: AdminRole[]) => r;

// ── isPurchaserScoped — the workspace decides, base role does NOT exempt ──────
console.log("purchaser-scope: SCOPED (workspace=purchaser)");
// (a) workspace=purchaser + base role sales → scoped (a plain operational role
//     no longer exempts — the WORKSPACE decides · mig 0242).
ok("(a) ws=purchaser + role=sales → scoped", isPurchaserScoped("purchaser", R("sales")) === true);
ok("ws=purchaser + role=normies → scoped", isPurchaserScoped("purchaser", R("normies")) === false); // normies=god-nav, sees all
ok("ws=purchaser + role=ops → scoped", isPurchaserScoped("purchaser", R("ops")) === true);
ok("ws=purchaser + no roles → scoped", isPurchaserScoped("purchaser", R()) === true);

console.log("purchaser-scope: NOT scoped — god tiers always see all");
// (b) workspace=purchaser + role=ultra → NOT scoped (god sees all).
ok("(b) ws=purchaser + role=ultra → not scoped", isPurchaserScoped("purchaser", R("ultra")) === false);
ok("ws=purchaser + role=super → not scoped", isPurchaserScoped("purchaser", R("super")) === false);
ok("ws=purchaser + role=normies → not scoped", isPurchaserScoped("purchaser", R("normies")) === false);

console.log("purchaser-scope: NOT scoped — other workspaces");
// (c) workspace=pricing + role=sales → NOT scoped.
ok("(c) ws=pricing + role=sales → not scoped", isPurchaserScoped("pricing", R("sales")) === false);
ok("ws=null + role=sales → not scoped", isPurchaserScoped(null, R("sales")) === false);
ok("ws=null + no roles → not scoped", isPurchaserScoped(null, R()) === false);
ok("ws=undefined → not scoped", isPurchaserScoped(undefined, undefined) === false);

console.log("purchaser-scope: BACK-COMPAT — legacy raw purchaser role (no workspace)");
// (f) legacy role=purchaser (no workspace) → scoped.
ok("(f) ws=null + role=purchaser → scoped", isPurchaserScoped(null, R("purchaser")) === true);
ok("ws=null + role=purchaser+ultra → not scoped (god wins)", isPurchaserScoped(null, R("purchaser", "ultra")) === false);

// ── canReassignPurchaser ─────────────────────────────────────────────────────
console.log("purchaser-scope: canReassignPurchaser — the allowed set");
// (d) workspace=purchaser_lead → not scoped + canReassign true.
ok("(d) ws=purchaser_lead → not scoped", isPurchaserScoped("purchaser_lead", R("sales")) === false);
ok("(d) ws=purchaser_lead → canReassign", canReassignPurchaser("purchaser_lead", R("sales")) === true);
// (e) role=interpreter → canReassign true.
ok("(e) role=interpreter → canReassign", canReassignPurchaser(null, R("interpreter")) === true);
ok("role=ultra → canReassign", canReassignPurchaser(null, R("ultra")) === true);
ok("role=super → canReassign", canReassignPurchaser(null, R("super")) === true);
ok("legacy role=purchaser_lead (no ws) → canReassign", canReassignPurchaser(null, R("purchaser_lead")) === true);

console.log("purchaser-scope: canReassignPurchaser — the denied set");
ok("ws=purchaser + role=sales CANNOT reassign", canReassignPurchaser("purchaser", R("sales")) === false);
ok("plain purchaser role CANNOT reassign", canReassignPurchaser(null, R("purchaser")) === false);
// normies is god-NAV but the owner named an explicit reassign set → excluded.
ok("normies CANNOT reassign (excluded despite god-nav)", canReassignPurchaser(null, R("normies")) === false);
ok("accounting CANNOT reassign", canReassignPurchaser(null, R("accounting")) === false);
ok("ops CANNOT reassign", canReassignPurchaser(null, R("ops")) === false);
ok("ws=pricing + no roles CANNOT reassign", canReassignPurchaser("pricing", R()) === false);
ok("null/undefined CANNOT reassign", canReassignPurchaser(null, null) === false);

console.log(`\npurchaser-scope: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
