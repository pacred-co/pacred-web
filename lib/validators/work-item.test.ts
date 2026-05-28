/**
 * 0080 — work-board (work_items) validator + helper unit tests.
 *
 * Covers the Zod contract + pure helpers for the cross-department
 * work-board (operating-system-analysis-2026-05-18.md §1.4):
 *
 *   1. WORK_ENTITY_TYPES / WORK_TYPES / WORK_STATUSES / WORK_PRIORITIES /
 *      WORK_ASSIGNABLE_ROLES — enum sets + their *_LABEL maps
 *      (every key must have a non-empty Thai label)
 *   2. WORK_STATUS_TRANSITIONS — terminal states have no exits; the legal
 *      hops are exactly the documented lifecycle
 *   3. createWorkItemSchema / assignWorkItemSchema / advanceWorkItemSchema /
 *      setWorkItemPrioritySchema — accept valid input, reject malformed
 *   4. workEntityHref — every entity type yields a non-empty /admin path
 *   5. isWorkItemOverdue — past-due active → true; done/cancelled/no-due → false
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  WORK_ENTITY_TYPES,
  WORK_ENTITY_LABEL,
  WORK_TYPES,
  WORK_TYPE_LABEL,
  WORK_STATUSES,
  WORK_STATUS_LABEL,
  WORK_STATUS_TRANSITIONS,
  WORK_PRIORITIES,
  WORK_PRIORITY_LABEL,
  WORK_PRIORITY_WEIGHT,
  WORK_ASSIGNABLE_ROLES,
  WORK_ROLE_LABEL,
  createWorkItemSchema,
  assignWorkItemSchema,
  advanceWorkItemSchema,
  setWorkItemPrioritySchema,
  workEntityHref,
  isWorkItemOverdue,
  type WorkEntityType,
  type WorkStatus,
} from "./work-item";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}

console.log("work-item validators (0080 work-board)");

// Valid RFC-4122 v4 UUIDs (Zod v4 .uuid() checks the version nibble).
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-9222-222222222222";

// ────────────────────────────────────────────────────────────
// (a) enum sets + label-map completeness
// ────────────────────────────────────────────────────────────
console.log("  (a) enum sets + label maps");
{
  assert("10 entity types",   WORK_ENTITY_TYPES.length === 10);
  assert("10 work types",     WORK_TYPES.length === 10);
  assert("5 statuses",        WORK_STATUSES.length === 5);
  assert("4 priorities",      WORK_PRIORITIES.length === 4);
  assert("7 assignable roles",WORK_ASSIGNABLE_ROLES.length === 7);

  // Roles must stay within admins.role (super/ops/accounting/sales_admin
  // + warehouse/driver from 0033 + interpreter from 0054).
  assert("roles match admins.role enum",
    ["super","ops","accounting","sales_admin","warehouse","driver","interpreter"]
      .every((r) => (WORK_ASSIGNABLE_ROLES as readonly string[]).includes(r)));

  // Every enum value must have a non-empty label (the board UI relies on it).
  assert("every entity type has a label",
    WORK_ENTITY_TYPES.every((t) => (WORK_ENTITY_LABEL[t] ?? "").length > 0));
  assert("every work type has a label",
    WORK_TYPES.every((t) => (WORK_TYPE_LABEL[t] ?? "").length > 0));
  assert("every status has a label",
    WORK_STATUSES.every((s) => (WORK_STATUS_LABEL[s] ?? "").length > 0));
  assert("every priority has a label",
    WORK_PRIORITIES.every((p) => (WORK_PRIORITY_LABEL[p] ?? "").length > 0));
  assert("every priority has a weight",
    WORK_PRIORITIES.every((p) => typeof WORK_PRIORITY_WEIGHT[p] === "number"));
  assert("every role has a label",
    WORK_ASSIGNABLE_ROLES.every((r) => (WORK_ROLE_LABEL[r] ?? "").length > 0));

  assert("urgent outranks low",
    WORK_PRIORITY_WEIGHT.urgent > WORK_PRIORITY_WEIGHT.low);
}

// ────────────────────────────────────────────────────────────
// (b) status transitions — terminal states + legal hops
// ────────────────────────────────────────────────────────────
console.log("  (b) status transition map");
{
  assert("done is terminal",      WORK_STATUS_TRANSITIONS.done.length === 0);
  assert("cancelled is terminal", WORK_STATUS_TRANSITIONS.cancelled.length === 0);
  assert("open → in_progress legal",
    WORK_STATUS_TRANSITIONS.open.includes("in_progress"));
  assert("in_progress → done legal",
    WORK_STATUS_TRANSITIONS.in_progress.includes("done"));
  assert("open → done NOT legal (must go in_progress first)",
    !WORK_STATUS_TRANSITIONS.open.includes("done"));
  assert("blocked → open (unblock) legal",
    WORK_STATUS_TRANSITIONS.blocked.includes("open"));
  assert("every active status can be cancelled",
    (["open","in_progress","blocked"] as WorkStatus[])
      .every((s) => WORK_STATUS_TRANSITIONS[s].includes("cancelled")));
  // Every listed transition target is itself a valid status.
  assert("transition targets are valid statuses",
    WORK_STATUSES.every((s) =>
      WORK_STATUS_TRANSITIONS[s].every((t) =>
        (WORK_STATUSES as readonly string[]).includes(t))));
}

// ────────────────────────────────────────────────────────────
// (c) createWorkItemSchema
// ────────────────────────────────────────────────────────────
console.log("  (c) createWorkItemSchema");
{
  const ok = createWorkItemSchema.safeParse({
    entity_type:   "forwarder",
    entity_ref:    "F260518-3",
    type:          "payment_followup",
    title:         "ตามชำระค่าขนส่ง",
    assigned_role: "accounting",
    priority:      "high",
  });
  assert("valid create accepted", ok.success);

  assert("empty entity_ref rejected",
    !createWorkItemSchema.safeParse({
      entity_type: "forwarder", entity_ref: "  ", type: "general",
      title: "x", assigned_role: "ops",
    }).success);

  assert("empty title rejected",
    !createWorkItemSchema.safeParse({
      entity_type: "forwarder", entity_ref: "F1", type: "general",
      title: "", assigned_role: "ops",
    }).success);

  assert("unknown entity_type rejected",
    !createWorkItemSchema.safeParse({
      entity_type: "nope", entity_ref: "F1", type: "general",
      title: "x", assigned_role: "ops",
    }).success);

  assert("unknown work type rejected",
    !createWorkItemSchema.safeParse({
      entity_type: "forwarder", entity_ref: "F1", type: "explode",
      title: "x", assigned_role: "ops",
    }).success);

  assert("unknown assigned_role rejected",
    !createWorkItemSchema.safeParse({
      entity_type: "forwarder", entity_ref: "F1", type: "general",
      title: "x", assigned_role: "ceo",
    }).success);

  // priority defaults to normal when omitted.
  const dflt = createWorkItemSchema.safeParse({
    entity_type: "contact_message", entity_ref: UUID_A, type: "cs_followup",
    title: "ลูกค้าถามเรื่องตู้", assigned_role: "ops",
  });
  assert("priority defaults to normal",
    dflt.success && dflt.data.priority === "normal");

  // over-length title rejected.
  assert("over-200-char title rejected",
    !createWorkItemSchema.safeParse({
      entity_type: "forwarder", entity_ref: "F1", type: "general",
      title: "x".repeat(201), assigned_role: "ops",
    }).success);
}

// ────────────────────────────────────────────────────────────
// (d) assignWorkItemSchema
// ────────────────────────────────────────────────────────────
console.log("  (d) assignWorkItemSchema");
{
  assert("assign to a role only accepted",
    assignWorkItemSchema.safeParse({
      id: UUID_A, assigned_role: "warehouse",
    }).success);

  assert("assign to a role + person accepted",
    assignWorkItemSchema.safeParse({
      id: UUID_A, assigned_role: "warehouse", assigned_to: UUID_B,
    }).success);

  assert("non-uuid id rejected",
    !assignWorkItemSchema.safeParse({
      id: "not-a-uuid", assigned_role: "ops",
    }).success);

  assert("non-uuid assigned_to rejected",
    !assignWorkItemSchema.safeParse({
      id: UUID_A, assigned_role: "ops", assigned_to: "x",
    }).success);
}

// ────────────────────────────────────────────────────────────
// (e) advanceWorkItemSchema
// ────────────────────────────────────────────────────────────
console.log("  (e) advanceWorkItemSchema");
{
  assert("valid advance accepted",
    advanceWorkItemSchema.safeParse({
      id: UUID_A, from: "open", to: "in_progress",
    }).success);

  assert("unknown from status rejected",
    !advanceWorkItemSchema.safeParse({
      id: UUID_A, from: "weird", to: "done",
    }).success);

  assert("unknown to status rejected",
    !advanceWorkItemSchema.safeParse({
      id: UUID_A, from: "open", to: "weird",
    }).success);
}

// ────────────────────────────────────────────────────────────
// (f) setWorkItemPrioritySchema
// ────────────────────────────────────────────────────────────
console.log("  (f) setWorkItemPrioritySchema");
{
  assert("valid priority change accepted",
    setWorkItemPrioritySchema.safeParse({
      id: UUID_A, priority: "urgent",
    }).success);
  assert("unknown priority rejected",
    !setWorkItemPrioritySchema.safeParse({
      id: UUID_A, priority: "extreme",
    }).success);
}

// ────────────────────────────────────────────────────────────
// (g) workEntityHref
// ────────────────────────────────────────────────────────────
console.log("  (g) workEntityHref");
{
  assert("every entity type yields an /admin path",
    WORK_ENTITY_TYPES.every((t) => {
      const href = workEntityHref(t as WorkEntityType, "REF123");
      return href.startsWith("/admin/");
    }));
  assert("forwarder href embeds the ref",
    workEntityHref("forwarder", "F260518-1") === "/admin/forwarders/F260518-1");
  // Wave 3 cleanup (2026-05-20 ค่ำ): spine retired; cargo_container legacy
  // work_item rows now route to the faithful /admin/report-cnt landing.
  assert("retired cargo_container href routes to /admin/report-cnt",
    workEntityHref("cargo_container", "GZE260518-1")
      === "/admin/report-cnt");
}

// ────────────────────────────────────────────────────────────
// (h) isWorkItemOverdue
// ────────────────────────────────────────────────────────────
console.log("  (h) isWorkItemOverdue");
{
  const now  = new Date("2026-05-18T12:00:00Z");
  const past = "2026-05-17T12:00:00Z";
  const fut  = "2026-05-19T12:00:00Z";

  assert("past-due open item is overdue",
    isWorkItemOverdue(past, "open", now));
  assert("past-due in_progress item is overdue",
    isWorkItemOverdue(past, "in_progress", now));
  assert("future-due item is NOT overdue",
    !isWorkItemOverdue(fut, "open", now));
  assert("no due date → never overdue",
    !isWorkItemOverdue(null, "open", now));
  assert("done item is never overdue (even past due)",
    !isWorkItemOverdue(past, "done", now));
  assert("cancelled item is never overdue (even past due)",
    !isWorkItemOverdue(past, "cancelled", now));
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
