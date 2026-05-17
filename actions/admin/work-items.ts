"use server";

/**
 * 0080 — Cross-department work-board (work_items) admin actions.
 *
 * Per docs/research/operating-system-analysis-2026-05-18.md §1.4 — the
 * Tier-2 centrepiece. work_items is a thin ADDITIVE overlay table that
 * indexes the domain rows (forwarder / service_order / container /
 * freight / invoice / declaration / contact / refund / QA) into one
 * assignable, queryable flow. This file is its mutation surface.
 *
 * Surface area V1:
 *   adminCreateWorkItem        — create a board entry (manual entry)
 *   adminAssignWorkItem        — (re)assign to a role + optional person
 *   adminAdvanceWorkItem       — move status along the lifecycle
 *   adminSetWorkItemPriority   — change priority
 *   ensureWorkItemForEntity    — idempotent find-or-create; the ADDITIVE
 *                                hook a domain Server Action can call
 *                                post-status-change (reuses the
 *                                ensure_work_item() DB function so the
 *                                spine never rewrites domain tables)
 *
 * RBAC: every action is gated `withAdmin(["super","ops"])` — work
 * coordination is an operations function (the 0080 RLS write policy is
 * pinned to the same super+ops pair). The board READ is broad (every
 * operational role — that is the cross-department-visibility point);
 * WRITES route through here.
 *
 * Concurrency: status / assignment / priority writes all carry an
 * optimistic `.eq("status", expectedFrom)` (or `.eq("id", …)` +
 * pre-read) race-guard so two admins acting on the same card cannot
 * silently clobber each other — the second write affects 0 rows and
 * returns a clear conflict error. Mirrors the commission-withdrawal +
 * customs-declaration patterns.
 *
 * All mutations log to admin_audit_log per ADR-0014.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  createWorkItemSchema,      type CreateWorkItemInput,
  assignWorkItemSchema,      type AssignWorkItemInput,
  advanceWorkItemSchema,     type AdvanceWorkItemInput,
  setWorkItemPrioritySchema, type SetWorkItemPriorityInput,
  WORK_STATUS_TRANSITIONS,
  type WorkEntityType,
  type WorkType,
  type WorkStatus,
  type WorkAssignableRole,
  type WorkPriority,
} from "@/lib/validators/work-item";

const ROLES = ["super", "ops"] as const;

/** Re-render every surface that reads work_items. */
function revalidateBoard(): void {
  revalidatePath("/admin/board");
  revalidatePath("/admin/board/inbox");
}

/** Normalise an optional form field ("" → undefined). */
function emptyToNull(v: string | undefined): string | null {
  return v && v.trim().length > 0 ? v.trim() : null;
}

// ────────────────────────────────────────────────────────────
// 1) Create a work_item (manual board entry)
// ────────────────────────────────────────────────────────────

export async function adminCreateWorkItem(
  input: CreateWorkItemInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createWorkItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const assignedTo = emptyToNull(d.assigned_to);
    const dueAt      = emptyToNull(d.due_at);

    const { data: row, error } = await admin
      .from("work_items")
      .insert({
        entity_type:   d.entity_type,
        entity_ref:    d.entity_ref,
        type:          d.type,
        title:         d.title,
        note:          emptyToNull(d.note),
        status:        "open",
        priority:      d.priority,
        assigned_role: d.assigned_role,
        assigned_to:   assignedTo,
        due_at:        dueAt ? new Date(dueAt).toISOString() : null,
        created_by:    adminId,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !row) {
      return { ok: false, error: error?.message ?? "create_failed" };
    }

    await logAdminAction(adminId, "work_item.create", "work_item", row.id, {
      entity_type:   d.entity_type,
      entity_ref:    d.entity_ref,
      type:          d.type,
      assigned_role: d.assigned_role,
      assigned_to:   assignedTo,
    });

    revalidateBoard();
    return { ok: true, data: { id: row.id } };
  });
}

// ────────────────────────────────────────────────────────────
// 2) (Re)assign a work_item
// ────────────────────────────────────────────────────────────

export async function adminAssignWorkItem(
  input: AssignWorkItemInput,
): Promise<AdminActionResult> {
  const parsed = assignWorkItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("work_items")
      .select("id, status, assigned_role, assigned_to")
      .eq("id", d.id)
      .maybeSingle<{
        id: string; status: string;
        assigned_role: string; assigned_to: string | null;
      }>();
    if (!existing) return { ok: false, error: "not_found" };
    if (existing.status === "done" || existing.status === "cancelled") {
      return { ok: false, error: `closed:${existing.status}` };
    }

    const assignedTo = emptyToNull(d.assigned_to);

    // Optimistic race-guard: assignment is only valid while the item is
    // still in the status we read. If another admin closed it in the
    // race window, this affects 0 rows.
    const { data: updated, error } = await admin
      .from("work_items")
      .update({
        assigned_role: d.assigned_role,
        assigned_to:   assignedTo,
      })
      .eq("id", d.id)
      .eq("status", existing.status)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "conflict_retry" };

    await logAdminAction(adminId, "work_item.assign", "work_item", d.id, {
      before: { assigned_role: existing.assigned_role, assigned_to: existing.assigned_to },
      after:  { assigned_role: d.assigned_role,        assigned_to: assignedTo },
    });

    revalidateBoard();
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Advance a work_item's status
// ────────────────────────────────────────────────────────────
//
// The from→to hop is validated against WORK_STATUS_TRANSITIONS, and the
// DB write carries `.eq("status", from)` — so if the card already moved
// (another admin), the update affects 0 rows and returns a conflict.

export async function adminAdvanceWorkItem(
  input: AdvanceWorkItemInput,
): Promise<AdminActionResult<{ status: WorkStatus }>> {
  const parsed = advanceWorkItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, from, to } = parsed.data;

  // Reject an illegal lifecycle hop before touching the DB.
  const legal = WORK_STATUS_TRANSITIONS[from as WorkStatus] ?? [];
  if (!legal.includes(to as WorkStatus)) {
    return { ok: false, error: `illegal_transition:${from}->${to}` };
  }

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("work_items")
      .select("id, status")
      .eq("id", id)
      .maybeSingle<{ id: string; status: string }>();
    if (!existing) return { ok: false, error: "not_found" };
    if (existing.status !== from) {
      // Card already moved — the caller's `from` is stale.
      return { ok: false, error: `bad_status:${existing.status}` };
    }

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { status: to };
    // Lifecycle stamps — set once on the entering transition.
    if (to === "in_progress" && existing.status !== "in_progress") {
      patch.started_at = nowIso;
    }
    if (to === "done" || to === "cancelled") {
      patch.closed_at = nowIso;
      patch.closed_by = adminId;
    }

    // Optimistic race-guard: the `.eq("status", from)` makes the write a
    // no-op (0 rows) if another admin advanced it first.
    const { data: updated, error } = await admin
      .from("work_items")
      .update(patch)
      .eq("id", id)
      .eq("status", from)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "conflict_retry" };

    await logAdminAction(adminId, "work_item.advance", "work_item", id, {
      from, to,
    });

    revalidateBoard();
    return { ok: true, data: { status: to as WorkStatus } };
  });
}

// ────────────────────────────────────────────────────────────
// 4) Change a work_item's priority
// ────────────────────────────────────────────────────────────

export async function adminSetWorkItemPriority(
  input: SetWorkItemPriorityInput,
): Promise<AdminActionResult> {
  const parsed = setWorkItemPrioritySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, priority } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("work_items")
      .select("id, status, priority")
      .eq("id", id)
      .maybeSingle<{ id: string; status: string; priority: string }>();
    if (!existing) return { ok: false, error: "not_found" };
    if (existing.status === "done" || existing.status === "cancelled") {
      return { ok: false, error: `closed:${existing.status}` };
    }
    if (existing.priority === priority) return { ok: true };   // idempotent no-op

    const { data: updated, error } = await admin
      .from("work_items")
      .update({ priority })
      .eq("id", id)
      .eq("status", existing.status)                            // optimistic race-guard
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "conflict_retry" };

    await logAdminAction(adminId, "work_item.set_priority", "work_item", id, {
      before: existing.priority, after: priority,
    });

    revalidateBoard();
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 5) ensureWorkItemForEntity — the ADDITIVE cascade hook
// ────────────────────────────────────────────────────────────
//
// §1.4: the work_items spine should be opened/advanced by the same
// status-change events the U1-2 cascade already fires on. Rather than a
// DB trigger across 10 heterogeneous domain tables, a domain Server
// Action (e.g. adminSetContainerStatus, adminMarkFreightDelivered)
// calls THIS, best-effort, AFTER its own status change. It delegates to
// the idempotent ensure_work_item() DB function (0080 §5): if a
// non-closed work_item already exists for (entity_type, entity_ref) it
// is returned untouched; otherwise one is created at status='open'.
//
// Best-effort by contract — a board-hook failure must NEVER roll back
// the domain status change. Callers should ignore a non-ok result (the
// domain action already succeeded; a missing board card is recoverable
// by a manual create). It is intentionally NOT wrapped in withAdmin:
// the caller already passed its own requireAdmin gate, and this only
// ever inserts an 'open' overlay row — no money, no domain mutation.

export async function ensureWorkItemForEntity(args: {
  entityType:   WorkEntityType;
  entityRef:    string;
  type:         WorkType;
  title:        string;
  assignedRole?: WorkAssignableRole;
  priority?:     WorkPriority;
  dueAt?:        string | null;
}): Promise<AdminActionResult<{ id: string }>> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("ensure_work_item", {
      p_entity_type:   args.entityType,
      p_entity_ref:    args.entityRef,
      p_type:          args.type,
      p_title:         args.title,
      p_assigned_role: args.assignedRole ?? "ops",
      p_priority:      args.priority ?? "normal",
      p_due_at:        args.dueAt ?? null,
    });
    if (error) return { ok: false, error: error.message };

    revalidateBoard();
    return { ok: true, data: { id: data as string } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ensure_failed" };
  }
}
