"use server";

/**
 * IO-1 — platform_incidents triage admin actions (design doc §6.5).
 *
 * The mutation surface for the /admin/incidents triage queue. An
 * incident is auto-captured (no button) into platform_incidents (0077)
 * by the capture rails; THIS file is how a dev advances it through the
 * visible lifecycle the owner asked for:
 *
 *   acknowledgeIncident  — open → acknowledged   (assigns self)
 *   markIncidentInProgress — acknowledged → in_progress
 *   resolveIncident      — → resolved            (resolution note required)
 *   ignoreIncident       — → ignored             (not a real bug)
 *   assignIncident       — (re)assign to an admin
 *   spawnFixWorkItem     — bridge the incident to a work_item (§2.7)
 *
 * RBAC: every action is gated `withAdmin(["super","ops"])` — triage is
 * an operations function (mirrors the work_items 0080 write posture;
 * ops is the operations-coordinator role). The /admin/incidents READ
 * is broader (every office role — design doc §6.5).
 *
 * Concurrency: each status write validates the from→to hop against
 * INCIDENT_STATUS_TRANSITIONS, then carries an optimistic
 * `.eq("status", expectedFrom)` race-guard so two devs acting on the
 * same incident cannot silently clobber each other — the second write
 * affects 0 rows and returns a clear conflict error. Mirrors
 * actions/admin/work-items.ts.
 *
 * All mutations log to admin_audit_log via logAdminAction (ADR-0014).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  acknowledgeIncidentSchema, type AcknowledgeIncidentInput,
  markInProgressSchema,      type MarkInProgressInput,
  resolveIncidentSchema,     type ResolveIncidentInput,
  ignoreIncidentSchema,      type IgnoreIncidentInput,
  assignIncidentSchema,      type AssignIncidentInput,
  spawnFixWorkItemSchema,    type SpawnFixWorkItemInput,
  INCIDENT_STATUS_TRANSITIONS,
  type IncidentStatus,
} from "@/lib/validators/platform-incident";

const ROLES = ["super", "ops"] as const;

/** Re-render every surface that reads platform_incidents. */
function revalidateIncidents(): void {
  revalidatePath("/admin/incidents");
}

type IncidentRow = {
  id:              string;
  status:          string;
  severity:        string;
  title:           string;
  route:           string | null;
  assigned_to:     string | null;
  acknowledged_at: string | null;
  work_item_id:    string | null;
};

/** Read the incident's current triage-relevant columns. */
async function readIncident(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<IncidentRow | null> {
  const { data, error } = await admin
    .from("platform_incidents")
    .select("id, status, severity, title, route, assigned_to, acknowledged_at, work_item_id")
    .eq("id", id)
    .maybeSingle<IncidentRow>();
  if (error) {
    console.error(`[platform_incidents list] failed`, { code: error.code, message: error.message });
  }
  return data ?? null;
}

/** Validate a from→to hop against the lifecycle whitelist. */
function isLegalTransition(from: string, to: IncidentStatus): boolean {
  const legal = INCIDENT_STATUS_TRANSITIONS[from as IncidentStatus] ?? [];
  return legal.includes(to);
}

// ────────────────────────────────────────────────────────────
// 1) Acknowledge — open → acknowledged (assigns self)
// ────────────────────────────────────────────────────────────

export async function acknowledgeIncident(
  input: AcknowledgeIncidentInput,
): Promise<AdminActionResult> {
  const parsed = acknowledgeIncidentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const existing = await readIncident(admin, id);
    if (!existing) return { ok: false, error: "not_found" };
    if (!isLegalTransition(existing.status, "acknowledged")) {
      return { ok: false, error: `illegal_transition:${existing.status}->acknowledged` };
    }

    const nowIso = new Date().toISOString();
    // Optimistic race-guard — the .eq("status", from) makes the write a
    // no-op if another dev already moved it.
    const { data: updated, error } = await admin
      .from("platform_incidents")
      .update({
        status:          "acknowledged",
        assigned_to:     adminId,
        acknowledged_at: nowIso,
      })
      .eq("id", id)
      .eq("status", existing.status)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "conflict_retry" };

    await logAdminAction(adminId, "incident.acknowledge", "platform_incident", id, {
      from: existing.status,
    });

    revalidateIncidents();
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Mark in progress — acknowledged → in_progress
// ────────────────────────────────────────────────────────────

export async function markIncidentInProgress(
  input: MarkInProgressInput,
): Promise<AdminActionResult> {
  const parsed = markInProgressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const existing = await readIncident(admin, id);
    if (!existing) return { ok: false, error: "not_found" };
    if (!isLegalTransition(existing.status, "in_progress")) {
      return { ok: false, error: `illegal_transition:${existing.status}->in_progress` };
    }

    const { data: updated, error } = await admin
      .from("platform_incidents")
      .update({ status: "in_progress" })
      .eq("id", id)
      .eq("status", existing.status)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "conflict_retry" };

    await logAdminAction(adminId, "incident.in_progress", "platform_incident", id, {
      from: existing.status,
    });

    revalidateIncidents();
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Resolve — → resolved (resolution note required)
// ────────────────────────────────────────────────────────────

export async function resolveIncident(
  input: ResolveIncidentInput,
): Promise<AdminActionResult> {
  const parsed = resolveIncidentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, note } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const existing = await readIncident(admin, id);
    if (!existing) return { ok: false, error: "not_found" };
    if (!isLegalTransition(existing.status, "resolved")) {
      return { ok: false, error: `illegal_transition:${existing.status}->resolved` };
    }

    const nowIso = new Date().toISOString();
    // The 0077 *_triaged_consistent CHECK requires acknowledged_at +
    // assigned_to on a resolved row. If the dev resolved straight from
    // a state that somehow lacks them, backfill self here so the CHECK
    // holds (the legal transitions never allow open→resolved, but a
    // defensive backfill keeps the write safe).
    const patch: Record<string, unknown> = {
      status:          "resolved",
      resolved_at:     nowIso,
      resolution_note: note,
    };
    if (!existing.acknowledged_at) patch.acknowledged_at = nowIso;
    if (!existing.assigned_to)     patch.assigned_to     = adminId;

    const { data: updated, error } = await admin
      .from("platform_incidents")
      .update(patch)
      .eq("id", id)
      .eq("status", existing.status)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "conflict_retry" };

    await logAdminAction(adminId, "incident.resolve", "platform_incident", id, {
      from: existing.status,
      note,
    });

    revalidateIncidents();
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 4) Ignore — → ignored (not a real bug)
// ────────────────────────────────────────────────────────────

export async function ignoreIncident(
  input: IgnoreIncidentInput,
): Promise<AdminActionResult> {
  const parsed = ignoreIncidentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id } = parsed.data;
  const note = parsed.data.note && parsed.data.note.trim().length > 0
    ? parsed.data.note.trim()
    : null;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const existing = await readIncident(admin, id);
    if (!existing) return { ok: false, error: "not_found" };
    if (!isLegalTransition(existing.status, "ignored")) {
      return { ok: false, error: `illegal_transition:${existing.status}->ignored` };
    }

    // 'ignored' is a terminal close — no CHECK requires assignee/note,
    // but record the dismiss reason in resolution_note for the audit
    // trail when one is given.
    const patch: Record<string, unknown> = { status: "ignored" };
    if (note) patch.resolution_note = note;

    const { data: updated, error } = await admin
      .from("platform_incidents")
      .update(patch)
      .eq("id", id)
      .eq("status", existing.status)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "conflict_retry" };

    await logAdminAction(adminId, "incident.ignore", "platform_incident", id, {
      from: existing.status,
      note,
    });

    revalidateIncidents();
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 5) Assign / reassign — pin the incident to an admin
// ────────────────────────────────────────────────────────────

export async function assignIncident(
  input: AssignIncidentInput,
): Promise<AdminActionResult> {
  const parsed = assignIncidentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, assignee } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const existing = await readIncident(admin, id);
    if (!existing) return { ok: false, error: "not_found" };
    if (existing.status === "resolved" || existing.status === "ignored") {
      return { ok: false, error: `closed:${existing.status}` };
    }

    // The assignee must be an active admin (an incident is never
    // assigned to a non-staff profile).
    const { data: assigneeAdmin, error: assigneeAdminErr } = await admin
      .from("admins")
      .select("profile_id")
      .eq("profile_id", assignee)
      .eq("is_active", true)
      .maybeSingle<{ profile_id: string }>();
    if (assigneeAdminErr) {
      console.error(`[admins mutation lookup] failed`, { code: assigneeAdminErr.code, message: assigneeAdminErr.message });
      return { ok: false, error: `db_error:${assigneeAdminErr.code ?? "unknown"}` };
    }
    if (!assigneeAdmin) return { ok: false, error: "assignee_not_admin" };

    const nowIso = new Date().toISOString();
    // Assigning also moves an 'open' incident to 'acknowledged' so the
    // *_triaged_consistent CHECK (assigned_to ⇒ acknowledged_at) holds.
    const patch: Record<string, unknown> = { assigned_to: assignee };
    if (existing.status === "open") {
      patch.status = "acknowledged";
      patch.acknowledged_at = existing.acknowledged_at ?? nowIso;
    }

    const { data: updated, error } = await admin
      .from("platform_incidents")
      .update(patch)
      .eq("id", id)
      .eq("status", existing.status)         // optimistic race-guard
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) return { ok: false, error: error.message };
    if (!updated) return { ok: false, error: "conflict_retry" };

    await logAdminAction(adminId, "incident.assign", "platform_incident", id, {
      before: existing.assigned_to,
      after:  assignee,
    });

    revalidateIncidents();
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 6) Spawn a fix work_item — the §2.7 bridge
// ────────────────────────────────────────────────────────────
//
// A triaged incident that needs a code fix MAY spawn a work_item (a
// 'doc_issue' / 'general' kind) via the existing ensure_work_item() DB
// function. The link is platform_incidents.work_item_id. Incident =
// "something broke + its triage status"; work_item = "a human must
// now do the fix" — one bridges to the other.

export async function spawnFixWorkItem(
  input: SpawnFixWorkItemInput,
): Promise<AdminActionResult<{ workItemId: string }>> {
  const parsed = spawnFixWorkItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const existing = await readIncident(admin, id);
    if (!existing) return { ok: false, error: "not_found" };
    if (existing.work_item_id) {
      // Idempotent — a fix job already exists for this incident.
      return { ok: true, data: { workItemId: existing.work_item_id } };
    }

    // ensure_work_item() is the idempotent find-or-create DB function
    // (0080 §5). entity_type='platform_incident' / entity_ref = the
    // incident id — an incident has no domain row, so the work_item
    // points back at the incident itself (the entity_type value 0077
    // adds to the work_items CHECK). type='general' (a valid WORK_TYPE).
    const title = `แก้บั๊ก: ${existing.title}`.slice(0, 200);
    const { data: wiId, error: rpcErr } = await admin.rpc("ensure_work_item", {
      p_entity_type:   "platform_incident",
      p_entity_ref:    id,
      p_type:          "general",
      p_title:         title,
      p_assigned_role: "ops",
      p_priority:      existing.severity === "critical" ? "urgent" : "high",
      p_due_at:        null,
    });

    if (rpcErr || !wiId) {
      return { ok: false, error: rpcErr?.message ?? "work_item_create_failed" };
    }

    // Link the incident → the work_item.
    const { error: linkErr } = await admin
      .from("platform_incidents")
      .update({ work_item_id: wiId as string })
      .eq("id", id);
    if (linkErr) return { ok: false, error: linkErr.message };

    await logAdminAction(adminId, "incident.spawn_work_item", "platform_incident", id, {
      work_item_id: wiId,
    });

    revalidateIncidents();
    revalidatePath("/admin/board");
    return { ok: true, data: { workItemId: wiId as string } };
  });
}
