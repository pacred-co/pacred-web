import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  WORK_STATUSES,
  WORK_STATUS_LABEL,
  WORK_ASSIGNABLE_ROLES,
  WORK_ROLE_LABEL,
  WORK_PRIORITY_WEIGHT,
  workEntityHref,
  isWorkItemOverdue,
  type WorkStatus,
  type WorkAssignableRole,
  type WorkEntityType,
} from "@/lib/validators/work-item";
import {
  WAITING_REASONS,
  WAITING_REASON_LABEL_TH,
  type WaitingReason,
} from "@/types/work-item-chat";
import { WorkItemCard } from "./work-item-card";
import { CreateWorkItemPanel } from "./create-work-item";

/**
 * 0080 — Cross-department work-board.
 *
 * The operating-system-analysis §1.4 centrepiece: the single screen that
 * answers "show me every live job, its stage, and which department owns
 * it" — the staff-side of the status-visibility promise.
 *
 * Layout: a column-per-status board (open / in_progress / blocked / done
 * / cancelled), each card linking to its domain detail page, assignable
 * to a role + person, advanceable along the lifecycle.
 *
 * URL filters:
 *   ?role=warehouse   — only items assigned to that department
 *   ?status=open      — focus a single status (others collapse)
 *   ?overdue=on       — only past-SLA active items
 *
 * RBAC: every operational role can SEE the board (cross-department
 * visibility is the point). The mutating actions are super+ops-gated.
 */

export const dynamic = "force-dynamic";

// Active statuses get a column by default; done/cancelled are shown
// collapsed (recent only) unless explicitly focused via ?status=.
const BOARD_COLUMNS: WorkStatus[] = ["open", "in_progress", "blocked"];

const STATUS_COLUMN_STYLE: Record<WorkStatus, string> = {
  open:        "border-blue-200 bg-blue-50/40",
  in_progress: "border-amber-200 bg-amber-50/40",
  blocked:     "border-red-200 bg-red-50/40",
  done:        "border-green-200 bg-green-50/40",
  cancelled:   "border-gray-200 bg-gray-50/40",
};

type SP = { role?: string; status?: string; overdue?: string; waiting?: string };

type AdminOption = { profile_id: string; name: string };

type WorkRow = {
  id:               string;
  entity_type:      string;
  entity_ref:       string;
  type:             string;
  title:            string;
  note:             string | null;
  status:           string;
  priority:         string;
  assigned_role:    string;
  assigned_to:      string | null;
  due_at:           string | null;
  created_at:       string;
  // IC-1 — waiting_for block (added by 0083).
  waiting_reason:   string | null;
  blocked_on_role:  string | null;
  blocked_on_admin: string | null;
};

export default async function AdminBoardPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin();                                  // any admin can view
  const sp = await searchParams;
  const admin = createAdminClient();

  const roleFilter: WorkAssignableRole | null =
    (WORK_ASSIGNABLE_ROLES as readonly string[]).includes(sp.role ?? "")
      ? (sp.role as WorkAssignableRole)
      : null;
  const statusFilter: WorkStatus | null =
    (WORK_STATUSES as readonly string[]).includes(sp.status ?? "")
      ? (sp.status as WorkStatus)
      : null;
  const waitingFilter: WaitingReason | null =
    (WAITING_REASONS as readonly string[]).includes(sp.waiting ?? "")
      ? (sp.waiting as WaitingReason)
      : null;
  const overdueOnly = sp.overdue === "on";

  // ── Fetch work items ──────────────────────────────────────────────
  // Pull the active set always; if a terminal status is focused, pull
  // that instead. Cap generously — the board is an operational queue.
  let q = admin
    .from("work_items")
    .select(`
      id, entity_type, entity_ref, type, title, note, status, priority,
      assigned_role, assigned_to, due_at, created_at,
      waiting_reason, blocked_on_role, blocked_on_admin
    `)
    .order("created_at", { ascending: false })
    .limit(500);

  if (roleFilter)    q = q.eq("assigned_role", roleFilter);
  if (waitingFilter) q = q.eq("waiting_reason", waitingFilter);
  if (statusFilter)  q = q.eq("status", statusFilter);
  else               q = q.in("status", BOARD_COLUMNS);    // default: active only

  const { data, error } = await q;
  if (error) {
    console.error(`[work_items list] failed`, { code: error.code, message: error.message });
  }
  let rows = (data ?? []) as WorkRow[];
  if (overdueOnly) {
    rows = rows.filter((r) => isWorkItemOverdue(r.due_at, r.status as WorkStatus));
  }

  // ── Resolve assignee names (one IN-query) ─────────────────────────
  const assigneeIds = [...new Set(rows.map((r) => r.assigned_to).filter((v): v is string => !!v))];
  const nameById = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: profs, error: profsErr } = await admin
      .from("profiles")
      .select("id, member_code, first_name, last_name")
      .in("id", assigneeIds);
    if (profsErr) {
      console.error(`[profiles list] failed`, { code: profsErr.code, message: profsErr.message });
    }
    for (const p of (profs ?? []) as Array<{ id: string; member_code: string | null; first_name: string | null; last_name: string | null }>) {
      nameById.set(
        p.id,
        [p.first_name, p.last_name].filter(Boolean).join(" ") || p.member_code || "—",
      );
    }
  }

  // ── Admin options for the assignee picker ─────────────────────────
  const { data: adminRows, error: adminRowsErr } = await admin
    .from("admins")
    .select("profile_id, role, profile:profiles!profile_id ( member_code, first_name, last_name )")
    .eq("is_active", true);
  if (adminRowsErr) {
    console.error(`[admins list] failed`, { code: adminRowsErr.code, message: adminRowsErr.message });
  }
  type AR = {
    profile_id: string; role: string;
    profile: { member_code: string | null; first_name: string | null; last_name: string | null }
           | { member_code: string | null; first_name: string | null; last_name: string | null }[]
           | null;
  };
  const adminOptionsMap = new Map<string, AdminOption>();
  for (const a of (adminRows ?? []) as AR[]) {
    const p = Array.isArray(a.profile) ? a.profile[0] ?? null : a.profile;
    if (!adminOptionsMap.has(a.profile_id)) {
      adminOptionsMap.set(a.profile_id, {
        profile_id: a.profile_id,
        name: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.member_code || a.profile_id.slice(0, 8),
      });
    }
  }
  const adminOptions = [...adminOptionsMap.values()].sort((x, y) => x.name.localeCompare(y.name, "th"));

  // ── Global counts — board-wide active state (NOT filtered) ────────
  const { data: allActive, error: allActiveErr } = await admin
    .from("work_items")
    .select("status, assigned_role, due_at, waiting_reason")
    .in("status", ["open", "in_progress", "blocked"]);
  if (allActiveErr) {
    console.error(`[work_items list] failed`, { code: allActiveErr.code, message: allActiveErr.message });
  }
  const activeRows = (allActive ?? []) as Array<{
    status: string; assigned_role: string; due_at: string | null; waiting_reason: string | null;
  }>;
  const totalActive = activeRows.length;
  const overdueCount = activeRows.filter((r) => isWorkItemOverdue(r.due_at, r.status as WorkStatus)).length;
  const byRole = new Map<string, number>();
  for (const r of activeRows) byRole.set(r.assigned_role, (byRole.get(r.assigned_role) ?? 0) + 1);
  // IC-1 — per-waiting-reason counts (for the chip badges).
  const byWaiting = new Map<string, number>();
  let totalWaiting = 0;
  for (const r of activeRows) {
    if (r.waiting_reason) {
      byWaiting.set(r.waiting_reason, (byWaiting.get(r.waiting_reason) ?? 0) + 1);
      totalWaiting += 1;
    }
  }

  // ── Sort each column: priority desc, then oldest-first (FIFO) ─────
  function sortColumn(items: WorkRow[]): WorkRow[] {
    return [...items].sort((a, b) => {
      const pw =
        (WORK_PRIORITY_WEIGHT[b.priority as keyof typeof WORK_PRIORITY_WEIGHT] ?? 1) -
        (WORK_PRIORITY_WEIGHT[a.priority as keyof typeof WORK_PRIORITY_WEIGHT] ?? 1);
      if (pw !== 0) return pw;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  const columns = statusFilter ? [statusFilter] : BOARD_COLUMNS;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · OPERATING SYSTEM</p>
          <h1 className="mt-1 text-2xl font-bold">กระดานงานข้ามแผนก (Work Board)</h1>
          <p className="mt-1 text-sm text-muted">
            ทุกแผนกเห็นงานในที่เดียว — มอบหมาย · เลื่อนสถานะ · ส่งต่อ ไม่ต้องไล่ถามใน LINE
          </p>
        </div>
        <Link
          href="/admin/board/inbox"
          className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-alt transition-colors"
        >
          📥 งานของฉัน (Inbox)
        </Link>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="งานที่ยังเปิดอยู่" value={totalActive} tone="default" />
        <Stat label="เกินกำหนด (SLA)" value={overdueCount} tone={overdueCount > 0 ? "danger" : "ok"} />
        <Stat label="รอเริ่ม" value={activeRows.filter((r) => r.status === "open").length} tone="info" />
        <Stat label="กำลังทำ" value={activeRows.filter((r) => r.status === "in_progress").length} tone="warn" />
      </div>

      {/* Create panel */}
      <CreateWorkItemPanel adminOptions={adminOptions} />

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted font-semibold">แผนก:</span>
          <Chip active={!roleFilter} href={buildHref({ role: null, status: sp.status, overdue: sp.overdue, waiting: sp.waiting })}>
            ทุกแผนก ({totalActive})
          </Chip>
          {WORK_ASSIGNABLE_ROLES.map((r) => (
            <Chip
              key={r}
              active={roleFilter === r}
              href={buildHref({ role: r, status: sp.status, overdue: sp.overdue, waiting: sp.waiting })}
            >
              {WORK_ROLE_LABEL[r]} ({byRole.get(r) ?? 0})
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted font-semibold">สถานะ:</span>
          <Chip active={!statusFilter} href={buildHref({ role: sp.role, status: null, overdue: sp.overdue, waiting: sp.waiting })}>
            งานที่เปิดอยู่
          </Chip>
          {WORK_STATUSES.map((s) => (
            <Chip
              key={s}
              active={statusFilter === s}
              href={buildHref({ role: sp.role, status: s, overdue: sp.overdue, waiting: sp.waiting })}
            >
              {WORK_STATUS_LABEL[s]}
            </Chip>
          ))}
          <Chip
            active={overdueOnly}
            href={buildHref({ role: sp.role, status: sp.status, overdue: overdueOnly ? null : "on", waiting: sp.waiting })}
          >
            ⏰ เกินกำหนดเท่านั้น
          </Chip>
        </div>
        {/* IC-1 — waiting_reason filter chips (one per reason + "ทั้งหมด"). */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted font-semibold">รอ:</span>
          <Chip active={!waitingFilter} href={buildHref({ role: sp.role, status: sp.status, overdue: sp.overdue, waiting: null })}>
            ทั้งหมด ({totalWaiting})
          </Chip>
          {WAITING_REASONS.map((w) => (
            <Chip
              key={w}
              active={waitingFilter === w}
              href={buildHref({ role: sp.role, status: sp.status, overdue: sp.overdue, waiting: w })}
            >
              {WAITING_REASON_LABEL_TH[w]} ({byWaiting.get(w) ?? 0})
            </Chip>
          ))}
        </div>
      </div>

      {/* Board columns */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-12 text-center">
          <p className="text-sm text-muted">ไม่มีงานตรงกับตัวกรอง</p>
        </div>
      ) : (
        <div className={`grid gap-4 ${columns.length === 1 ? "grid-cols-1" : "lg:grid-cols-3"}`}>
          {columns.map((col) => {
            const colRows = sortColumn(rows.filter((r) => r.status === col));
            return (
              <section
                key={col}
                className={`rounded-2xl border ${STATUS_COLUMN_STYLE[col]} dark:bg-surface/40`}
              >
                <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
                  <h2 className="font-bold text-sm">{WORK_STATUS_LABEL[col]}</h2>
                  <span className="rounded-full bg-white dark:bg-surface border border-border px-2 py-0.5 text-[11px] font-mono">
                    {colRows.length}
                  </span>
                </div>
                <div className="p-3 space-y-3">
                  {colRows.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted">— ว่าง —</p>
                  ) : (
                    colRows.map((r) => (
                      <WorkItemCard
                        key={r.id}
                        item={{
                          id:               r.id,
                          entity_type:      r.entity_type,
                          entity_ref:       r.entity_ref,
                          type:             r.type,
                          title:            r.title,
                          note:             r.note,
                          status:           r.status as WorkStatus,
                          priority:         r.priority,
                          assigned_role:    r.assigned_role,
                          assigned_to:      r.assigned_to,
                          assignee_name:    r.assigned_to ? nameById.get(r.assigned_to) ?? null : null,
                          due_at:           r.due_at,
                          domain_href:      workEntityHref(r.entity_type as WorkEntityType, r.entity_ref),
                          overdue:          isWorkItemOverdue(r.due_at, r.status as WorkStatus),
                          waiting_reason:   r.waiting_reason as WaitingReason | null,
                          blocked_on_role:  r.blocked_on_role,
                          blocked_on_admin: r.blocked_on_admin,
                        }}
                        adminOptions={adminOptions}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted">
        การ์ดเรียงตามความสำคัญ (ด่วน → ปกติ) แล้วงานเก่าก่อน (FIFO). กดที่ชื่องานเพื่อเปิดหน้ารายละเอียดของแผนกนั้น.
      </p>
    </main>
  );
}

// ── helpers ───────────────────────────────────────────────────────

function buildHref(p: {
  role?: string | null; status?: string | null; overdue?: string | null; waiting?: string | null;
}): string {
  const qs = new URLSearchParams();
  if (p.role)    qs.set("role", p.role);
  if (p.status)  qs.set("status", p.status);
  if (p.overdue) qs.set("overdue", p.overdue);
  if (p.waiting) qs.set("waiting", p.waiting);
  const s = qs.toString();
  return s ? `/admin/board?${s}` : "/admin/board";
}

function Chip({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "bg-primary-600 text-white border-primary-600"
          : "bg-white dark:bg-surface border-border hover:bg-surface-alt"
      }`}
    >
      {children}
    </Link>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "danger" | "ok" | "info" | "warn";
}) {
  const toneCls: Record<typeof tone, string> = {
    default: "text-foreground",
    danger:  "text-red-700",
    ok:      "text-green-700",
    info:    "text-blue-700",
    warn:    "text-amber-700",
  };
  return (
    <div className="rounded-xl border border-border bg-white dark:bg-surface px-4 py-3 shadow-sm">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`mt-0.5 text-2xl font-black font-mono ${toneCls[tone]}`}>{value}</p>
    </div>
  );
}
