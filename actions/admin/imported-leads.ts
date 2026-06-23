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
import { getAssignableAdmins } from "@/actions/admin/crm";
import { isGodRole, type AdminRole } from "@/lib/auth/require-admin";
import { withAdmin, type AdminActionResult, logAdminAction } from "./common";
import {
  saveImportedLeadsSchema,
  assignImportedLeadsSchema,
  distributeImportedLeadsSchema,
  logImportedLeadCallSchema,
  setImportedLeadStatusSchema,
  setImportedLeadServiceSchema,
  setImportedLeadNoteSchema,
  setImportedLeadLineFacebookSchema,
  setImportedLeadEmailSchema,
  setImportedLeadPrCodeSchema,
  setImportedLeadPhoneSchema,
  handoffImportedLeadSchema,
  importedLeadReportSchema,
  IMPORTED_LEAD_CALL_STATUSES,
} from "@/lib/validators/imported-lead";

const TABLE = "imported_leads";
const SELECT_COLS_BASE =
  "id, name, address, phone, line_facebook, email, service, source, assigned_admin_id, call_status, call_count, last_called_at";
// `note` (0202) + `pr_code` (0203) = owner-applied migrations. getImportedLeads
// degrades gracefully if either hasn't landed yet (retries without them) so the
// table never hard-breaks in the window between this code and the migration apply.
const SELECT_COLS = `${SELECT_COLS_BASE}, note, pr_code`;

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
  /** "รหัส PR" — member code recorded on a closed deal (migration 0203). */
  pr_code: string;
  /** For call_status='other_rep': the rep (profile_id) this lead was handed off FROM
   *  (current assigned_admin_id = the TO). Sourced from the handoff call-history
   *  row, NOT a column — so no migration (ปอน 2026-06-23 "ใครย้ายไปเข้าใคร"). */
  handoffFrom?: string;
};

/** List imported leads (newest first). Reps see only their own; `mine` also scopes seniors. */
export async function getImportedLeads(
  input?: { mine?: boolean },
): Promise<AdminActionResult<{ leads: ImportedLead[] }>> {
  return withAdmin<{ leads: ImportedLead[] }>([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    // Scope to OWN assigned leads (non-senior always · senior when ?mine). The key
    // is the admin's profile_id — exactly what assignImportedLeads stores (owner
    // 2026-06-23: a lead is assigned directly to the user).
    const scopeId = !isSenior(roles) || input?.mine ? adminId : null;
    const build = (cols: string) => {
      let q = admin.from(TABLE).select(cols).order("id", { ascending: false }).limit(2000);
      if (scopeId !== null) q = q.eq("assigned_admin_id", scopeId);
      return q;
    };

    const { data, error } = await build(SELECT_COLS);
    let leads: ImportedLead[];
    if (error) {
      // 42703 = undefined_column → migration 0202 (note) not applied yet. Retry
      // without note so the workspace stays usable until the owner applies it.
      if (error.code === "42703") {
        const fb = await build(SELECT_COLS_BASE);
        if (fb.error) {
          console.error("[imported_leads:list] failed", { code: fb.error.code, message: fb.error.message });
          return { ok: false, error: `query_failed: ${fb.error.message}` };
        }
        leads = ((fb.data ?? []) as unknown as Record<string, unknown>[]).map((d) => ({ ...d, note: "", pr_code: "" })) as unknown as ImportedLead[];
      } else {
        console.error("[imported_leads:list] failed", { code: error.code, message: error.message });
        return { ok: false, error: `query_failed: ${error.message}` };
      }
    } else {
      leads = (data ?? []) as unknown as ImportedLead[];
    }

    // Enrich other_rep leads with their handoff source (ปอน 2026-06-23 "ใครย้ายไป
    // เข้าใคร"): the latest handoff call-row's note holds the FROM rep legacyId.
    const otherIds = leads.filter((l) => l.call_status === "other_rep").map((l) => l.id);
    if (otherIds.length) {
      const { data: hcalls, error: hErr } = await admin
        .from("imported_lead_calls")
        .select("lead_id, note, called_at")
        .eq("status", "other_rep")
        .in("lead_id", otherIds)
        .order("called_at", { ascending: false });
      if (hErr) console.error("[imported_leads:handoff-enrich] failed", { code: hErr.code, message: hErr.message });
      const fromMap = new Map<number, string>();
      for (const c of (hcalls ?? []) as { lead_id: number; note: string }[]) {
        if (!fromMap.has(c.lead_id)) fromMap.set(c.lead_id, c.note || "");
      }
      leads = leads.map((l) => (l.call_status === "other_rep" ? { ...l, handoffFrom: fromMap.get(l.id) ?? "" } : l));
    }
    return { ok: true, data: { leads } };
  });
}

export type ImportedLeadCall = {
  id: number;
  adminId: string;
  status: string;
  note: string;
  calledAt: string | null;
};

/** Call history for ONE lead (newest first · owner 2026-06-23 "กดแถวแล้วดูว่าโทรหา
 *  ใครบ้างแล้ว"). A non-senior may only view a lead assigned to them. */
export async function getImportedLeadCalls(input: { id?: number } | unknown): Promise<AdminActionResult<{ calls: ImportedLeadCall[] }>> {
  const id = Number((input as { id?: unknown })?.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "invalid_input" };
  return withAdmin<{ calls: ImportedLeadCall[] }>([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    if (!isSenior(roles)) {
      const { data: own, error: ownErr } = await admin
        .from(TABLE).select("id").eq("id", id).eq("assigned_admin_id", adminId).maybeSingle<{ id: number }>();
      if (ownErr) {
        console.error("[imported_leads:calls own] failed", { code: ownErr.code, message: ownErr.message });
        return { ok: false, error: "read_failed" };
      }
      if (!own) return { ok: false, error: "not_found" };
    }
    const { data, error } = await admin
      .from("imported_lead_calls")
      .select("id, admin_id, status, note, called_at")
      .eq("lead_id", id)
      .order("called_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("[imported_leads:calls] failed", { code: error.code, message: error.message });
      return { ok: false, error: "query_failed" };
    }
    const calls = ((data ?? []) as { id: number; admin_id: string | null; status: string | null; note: string | null; called_at: string | null }[])
      .map((c) => ({ id: c.id, adminId: c.admin_id ?? "", status: c.status ?? "", note: c.note ?? "", calledAt: c.called_at }));
    return { ok: true, data: { calls } };
  });
}

/**
 * Top-card stats DERIVED FROM the imported_leads workspace (ปอน 2026-06-23 —
 * "ทำให้มันสัมพันธ์กัน": the cards above the table must reflect THIS data, not the
 * old tb_users lead system). Scoped like the table — a rep sees their own numbers,
 * a senior/ultra sees the whole pool.
 *   ติดต่อแล้ววันนี้ = DISTINCT leads called today — 1 ลูกค้า=1 ไม่ว่าจะโทรกี่ครั้ง
 *                     (ปอน 2026-06-23) — via imported_leads.last_called_at ≥ midnight
 *                     (1 แถว/ลูกค้า → distinct โดยธรรมชาติ). server-local boundary.
 *   ปิดการขายแล้ว    = imported_leads whose call_status = 'closed'.
 */
export type ImportedLeadStats = {
  total: number;          // distinct callable phones (matches the deduped list)
  calledToday: number;    // daily (resets) — distinct leads last-called today
  closed: number;         // cumulative status counts ↓
  noAnswer: number;
  notInterested: number;
  mineCount: number;      // chip badges ↓ — leads assigned to the viewer
  callbackCount: number;  // call_status = callback
  pendingCount: number;   // call_status = '' (ยังไม่ได้ดำเนินการ)
};

export async function getImportedLeadStats(): Promise<AdminActionResult<ImportedLeadStats>> {
  return withAdmin<ImportedLeadStats>([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    const senior = isSenior(roles);
    const myId = adminId; // a lead is assigned directly to the admin's profile_id

    // ONE scoped read → compute every card + chip badge in JS (≤ a few hundred rows).
    // Avoids `note` (migration 0202) so it works on prod regardless of apply state.
    let q = admin.from(TABLE).select("phone, assigned_admin_id, call_status, last_called_at").limit(50000);
    if (!senior) q = q.eq("assigned_admin_id", myId);
    const { data, error } = await q;
    if (error) {
      console.error("[imported_leads:stats] failed", { code: error.code, message: error.message });
      return { ok: false, error: `query_failed: ${error.message}` };
    }

    const startMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
    const digits = (p: string) => (p ?? "").replace(/\D/g, "");
    // Count DISTINCT phones per bucket — the list HIDES duplicate phones + no-phone
    // rows, so a raw row-count over-states reality (owner 2026-06-23 "ไม่ตรงกับความ
    // เป็นจริง"). Counting distinct callable numbers makes each badge == the list.
    const sets = {
      all: new Set<string>(),
      calledToday: new Set<string>(), closed: new Set<string>(), noAnswer: new Set<string>(),
      notInterested: new Set<string>(), callback: new Set<string>(), pending: new Set<string>(), mine: new Set<string>(),
    };
    for (const r of (data ?? []) as { phone: string; assigned_admin_id: string; call_status: string; last_called_at: string | null }[]) {
      const ph = digits(r.phone);
      if (!ph) continue; // no callable number → hidden in the list too
      sets.all.add(ph);
      if (r.last_called_at && new Date(r.last_called_at).getTime() >= startMs) sets.calledToday.add(ph);
      const st = r.call_status || "";
      if (st === "") sets.pending.add(ph);
      else if (st === "closed") sets.closed.add(ph);
      else if (st === "no_answer") sets.noAnswer.add(ph);
      else if (st === "not_interested") sets.notInterested.add(ph);
      else if (st === "callback") sets.callback.add(ph);
      if (r.assigned_admin_id === myId) sets.mine.add(ph);
    }
    return { ok: true, data: {
      total: sets.all.size,
      calledToday: sets.calledToday.size, closed: sets.closed.size, noAnswer: sets.noAnswer.size,
      notInterested: sets.notInterested.size, mineCount: sets.mine.size,
      callbackCount: sets.callback.size, pendingCount: sets.pending.size,
    } };
  });
}

export type ImportedLeadReportRow = {
  legacyId: string;
  name: string;
  contacted: number;
  closed: number;
  byStatus: Record<string, number>;
};

/**
 * "ประวัติการมอบหมายโทรเซลล์" report (ปอน 2026-06-23) — per-rep contacted/closed
 * over a date range, filterable by rep + status. SENIOR-only (cross-rep view; the
 * UI is in the ultra assign tab). "contacted" = DISTINCT leads whose last call falls
 * in the range (imported_leads = 1 row/lead) — reconciles with the daily card.
 */
export async function getImportedLeadCallReport(
  input: unknown,
): Promise<AdminActionResult<{ rows: ImportedLeadReportRow[]; total: { contacted: number; closed: number; byStatus: Record<string, number> } }>> {
  const parsed = importedLeadReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { from, to, rep, status } = parsed.data;

  return withAdmin([...IMPORT_ROLES], async () => {
    const admin = createAdminClient();
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return { ok: false, error: "invalid_range" };
    }

    let q = admin
      .from(TABLE)
      .select("assigned_admin_id, call_status")
      .gte("last_called_at", start.toISOString())
      .lte("last_called_at", end.toISOString())
      .not("last_called_at", "is", null)
      .limit(50000);
    if (rep) q = q.eq("assigned_admin_id", rep);
    if (status) q = q.eq("call_status", status);
    const { data, error } = await q;
    if (error) {
      console.error("[imported_leads:report] failed", { code: error.code, message: error.message });
      return { ok: false, error: "query_failed" };
    }

    const repsRes = await getAssignableAdmins();
    const nameOf = new Map((repsRes.ok ? repsRes.data?.reps ?? [] : []).map((r) => [r.legacyId, r.name]));
    const blank = (): Record<string, number> => Object.fromEntries(IMPORTED_LEAD_CALL_STATUSES.map((s) => [s, 0]));

    const byRep = new Map<string, ImportedLeadReportRow>();
    const total = { contacted: 0, closed: 0, byStatus: blank() };
    for (const row of (data ?? []) as { assigned_admin_id: string; call_status: string }[]) {
      const id = row.assigned_admin_id || "";
      if (!byRep.has(id)) {
        byRep.set(id, { legacyId: id, name: id ? nameOf.get(id) ?? id : "(ยังไม่มอบหมาย)", contacted: 0, closed: 0, byStatus: blank() });
      }
      const r = byRep.get(id)!;
      // a called-but-no-outcome lead has call_status='' → bucket as 'called'
      const st = (IMPORTED_LEAD_CALL_STATUSES as readonly string[]).includes(row.call_status) ? row.call_status : "called";
      r.contacted++; total.contacted++;
      r.byStatus[st]++; total.byStatus[st]++;
      if (st === "closed") { r.closed++; total.closed++; }
    }

    const rows = [...byRep.values()].sort((a, b) => b.contacted - a.contacted);
    return { ok: true, data: { rows, total } };
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
    // Validate the target against the SAME pool the assign dropdown is built from
    // (getAssignableAdmins → active เซลล์/CS, keyed by profile_id) so a typo'd /
    // off-boarded id can't silently strand prospects ('' = clear assignment).
    // (Skip the guard if the pool can't load — the UI already constrained it.)
    if (parsed.data.legacyId) {
      const repsRes = await getAssignableAdmins();
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

/**
 * Random EVEN distribution (ปอน 2026-06-23) — shuffle the selected ids (Fisher-Yates)
 * + round-robin across the chosen reps so each gets an equal share (±1), randomly.
 * IMPORT_ROLES (ultra/senior · same gate as assign). Math.random is fine here (server
 * action, not a workflow script).
 */
export async function distributeImportedLeads(
  input: unknown,
): Promise<AdminActionResult<{ distributed: number; perRep: Record<string, number> }>> {
  const parsed = distributeImportedLeadsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { ids, legacyIds } = parsed.data;

  return withAdmin<{ distributed: number; perRep: Record<string, number> }>([...IMPORT_ROLES], async ({ adminId }) => {
    // Validate every target against the assign-dropdown pool (getAssignableAdmins).
    const repsRes = await getAssignableAdmins();
    if (repsRes.ok) {
      const allowed = new Set((repsRes.data?.reps ?? []).map((r) => r.legacyId));
      for (const lid of legacyIds) {
        if (!allowed.has(lid)) return { ok: false, error: "invalid_rep" };
      }
    }
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    // Fisher-Yates shuffle → round-robin to reps (even ±1 + random who-gets-what).
    const shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const groups = new Map<string, number[]>(legacyIds.map((lid) => [lid, []]));
    shuffled.forEach((id, idx) => groups.get(legacyIds[idx % legacyIds.length])!.push(id));

    const perRep: Record<string, number> = {};
    let distributed = 0;
    for (const lid of legacyIds) {
      const grp = groups.get(lid) ?? [];
      if (grp.length === 0) { perRep[lid] = 0; continue; }
      const { data, error } = await admin
        .from(TABLE)
        .update({ assigned_admin_id: lid, assigned_at: nowIso, updated_at: nowIso })
        .in("id", grp)
        .select("id");
      if (error) {
        console.error("[imported_leads:distribute] failed", { code: error.code, message: error.message });
        return { ok: false, error: `distribute_failed: ${error.message}` };
      }
      perRep[lid] = data?.length ?? 0;
      distributed += data?.length ?? 0;
    }
    void logAdminAction(adminId, "imported_lead.distribute", TABLE, ids.join(","), { legacyIds, distributed });
    revalidatePath("/admin/leads");
    return { ok: true, data: { distributed, perRep } };
  });
}

/** Record a call attempt — reps may only call their OWN assigned leads. */
export async function logImportedLeadCall(input: unknown): Promise<AdminActionResult<{ callCount: number }>> {
  const parsed = logImportedLeadCallSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin<{ callCount: number }>([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    const senior = isSenior(roles);

    // Existence + ownership check (scoped for non-senior → 404 if not theirs).
    let read = admin.from(TABLE).select("call_count").eq("id", parsed.data.id);
    if (!senior) read = read.eq("assigned_admin_id", adminId);
    const { data: cur, error: readErr } = await read.maybeSingle<{ call_count: number }>();
    if (readErr) {
      console.error("[imported_leads:call read] failed", { code: readErr.code, message: readErr.message });
      return { ok: false, error: "read_failed" };
    }
    if (!cur) return { ok: false, error: "not_found" };

    const nowIso = new Date().toISOString();
    const { error: logErr } = await admin.from("imported_lead_calls").insert({
      lead_id: parsed.data.id,
      admin_id: adminId,
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
      q = q.eq("assigned_admin_id", adminId); // own leads only — keyed by profile_id
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
      q = q.eq("assigned_admin_id", adminId); // own leads only — keyed by profile_id
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
    // Validate the target against the SAME pool as the dropdown (getAssignableAdmins).
    const repsRes = await getAssignableAdmins();
    if (repsRes.ok) {
      const allowed = new Set((repsRes.data?.reps ?? []).map((r) => r.legacyId));
      if (!allowed.has(parsed.data.legacyId)) return { ok: false, error: "invalid_rep" };
    }

    const admin = createAdminClient();
    const senior = isSenior(roles);

    // Capture the current owner (the "from") before reassigning — for the
    // "ย้ายจาก X → Y" display. The scoped read also enforces rep-owns-it.
    let readCur = admin.from(TABLE).select("assigned_admin_id").eq("id", parsed.data.id);
    if (!senior) readCur = readCur.eq("assigned_admin_id", adminId);
    const { data: cur, error: curErr } = await readCur.maybeSingle<{ assigned_admin_id: string }>();
    if (curErr) {
      console.error("[imported_leads:handoff read] failed", { code: curErr.code, message: curErr.message });
      return { ok: false, error: "read_failed" };
    }
    if (!cur) return { ok: false, error: "not_found" };
    const fromLegacy = cur.assigned_admin_id || "";

    const nowIso = new Date().toISOString();
    let upd = admin
      .from(TABLE)
      .update({ assigned_admin_id: parsed.data.legacyId, assigned_at: nowIso, call_status: "other_rep", updated_at: nowIso })
      .eq("id", parsed.data.id);
    if (!senior) upd = upd.eq("assigned_admin_id", adminId); // a rep may hand off only their OWN lead
    const { data, error } = await upd.select("id");
    if (error) {
      console.error("[imported_leads:handoff] failed", { code: error.code, message: error.message });
      return { ok: false, error: "update_failed" };
    }
    if (!data || data.length === 0) return { ok: false, error: "not_found" };

    // Record who→whom in call history (note = FROM rep legacyId · TO = the new
    // assigned_admin_id). No migration — reuses imported_lead_calls (0201).
    await admin.from("imported_lead_calls").insert({ lead_id: parsed.data.id, admin_id: adminId, status: "other_rep", note: fromLegacy });
    void logAdminAction(adminId, "imported_lead.handoff", TABLE, String(parsed.data.id), { from: fromLegacy, to: parsed.data.legacyId });
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
      q = q.eq("assigned_admin_id", adminId); // own leads only — keyed by profile_id
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

/** Edit the LINE/Facebook contact — everyone's editable col; reps scoped to OWN. */
export async function setImportedLeadLineFacebook(input: unknown): Promise<AdminActionResult> {
  const parsed = setImportedLeadLineFacebookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    let q = admin
      .from(TABLE)
      .update({ line_facebook: parsed.data.lineFacebook, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id);
    if (!isSenior(roles)) {
      q = q.eq("assigned_admin_id", adminId); // own leads only — keyed by profile_id
    }
    const { error } = await q;
    if (error) {
      console.error("[imported_leads:line_facebook] failed", { code: error.code, message: error.message });
      return { ok: false, error: "update_failed" };
    }
    revalidatePath("/admin/leads");
    return { ok: true };
  });
}

/** Edit the email — everyone's editable col; reps scoped to OWN. */
export async function setImportedLeadEmail(input: unknown): Promise<AdminActionResult> {
  const parsed = setImportedLeadEmailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    let q = admin
      .from(TABLE)
      .update({ email: parsed.data.email, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id);
    if (!isSenior(roles)) {
      q = q.eq("assigned_admin_id", adminId); // own leads only — keyed by profile_id
    }
    const { error } = await q;
    if (error) {
      console.error("[imported_leads:email] failed", { code: error.code, message: error.message });
      return { ok: false, error: "update_failed" };
    }
    revalidatePath("/admin/leads");
    return { ok: true };
  });
}

/** Edit the phone — reps fix messy/typo'd numbers so the tel: link dials right
 *  (ปอน 2026-06-23). Editable; reps scoped to OWN. */
export async function setImportedLeadPhone(input: unknown): Promise<AdminActionResult> {
  const parsed = setImportedLeadPhoneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    let q = admin
      .from(TABLE)
      .update({ phone: parsed.data.phone, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id);
    if (!isSenior(roles)) {
      q = q.eq("assigned_admin_id", adminId); // own leads only — keyed by profile_id
    }
    const { error } = await q;
    if (error) {
      console.error("[imported_leads:phone] failed", { code: error.code, message: error.message });
      return { ok: false, error: "update_failed" };
    }
    revalidatePath("/admin/leads");
    return { ok: true };
  });
}

/** Set "รหัส PR" (closed-deal member code) — editable; reps scoped to OWN. */
export async function setImportedLeadPrCode(input: unknown): Promise<AdminActionResult> {
  const parsed = setImportedLeadPrCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    let q = admin
      .from(TABLE)
      .update({ pr_code: parsed.data.prCode, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id);
    if (!isSenior(roles)) {
      q = q.eq("assigned_admin_id", adminId); // own leads only — keyed by profile_id
    }
    const { error } = await q;
    if (error) {
      console.error("[imported_leads:pr_code] failed", { code: error.code, message: error.message });
      return { ok: false, error: "update_failed" };
    }
    revalidatePath("/admin/leads");
    return { ok: true };
  });
}
