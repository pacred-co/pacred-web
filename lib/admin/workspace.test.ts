/**
 * WORKSPACE resolution + the freight queue-count mechanism.
 *
 * 2026-08-07 (owner "คลีนที่ไร้สาระออก") — the ADMIN freight surfaces were cut
 * (0 real customer jobs ever: freight_quotes/invoices = 0 rows · freight_shipments
 * = seed/mock only). So a freight_* position now falls back to the CARGO oversight
 * DEFAULT instead of landing on pages that no longer exist. This test flipped from
 * "every freight role owns a dedicated freight workspace" (the old truth) to
 * "no workspace points at a deleted freight page" (the new truth).
 *
 * Still locked: (1) freight_* roles resolve to a REAL workspace (graceful fallback,
 * never a crash/empty), (2) no queue href points into the removed admin freight
 * tree, (3) the freightBadge count MECHANISM still works — kept as a toolbox
 * capability for when freight is rebuilt (docs/reference/freight-toolbox.md),
 * and (4) NON-freight resolution is UNCHANGED (no regression on cargo).
 *
 * Pure — no DB. workspace.ts only `import type`s the count types + value-imports
 * the pure isGodRole, so this runs on the tsx unit harness with no env.
 *
 * Run:  pnpm tsx lib/admin/workspace.test.ts   (wired into pnpm test)
 */

import {
  resolveWorkspace, queueCount, workspaceTotal,
  type WorkspaceQueue,
} from "./workspace";
import { ALL_FREIGHT_QUEUE_KEYS, type FreightQueueKey } from "../freight/freight-queue-keys";
import type { AdminRole } from "../auth/require-admin";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assert(label: string, cond: boolean) { assertEq(label, cond, true); }
function section(name: string) { console.log(`\n${name}`); }

const FREIGHT_ROLES: AdminRole[] = [
  "freight_sales_manager", "freight_sales",
  "freight_export_manager", "freight_export_cs", "freight_export_doc",
  "freight_export_clearance", "freight_clearance_both", "freight_export_messenger",
  "freight_import_manager", "freight_import_cs", "freight_import_doc",
  "freight_import_clearance", "freight_import_messenger",
];
const FREIGHT_KEY_SET = new Set<FreightQueueKey>(ALL_FREIGHT_QUEUE_KEYS);

// ── (a) freight roles still resolve GRACEFULLY (fallback, never empty/crash) ──
section("(a) each freight_* position falls back to a real workspace");
const CARGO_DEFAULT_HEADING = "พื้นที่งานของฉัน (ภาพรวม)";
for (const r of FREIGHT_ROLES) {
  const ws = resolveWorkspace([r], r);
  // 2026-08-07: the dedicated freight specs were removed with the admin pages.
  // The contract is now "never strand a seated staffer" — a real heading + queues.
  assert(`${r}: resolves to a real workspace (has queues)`, ws.queues.length > 0);
  assert(`${r}: heading is non-empty`, ws.headingTh.length > 0);
}

// ── (b) NO workspace queue points into the removed admin-freight tree ──
section("(b) no queue links to a deleted freight/customs admin page");
const DEAD_PREFIXES = [
  "/admin/freight/", "/admin/accounting/freight", "/admin/accounting/customs-declarations",
  "/admin/accounting/cargo-declarations", "/admin/accounting/customs-doc-kit",
  "/admin/accounting/hs-triage", "/admin/accounting/hs-consult",
  "/admin/pricing", "/admin/commission/freight", "/admin/bookings",
  "/admin/withdrawal/freight-th",
];
const ALL_ROLES: AdminRole[] = [...FREIGHT_ROLES, "super", "accounting", "warehouse",
  "sales", "sales_admin", "ops", "driver", "pricing"] as AdminRole[];
for (const r of ALL_ROLES) {
  for (const q of resolveWorkspace([r], r).queues) {
    assert(`${r}/${q.key}: href ไม่ชี้หน้าที่ลบไปแล้ว (${q.href})`,
      !DEAD_PREFIXES.some((d) => q.href.startsWith(d)));
    // A queue still carries EXACTLY one count source (cargo badge XOR freight badge).
    const sources = [q.badge, q.freightBadge].filter((x) => x !== undefined).length;
    assertEq(`${r}/${q.key}: exactly one count source`, sources, 1);
  }
}

// ── (c) queueCount resolves the freight count from the freight counts map ──
section("(c) queueCount reads freightBadge from FreightQueueCounts");
const fq: WorkspaceQueue = {
  key: "x", label: "x", freightBadge: "freightLeads", href: "/admin/freight/leads",
  nextAction: "x", icon: "Inbox",
};
const cq: WorkspaceQueue = {
  key: "y", label: "y", badge: "shopPending", href: "/admin/service-orders?q=1",
  nextAction: "y", icon: "ShoppingCart",
};
assertEq("freight queue + freightCounts → freight count", queueCount({}, fq, { freightLeads: 7 }), 7);
assertEq("freight queue + NO freightCounts → 0 (back-compat)", queueCount({}, fq), 0);
assertEq("freight queue ignores cargo counts", queueCount({ shopPending: 99 } as never, fq), 0);
assertEq("cargo queue still reads BadgeCounts", queueCount({ shopPending: 5 }, cq, { freightLeads: 7 }), 5);

// ── (d) workspaceTotal sums freight + cargo, de-duped, freight-aware ──
section("(d) workspaceTotal counts freight queues when freightCounts supplied");
const mixedWs = {
  workspaceRole: "freight_sales_manager" as AdminRole,
  headingTh: "x", isOversight: true,
  queues: [fq, { ...fq, key: "x2" }, cq], // fq twice (same freightBadge) → de-duped
};
assertEq("dedupes same freightBadge + adds cargo",
  workspaceTotal({ shopPending: 5 }, mixedWs, { freightLeads: 7 }), 12); // 7 (once) + 5
assertEq("no freightCounts → only cargo counts (freight → 0)",
  workspaceTotal({ shopPending: 5 }, mixedWs), 5);

// ── (e) NON-freight resolution UNCHANGED (regression guard) ──
section("(e) non-freight workspaces still resolve as before");
const wh = resolveWorkspace(["warehouse"], "warehouse");
assertEq("warehouse heading", wh.headingTh, "พื้นที่งานโกดัง (Warehouse)");
assert("warehouse queues are all cargo (no freightBadge)",
  wh.queues.length > 0 && wh.queues.every((q) => q.freightBadge === undefined && q.badge !== undefined));

const acc = resolveWorkspace(["accounting"], "accounting");
assert("accounting → cargo finance queues, no freight queues",
  acc.queues.length > 0 && acc.queues.every((q) => q.freightBadge === undefined));

// god-nav with no position → the cargo oversight DEFAULT (unchanged).
const god = resolveWorkspace(["super"], null);
assertEq("super/no-position → cargo oversight DEFAULT", god.headingTh, CARGO_DEFAULT_HEADING);
assert("DEFAULT is cargo-only (no freight queues)",
  god.queues.every((q) => q.freightBadge === undefined));

// a position ALWAYS wins over the tier — and after the 2026-08-07 cut a seated
// freight person lands on the cargo oversight DEFAULT instead of a dead page.
const seated = resolveWorkspace(["super"], "freight_import_cs");
assert("super-tier seated as freight_import_cs → ยังได้ workspace ที่เปิดได้จริง",
  seated.queues.length > 0 && seated.queues.every((q) => !q.href.startsWith("/admin/freight/")));

// ── (f) ALL_FREIGHT_QUEUE_KEYS is exhaustive (no key drift) ──
section("(f) freight queue-key list is complete");
assertEq("ALL_FREIGHT_QUEUE_KEYS has 8 keys", ALL_FREIGHT_QUEUE_KEYS.length, 8);
assertEq("no duplicate freight keys", new Set(ALL_FREIGHT_QUEUE_KEYS).size, ALL_FREIGHT_QUEUE_KEYS.length);

console.log(`\n${fail === 0 ? "✅" : "❌"} workspace freight lane: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
