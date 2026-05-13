import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  ChevronRight, Home, Clock, CheckCircle2, AlertTriangle, XCircle,
  Plane, Calendar, ChevronLeft, ChevronRightCircle, FileText,
} from "lucide-react";
import { ClockButton, EditAttendanceButton } from "./attendance-actions";

type Profile = {
  id: string;
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};
type ContactExtra = {
  profile_id: string;
  nickname: string | null;
  department: string | null;
  employee_type: string | null;
  suspended_at: string | null;
};
type Att = {
  profile_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: "present" | "late" | "early_leave" | "absent" | "leave" | "holiday" | "off";
  late_minutes: number;
  worked_minutes: number;
  note: string | null;
};

const STATUS_CFG: Record<Att["status"], { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  present:     { label: "มาตรงเวลา", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  late:        { label: "สาย",       cls: "bg-amber-50 text-amber-700 border-amber-200",       Icon: AlertTriangle },
  early_leave: { label: "ออกก่อน",   cls: "bg-orange-50 text-orange-700 border-orange-200",    Icon: AlertTriangle },
  absent:      { label: "ขาดงาน",    cls: "bg-red-50 text-red-700 border-red-200",             Icon: XCircle },
  leave:       { label: "ลา",        cls: "bg-purple-50 text-purple-700 border-purple-200",    Icon: Plane },
  holiday:     { label: "หยุดประเทศ", cls: "bg-blue-50 text-blue-700 border-blue-200",          Icon: Calendar },
  off:         { label: "วันหยุด",    cls: "bg-gray-50 text-gray-700 border-gray-200",          Icon: Calendar },
};

function toYMD(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function timeOf(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function thaiDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("th-TH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export default async function AdminHRAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; dept?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const today = toYMD(new Date());
  const date  = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const isToday = date === today;
  const admin = createAdminClient();

  const [adminsRes, contactsRes, attsRes, leavesRes] = await Promise.all([
    admin.from("admins")
      .select(`profile_id, is_active,
               profile:profiles!profile_id ( id, member_code, first_name, last_name, avatar_url )`)
      .eq("is_active", true),
    admin.from("admin_contact_extras")
      .select("profile_id, nickname, department, employee_type, suspended_at"),
    admin.from("attendance_logs")
      .select("profile_id, work_date, clock_in, clock_out, status, late_minutes, worked_minutes, note")
      .eq("work_date", date),
    admin.from("leave_requests")
      .select("id, status")
      .eq("status", "pending"),
  ]);

  type AdminRow = { profile_id: string; is_active: boolean; profile: Profile | Profile[] | null };
  const profilesById = new Map<string, Profile>();
  for (const r of (adminsRes.data ?? []) as AdminRow[]) {
    const p = Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile;
    if (p) profilesById.set(p.id, p);
  }
  const contactByProfile = new Map<string, ContactExtra>();
  for (const c of (contactsRes.data ?? []) as ContactExtra[]) {
    contactByProfile.set(c.profile_id, c);
  }
  const attByProfile = new Map<string, Att>();
  for (const a of (attsRes.data ?? []) as Att[]) {
    attByProfile.set(a.profile_id, a);
  }

  // Compose row list — every active admin who is not suspended
  type Row = {
    profile: Profile;
    nickname: string | null;
    department: string | null;
    employee_type: string | null;
    att: Att | null;
    effectiveStatus: Att["status"];   // 'absent' if missing
  };
  const allRows: Row[] = Array.from(profilesById.values()).map((p) => {
    const c = contactByProfile.get(p.id);
    const att = attByProfile.get(p.id) ?? null;
    return {
      profile: p,
      nickname: c?.nickname ?? null,
      department: c?.department ?? null,
      employee_type: c?.employee_type ?? null,
      att,
      effectiveStatus: att?.status ?? "absent",
    };
  }).filter((r) => !contactByProfile.get(r.profile.id)?.suspended_at);

  // Apply dept filter
  let rows = allRows;
  if (sp.dept) rows = rows.filter((r) => r.department === sp.dept);

  // Stats based on ALL rows (so filter doesn't distort the totals card)
  const totals = {
    present: allRows.filter((r) => r.effectiveStatus === "present").length,
    late:    allRows.filter((r) => r.effectiveStatus === "late").length,
    early:   allRows.filter((r) => r.effectiveStatus === "early_leave").length,
    absent:  allRows.filter((r) => r.effectiveStatus === "absent").length,
    leave:   allRows.filter((r) => r.effectiveStatus === "leave").length,
    holiday: allRows.filter((r) => r.effectiveStatus === "holiday" || r.effectiveStatus === "off").length,
    expected: allRows.length,
  };

  // Group by department for table
  const byDept = new Map<string, Row[]>();
  for (const r of rows) {
    const d = r.department ?? "(ไม่ระบุฝ่าย)";
    if (!byDept.has(d)) byDept.set(d, []);
    byDept.get(d)!.push(r);
  }

  // Date navigation
  const cur = new Date(date);
  const prev = new Date(cur); prev.setDate(prev.getDate() - 1);
  const next = new Date(cur); next.setDate(next.getDate() + 1);
  const prevDate = toYMD(prev);
  const nextDate = toYMD(next);

  const pendingLeaves = (leavesRes.data ?? []).length;
  const allDepartments = Array.from(new Set(allRows.map((r) => r.department).filter(Boolean) as string[])).sort();

  const nav = (d: string) => `/admin/hr/attendance?date=${d}${sp.dept ? `&dept=${encodeURIComponent(sp.dept)}` : ""}`;

  return (
    <main className="p-4 lg:p-6 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr" className="hover:text-primary-600">ฝ่ายทรัพยากรบุคคล</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">เข้างาน / ลา</span>
      </nav>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white shadow-sm">
        <div className="absolute inset-0 opacity-10 [background:radial-gradient(circle_at_top_right,white,transparent_50%)]" />
        <div className="relative p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest opacity-80">HR · TIME ATTENDANCE</p>
                <h1 className="text-xl sm:text-2xl font-bold">บันทึกเวลาเข้างาน</h1>
                <p className="text-xs opacity-80 mt-0.5">
                  {thaiDate(date)} {isToday && <span className="ml-1 rounded-full bg-white text-primary-700 px-1.5 py-0.5 text-[10px] font-bold">วันนี้</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/admin/hr/attendance/leaves"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white text-primary-700 px-3 py-2 text-xs sm:text-sm font-bold hover:bg-white/90 shadow"
              >
                <FileText className="w-4 h-4" />
                คำขอลา
                {pendingLeaves > 0 && (
                  <span className="rounded-full bg-red-500 text-white px-1.5 text-[10px]">{pendingLeaves}</span>
                )}
              </Link>
              <Link
                href="/admin/hr"
                className="rounded-lg bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-2 text-xs sm:text-sm font-medium hover:bg-white/25"
              >
                ← HR
              </Link>
            </div>
          </div>

          {/* Stat row */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <StatPill label="ตรงเวลา" value={totals.present} tone="emerald" />
            <StatPill label="สาย"     value={totals.late}    tone="amber" />
            <StatPill label="ออกก่อน" value={totals.early}   tone="orange" />
            <StatPill label="ลา"      value={totals.leave}   tone="purple" />
            <StatPill label="ขาด"     value={totals.absent}  tone="red" />
            <StatPill label="คาดหวัง" value={totals.expected} tone="white" />
          </div>
        </div>
      </div>

      {/* Date picker + dept filter */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href={nav(prevDate)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-surface-alt"
              title="ย้อนกลับ 1 วัน"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <form action="/admin/hr/attendance" method="get" className="inline-flex items-center gap-2">
              <input
                type="date"
                name="date"
                defaultValue={date}
                className="rounded-lg border border-border bg-surface-alt/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40"
              />
              {sp.dept && <input type="hidden" name="dept" value={sp.dept} />}
              <button type="submit" className="rounded-lg bg-primary-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-primary-600">
                ดู
              </button>
            </form>
            <Link
              href={nav(nextDate)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-surface-alt"
              title="ไปข้างหน้า 1 วัน"
            >
              <ChevronRightCircle className="w-4 h-4" />
            </Link>
            {!isToday && (
              <Link href={nav(today)} className="text-xs text-primary-600 hover:underline ml-2">
                กลับวันนี้
              </Link>
            )}
          </div>

          <form action="/admin/hr/attendance" method="get" className="flex items-center gap-2">
            <input type="hidden" name="date" value={date} />
            <select name="dept" defaultValue={sp.dept ?? ""} className="rounded-lg border border-border bg-surface-alt/30 px-3 py-1.5 text-sm">
              <option value="">ทุกแผนก</option>
              {allDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <button type="submit" className="rounded-lg bg-primary-500 text-white px-3 py-1.5 text-xs">กรอง</button>
          </form>
        </div>
      </div>

      {/* Department-grouped tables */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted">
          <Clock className="w-12 h-12 mx-auto mb-2 opacity-30" />
          ไม่มีพนักงาน — เพิ่ม admin จาก <Link href="/admin/admins" className="text-primary-600 hover:underline">/admin/admins</Link>
        </div>
      ) : (
        Array.from(byDept.entries()).map(([dept, deptRows]) => (
          <section key={dept} className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
            <header className="flex items-center justify-between px-5 py-3 bg-surface-alt/50 border-b border-border">
              <h2 className="font-bold text-sm">{dept} <span className="text-muted text-xs font-normal">({deptRows.length} คน)</span></h2>
            </header>

            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-border">
                  <tr>
                    <th className="px-4 py-2">พนักงาน</th>
                    <th className="px-4 py-2">เวลาเข้า</th>
                    <th className="px-4 py-2">เวลาออก</th>
                    <th className="px-4 py-2">สถานะ</th>
                    <th className="px-4 py-2 text-right">ชั่วโมงงาน</th>
                    <th className="px-4 py-2 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {deptRows.map((r) => {
                    const cfg = STATUS_CFG[r.effectiveStatus];
                    const fullName = `${r.profile.first_name ?? ""} ${r.profile.last_name ?? ""}`.trim() || "—";
                    return (
                      <tr key={r.profile.id} className="border-t border-border hover:bg-surface-alt/30">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <Avatar src={r.profile.avatar_url} name={fullName} />
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {fullName}
                                {r.nickname && <span className="text-muted text-xs font-normal ml-1">({r.nickname})</span>}
                              </p>
                              <p className="font-mono text-[10px] text-muted">{r.profile.member_code ?? "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className={r.att?.late_minutes ? "text-amber-600 font-bold" : ""}>{timeOf(r.att?.clock_in ?? null)}</span>
                            {r.att?.late_minutes ? (
                              <span className="rounded bg-amber-100 text-amber-700 px-1 py-0.5 text-[9px] font-bold">+{r.att.late_minutes}ม.</span>
                            ) : null}
                            {isToday && !r.att?.clock_in && r.effectiveStatus !== "leave" && r.effectiveStatus !== "off" && (
                              <ClockButton profileId={r.profile.id} workDate={date} field="clock_in" hasValue={false} />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs font-mono">
                          <div className="flex items-center gap-1.5">
                            <span>{timeOf(r.att?.clock_out ?? null)}</span>
                            {isToday && r.att?.clock_in && !r.att.clock_out && (
                              <ClockButton profileId={r.profile.id} workDate={date} field="clock_out" hasValue={false} />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}>
                            <cfg.Icon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                          {r.att?.note && <p className="text-[10px] text-muted mt-0.5 italic">{r.att.note}</p>}
                        </td>
                        <td className="px-4 py-2 text-right text-xs font-mono">
                          {r.att?.worked_minutes ? `${Math.floor(r.att.worked_minutes / 60)}ชม. ${r.att.worked_minutes % 60}น.` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right relative">
                          <EditAttendanceButton
                            profileId={r.profile.id}
                            workDate={date}
                            initial={{
                              clock_in:  r.att?.clock_in  ?? null,
                              clock_out: r.att?.clock_out ?? null,
                              status:    r.att?.status    ?? "absent",
                              note:      r.att?.note      ?? null,
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted">
        คำขอลาที่รอ approve อยู่ที่ <Link href="/admin/hr/attendance/leaves" className="text-primary-600 hover:underline">/admin/hr/attendance/leaves</Link>{" "}
        · เกณฑ์สาย: เข้างานหลัง 08:45 (grace 15 นาที จาก 08:30)
      </div>
    </main>
  );
}

function StatPill({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "orange" | "purple" | "red" | "white" }) {
  const cls = {
    emerald: "bg-emerald-500/30 border-emerald-300/50",
    amber:   "bg-amber-500/30 border-amber-300/50",
    orange:  "bg-orange-500/30 border-orange-300/50",
    purple:  "bg-purple-500/30 border-purple-300/50",
    red:     "bg-red-500/30 border-red-300/50",
    white:   "bg-white/10 border-white/30",
  }[tone];
  return (
    <div className={`rounded-lg border backdrop-blur-sm p-2 text-center ${cls}`}>
      <p className="text-[10px] font-bold opacity-90">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
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
