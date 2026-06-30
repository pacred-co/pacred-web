/**
 * G1 freight lane — per-position WORKSPACE resolution + freight queue counts.
 *
 * Locks (1) that every freight_* role resolves to a DEDICATED freight workspace
 * (not the cargo oversight DEFAULT — the bug this lane fixed), (2) that those
 * freight queues carry `freightBadge` keys (counted from the freight SOT, not a
 * cargo BadgeKey), (3) that every `freightBadge` used is a real FreightQueueKey,
 * and (4) that NON-freight resolution is UNCHANGED (no regression).
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

// ── (a) every freight role → a DEDICATED freight workspace (not the cargo default) ──
section("(a) each freight_* position resolves to a freight workspace");
const CARGO_DEFAULT_HEADING = "พื้นที่งานของฉัน (ภาพรวม)";
for (const r of FREIGHT_ROLES) {
  const ws = resolveWorkspace([r], r);
  assert(`${r}: heading is freight-specific (not the cargo DEFAULT)`,
    ws.headingTh !== CARGO_DEFAULT_HEADING && ws.queues.length > 0);
  // It must own at least one freight queue (a freightBadge), not only cargo queues.
  assert(`${r}: owns ≥1 freight queue`,
    ws.queues.some((q) => q.freightBadge !== undefined));
}

// ── (b) every freightBadge used in any freight workspace is a real FreightQueueKey ──
section("(b) freight queue keys are valid + counted from the freight SOT");
for (const r of FREIGHT_ROLES) {
  const ws = resolveWorkspace([r], r);
  for (const q of ws.queues) {
    if (q.freightBadge !== undefined) {
      assert(`${r}/${q.key}: '${q.freightBadge}' is a FreightQueueKey`,
        FREIGHT_KEY_SET.has(q.freightBadge));
    }
    // A queue carries EXACTLY one count source (cargo badge XOR freight badge).
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

// a position ALWAYS wins over the tier — a super-tier person seated as freight CS
// gets the freight workspace (the position is the job).
const seated = resolveWorkspace(["super"], "freight_import_cs");
assert("super-tier seated as freight_import_cs → freight workspace",
  seated.queues.some((q) => q.freightBadge !== undefined));

// ── (f) ALL_FREIGHT_QUEUE_KEYS is exhaustive (no key drift) ──
section("(f) freight queue-key list is complete");
assertEq("ALL_FREIGHT_QUEUE_KEYS has 8 keys", ALL_FREIGHT_QUEUE_KEYS.length, 8);
assertEq("no duplicate freight keys", new Set(ALL_FREIGHT_QUEUE_KEYS).size, ALL_FREIGHT_QUEUE_KEYS.length);

console.log(`\n${fail === 0 ? "✅" : "❌"} workspace freight lane: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
