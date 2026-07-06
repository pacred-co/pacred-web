/**
 * Unit tests for the per-order purchaser scope rule (lib/admin/purchaser-scope.ts)
 * — owner ④ · mig 0241. The core rule that decides whether the ฝากสั่งซื้อ +
 * ฝากนำเข้า lists hard-scope a viewer to their OWN assigned orders.
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

// ── isPurchaserScoped — a purchaser-only viewer scopes to their own ──────────
console.log("purchaser-scope: SCOPED (purchaser-only)");
ok("['purchaser'] → scoped", isPurchaserScoped(R("purchaser")) === true);

console.log("purchaser-scope: NOT scoped (full-access roles see all)");
ok("['purchaser_lead'] → not scoped", isPurchaserScoped(R("purchaser_lead")) === false);
ok("['interpreter'] → not scoped", isPurchaserScoped(R("interpreter")) === false);
ok("['ultra'] → not scoped", isPurchaserScoped(R("ultra")) === false);
ok("['super'] → not scoped", isPurchaserScoped(R("super")) === false);
ok("['normies'] → not scoped", isPurchaserScoped(R("normies")) === false);
ok("['accounting'] → not scoped", isPurchaserScoped(R("accounting")) === false);
ok("['ops'] → not scoped", isPurchaserScoped(R("ops")) === false);
ok("['sales'] → not scoped", isPurchaserScoped(R("sales")) === false);
ok("['warehouse'] → not scoped", isPurchaserScoped(R("warehouse")) === false);

console.log("purchaser-scope: dual grants — the broader role wins (never down-scope)");
ok("['purchaser','purchaser_lead'] → not scoped", isPurchaserScoped(R("purchaser", "purchaser_lead")) === false);
ok("['purchaser','interpreter'] → not scoped", isPurchaserScoped(R("purchaser", "interpreter")) === false);
ok("['purchaser','ultra'] → not scoped", isPurchaserScoped(R("purchaser", "ultra")) === false);
ok("['purchaser','accounting'] → not scoped", isPurchaserScoped(R("purchaser", "accounting")) === false);

console.log("purchaser-scope: edge — no roles / unrelated roles");
ok("[] → not scoped", isPurchaserScoped(R()) === false);
ok("null → not scoped", isPurchaserScoped(null) === false);
ok("undefined → not scoped", isPurchaserScoped(undefined) === false);
ok("['pricing'] (non-purchaser) → not scoped", isPurchaserScoped(R("pricing")) === false);

// ── canReassignPurchaser — exactly {interpreter, purchaser_lead, ultra, super} ─
console.log("purchaser-scope: canReassignPurchaser — the allowed set");
ok("interpreter can reassign", canReassignPurchaser(R("interpreter")) === true);
ok("purchaser_lead can reassign", canReassignPurchaser(R("purchaser_lead")) === true);
ok("ultra can reassign", canReassignPurchaser(R("ultra")) === true);
ok("super can reassign", canReassignPurchaser(R("super")) === true);

console.log("purchaser-scope: canReassignPurchaser — the denied set");
ok("plain purchaser CANNOT reassign", canReassignPurchaser(R("purchaser")) === false);
// normies is god-NAV but the owner named an explicit reassign set → excluded.
ok("normies CANNOT reassign (excluded despite god-nav)", canReassignPurchaser(R("normies")) === false);
ok("accounting CANNOT reassign", canReassignPurchaser(R("accounting")) === false);
ok("ops CANNOT reassign", canReassignPurchaser(R("ops")) === false);
ok("[] CANNOT reassign", canReassignPurchaser(R()) === false);
ok("null CANNOT reassign", canReassignPurchaser(null) === false);

console.log(`\npurchaser-scope: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
