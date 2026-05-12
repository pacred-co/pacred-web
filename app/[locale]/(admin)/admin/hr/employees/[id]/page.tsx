import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, User, Phone, Mail, BadgeCheck, Building2, Calendar } from "lucide-react";
import { EmployeeEditForm } from "./edit-form";

const ROLE_BADGE: Record<string, string> = {
  super:       "bg-red-50 text-red-700 border-red-200",
  ops:         "bg-blue-50 text-blue-700 border-blue-200",
  accounting:  "bg-green-50 text-green-700 border-green-200",
  sales_admin: "bg-purple-50 text-purple-700 border-purple-200",
};

export default async function AdminHREmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const [profileRes, adminsRes, contactRes, assignmentsRes] = await Promise.all([
    admin.from("profiles")
      .select("id, member_code, first_name, last_name, phone, email, avatar_url, created_at, account_type")
      .eq("id", id).maybeSingle(),
    admin.from("admins")
      .select("role, is_active, granted_at, granted_by")
      .eq("profile_id", id),
    admin.from("admin_contact_extras")
      .select("display_name, nickname, company, employee_type, department, section, work_email, work_phone, direct_phone, hired_at, suspended_at")
      .eq("profile_id", id).maybeSingle(),
    admin.from("org_assignments")
      .select(`
        id, kind, started_at, ended_at,
        position:org_positions!position_id (
          name,
          section:org_sections!section_id (
            name,
            branch:org_branches!branch_id ( name, color_tone )
          )
        )
      `)
      .eq("profile_id", id),
  ]);

  if (!profileRes.data) notFound();
  const profile = profileRes.data;
  const contact = contactRes.data;
  const roles   = adminsRes.data ?? [];
  type Branch  = { name: string; color_tone: string };
  type Section = { name: string; branch: Branch | Branch[] | null };
  type Position = { name: string; section: Section | Section[] | null };
  type RawAssignment = { id: string; kind: string; started_at: string; ended_at: string | null; position: Position | Position[] | null };
  const pickOne = <T,>(v: T | T[] | null | undefined): T | null =>
    v == null ? null : Array.isArray(v) ? v[0] ?? null : v;
  const assignments = ((assignmentsRes.data ?? []) as unknown as RawAssignment[]).map((a) => {
    const pos = pickOne(a.position);
    const sec = pos ? pickOne(pos.section) : null;
    const br  = sec ? pickOne(sec.branch)  : null;
    return {
      ...a,
      position: pos
        ? { name: pos.name, section: sec ? { name: sec.name, branch: br } : null }
        : null,
    };
  });

  const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || (contact?.display_name ?? "—");

  return (
    <main className="p-4 lg:p-6 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr" className="hover:text-primary-600">ฝ่ายทรัพยากรบุคคล</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr/employees" className="hover:text-primary-600">พนักงาน</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">{fullName}</span>
      </nav>

      {/* Profile header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white shadow-sm">
        <div className="absolute inset-0 opacity-10 [background:radial-gradient(circle_at_top_right,white,transparent_50%)]" />
        <div className="relative p-5 flex flex-wrap items-start gap-4">
          <div className="h-16 w-16 rounded-2xl bg-white/15 backdrop-blur-sm ring-2 ring-white/30 overflow-hidden flex items-center justify-center text-xl font-bold">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt={fullName} className="w-full h-full object-cover" />
            ) : (
              fullName.charAt(0).toUpperCase() || "?"
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold tracking-widest opacity-80">HR · พนักงาน</p>
            <h1 className="text-xl sm:text-2xl font-bold">{fullName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-90">
              <span className="font-mono">{profile.member_code ?? "—"}</span>
              {contact?.nickname && <span>· ชื่อเล่น {contact.nickname}</span>}
              {profile.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" /> {profile.email}</span>}
              {profile.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {profile.phone}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <span
                  key={r.role}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold bg-white/15 backdrop-blur-sm border-white/30 ${r.is_active ? "" : "opacity-50"}`}
                >
                  {r.role}{r.is_active ? "" : " (off)"}
                </span>
              ))}
              {contact?.suspended_at ? (
                <span className="rounded-full border border-red-300 bg-red-500 text-white px-2 py-0.5 text-[10px] font-bold">
                  ● พักงานแล้ว
                </span>
              ) : (
                <span className="rounded-full border border-emerald-300 bg-emerald-500 text-white px-2 py-0.5 text-[10px] font-bold">
                  ● ทำงานอยู่
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/hr/employees"
              className="rounded-lg bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-2 text-xs sm:text-sm font-medium hover:bg-white/25"
            >
              ← กลับรายการ
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <EmployeeEditForm
          profileId={profile.id}
          initial={{
            display_name:  contact?.display_name  ?? null,
            nickname:      contact?.nickname      ?? null,
            company:       contact?.company       ?? "pacred",
            employee_type: contact?.employee_type ?? "full_time",
            department:    contact?.department    ?? null,
            section:       contact?.section       ?? null,
            work_email:    contact?.work_email    ?? null,
            work_phone:    contact?.work_phone    ?? null,
            direct_phone:  contact?.direct_phone  ?? null,
            hired_at:      contact?.hired_at      ?? null,
          }}
        />

        <aside className="space-y-4">
          {/* Org assignments */}
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary-500" />
              ตำแหน่งในผังองค์กร
            </h3>
            {assignments.length === 0 ? (
              <p className="text-xs text-muted">ยังไม่ได้ assign ตำแหน่ง — ไปที่ <Link href="/admin/hr/org-table" className="text-primary-600 hover:underline">ผังตาราง</Link></p>
            ) : (
              <ul className="space-y-2">
                {assignments.map((a) => (
                  <li key={a.id} className="rounded-lg border border-border p-2.5">
                    <p className="text-xs font-bold text-foreground">{a.position?.name ?? "—"}</p>
                    <p className="text-[11px] text-muted">{a.position?.section?.name ?? "—"} · {a.position?.section?.branch?.name ?? "—"}</p>
                    <p className="text-[10px] text-muted mt-1">
                      {a.kind} · เริ่ม {new Date(a.started_at).toLocaleDateString("th-TH")}
                      {a.ended_at && ` · จบ ${new Date(a.ended_at).toLocaleDateString("th-TH")}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Admin roles meta */}
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-primary-500" />
              สิทธิ์ในระบบ
            </h3>
            {roles.length === 0 ? (
              <p className="text-xs text-muted">ยังไม่มี role — เพิ่มจาก <Link href="/admin/admins" className="text-primary-600 hover:underline">/admin/admins</Link></p>
            ) : (
              <ul className="space-y-1.5">
                {roles.map((r) => (
                  <li key={r.role} className="flex items-center justify-between text-xs">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${ROLE_BADGE[r.role] ?? "bg-gray-50 text-gray-700 border-gray-200"} ${!r.is_active ? "opacity-40" : ""}`}>
                      {r.role}
                    </span>
                    <span className="text-muted text-[10px]">{new Date(r.granted_at).toLocaleDateString("th-TH")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Meta */}
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm text-xs space-y-2">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <User className="w-4 h-4 text-primary-500" />
              ข้อมูลโปรไฟล์
            </h3>
            <Meta label="UUID"           value={<span className="font-mono text-[10px] break-all">{profile.id}</span>} />
            <Meta label="ประเภทบัญชี"     value={profile.account_type === "juristic" ? "นิติบุคคล" : "บุคคล"} />
            <Meta label="สมัครเมื่อ"     value={
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(profile.created_at).toLocaleDateString("th-TH")}
              </span>
            } />
            {contact?.hired_at && (
              <Meta label="เริ่มงาน" value={new Date(contact.hired_at).toLocaleDateString("th-TH")} />
            )}
            {contact?.suspended_at && (
              <Meta label="พักงานเมื่อ" value={new Date(contact.suspended_at).toLocaleDateString("th-TH")} />
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  );
}
