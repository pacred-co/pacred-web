import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, Users, Plus, Search, Building2 } from "lucide-react";
import { EmployeeRowActions } from "./employee-actions";

type Profile = {
  id: string;
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
};
type Contact = {
  display_name: string | null;
  nickname:     string | null;
  company:      string | null;
  employee_type: string | null;
  department:   string | null;
  section:      string | null;
  work_email:   string | null;
  work_phone:   string | null;
  direct_phone: string | null;
  hired_at:     string | null;
  suspended_at: string | null;
};
type AdminRow = {
  profile_id: string;
  role: string;
  is_active: boolean;
  granted_at: string;
  profile: Profile | Profile[] | null;
  contact: Contact | Contact[] | null;
};
type Assignment = {
  profile_id: string;
  kind: "employee" | "internship" | "partner";
  position: { name: string; section: { name: string; branch: { name: string; color_tone: string } | null } | null } | null;
};

const COMPANY_LABEL: Record<string, { label: string; cls: string }> = {
  "pacred":         { label: "Pacred",         cls: "bg-primary-50 text-primary-700 border-primary-200" },
  "pacred-cargo":   { label: "Pacred Cargo",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  "pacred-freight": { label: "Pacred Freight", cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
};
const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  full_time: { label: "พนักงานประจำ", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  probation: { label: "ทดลองงาน",     cls: "bg-amber-50 text-amber-700 border-amber-200" },
  contract:  { label: "สัญญาจ้าง",   cls: "bg-blue-50 text-blue-700 border-blue-200" },
  daily:     { label: "รายวัน",       cls: "bg-purple-50 text-purple-700 border-purple-200" },
  intern:    { label: "ฝึกงาน",       cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  partner:   { label: "พาร์ทเนอร์",   cls: "bg-pink-50 text-pink-700 border-pink-200" },
};
const ROLE_BADGE: Record<string, string> = {
  super:       "bg-red-50 text-red-700 border-red-200",
  ops:         "bg-blue-50 text-blue-700 border-blue-200",
  accounting:  "bg-green-50 text-green-700 border-green-200",
  sales_admin: "bg-purple-50 text-purple-700 border-purple-200",
};

type Filter = "all" | "active" | "suspended";

export default async function AdminHREmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: Filter; dept?: string; type?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter: Filter = sp.status === "active" || sp.status === "suspended" ? sp.status : "all";
  const admin = createAdminClient();

  const [adminsRes, assignmentsRes] = await Promise.all([
    admin
      .from("admins")
      .select(`
        profile_id, role, is_active, granted_at,
        profile:profiles!profile_id ( id, member_code, first_name, last_name, phone, email, avatar_url, created_at ),
        contact:admin_contact_extras!profile_id (
          display_name, nickname, company, employee_type,
          department, section, work_email, work_phone, direct_phone,
          hired_at, suspended_at
        )
      `)
      .order("granted_at", { ascending: false }),
    admin
      .from("org_assignments")
      .select(`
        profile_id, kind,
        position:org_positions!position_id (
          name,
          section:org_sections!section_id (
            name,
            branch:org_branches!branch_id ( name, color_tone )
          )
        )
      `)
      .is("ended_at", null),
  ]);

  // Group admins rows by profile_id (so people with multiple roles show once)
  const rows = (adminsRes.data ?? []) as AdminRow[];
  type FlatPerson = {
    profile_id: string;
    profile: Profile | null;
    contact: Contact | null;
    roles: Array<{ role: string; is_active: boolean; granted_at: string }>;
  };
  const byProfile = new Map<string, FlatPerson>();
  for (const r of rows) {
    const p = Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile;
    const c = Array.isArray(r.contact) ? r.contact[0] ?? null : r.contact;
    const entry = byProfile.get(r.profile_id) ?? { profile_id: r.profile_id, profile: p, contact: c, roles: [] };
    entry.roles.push({ role: r.role, is_active: r.is_active, granted_at: r.granted_at });
    byProfile.set(r.profile_id, entry);
  }

  // Map assignments → first active position per profile (for the table dept/position cells)
  type FlatAssignment = { kind: Assignment["kind"]; positionName: string | null; sectionName: string | null; branchName: string | null; branchTone: string | null };
  const assignByProfile = new Map<string, FlatAssignment>();
  for (const a of (assignmentsRes.data ?? []) as unknown as Array<{ profile_id: string; kind: Assignment["kind"]; position: Assignment["position"] | Assignment["position"][] | null }>) {
    const pos = Array.isArray(a.position) ? a.position[0] ?? null : a.position;
    const sec = pos?.section ? (Array.isArray(pos.section) ? pos.section[0] ?? null : pos.section) : null;
    const br  = sec?.branch  ? (Array.isArray(sec.branch)  ? sec.branch[0]  ?? null : sec.branch)  : null;
    if (!assignByProfile.has(a.profile_id)) {
      assignByProfile.set(a.profile_id, {
        kind:         a.kind,
        positionName: pos?.name ?? null,
        sectionName:  sec?.name ?? null,
        branchName:   br?.name ?? null,
        branchTone:   br?.color_tone ?? null,
      });
    }
  }

  // Compose flat list for rendering
  type Person = FlatPerson & {
    fullName: string;
    isSuspended: boolean;
    assignment: FlatAssignment | null;
  };
  const allPeople: Person[] = Array.from(byProfile.values()).map((p) => ({
    ...p,
    fullName: `${p.profile?.first_name ?? ""} ${p.profile?.last_name ?? ""}`.trim() || (p.contact?.display_name ?? "—"),
    isSuspended: !!p.contact?.suspended_at || p.roles.every((r) => !r.is_active),
    assignment: assignByProfile.get(p.profile_id) ?? null,
  }));

  // Stat counts BEFORE filter so the tab badges remain accurate
  const totalAll       = allPeople.length;
  const totalActive    = allPeople.filter((p) => !p.isSuspended).length;
  const totalSuspended = totalAll - totalActive;

  // Apply filters
  const q = sp.q?.trim().toLowerCase();
  let people = allPeople;
  if (filter === "active")    people = people.filter((p) => !p.isSuspended);
  if (filter === "suspended") people = people.filter((p) =>  p.isSuspended);
  if (sp.dept)                people = people.filter((p) => p.contact?.department === sp.dept || p.assignment?.sectionName === sp.dept);
  if (sp.type)                people = people.filter((p) => (p.contact?.employee_type ?? "full_time") === sp.type);
  if (q) {
    people = people.filter((p) =>
      [p.profile?.member_code, p.profile?.first_name, p.profile?.last_name, p.contact?.nickname,
       p.contact?.display_name, p.profile?.phone, p.profile?.email, p.contact?.work_phone, p.contact?.work_email]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }

  // Collect distinct departments for the dropdown
  const allDepartments = Array.from(new Set(
    allPeople.flatMap((p) => [p.contact?.department, p.assignment?.sectionName].filter(Boolean) as string[]),
  )).sort();

  // Tab pill helper — build hrefs that preserve other filters
  const tabHref = (s: Filter) => {
    const qs = new URLSearchParams();
    if (sp.q)    qs.set("q",    sp.q);
    if (sp.dept) qs.set("dept", sp.dept);
    if (sp.type) qs.set("type", sp.type);
    if (s !== "all") qs.set("status", s);
    const s2 = qs.toString();
    return `/admin/hr/employees${s2 ? `?${s2}` : ""}`;
  };

  return (
    <main className="p-4 lg:p-6 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr" className="hover:text-primary-600">ฝ่ายทรัพยากรบุคคล</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">รายชื่อพนักงานทั้งหมด</span>
      </nav>

      {/* Header card — PCS-style red gradient header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white shadow-sm">
        <div className="absolute inset-0 opacity-10 [background:radial-gradient(circle_at_top_right,white,transparent_50%)]" />
        <div className="relative p-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-widest opacity-80">HR · EMPLOYEE DIRECTORY</p>
              <h1 className="text-xl sm:text-2xl font-bold">รายชื่อพนักงานทั้งหมดแบบตารางข้อมูล</h1>
              <p className="text-xs opacity-80 mt-0.5">ทั้งหมด {totalAll} คน · ทำงานอยู่ {totalActive} · พักงาน {totalSuspended}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/hr"
              className="rounded-lg bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-2 text-xs sm:text-sm font-medium hover:bg-white/25"
            >
              ← กลับ HR
            </Link>
            <Link
              href="/admin/admins"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white text-primary-700 px-3 py-2 text-xs sm:text-sm font-bold hover:bg-white/90 shadow"
              title="เพิ่มสิทธิ์ admin ให้กับโปรไฟล์ที่มีอยู่"
            >
              <Plus className="w-4 h-4" />
              เพิ่มพนักงานใหม่
            </Link>
          </div>
        </div>
      </div>

      {/* Status tabs + search bar */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <TabPill href={tabHref("all")}       active={filter === "all"}       label="ทั้งหมด"     count={totalAll}       />
          <TabPill href={tabHref("active")}    active={filter === "active"}    label="ยังทำงานอยู่" count={totalActive}    tone="green" />
          <TabPill href={tabHref("suspended")} active={filter === "suspended"} label="พักงาน / ลาออก" count={totalSuspended} tone="red" />
        </div>

        <form action="/admin/hr/employees" method="get" className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="ค้นหา รหัส / ชื่อ / ชื่อเล่น / เบอร์ / อีเมล"
              className="w-full rounded-lg border border-border bg-surface-alt/30 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40"
            />
          </label>
          <select name="dept" defaultValue={sp.dept ?? ""} className="rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm">
            <option value="">ทุกแผนก</option>
            {allDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select name="type" defaultValue={sp.type ?? ""} className="rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm">
            <option value="">ทุกประเภท</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 text-sm font-medium hover:bg-primary-600">
            ค้นหา
          </button>
        </form>
      </div>

      {/* Data table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {people.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted">
            <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
            ไม่พบพนักงานในเงื่อนไขที่เลือก
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="px-3 py-2.5 whitespace-nowrap">วันที่เริ่ม</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">รหัสพนักงาน</th>
                  <th className="px-3 py-2.5">ชื่อ-นามสกุล</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">ชื่อเล่น</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">บริษัท</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">ประเภท</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">แผนก / ตำแหน่ง</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Roles</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">ติดต่อส่วนตัว</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">ติดต่อบริษัท</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">สถานะ</th>
                  <th className="px-3 py-2.5 whitespace-nowrap text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const company = COMPANY_LABEL[p.contact?.company ?? "pacred"] ?? COMPANY_LABEL.pacred;
                  const type    = TYPE_LABEL[p.contact?.employee_type ?? "full_time"] ?? TYPE_LABEL.full_time;
                  const dept    = p.contact?.department ?? p.assignment?.sectionName ?? null;
                  const pos     = p.assignment?.positionName ?? p.contact?.section ?? "—";
                  const hiredDate = p.contact?.hired_at ?? p.profile?.created_at ?? p.roles[0]?.granted_at;
                  return (
                    <tr key={p.profile_id} className={`border-t border-border hover:bg-surface-alt/30 ${p.isSuspended ? "opacity-60" : ""}`}>
                      <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">
                        {hiredDate ? new Date(hiredDate).toLocaleDateString("th-TH") : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/admin/hr/employees/${p.profile_id}`} className="font-mono text-xs text-primary-600 hover:underline">
                          {p.profile?.member_code ?? "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-[180px]">
                          <Avatar src={p.profile?.avatar_url ?? null} name={p.fullName} />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground text-sm truncate">{p.fullName}</p>
                            {p.contact?.display_name && (
                              <p className="text-[11px] text-muted truncate">"{p.contact.display_name}"</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {p.contact?.nickname ? (
                          <span className="font-medium text-foreground">{p.contact.nickname}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${company.cls}`}>
                          <Building2 className="w-2.5 h-2.5" />
                          {company.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${type.cls}`}>
                          {type.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <div className="font-medium text-foreground">{dept ?? <span className="text-muted">—</span>}</div>
                        <div className="text-muted text-[11px]">{pos}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {p.roles.length === 0 ? (
                            <span className="text-[10px] text-muted">—</span>
                          ) : p.roles.map((r) => (
                            <span
                              key={r.role}
                              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${ROLE_BADGE[r.role] ?? "bg-gray-50 text-gray-700 border-gray-200"} ${!r.is_active ? "opacity-40" : ""}`}
                            >
                              {r.role}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px]">
                        <div>{p.profile?.phone ?? <span className="text-muted">—</span>}</div>
                        <div className="text-muted truncate max-w-[160px]">{p.profile?.email ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px]">
                        <div>{p.contact?.work_phone ?? p.contact?.direct_phone ?? <span className="text-muted">—</span>}</div>
                        <div className="text-muted truncate max-w-[160px]">{p.contact?.work_email ?? "—"}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        {p.isSuspended ? (
                          <span className="rounded-full border border-red-200 bg-red-50 text-red-700 px-2 py-0.5 text-[10px] font-bold">
                            ● พักงาน
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-bold">
                            ● ทำงาน
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <EmployeeRowActions
                          profileId={p.profile_id}
                          suspended={p.isSuspended}
                          hasEmail={!!p.profile?.email}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted">
        Phase 2 (ถัดไป): ลงประกาศรับสมัครงาน · นัดสัมภาษณ์ · ระบบ TAS · KPI · เงินเดือน
      </div>
    </main>
  );
}

function TabPill({
  href, active, label, count, tone,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  tone?: "green" | "red";
}) {
  const activeCls = tone === "green"
    ? "bg-emerald-500 text-white border-emerald-500"
    : tone === "red"
      ? "bg-red-500 text-white border-red-500"
      : "bg-primary-500 text-white border-primary-500";
  const idleCls = "bg-white dark:bg-surface text-foreground border-border hover:bg-surface-alt";
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${active ? activeCls : idleCls}`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white/25" : "bg-surface-alt"}`}>
        {count}
      </span>
    </Link>
  );
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} className="h-8 w-8 rounded-full object-cover ring-1 ring-border shrink-0" />
    );
  }
  return (
    <div className="h-8 w-8 rounded-full bg-surface-alt ring-1 ring-border flex items-center justify-center text-[11px] font-bold text-muted shrink-0">
      {name.charAt(0).toUpperCase() || "?"}
    </div>
  );
}
