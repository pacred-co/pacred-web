import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  WORK_STATUS_LABEL,
  WORK_ROLE_LABEL,
  WORK_PRIORITY_WEIGHT,
  workEntityHref,
  isWorkItemOverdue,
  type WorkStatus,
  type WorkAssignableRole,
  type WorkEntityType,
} from "@/lib/validators/work-item";
import { WorkItemCard } from "../work-item-card";

/**
 * 0080 — per-role "งานของฉัน" (my inbox).
 *
 * The §1.4 per-role landing — generalises the /admin/driver-runs
 * "งานของฉัน" pattern to every role. Shows:
 *   - items pinned to ME personally (assigned_to = my profile)
 *   - items routed to a DEPARTMENT I belong to (assigned_role in my
 *     roles) but not yet pinned to a person
 *
 * Only open / in_progress / blocked items appear — the inbox is a
 * "what needs me" queue, not a history. Done work drops off.
 */

export const dynamic = "force-dynamic";

type WorkRow = {
  id:            string;
  entity_type:   string;
  entity_ref:    string;
  type:          string;
  title:         string;
  note:          string | null;
  status:        string;
  priority:      string;
  assigned_role: string;
  assigned_to:   string | null;
  due_at:        string | null;
  created_at:    string;
};

const ACTIVE: WorkStatus[] = ["open", "in_progress", "blocked"];

export default async function AdminBoardInboxPage() {
  const { user, roles } = await requireAdmin();
  const admin = createAdminClient();

  // ── Items for ME — assigned_to = me OR assigned_role ∈ my roles ───
  // Two queries (OR across two columns is cleaner as a union).
  const { data: mineRaw } = await admin
    .from("work_items")
    .select(`
      id, entity_type, entity_ref, type, title, note, status, priority,
      assigned_role, assigned_to, due_at, created_at
    `)
    .eq("assigned_to", user.id)
    .in("status", ACTIVE)
    .order("created_at", { ascending: false })
    .limit(300);

  const { data: deptRaw } = await admin
    .from("work_items")
    .select(`
      id, entity_type, entity_ref, type, title, note, status, priority,
      assigned_role, assigned_to, due_at, created_at
    `)
    .in("assigned_role", roles as WorkAssignableRole[])
    .is("assigned_to", null)
    .in("status", ACTIVE)
    .order("created_at", { ascending: false })
    .limit(300);

  const mine = (mineRaw ?? []) as WorkRow[];
  const dept = (deptRaw ?? []) as WorkRow[];

  // ── Admin options for the assignee picker (claim → pin to a person) ─
  const { data: adminRows } = await admin
    .from("admins")
    .select("profile_id, profile:profiles!profile_id ( member_code, first_name, last_name )")
    .eq("is_active", true);
  type AR = {
    profile_id: string;
    profile: { member_code: string | null; first_name: string | null; last_name: string | null }
           | { member_code: string | null; first_name: string | null; last_name: string | null }[]
           | null;
  };
  const optionMap = new Map<string, { profile_id: string; name: string }>();
  for (const a of (adminRows ?? []) as AR[]) {
    const p = Array.isArray(a.profile) ? a.profile[0] ?? null : a.profile;
    if (!optionMap.has(a.profile_id)) {
      optionMap.set(a.profile_id, {
        profile_id: a.profile_id,
        name: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.member_code || a.profile_id.slice(0, 8),
      });
    }
  }
  const adminOptions = [...optionMap.values()].sort((x, y) => x.name.localeCompare(y.name, "th"));

  function sortRows(items: WorkRow[]): WorkRow[] {
    return [...items].sort((a, b) => {
      const pw =
        (WORK_PRIORITY_WEIGHT[b.priority as keyof typeof WORK_PRIORITY_WEIGHT] ?? 1) -
        (WORK_PRIORITY_WEIGHT[a.priority as keyof typeof WORK_PRIORITY_WEIGHT] ?? 1);
      if (pw !== 0) return pw;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  function toCard(r: WorkRow) {
    return {
      id:            r.id,
      entity_type:   r.entity_type,
      entity_ref:    r.entity_ref,
      type:          r.type,
      title:         r.title,
      note:          r.note,
      status:        r.status as WorkStatus,
      priority:      r.priority,
      assigned_role: r.assigned_role,
      assigned_to:   r.assigned_to,
      assignee_name: null as string | null,
      due_at:        r.due_at,
      domain_href:   workEntityHref(r.entity_type as WorkEntityType, r.entity_ref),
      overdue:       isWorkItemOverdue(r.due_at, r.status as WorkStatus),
    };
  }

  const mineOverdue = mine.filter((r) => isWorkItemOverdue(r.due_at, r.status as WorkStatus)).length;

  return (
    <main className="p-6 lg:p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · งานของฉัน</p>
          <h1 className="mt-1 text-2xl font-bold">กล่องงานของฉัน (My Inbox)</h1>
          <p className="mt-1 text-sm text-muted">
            งานที่มอบหมายให้คุณ + งานของแผนก ({roles.map((r) => WORK_ROLE_LABEL[r as WorkAssignableRole] ?? r).join(" · ")}) ที่ยังไม่มีคนรับ
          </p>
        </div>
        <Link
          href="/admin/board"
          className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-alt transition-colors"
        >
          ← กระดานรวม
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-white dark:bg-surface px-4 py-3 shadow-sm">
          <p className="text-[11px] text-muted">งานของฉัน</p>
          <p className="mt-0.5 text-2xl font-black font-mono">{mine.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-white dark:bg-surface px-4 py-3 shadow-sm">
          <p className="text-[11px] text-muted">งานของฉันที่เกินกำหนด</p>
          <p className={`mt-0.5 text-2xl font-black font-mono ${mineOverdue > 0 ? "text-red-700" : "text-green-700"}`}>
            {mineOverdue}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white dark:bg-surface px-4 py-3 shadow-sm">
          <p className="text-[11px] text-muted">งานแผนกที่ยังไม่มีคนรับ</p>
          <p className="mt-0.5 text-2xl font-black font-mono text-amber-700">{dept.length}</p>
        </div>
      </div>

      {/* My items */}
      <section className="space-y-3">
        <h2 className="font-bold text-sm flex items-center gap-2">
          🙋 งานที่มอบหมายให้ฉันโดยตรง
          <span className="rounded-full bg-surface-alt border border-border px-2 py-0.5 text-[11px] font-mono">
            {mine.length}
          </span>
        </h2>
        {mine.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-10 text-center">
            <p className="text-sm text-muted">ยังไม่มีงานที่มอบหมายให้คุณโดยตรง</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortRows(mine).map((r) => (
              <WorkItemCard key={r.id} item={toCard(r)} adminOptions={adminOptions} />
            ))}
          </div>
        )}
      </section>

      {/* Department unclaimed */}
      <section className="space-y-3">
        <h2 className="font-bold text-sm flex items-center gap-2">
          📨 งานของแผนก — รอคนรับ
          <span className="rounded-full bg-surface-alt border border-border px-2 py-0.5 text-[11px] font-mono">
            {dept.length}
          </span>
        </h2>
        {dept.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-10 text-center">
            <p className="text-sm text-muted">ไม่มีงานแผนกที่รอคนรับ</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortRows(dept).map((r) => (
              <WorkItemCard key={r.id} item={toCard(r)} adminOptions={adminOptions} />
            ))}
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted">
        กล่องงานแสดงเฉพาะงานที่ยังเปิดอยู่ ({ACTIVE.map((s) => WORK_STATUS_LABEL[s]).join(" / ")}) — งานที่เสร็จแล้วจะหายจากกล่องนี้.
        กด &ldquo;มอบหมาย&rdquo; ที่การ์ดงานแผนก เพื่อรับงานนั้นมาเป็นของคุณ.
      </p>
    </main>
  );
}
