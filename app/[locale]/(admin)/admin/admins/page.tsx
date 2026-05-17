import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { GrantForm, RowActions, ContactForm } from "./admin-actions";

/**
 * U4-1 — Staff RBAC / super-review console.
 *
 * Surfaces every `admins` row + their profile + display contact + role
 * distribution overview. `super` can grant new roles, toggle active /
 * inactive, and see the full picture across all 7 role kinds (super /
 * ops / accounting / sales_admin / warehouse / driver / interpreter).
 *
 * URL filters:
 *   ?role=super    — only show admins holding that role
 *   ?active=on     — only show active rows (default: all)
 */

export const dynamic = "force-dynamic";

const ALL_ROLES = ["super","ops","accounting","sales_admin","warehouse","driver","interpreter"] as const;
type AdminRole = typeof ALL_ROLES[number];

const ROLE_LABEL: Record<AdminRole, string> = {
  super:       "Super",
  ops:         "Ops",
  accounting:  "Accounting",
  sales_admin: "Sales Admin",
  warehouse:   "Warehouse",
  driver:      "Driver",
  interpreter: "ล่ามจีน (Interpreter)",
};
const ROLE_BADGE: Record<AdminRole, string> = {
  super:       "bg-red-50 text-red-700 border-red-200",
  ops:         "bg-blue-50 text-blue-700 border-blue-200",
  accounting:  "bg-green-50 text-green-700 border-green-200",
  sales_admin: "bg-purple-50 text-purple-700 border-purple-200",
  warehouse:   "bg-amber-50 text-amber-700 border-amber-200",
  driver:      "bg-cyan-50 text-cyan-700 border-cyan-200",
  interpreter: "bg-pink-50 text-pink-700 border-pink-200",
};

type SP = { role?: string; active?: string };

export default async function AdminAdminsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  await requireAdmin(["super"]);                      // only super can manage admins
  const sp = await searchParams;
  const roleFilter   = (ALL_ROLES as readonly string[]).includes(sp.role ?? "") ? (sp.role as AdminRole) : null;
  const activeOnly   = sp.active === "on";
  const admin = createAdminClient();

  // Pull all admin rows + joined profile + contact extras
  const { data: adminRows } = await admin
    .from("admins")
    .select(`
      profile_id, role, granted_at, is_active,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone, email, avatar_url ),
      contact:admin_contact_extras!profile_id ( display_name, direct_phone, department, section )
    `)
    .order("granted_at", { ascending: false });

  type Profile = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; avatar_url: string | null };
  type Contact = { display_name: string | null; direct_phone: string | null; department: string | null; section: string | null };
  type Row = {
    profile_id: string; role: AdminRole;
    granted_at: string; is_active: boolean;
    profile: Profile | Profile[] | null;
    contact: Contact | Contact[] | null;
  };
  const allRows = ((adminRows ?? []) as Row[]).map((r) => ({
    ...r,
    profile_one: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
    contact_one: Array.isArray(r.contact) ? r.contact[0] ?? null : r.contact,
  }));

  // Role distribution overview — counted off ALL rows, NOT filtered.
  const roleDistribution: Record<AdminRole, { active: number; inactive: number }> =
    Object.fromEntries(ALL_ROLES.map((r) => [r, { active: 0, inactive: 0 }])) as Record<AdminRole, { active: number; inactive: number }>;
  for (const r of allRows) {
    if (r.is_active) roleDistribution[r.role].active   += 1;
    else             roleDistribution[r.role].inactive += 1;
  }
  const totalAdmins = new Set(allRows.map((r) => r.profile_id)).size;

  // Apply filters AFTER counting distribution.
  const rows = allRows.filter((r) => {
    if (roleFilter && r.role !== roleFilter) return false;
    if (activeOnly && !r.is_active)         return false;
    return true;
  });

  // Group by profile_id (so same person with 2 roles shows as 1 row + multi badges)
  const byProfile = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byProfile.get(r.profile_id) ?? [];
    arr.push(r);
    byProfile.set(r.profile_id, arr);
  }

  // ── Recent RBAC change events (admin_audit_log filter) ─────────────
  // Surface the 10 most recent admin.grant_role / admin.toggle_role
  // / admin.revoke_role events for super-review.
  const { data: recentRbacEvents } = await admin
    .from("admin_audit_log")
    .select("id, admin_id, action, target_type, target_id, payload, created_at, admin:profiles!admin_id(member_code, first_name, last_name)")
    .like("action", "admin.%")
    .order("created_at", { ascending: false })
    .limit(10);
  type RbacEvent = {
    id: string;
    admin_id: string;
    action: string;
    target_type: string;
    target_id: string;
    payload: Record<string, unknown> | null;
    created_at: string;
    admin: { member_code: string | null; first_name: string | null; last_name: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null }[] | null;
  };
  const rbacEvents = ((recentRbacEvents ?? []) as RbacEvent[]).map((e) => ({
    ...e,
    actor: Array.isArray(e.admin) ? e.admin[0] ?? null : e.admin,
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-7xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · U4-1 RBAC console</p>
        <h1 className="mt-1 text-2xl font-bold">จัดการ admin (super only)</h1>
        <p className="mt-1 text-sm text-muted">เพิ่มสิทธิ์ admin / ปิดสิทธิ์ / ตั้งชื่อแสดงสำหรับการ์ดเซลล์ · ดูสถิติ role + ประวัติเปลี่ยน RBAC ล่าสุด</p>
      </div>

      {/* RBAC distribution overview */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-bold text-sm">การกระจาย role</h2>
          <p className="text-xs text-muted">{totalAdmins} คน รวม · {allRows.length} role grants</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {ALL_ROLES.map((r) => {
            const counts = roleDistribution[r];
            const isFiltered = roleFilter === r;
            const total = counts.active + counts.inactive;
            return (
              <Link
                key={r}
                href={`/admin/admins?role=${r}${activeOnly ? "&active=on" : ""}`}
                className={`rounded-lg border p-2.5 transition ${
                  isFiltered ? "ring-2 ring-primary-400 " + ROLE_BADGE[r]
                             : "border-border bg-surface-alt/30 hover:bg-surface-alt"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wide font-medium">{ROLE_LABEL[r]}</p>
                <p className="text-xl font-bold">{counts.active}</p>
                {counts.inactive > 0 && (
                  <p className="text-[10px] text-muted">+{counts.inactive} ปิดอยู่</p>
                )}
                <p className="text-[10px] text-muted">รวม {total}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted font-medium">ตัวกรอง:</span>
        {roleFilter && (
          <Link href={`/admin/admins${activeOnly ? "?active=on" : ""}`} className="rounded-full border border-border bg-white px-3 py-1 hover:bg-surface-alt">
            ✕ ล้าง role
          </Link>
        )}
        <Link
          href={`/admin/admins?${new URLSearchParams({
            ...(roleFilter ? { role: roleFilter } : {}),
            ...(activeOnly ? {} : { active: "on" }),
          })}`}
          className={`rounded-full border px-3 py-1 ${
            activeOnly ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
          }`}
        >
          {activeOnly ? "✓ active เท่านั้น" : "active เท่านั้น"}
        </Link>
        <span className="text-muted ml-2">→ {rows.length} จาก {allRows.length} grants ที่เห็น</span>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {byProfile.size === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ยังไม่มี admin อื่นนอกจากคุณ</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">โปรไฟล์</th>
                  <th className="px-4 py-3">บัตรเซลล์ (display)</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byProfile.entries()).map(([profileId, entries]) => {
                  const first = entries[0];
                  const p = first.profile_one;
                  const c = first.contact_one;
                  return (
                    <tr key={profileId} className="border-t border-border align-top">
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono">{p?.member_code ?? "—"}</div>
                        <div className="font-medium text-foreground">{p?.first_name} {p?.last_name}</div>
                        <div className="text-muted">📞 {p?.phone ?? "—"}</div>
                        <div className="text-muted">{p?.email ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {c?.display_name ? (
                          <>
                            <div className="font-medium">{c.display_name}</div>
                            {c.direct_phone && <div className="text-muted">📞 {c.direct_phone}</div>}
                            {c.department && <div className="text-muted">{c.department}{c.section ? ` / ${c.section}` : ""}</div>}
                          </>
                        ) : (
                          <div className="text-muted">ยังไม่ตั้ง</div>
                        )}
                        <ContactForm
                          profileId={profileId}
                          displayName={c?.display_name ?? null}
                          directPhone={c?.direct_phone ?? null}
                          department={c?.department ?? null}
                          section={c?.section ?? null}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs space-y-1">
                        {entries.map((e) => (
                          <div key={e.role} className="flex items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${ROLE_BADGE[e.role]}`}>
                              {ROLE_LABEL[e.role]}
                            </span>
                            <RowActions profileId={profileId} role={e.role} isActive={e.is_active} />
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {entries.every((e) => e.is_active) ? "✓ ใช้งาน" : "○ ปิดบางส่วน"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <GrantForm />
      </div>

      {/* Recent RBAC change events */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-sm">การเปลี่ยน RBAC ล่าสุด</h2>
            <p className="text-[10px] text-muted mt-0.5">10 เหตุการณ์ล่าสุดจาก <code className="rounded bg-surface-alt px-1">admin_audit_log</code> action prefix <code className="rounded bg-surface-alt px-1">admin.</code></p>
          </div>
          <Link href="/admin/audit?action=admin." className="text-[10px] text-primary-600 hover:underline shrink-0">
            ↗ ดูทั้งหมดใน audit log
          </Link>
        </div>
        {rbacEvents.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">ยังไม่มีการเปลี่ยน RBAC</p>
        ) : (
          <ul className="divide-y divide-border">
            {rbacEvents.map((e) => {
              const actor = e.actor;
              const actorLabel = actor
                ? `${[actor.first_name, actor.last_name].filter(Boolean).join(" ") || "—"}${actor.member_code ? ` (${actor.member_code})` : ""}`
                : e.admin_id.slice(0, 8);
              return (
                <li key={e.id} className="px-5 py-2.5 text-xs flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 space-y-0.5">
                    <p>
                      <span className="font-mono font-medium text-primary-700">{e.action}</span>
                      <span className="text-muted"> on </span>
                      <span className="font-mono">{e.target_id.slice(0, 8)}</span>
                    </p>
                    <p className="text-[10px] text-muted">
                      โดย <span className="text-foreground font-medium">{actorLabel}</span>
                      {" · "}
                      {new Date(e.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  {e.payload && Object.keys(e.payload).length > 0 && (
                    <details className="text-[10px] shrink-0 max-w-[50%]">
                      <summary className="cursor-pointer text-muted hover:text-foreground">payload</summary>
                      <pre className="mt-1 rounded bg-surface-alt/50 p-2 overflow-x-auto font-mono text-[10px] whitespace-pre-wrap break-words">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
