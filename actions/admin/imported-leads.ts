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
import { type AdminRole } from "@/lib/auth/require-admin";
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
  importedLeadReportDetailSchema,
  importedLeadAssignmentDetailSchema,
  IMPORTED_LEAD_CALL_STATUSES,
  bucketLeadSource,
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

/**
 * "Sees / mutates ANY lead" = ULTRA ONLY (owner 2026-06-24: "ให้เขาเห็นแค่ของ
 * ตัวเอง · เฉพาะลูกค้าที่เป็นไอดีของเขา · ชื่อเซลล์อื่นไม่ได้เลย · ลูกค้าที่ยังไม่ได้
 * ดำเนินการด้วย · ยกเว้น id ultra"). EVERY other role — incl. super / manager /
 * sales_admin / sales / ops — is FORCE-scoped to their OWN assigned leads
 * (assigned_admin_id = their profile_id) on every read, the stat cards, and every
 * per-lead mutation. Deliberately NOT isGodRole() (that also passes `super`),
 * matching the page's ultra-only "มอบหมายโทรเซลล์" gate (super ไม่เห็น).
 */
function isSenior(roles: AdminRole[]): boolean {
  return roles.includes("ultra");
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
    // owner 2026-06-24: ONLY ultra/senior sees "ย้ายมาจาก <เซลล์อื่น>" — a normal rep
    // must not see another sales rep's name at all ("ชื่อเซลล์อื่นนี่ไม่ได้เลย").
    const otherIds = isSenior(roles) ? leads.filter((l) => l.call_status === "other_rep").map((l) => l.id) : [];
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
    const senior = isSenior(roles);
    if (!senior) {
      const { data: own, error: ownErr } = await admin
        .from(TABLE).select("id").eq("id", id).eq("assigned_admin_id", adminId).maybeSingle<{ id: number }>();
      if (ownErr) {
        console.error("[imported_leads:calls own] failed", { code: ownErr.code, message: ownErr.message });
        return { ok: false, error: "read_failed" };
      }
      if (!own) return { ok: false, error: "not_found" };
    }
    // owner 2026-06-24 "เห็นแค่การกระทำของตัวเอง" — a non-ultra sees ONLY their OWN call
    // logs on the lead (other staff's calls + the handoff rows are hidden). Ultra: all.
    let cq = admin
      .from("imported_lead_calls")
      .select("id, admin_id, status, note, called_at")
      .eq("lead_id", id);
    if (!senior) cq = cq.eq("admin_id", adminId);
    const { data, error } = await cq
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
      const st = r.call_status || "";
      // owner 2026-06-24: "ติดต่อแล้ววันนี้" = โทรแล้วติดต่อได้จริงเท่านั้น — ผล
      // "ไม่รับสาย"/"ไม่สนใจ" ไม่นับว่าติดต่อแล้ว (ไปกองที่ลิสต์ไม่รับสาย/ไม่สนใจ ของมันเอง).
      const contactedToday =
        !!r.last_called_at &&
        new Date(r.last_called_at).getTime() >= startMs &&
        st !== "no_answer" &&
        st !== "not_interested";
      if (contactedToday) sets.calledToday.add(ph);
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

// ── Source-tab counts (owner 2026-07-01 · the page-level "ที่มา (source)" tabs) ──
// Exact badge counts for the pcs / freight / freight_no_phone tabs on /admin/leads.
// Same dedupe semantics as the list so each badge == what staff see:
//   freight / pcs        → DISTINCT callable phones (the list hides dup + no-phone).
//   freight_no_phone     → ROW count (these rows have NO phone, so the no-phone tab
//                          shows them all; distinct-by-phone would zero them out).
// Role-scoped like every other read (a rep sees only their own; senior sees all).
export type ImportedLeadSourceCounts = {
  all: number; // distinct callable phones across the whole pool (= ImportedLeadStats.total)
  pcs: number; // distinct callable phones with a NON-freight source
  freight: number; // distinct callable phones, source='freight'
  freightNoPhone: number; // ROWS with source='freight_no_phone' (no phone → row count)
};

export async function getImportedLeadSourceCounts(): Promise<AdminActionResult<ImportedLeadSourceCounts>> {
  return withAdmin<ImportedLeadSourceCounts>([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    const senior = isSenior(roles);
    let q = admin.from(TABLE).select("phone, source, assigned_admin_id").limit(50000);
    if (!senior) q = q.eq("assigned_admin_id", adminId);
    const { data, error } = await q;
    if (error) {
      console.error("[imported_leads:source-counts] failed", { code: error.code, message: error.message });
      return { ok: false, error: `query_failed: ${error.message}` };
    }
    const digits = (p: string) => (p ?? "").replace(/\D/g, "");
    const all = new Set<string>();
    const pcs = new Set<string>();
    const freight = new Set<string>();
    let freightNoPhone = 0;
    for (const r of (data ?? []) as { phone: string; source: string }[]) {
      const bucket = bucketLeadSource(r.source); // SOT — shared with the list filter
      if (bucket === "freight_no_phone") { freightNoPhone++; continue; } // counted by row (no phone)
      const ph = digits(r.phone);
      if (!ph) continue; // no callable number → hidden in the phone-list tabs too
      all.add(ph);
      if (bucket === "freight") freight.add(ph);
      else pcs.add(ph);
    }
    return { ok: true, data: { all: all.size, pcs: pcs.size, freight: freight.size, freightNoPhone } };
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

export type ImportedLeadReportDetailRow = {
  id: number;
  name: string;
  phone: string;
  callStatus: string;
  lastCalledAt: string | null;
  callCount: number;
};

/**
 * Drill-down behind a report row (owner 2026-06-23) — the actual customers a rep
 * contacted in the range. `rep` = EXACT assigned_admin_id ('' = ยังไม่มอบหมาย).
 * SENIOR-only (same gate as the report).
 */
export async function getImportedLeadReportDetail(
  input: unknown,
): Promise<AdminActionResult<{ rows: ImportedLeadReportDetailRow[] }>> {
  const parsed = importedLeadReportDetailSchema.safeParse(input);
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
      .select("id, name, phone, call_status, last_called_at, call_count")
      .eq("assigned_admin_id", rep)
      .gte("last_called_at", start.toISOString())
      .lte("last_called_at", end.toISOString())
      .not("last_called_at", "is", null)
      .order("last_called_at", { ascending: false })
      .limit(1000);
    if (status) q = q.eq("call_status", status);
    const { data, error } = await q;
    if (error) {
      console.error("[imported_leads:report detail] failed", { code: error.code, message: error.message });
      return { ok: false, error: "query_failed" };
    }
    const rows = ((data ?? []) as { id: number; name: string | null; phone: string | null; call_status: string | null; last_called_at: string | null; call_count: number | null }[])
      .map((r) => ({ id: r.id, name: r.name ?? "", phone: r.phone ?? "", callStatus: r.call_status ?? "", lastCalledAt: r.last_called_at, callCount: r.call_count ?? 0 }));
    return { ok: true, data: { rows } };
  });
}

// ── "งานที่มอบหมาย" — standing assignment workload per rep (owner 2026-06-30) ────
// Distinct from getImportedLeadCallReport (a date-ranged CALL-activity report): this
// is the CURRENT assignment state — how many leads each rep was distributed + their
// progress (ยังไม่โทร vs ติดตามแล้ว vs ปิดได้). NOT date-bounded — a rep handed 200
// leads who hasn't dialed yet shows 200 มอบหมาย / 200 ยังไม่โทร (the call report
// would show 0). Counts DISTINCT callable customers via the SAME global dedupe-by-
// phone as the client list, so the per-rep totals reconcile with the table.

export type ImportedLeadAssignmentRow = {
  legacyId: string;
  name: string;
  total: number; // distinct assigned customers (callable phone)
  untouched: number; // never dialed + no outcome — the "ยังไม่ได้เริ่ม" backlog
  byStatus: Record<string, number>; // closed/callback/no_answer/not_interested/other_rep/called
};

/**
 * Single-bucket partition for an assigned lead so `total = untouched + Σ byStatus`
 * exactly (no double counting): a known outcome wins; else a dialed-but-no-outcome
 * lead is "called"; else it's untouched.
 */
function assignmentBucket(status: string, callCount: number): string {
  if ((IMPORTED_LEAD_CALL_STATUSES as readonly string[]).includes(status) && status !== "called") return status;
  if (status === "called" || callCount > 0) return "called";
  return "untouched";
}

/**
 * Global dedupe-by-phone identical to the client list's `dedupeByPhone` (best-scored
 * row per callable phone wins · assigned > has-calls) so the per-rep assignment
 * counts == what staff see in the table. Rows must arrive id-desc (list order).
 */
function dedupeAssignRows<T extends { assigned_admin_id: string; phone: string; call_count: number }>(rows: T[]): T[] {
  const digits = (p: string) => (p ?? "").replace(/\D/g, "");
  const score = (l: T) => (l.assigned_admin_id ? 2 : 0) + ((l.call_count ?? 0) > 0 ? 1 : 0);
  const best = new Map<string, T>();
  for (const l of rows) {
    const key = digits(l.phone);
    if (!key) continue; // no callable number → hidden in the list too
    const cur = best.get(key);
    if (!cur || score(l) > score(cur)) best.set(key, l);
  }
  return [...best.values()];
}

/** Cross-rep "sees ALL assignments" = the distributors (ultra/super/manager/sales_admin).
 *  A plain เซลล์/ops sees ONLY their own assigned summary (self-scoped). */
function canSeeAllAssignments(roles: AdminRole[]): boolean {
  return isSenior(roles) || roles.some((r) => (IMPORT_ROLES as readonly string[]).includes(r));
}

/**
 * Per-rep standing assignment summary. Distributors (ultra/super/manager/sales_admin)
 * see EVERY rep + the "(ยังไม่มอบหมาย)" pool. A plain เซลล์/ops — or anyone passing
 * `{ mine: true }` (their own "ประวัติ + สรุป" tab) — is force-scoped to their OWN
 * assigned leads (one row · owner 2026-06-30 "เซลล์ที่ได้รับมอบหมายต้องเห็นสรุปของตัวเอง").
 */
export async function getImportedLeadAssignmentSummary(
  input?: { mine?: boolean } | unknown,
): Promise<AdminActionResult<{ rows: ImportedLeadAssignmentRow[]; total: ImportedLeadAssignmentRow }>> {
  const mine = Boolean((input as { mine?: boolean } | undefined)?.mine);
  return withAdmin([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    // Self-scope (and dedupe within self) so the count == the rep's own "ลูกค้าของฉัน"
    // list (which scopes at the query level then dedupes within).
    const scopeToSelf = mine || !canSeeAllAssignments(roles);
    let query = admin
      .from(TABLE)
      .select("assigned_admin_id, phone, call_status, call_count")
      .order("id", { ascending: false })
      .limit(50000);
    if (scopeToSelf) query = query.eq("assigned_admin_id", adminId);
    const { data, error } = await query;
    if (error) {
      console.error("[imported_leads:assign-summary] failed", { code: error.code, message: error.message });
      return { ok: false, error: "query_failed" };
    }

    const repsRes = await getAssignableAdmins();
    const nameOf = new Map((repsRes.ok ? repsRes.data?.reps ?? [] : []).map((r) => [r.legacyId, r.name]));
    const blank = (): Record<string, number> => Object.fromEntries(IMPORTED_LEAD_CALL_STATUSES.map((s) => [s, 0]));

    type Raw = { assigned_admin_id: string; phone: string; call_status: string; call_count: number };
    const survivors = dedupeAssignRows((data ?? []) as Raw[]);
    const byRep = new Map<string, ImportedLeadAssignmentRow>();
    const total: ImportedLeadAssignmentRow = { legacyId: "", name: "รวมทั้งหมด", total: 0, untouched: 0, byStatus: blank() };
    for (const l of survivors) {
      const id = l.assigned_admin_id || "";
      if (!byRep.has(id)) {
        byRep.set(id, { legacyId: id, name: id ? nameOf.get(id) ?? id : "(ยังไม่มอบหมาย)", total: 0, untouched: 0, byStatus: blank() });
      }
      const r = byRep.get(id)!;
      r.total++; total.total++;
      const b = assignmentBucket(l.call_status, l.call_count ?? 0);
      if (b === "untouched") { r.untouched++; total.untouched++; }
      else { r.byStatus[b] = (r.byStatus[b] ?? 0) + 1; total.byStatus[b] = (total.byStatus[b] ?? 0) + 1; }
    }

    // Resolve names for any assigned admin OUTSIDE the active-assignable pool
    // (deactivated / reassigned-role staff) from `profiles` so the rep column never
    // shows a raw UUID (owner §0f: labels readable). nameOf already covered actives.
    const unresolved = [...byRep.values()].filter((r) => r.legacyId && r.name === r.legacyId).map((r) => r.legacyId);
    if (unresolved.length) {
      const { data: profs, error: profErr } = await admin
        .from("profiles")
        .select("id, first_name, last_name, admin_login_id")
        .in("id", unresolved);
      if (profErr) {
        console.error("[imported_leads:assign-summary names] failed", { code: profErr.code, message: profErr.message });
      } else {
        const nm = new Map(
          ((profs ?? []) as { id: string; first_name: string | null; last_name: string | null; admin_login_id: string | null }[]).map((p) => [
            p.id,
            [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.admin_login_id || p.id,
          ]),
        );
        for (const r of byRep.values()) {
          if (r.legacyId && r.name === r.legacyId && nm.has(r.legacyId)) r.name = nm.get(r.legacyId)!;
        }
      }
    }

    // Assigned reps first (heaviest load on top), the unassigned pool always last.
    const rows = [...byRep.values()].sort((a, b) => {
      if (!a.legacyId) return 1;
      if (!b.legacyId) return -1;
      return b.total - a.total;
    });
    return { ok: true, data: { rows, total } };
  });
}

/**
 * Drill-down behind an assignment-summary row — the actual leads CURRENTLY assigned
 * to a rep (NOT date-ranged), optionally filtered to one progress bucket. A plain
 * เซลล์/ops (or `{ mine: true }`) is force-scoped to their OWN leads, ignoring `rep`;
 * distributors may pass any `rep`. Dedupe scope matches the read scope so the list
 * length reconciles with the summary's count.
 */
export async function getImportedLeadAssignmentDetail(
  input: unknown,
): Promise<AdminActionResult<{ rows: ImportedLeadReportDetailRow[] }>> {
  const parsed = importedLeadAssignmentDetailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { rep, bucket, mine } = parsed.data;

  return withAdmin([...WORK_ROLES], async ({ adminId, roles }) => {
    const admin = createAdminClient();
    // Non-distributors (or an explicit `mine`) can ONLY see their own leads.
    const selfScope = mine || !canSeeAllAssignments(roles);
    const targetRep = selfScope ? adminId : rep;
    let query = admin
      .from(TABLE)
      .select("id, name, phone, call_status, last_called_at, call_count, assigned_admin_id")
      .order("id", { ascending: false })
      .limit(50000);
    // Narrow the read ONLY when self-scoped — so dedupe stays within the rep's own
    // set (matches their "ลูกค้าของฉัน" list AND the self summary). A distributor reads
    // ALL + dedupes globally + filters to `targetRep`, matching the cross-rep summary.
    if (selfScope) query = query.eq("assigned_admin_id", adminId);
    const { data, error } = await query;
    if (error) {
      console.error("[imported_leads:assign-detail] failed", { code: error.code, message: error.message });
      return { ok: false, error: "query_failed" };
    }
    type Raw = { id: number; name: string | null; phone: string; call_status: string; last_called_at: string | null; call_count: number; assigned_admin_id: string };
    const rows = dedupeAssignRows((data ?? []) as Raw[])
      .filter((l) => (l.assigned_admin_id || "") === targetRep)
      .filter((l) => bucket === "all" || assignmentBucket(l.call_status, l.call_count ?? 0) === bucket)
      .map((l) => ({
        id: l.id, name: l.name ?? "", phone: l.phone ?? "", callStatus: l.call_status ?? "",
        lastCalledAt: l.last_called_at, callCount: l.call_count ?? 0,
      }));
    return { ok: true, data: { rows } };
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
