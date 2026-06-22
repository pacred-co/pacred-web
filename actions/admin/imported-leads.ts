"use server";

/**
 * Imported-leads CRM workspace server actions (ปอน 2026-06-22).
 * Backs app/[locale]/(admin)/admin/leads/lead-assign-bar.tsx.
 *
 * Two tiers (ปอน: import/assign = ultra-only separate bar · เซลล์เห็น+ทำงาน lead
 * ที่มอบหมายให้ตัวเองในหน้าปกติ):
 *   WORK_ROLES   — view + call/status/service. Non-senior callers are FORCE-scoped
 *                  to their OWN assigned leads (no whole-pool PII read/mutate).
 *   IMPORT_ROLES — import (CSV) + assign-to-rep (the distribution actions).
 * Ultra/super bypass any role check via requireAdmin's god-role rule.
 * All writes go via createAdminClient (RLS bypass).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminLegacyId } from "@/lib/admin/default-queue-filter-server";
import { getCrmReps } from "@/actions/admin/crm";
import { isGodRole, type AdminRole } from "@/lib/auth/require-admin";
import { withAdmin, type AdminActionResult, logAdminAction } from "./common";
import {
  saveImportedLeadsSchema,
  assignImportedLeadsSchema,
  logImportedLeadCallSchema,
  setImportedLeadStatusSchema,
  setImportedLeadServiceSchema,
  setImportedLeadNoteSchema,
  handoffImportedLeadSchema,
} from "@/lib/validators/imported-lead";

const TABLE = "imported_leads";
const SELECT_COLS_BASE =
  "id, name, address, phone, line_facebook, email, service, source, assigned_admin_id, call_status, call_count, last_called_at";
// `note` = migration 0202 (owner-applied). getImportedLeads degrades gracefully
// if 0202 hasn't landed yet (retries without note) so the table never hard-breaks
// in the window between this code and the migration apply.
const SELECT_COLS = `${SELECT_COLS_BASE}, note`;

const WORK_ROLES = ["super", "manager", "sales_admin", "sales", "ops"] as const;
const IMPORT_ROLES = ["super", "manager", "sales_admin"] as const;

/** Senior = may see/mutate ANY lead (supervisor); else scoped to own assigned. */
function isSenior(roles: AdminRole[]): boolean {
  return isGodRole(roles) || roles.some((r) => (IMPORT_ROLES as readonly string[]).includes(r));
}

export type ImportedLead = {
  id: number;
  name: string;
  address: string;
  phone: string;
  line_facebook: string;
  email: string;
  service: string;
  source: string;
  assigned_admin_id: string;
  call_status: string;
  call_count: number;
  last_called_at: string | null;
  note: string;
};

/** List imported leads (newest first). Reps see only their own; `mine` also scopes seniors. */
export async function getImportedLeads(
  input?: { mine?: boolean },
): Promise<AdminActionResult<{ leads: ImportedLead[] }>> {
  return withAdmin<{ leads: ImportedLead[] }>([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    const scopeLegacy =
      !isSenior(roles) || input?.mine ? (await getAdminLegacyId(adminId)) ?? "__none__" : null;
    const build = (cols: string) => {
      let q = admin.from(TABLE).select(cols).order("id", { ascending: false }).limit(2000);
      if (scopeLegacy !== null) q = q.eq("assigned_admin_id", scopeLegacy);
      return q;
    };

    const { data, error } = await build(SELECT_COLS);
    if (error) {
      // 42703 = undefined_column → migration 0202 (note) not applied yet. Retry
      // without note so the workspace stays usable until the owner applies it.
      if (error.code === "42703") {
        const fb = await build(SELECT_COLS_BASE);
        if (!fb.error) {
          const rows = (fb.data ?? []) as unknown as Record<string, unknown>[];
          const leads = rows.map((d) => ({ ...d, note: "" })) as unknown as ImportedLead[];
          return { ok: true, data: { leads } };
        }
      }
      console.error("[imported_leads:list] failed", { code: error.code, message: error.message });
      return { ok: false, error: `query_failed: ${error.message}` };
    }
    return { ok: true, data: { leads: (data ?? []) as unknown as ImportedLead[] } };
  });
}

/** Insert a parsed CSV batch with its source (ultra/senior distribution). */
export async function saveImportedLeads(input: unknown): Promise<AdminActionResult<{ inserted: number }>> {
  const parsed = saveImportedLeadsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin<{ inserted: number }>([...IMPORT_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const rows = parsed.data.rows.map((r) => ({
      name: r.name,
      address: r.address,
      phone: r.phone,
      line_facebook: r.line_facebook,
      email: r.email,
      service: r.service,
      source: parsed.data.source,
      created_by: adminId,
    }));
    const { data, error } = await admin.from(TABLE).insert(rows).select("id");
    if (error) {
      console.error("[imported_leads:insert] failed", { code: error.code, message: error.message });
      return { ok: false, error: `insert_failed: ${error.message}` };
    }
    void logAdminAction(adminId, "imported_lead.import", TABLE, "bulk", {
      source: parsed.data.source,
      count: rows.length,
    });
    revalidatePath("/admin/leads");
    return { ok: true, data: { inserted: data?.length ?? 0 } };
  });
}

/** Assign (or clear) the chosen leads to a sales rep (ultra/senior distribution). */
export async function assignImportedLeads(input: unknown): Promise<AdminActionResult<{ assigned: number }>> {
  const parsed = assignImportedLeadsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin<{ assigned: number }>([...IMPORT_ROLES], async ({ adminId }) => {
    // Validate the target rep against the SAME pool the assign dropdown is built
    // from (getCrmReps → admin_contact_extras.legacy_admin_id) so a typo'd /
    // off-boarded id can't silently strand prospects ('' = clear assignment).
    // (Skip the guard if the rep list can't load — the UI already constrained it.)
    if (parsed.data.legacyId) {
      const repsRes = await getCrmReps();
      if (repsRes.ok) {
        const allowed = new Set((repsRes.data?.reps ?? []).map((r) => r.legacyId));
        if (!allowed.has(parsed.data.legacyId)) {
          return { ok: false, error: "invalid_rep" };
        }
      }
    }
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from(TABLE)
      .update({
        assigned_admin_id: parsed.data.legacyId,
        assigned_at: parsed.data.legacyId ? nowIso : null,
        updated_at: nowIso,
      })
      .in("id", parsed.data.ids)
      .select("id");
    if (error) {
      console.error("[imported_leads:assign] failed", { code: error.code, message: error.message });
      return { ok: false, error: `assign_failed: ${error.message}` };
    }
    void logAdminAction(adminId, "imported_lead.assign", TABLE, parsed.data.ids.join(","), {
      legacyId: parsed.data.legacyId,
      count: data?.length ?? 0,
    });
    revalidatePath("/admin/leads");
    return { ok: true, data: { assigned: data?.length ?? 0 } };
  });
}

/** Record a call attempt — reps may only call their OWN assigned leads. */
export async function logImportedLeadCall(input: unknown): Promise<AdminActionResult<{ callCount: number }>> {
  const parsed = logImportedLeadCallSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin<{ callCount: number }>([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    const callerLegacy = (await getAdminLegacyId(adminId)) ?? adminId;
    const senior = isSenior(roles);

    // Existence + ownership check (scoped for non-senior → 404 if not theirs).
    let read = admin.from(TABLE).select("call_count").eq("id", parsed.data.id);
    if (!senior) read = read.eq("assigned_admin_id", callerLegacy);
    const { data: cur, error: readErr } = await read.maybeSingle<{ call_count: number }>();
    if (readErr) {
      console.error("[imported_leads:call read] failed", { code: readErr.code, message: readErr.message });
      return { ok: false, error: "read_failed" };
    }
    if (!cur) return { ok: false, error: "not_found" };

    const nowIso = new Date().toISOString();
    const { error: logErr } = await admin.from("imported_lead_calls").insert({
      lead_id: parsed.data.id,
      admin_id: callerLegacy,
      status: parsed.data.status ?? "called",
      note: parsed.data.note,
    });
    if (logErr) {
      console.error("[imported_leads:call log] failed", { code: logErr.code, message: logErr.message });
      return { ok: false, error: "log_failed" };
    }

    // Derive call_count from the authoritative history (COUNT) rather than a
    // read-modify-write +1, so concurrent calls converge to the true total.
    const { count } = await admin
      .from("imported_lead_calls")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", parsed.data.id);
    const nextCount = count ?? (cur.call_count ?? 0) + 1;
    const update: Record<string, unknown> = { call_count: nextCount, last_called_at: nowIso, updated_at: nowIso };
    if (parsed.data.status) update.call_status = parsed.data.status;
    const { error: updErr } = await admin.from(TABLE).update(update).eq("id", parsed.data.id);
    if (updErr) {
      console.error("[imported_leads:call update] failed", { code: updErr.code, message: updErr.message });
      return { ok: false, error: "update_failed" };
    }
    revalidatePath("/admin/leads");
    return { ok: true, data: { callCount: nextCount } };
  });
}

/** Set the call-outcome status (reps scoped to their OWN leads). */
export async function setImportedLeadStatus(input: unknown): Promise<AdminActionResult> {
  const parsed = setImportedLeadStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    let q = admin
      .from(TABLE)
      .update({ call_status: parsed.data.status, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id);
    if (!isSenior(roles)) {
      const myLegacy = (await getAdminLegacyId(adminId)) ?? "__none__";
      q = q.eq("assigned_admin_id", myLegacy);
    }
    const { error } = await q;
    if (error) {
      console.error("[imported_leads:status] failed", { code: error.code, message: error.message });
      return { ok: false, error: "update_failed" };
    }
    revalidatePath("/admin/leads");
    return { ok: true };
  });
}

/** Set the service (reps scoped to their OWN leads). */
export async function setImportedLeadService(input: unknown): Promise<AdminActionResult> {
  const parsed = setImportedLeadServiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    let q = admin
      .from(TABLE)
      .update({ service: parsed.data.service, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id);
    if (!isSenior(roles)) {
      const myLegacy = (await getAdminLegacyId(adminId)) ?? "__none__";
      q = q.eq("assigned_admin_id", myLegacy);
    }
    const { error } = await q;
    if (error) {
      console.error("[imported_leads:service] failed", { code: error.code, message: error.message });
      return { ok: false, error: "update_failed" };
    }
    revalidatePath("/admin/leads");
    return { ok: true };
  });
}

/**
 * "ลูกค้าเซลล์อื่น" handoff — route a lead to the rep it actually belongs to so it
 * lands in THAT rep's "ลูกค้าของฉัน" (ปอน 2026-06-23). Stamps call_status='other_rep'.
 *
 * Distinct from `assignImportedLeads` (ultra/senior BULK distribution): this is a
 * WORK_ROLES per-lead correction, but a non-senior caller may only hand off a lead
 * ALREADY ASSIGNED TO THEM (the `.eq(assigned_admin_id, me)` guard) — they can't
 * touch another rep's lead. Target rep validated against the dropdown pool.
 */
export async function handoffImportedLead(input: unknown): Promise<AdminActionResult> {
  const parsed = handoffImportedLeadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...WORK_ROLES], async ({ adminId, roles }) => {
    // Validate the target rep against the SAME pool as the dropdown (getCrmReps).
    const repsRes = await getCrmReps();
    if (repsRes.ok) {
      const allowed = new Set((repsRes.data?.reps ?? []).map((r) => r.legacyId));
      if (!allowed.has(parsed.data.legacyId)) return { ok: false, error: "invalid_rep" };
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    let q = admin
      .from(TABLE)
      .update({
        assigned_admin_id: parsed.data.legacyId,
        assigned_at: nowIso,
        call_status: "other_rep",
        updated_at: nowIso,
      })
      .eq("id", parsed.data.id);
    if (!isSenior(roles)) {
      const myLegacy = (await getAdminLegacyId(adminId)) ?? "__none__";
      q = q.eq("assigned_admin_id", myLegacy); // a rep may hand off only their OWN lead
    }
    const { data, error } = await q.select("id");
    if (error) {
      console.error("[imported_leads:handoff] failed", { code: error.code, message: error.message });
      return { ok: false, error: "update_failed" };
    }
    if (!data || data.length === 0) return { ok: false, error: "not_found" };
    void logAdminAction(adminId, "imported_lead.handoff", TABLE, String(parsed.data.id), {
      to: parsed.data.legacyId,
    });
    revalidatePath("/admin/leads");
    return { ok: true };
  });
}

/** Set the standing note ("หมายเหตุ") — everyone's editable col; reps scoped to OWN. */
export async function setImportedLeadNote(input: unknown): Promise<AdminActionResult> {
  const parsed = setImportedLeadNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    let q = admin
      .from(TABLE)
      .update({ note: parsed.data.note, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id);
    if (!isSenior(roles)) {
      const myLegacy = (await getAdminLegacyId(adminId)) ?? "__none__";
      q = q.eq("assigned_admin_id", myLegacy);
    }
    const { error } = await q;
    if (error) {
      console.error("[imported_leads:note] failed", { code: error.code, message: error.message });
      return { ok: false, error: "update_failed" };
    }
    revalidatePath("/admin/leads");
    return { ok: true };
  });
}
