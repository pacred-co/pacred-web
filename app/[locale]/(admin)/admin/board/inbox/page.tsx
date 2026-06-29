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
import { type WaitingReason } from "@/types/work-item-chat";
import { WorkItemCard } from "../work-item-card";
import { DevCockpitPanel } from "@/components/admin/dev-cockpit-panel";
import { isDevCockpitAdmin, loadDevCockpit, type DevCockpit } from "@/lib/admin/dev-cockpit";

/**
 * 0080 + IC-1 — per-role inbox with two tabs.
 *
 * `?tab=mine` (default) — งานของฉัน
 *   - items pinned to ME personally (assigned_to = me)
 *   - items routed to a DEPARTMENT I belong to (assigned_role ∈ my roles)
 *     but not yet pinned to a person
 *
 * `?tab=waiting` (IC-1 §5.3) — รอฉันจัดการ
 *   - jobs blocked on my dept (blocked_on_role = my role)
 *   - jobs blocked on me personally (blocked_on_admin = my profile)
 *
 * Only open / in_progress / blocked items appear — the inbox is a
 * "what needs me" queue, not a history. Done work drops off.
 */

export const dynamic = "force-dynamic";

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
  waiting_reason:   string | null;
  blocked_on_role:  string | null;
  blocked_on_admin: string | null;
};

const ACTIVE: WorkStatus[] = ["open", "in_progress", "blocked"];

type InboxTab = "mine" | "waiting" | "mailbox";

export default async function AdminBoardInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { user, roles } = await requireAdmin();
  const sp = await searchParams;
  const tab: InboxTab =
    sp.tab === "waiting" ? "waiting" :
    sp.tab === "mailbox" ? "mailbox" :
    "mine";
  const admin = createAdminClient();

  // ── Dev cockpit — ภูม only (2026-06-29) · hi-tech mission-control hero ──
  // Gated by allowlist (member_code/login_id), NOT a role. Others see the
  // normal inbox unchanged.
  const { data: meProfile, error: meProfileErr } = await admin
    .from("profiles")
    .select("member_code, admin_login_id, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();
  if (meProfileErr) {
    console.error(`[dev-cockpit profile probe] failed`, { code: meProfileErr.code, message: meProfileErr.message });
  }
  const showCockpit = isDevCockpitAdmin(meProfile?.member_code, meProfile?.admin_login_id);
  let cockpit: DevCockpit | null = null;
  if (showCockpit) {
    cockpit = await loadDevCockpit(admin);
  }
  const cockpitName = [meProfile?.first_name, meProfile?.last_name].filter(Boolean).join(" ") || "ภูม";
  const cockpitCode = meProfile?.member_code ?? "AD008";

  const selectCols = `
    id, entity_type, entity_ref, type, title, note, status, priority,
    assigned_role, assigned_to, due_at, created_at,
    waiting_reason, blocked_on_role, blocked_on_admin
  `;

  // ── Items for ME — assigned_to = me OR assigned_role ∈ my roles ───
  // Two queries (OR across two columns is cleaner as a union).
  const { data: mineRaw, error: mineRawErr } = await admin
    .from("work_items")
    .select(selectCols)
    .eq("assigned_to", user.id)
    .in("status", ACTIVE)
    .order("created_at", { ascending: false })
    .limit(300);
  if (mineRawErr) {
    console.error(`[work_items list] failed`, { code: mineRawErr.code, message: mineRawErr.message });
  }

  const { data: deptRaw, error: deptRawErr } = await admin
    .from("work_items")
    .select(selectCols)
    .in("assigned_role", roles as WorkAssignableRole[])
    .is("assigned_to", null)
    .in("status", ACTIVE)
    .order("created_at", { ascending: false })
    .limit(300);
  if (deptRawErr) {
    console.error(`[work_items list] failed`, { code: deptRawErr.code, message: deptRawErr.message });
  }

  const mine = (mineRaw ?? []) as unknown as WorkRow[];
  const dept = (deptRaw ?? []) as unknown as WorkRow[];

  // ── IC-1 §5.3 — "Waiting on me" tab data ──────────────────────────
  // Jobs blocked on my DEPT (blocked_on_role ∈ my roles, waiting_reason
  // present).  Excludes jobs already pinned to a specific person — those
  // go in "blocked on me personally".
  const { data: blockedDeptRaw, error: blockedDeptRawErr } = await admin
    .from("work_items")
    .select(selectCols)
    .in("blocked_on_role", roles as WorkAssignableRole[])
    .not("waiting_reason", "is", null)
    .is("blocked_on_admin", null)
    .in("status", ACTIVE)
    .order("created_at", { ascending: false })
    .limit(300);
  if (blockedDeptRawErr) {
    console.error(`[work_items list] failed`, { code: blockedDeptRawErr.code, message: blockedDeptRawErr.message });
  }

  // Jobs blocked on ME personally (a specific person was named).
  const { data: blockedMeRaw, error: blockedMeRawErr } = await admin
    .from("work_items")
    .select(selectCols)
    .eq("blocked_on_admin", user.id)
    .not("waiting_reason", "is", null)
    .in("status", ACTIVE)
    .order("created_at", { ascending: false })
    .limit(300);
  if (blockedMeRawErr) {
    console.error(`[work_items list] failed`, { code: blockedMeRawErr.code, message: blockedMeRawErr.message });
  }

  const blockedDept = (blockedDeptRaw ?? []) as unknown as WorkRow[];
  const blockedMe   = (blockedMeRaw   ?? []) as unknown as WorkRow[];

  // ── Admin options for the assignee picker (claim → pin to a person) ─
  const { data: adminRows, error: adminRowsErr } = await admin
    .from("admins")
    .select("profile_id, profile:profiles!profile_id ( member_code, first_name, last_name )")
    .eq("is_active", true);
  if (adminRowsErr) {
    console.error(`[admins list] failed`, { code: adminRowsErr.code, message: adminRowsErr.message });
  }
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
      assignee_name:    null as string | null,
      due_at:           r.due_at,
      domain_href:      workEntityHref(r.entity_type as WorkEntityType, r.entity_ref),
      overdue:          isWorkItemOverdue(r.due_at, r.status as WorkStatus),
      waiting_reason:   r.waiting_reason as WaitingReason | null,
      blocked_on_role:  r.blocked_on_role,
      blocked_on_admin: r.blocked_on_admin,
    };
  }

  const totalWaiting = blockedDept.length + blockedMe.length;

  const mineOverdue = mine.filter((r) => isWorkItemOverdue(r.due_at, r.status as WorkStatus)).length;

  return (
    <main className="p-6 lg:p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · งานของฉัน</p>
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

      {/* Dev cockpit — ภูม only · hi-tech mission-control hero */}
      {showCockpit && cockpit && (
        <DevCockpitPanel cockpit={cockpit} adminName={cockpitName} adminCode={cockpitCode} />
      )}

      {/* Tab bar — URL state via ?tab= */}
      <nav className="flex gap-1 border-b border-border" aria-label="inbox tabs">
        <TabLink active={tab === "mine"}     href="/admin/board/inbox" badge={mine.length + dept.length}>
          🙋 งานของฉัน
        </TabLink>
        <TabLink active={tab === "waiting"}  href="/admin/board/inbox?tab=waiting" badge={totalWaiting}>
          🔴 รอฉันจัดการ
        </TabLink>
        <TabLink active={tab === "mailbox"} href="/admin/board/inbox?tab=mailbox" badge={0}>
          💌 กล่องจดหมาย
        </TabLink>
      </nav>

      {/* Tab: MINE — งานของฉัน + งานแผนกที่ยังไม่มีคนรับ */}
      {tab === "mine" && (
        <>
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
        </>
      )}

      {/* Tab: WAITING — IC-1 §5.3 — "รอฉันจัดการ" */}
      {tab === "waiting" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-white dark:bg-surface px-4 py-3 shadow-sm">
              <p className="text-[11px] text-muted">บล็อกที่แผนกของฉัน</p>
              <p className="mt-0.5 text-2xl font-black font-mono text-orange-700">{blockedDept.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-white dark:bg-surface px-4 py-3 shadow-sm">
              <p className="text-[11px] text-muted">บล็อกที่ฉันโดยตรง</p>
              <p className="mt-0.5 text-2xl font-black font-mono text-red-700">{blockedMe.length}</p>
            </div>
          </div>

          {/* Blocked on my dept */}
          <section className="space-y-3">
            <h2 className="font-bold text-sm flex items-center gap-2">
              🔴 งานที่บล็อกแผนกของฉัน
              <span className="rounded-full bg-surface-alt border border-border px-2 py-0.5 text-[11px] font-mono">
                {blockedDept.length}
              </span>
            </h2>
            {blockedDept.length === 0 ? (
              <div className="rounded-2xl border border-border bg-white dark:bg-surface p-10 text-center">
                <p className="text-sm text-muted">ไม่มีงานที่รอแผนกของคุณ</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sortRows(blockedDept).map((r) => (
                  <WorkItemCard key={r.id} item={toCard(r)} adminOptions={adminOptions} />
                ))}
              </div>
            )}
          </section>

          {/* Blocked on me personally */}
          <section className="space-y-3">
            <h2 className="font-bold text-sm flex items-center gap-2">
              🔴 งานที่บล็อกฉันโดยตรง
              <span className="rounded-full bg-surface-alt border border-border px-2 py-0.5 text-[11px] font-mono">
                {blockedMe.length}
              </span>
            </h2>
            {blockedMe.length === 0 ? (
              <div className="rounded-2xl border border-border bg-white dark:bg-surface p-10 text-center">
                <p className="text-sm text-muted">ไม่มีงานที่บล็อกคุณโดยตรง</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sortRows(blockedMe).map((r) => (
                  <WorkItemCard key={r.id} item={toCard(r)} adminOptions={adminOptions} />
                ))}
              </div>
            )}
          </section>

          <p className="text-[11px] text-muted">
            งานที่นี่กำลังหยุดรอคุณ — กดเข้างาน → ดูเหตุผลใน chat → ตอบหรือ “✅ unblock” เพื่อปลดล็อก.
          </p>
        </>
      )}

      {/* Tab: MAILBOX — กล่องจดหมาย (โครงไว้ก่อน · ปอนจะมาทำเนื้อหาเอง 2026-06-29) */}
      {tab === "mailbox" && (
        <section className="space-y-3">
          <h2 className="font-bold text-sm flex items-center gap-2">💌 กล่องจดหมาย</h2>
          <div className="rounded-2xl border border-dashed border-border bg-white dark:bg-surface p-10 text-center">
            <p className="text-3xl">💌</p>
            <p className="mt-2 text-sm font-semibold text-foreground">กล่องจดหมาย — กำลังจัดทำ</p>
            <p className="mt-1 text-xs text-muted">ขึ้นโครงไว้ก่อน · เดี๋ยวปอนมาเพิ่มเนื้อหาเอง</p>
          </div>
        </section>
      )}
    </main>
  );
}

function TabLink({
  active, href, badge, children,
}: {
  active: boolean; href: string; badge: number; children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors min-h-[44px] ${
        active
          ? "border-primary-600 text-primary-600"
          : "border-transparent text-muted hover:text-foreground hover:border-border"
      }`}
    >
      {children}
      {badge > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[11px] font-mono ${
            active ? "bg-primary-600 text-white" : "bg-surface-alt border border-border"
          }`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
