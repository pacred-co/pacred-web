/**
 * RBAC chokepoint test for the freight journey-catalog (W4 · 2026-06-30).
 * canRoleSetStatus is THE gate the advance-status action relies on — lock it.
 * Run: tsx lib/freight/journey-catalog.test.ts
 */
import assert from "node:assert";
import {
  canRoleSetStatus,
  allowedGroupsOf,
  mainStatusOf,
} from "./journey-catalog";
import type { AdminRole } from "@/lib/auth/require-admin";

let n = 0;
const t = (_name: string, fn: () => void) => { fn(); n++; };

// ── god / manager bypass ──────────────────────────────────────────
t("god bypasses everything", () => {
  assert.equal(canRoleSetStatus("PENDING", [] as AdminRole[], true), true);
  assert.equal(canRoleSetStatus("PREP_DOCS", ["accounting"] as AdminRole[], true), true);
});

t("no roles (non-god) → cannot set anything", () => {
  assert.equal(canRoleSetStatus("PENDING", [] as AdminRole[], false), false);
  assert.equal(canRoleSetStatus("PREP_DOCS", [] as AdminRole[], false), false);
});

// ── the per-group gate (the real RBAC) ────────────────────────────
t("sales-group code: sales can, accounting cannot", () => {
  assert.equal(canRoleSetStatus("PENDING", ["sales"] as AdminRole[], false), true);
  assert.equal(canRoleSetStatus("PENDING", ["accounting"] as AdminRole[], false), false);
});

t("document-group code: a freight doc role can, pricing cannot", () => {
  assert.equal(canRoleSetStatus("PREP_DOCS", ["freight_export_doc"] as AdminRole[], false), true);
  assert.equal(canRoleSetStatus("PREP_DOCS", ["pricing"] as AdminRole[], false), false);
});

t("operation-group code: warehouse can, sales cannot", () => {
  assert.equal(canRoleSetStatus("RECEIVE_GOODS", ["warehouse"] as AdminRole[], false), true);
  assert.equal(canRoleSetStatus("RECEIVE_GOODS", ["sales"] as AdminRole[], false), false);
});

t("a caller holding ANY allowed role passes (multi-role union)", () => {
  assert.equal(canRoleSetStatus("PENDING", ["accounting", "sales"] as AdminRole[], false), true);
});

// ── catalog integrity ─────────────────────────────────────────────
t("allowedGroupsOf reflects the meta", () => {
  assert.ok(allowedGroupsOf("PENDING").includes("sales"));
  assert.ok(allowedGroupsOf("PREP_DOCS").includes("document"));
  assert.ok(allowedGroupsOf("RECEIVE_GOODS").includes("operation"));
});

t("mainStatusOf maps + is null-safe", () => {
  assert.equal(mainStatusOf("PENDING"), "pending");
  assert.equal(typeof mainStatusOf(null), "string"); // null-safe (no throw)
});

console.log(`journey-catalog: ${n} passed`);
