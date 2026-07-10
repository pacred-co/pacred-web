/**
 * resolveActiveSalesRep — pure DISPLAY-fallback for a retired sales rep.
 *
 * No DB — imports the module (which `import "server-only"`), so run under the
 * test tsconfig that stubs the marker:
 *
 *     tsx --tsconfig tsconfig.test.json lib/admin/resolve-active-rep.test.ts
 */
import {
  resolveActiveSalesRep,
  CENTRAL_SALES_LABEL,
} from "./resolve-active-rep";
import { CENTRAL_SALES_ADMIN_ID } from "./sales-rep-central";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

console.log("resolveActiveSalesRep");

const active = new Set(["admin_may", "admin_pee"]);

// 1 — active assigned rep → itself, not central.
{
  const r = resolveActiveSalesRep("admin_may", { activeIds: active });
  ok(r.adminID === "admin_may", "active rep resolves to itself");
  ok(r.isCentral === false, "active rep is not central");
  ok(r.label === "", "active rep has empty label (caller renders real name)");
}

// 2 — retired assigned rep (not in active set) → central.
{
  const r = resolveActiveSalesRep("admin_retired", { activeIds: active });
  ok(r.adminID === CENTRAL_SALES_ADMIN_ID, "retired rep resolves to central");
  ok(r.isCentral === true, "retired rep is central");
  ok(r.label === CENTRAL_SALES_LABEL, "retired rep gets central label");
}

// 3 — empty / null / undefined assigned rep → central.
{
  for (const empty of ["", "   ", null, undefined] as const) {
    const r = resolveActiveSalesRep(empty, { activeIds: active });
    ok(
      r.adminID === CENTRAL_SALES_ADMIN_ID && r.isCentral === true,
      `empty adminIDSale (${JSON.stringify(empty)}) → central`,
    );
  }
}

// 4 — whitespace-padded active id still matches (trimmed).
{
  const r = resolveActiveSalesRep("  admin_pee  ", { activeIds: active });
  ok(r.adminID === "admin_pee" && !r.isCentral, "padded active id trims + matches");
}

// 5 — empty active set (e.g. transient load failure) → every rep central.
{
  const r = resolveActiveSalesRep("admin_may", { activeIds: new Set() });
  ok(r.isCentral === true, "empty active set → central (fail-safe)");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
