import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  ChevronRight, Home, GraduationCap, Clock, Star, User2, Link as LinkIcon, Users2,
} from "lucide-react";
import {
  CourseFormButton, CourseRowActions, EnrollmentRowActions, AddEnrollmentInline,
} from "./training-actions";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportHrTrainingAll } from "@/actions/admin/export/hr-training";

type Profile = { id: string; member_code: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null };
type Course = {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string | null;
  duration_hours: number;
  instructor: string | null;
  materials_url: string | null;
  is_mandatory: boolean;
  is_active: boolean;
  created_at: string;
};
type Enrollment = {
  id: string;
  course_id: string;
  profile_id: string;
  status: "enrolled" | "in_progress" | "completed" | "failed" | "exempted";
  enrolled_at: string;
  completed_at: string | null;
  score: number | null;
  profile: Profile | Profile[] | null;
};

const CAT_LABEL: Record<string, { label: string; cls: string }> = {
  general:     { label: "ทั่วไป",      cls: "bg-gray-50 text-gray-700 border-gray-200" },
  operations:  { label: "ปฏิบัติการ",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
  compliance:  { label: "Compliance", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  technical:   { label: "เทคนิค",     cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  soft_skills: { label: "Soft skills",cls: "bg-amber-50 text-amber-700 border-amber-200" },
  safety:      { label: "Safety",     cls: "bg-red-50 text-red-700 border-red-200" },
};
const STATUS_LABEL: Record<Enrollment["status"], { label: string; cls: string }> = {
  enrolled:    { label: "ลงทะเบียน",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress: { label: "กำลังเรียน",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  completed:   { label: "ผ่าน",       cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  failed:      { label: "ไม่ผ่าน",    cls: "bg-red-50 text-red-700 border-red-200" },
  exempted:    { label: "ยกเว้น",     cls: "bg-gray-50 text-gray-700 border-gray-200" },
};

export default async function AdminHRTrainingPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const [coursesRes, enrollsRes, adminsRes] = await Promise.all([
    admin.from("training_courses").select("*").order("created_at", { ascending: false }),
    admin.from("training_enrollments")
      .select(`id, course_id, profile_id, status, enrolled_at, completed_at, score,
               profile:profiles!profile_id ( id, member_code, first_name, last_name, avatar_url )`),
    admin.from("admins")
      .select(`profile_id, profile:profiles!profile_id ( id, member_code, first_name, last_name )`)
      .eq("is_active", true),
  ]);

  const courses    = (coursesRes.data ?? []) as Course[];
  const enrolls    = ((enrollsRes.data ?? []) as Enrollment[]).map((e) => ({
    ...e, profile_one: Array.isArray(e.profile) ? e.profile[0] ?? null : e.profile,
  }));

  type AdminRow = { profile_id: string; profile: Profile | Profile[] | null };
  const allEmployees = ((adminsRes.data ?? []) as unknown as AdminRow[]).map((a) => {
    const p = Array.isArray(a.profile) ? a.profile[0] ?? null : a.profile;
    const full = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "—";
    return { id: a.profile_id, label: `${p?.member_code ?? "—"} · ${full}` };
  }).sort((a, b) => a.label.localeCompare(b.label, "th"));

  // Group enrollments per course
  const enrollsByCourse = new Map<string, typeof enrolls>();
  for (const e of enrolls) {
    if (!enrollsByCourse.has(e.course_id)) enrollsByCourse.set(e.course_id, []);
    enrollsByCourse.get(e.course_id)!.push(e);
  }

  // Totals
  const totalCourses    = courses.length;
  const mandatoryCount  = courses.filter((c) => c.is_mandatory).length;
  const totalCompleted  = enrolls.filter((e) => e.status === "completed").length;
  const totalInProgress = enrolls.filter((e) => e.status === "enrolled" || e.status === "in_progress").length;

  // CSV: flatten enrollments → one row per learner (course context + learner).
  // Columns mirror the per-course <thead> + the course attributes the cards show.
  const csvCols: CsvCol[] = [
    { key: "course",         label: "หลักสูตร" },
    { key: "category",       label: "หมวด" },
    { key: "mandatory",      label: "บังคับเรียน" },
    { key: "duration_hours", label: "ชั่วโมง" },
    { key: "instructor",     label: "ผู้สอน" },
    { key: "member_code",    label: "รหัสพนักงาน" },
    { key: "employee",       label: "พนักงาน" },
    { key: "enrolled_at",    label: "วันลงทะเบียน" },
    { key: "status",         label: "สถานะ" },
    { key: "score",          label: "คะแนน" },
    { key: "completed_at",   label: "เรียนจบเมื่อ" },
  ];
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const csvRows: CsvRow[] = enrolls.map((e) => {
    const c = courseById.get(e.course_id);
    const p = e.profile_one;
    const fullName = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "—";
    const cat = CAT_LABEL[c?.category ?? ""] ?? CAT_LABEL.general;
    return {
      course: c?.title ?? "—",
      category: cat.label,
      mandatory: c?.is_mandatory ? "บังคับเรียน" : "",
      duration_hours: c?.duration_hours ?? "",
      instructor: c?.instructor ?? "",
      member_code: p?.member_code ?? "—",
      employee: fullName,
      enrolled_at: e.enrolled_at ? e.enrolled_at.slice(0, 10) : "",
      status: STATUS_LABEL[e.status]?.label ?? e.status,
      score: e.score != null ? `${e.score}` : "—",
      completed_at: e.completed_at ? e.completed_at.slice(0, 10) : "",
    };
  });

  return (
    <main className="p-4 lg:p-6 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr" className="hover:text-primary-600">ฝ่ายทรัพยากรบุคคล</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">อบรม / Training</span>
      </nav>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white shadow-sm">
        <div className="absolute inset-0 opacity-10 [background:radial-gradient(circle_at_top_right,white,transparent_50%)]" />
        <div className="relative p-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-widest opacity-80">HR · LEARNING & TRAINING</p>
              <h1 className="text-xl sm:text-2xl font-bold">หลักสูตรอบรม</h1>
              <p className="text-xs opacity-80 mt-0.5">
                {totalCourses} หลักสูตร · บังคับเรียน {mandatoryCount} · เรียนจบ {totalCompleted} ครั้ง · ในกระบวนการ {totalInProgress}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CsvButton
              rows={csvRows}
              cols={csvCols}
              filename="hr-training.csv"
              fetchAll={async () => {
                "use server";
                return exportHrTrainingAll();
              }}
            />
            <CourseFormButton buttonLabel="เพิ่มหลักสูตร" />
            <Link
              href="/admin/hr"
              className="rounded-lg bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-2 text-xs sm:text-sm font-medium hover:bg-white/25"
            >
              ← HR
            </Link>
          </div>
        </div>
      </div>

      {/* Courses */}
      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted">
          <GraduationCap className="w-12 h-12 mx-auto mb-2 opacity-30" />
          ยังไม่มีหลักสูตร — เริ่มเพิ่มหลักสูตรแรกได้เลย
        </div>
      ) : (
        courses.map((c) => {
          const cat = CAT_LABEL[c.category] ?? CAT_LABEL.general;
          const ces = enrollsByCourse.get(c.id) ?? [];
          const completed = ces.filter((e) => e.status === "completed").length;
          const enrolled  = ces.filter((e) => e.status === "enrolled" || e.status === "in_progress").length;
          const ratio = ces.length > 0 ? Math.round((completed / ces.length) * 100) : 0;
          return (
            <section key={c.id} className={`rounded-2xl border bg-white dark:bg-surface shadow-sm overflow-hidden ${c.is_active ? "border-border" : "border-dashed border-border opacity-70"}`}>
              <header className="px-5 py-3 bg-surface-alt/50 border-b border-border">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${cat.cls}`}>{cat.label}</span>
                      {c.is_mandatory && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 text-red-700 px-2 py-0.5 text-[11px] font-bold">
                          <Star className="w-3 h-3" />
                          บังคับเรียน
                        </span>
                      )}
                      {!c.is_active && (
                        <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium">ปิดใช้</span>
                      )}
                    </div>
                    <h2 className="font-bold text-foreground">{c.title}</h2>
                    {c.description && <p className="text-xs text-muted mt-0.5 line-clamp-2">{c.description}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                      <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {c.duration_hours} ชม.</span>
                      {c.instructor && <span className="inline-flex items-center gap-1"><User2 className="w-3 h-3" /> {c.instructor}</span>}
                      {c.materials_url && (
                        <a href={c.materials_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline">
                          <LinkIcon className="w-3 h-3" /> สื่อการสอน
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <CourseFormButton
                      buttonLabel="แก้"
                      asPencil
                      initial={{
                        id: c.id, title: c.title, category: c.category as never,
                        description: c.description ?? "", duration_hours: c.duration_hours,
                        instructor: c.instructor ?? "", materials_url: c.materials_url ?? "",
                        is_mandatory: c.is_mandatory, is_active: c.is_active,
                      }}
                    />
                    <CourseRowActions courseId={c.id} />
                  </div>
                </div>
              </header>

              {/* Progress + enroll */}
              <div className="px-5 py-3 bg-white dark:bg-surface border-b border-border flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-muted inline-flex items-center gap-1">
                      <Users2 className="w-3 h-3" />
                      {ces.length} คน · จบแล้ว {completed} · กำลังเรียน {enrolled}
                    </span>
                    <span className="font-bold">{ratio}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${ratio}%` }} />
                  </div>
                </div>
                <AddEnrollmentInline courseId={c.id} employees={allEmployees} />
              </div>

              {ces.length === 0 ? (
                <p className="px-5 py-4 text-xs text-muted italic">— ยังไม่มีผู้เรียน — กดปุ่ม &ldquo;Enroll ทุกคน&rdquo; หรือเลือกรายคน</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-4 py-2">พนักงาน</th>
                        <th className="px-4 py-2">วันลงทะเบียน</th>
                        <th className="px-4 py-2">สถานะ</th>
                        <th className="px-4 py-2">คะแนน</th>
                        <th className="px-4 py-2">เรียนจบเมื่อ</th>
                        <th className="px-4 py-2 text-right">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ces.map((e) => {
                        const st = STATUS_LABEL[e.status];
                        const p = e.profile_one;
                        const full = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "—";
                        return (
                          <tr key={e.id} className="border-t border-border hover:bg-surface-alt/30">
                            <td className="px-4 py-2 text-xs">
                              <div className="flex items-center gap-2">
                                <Avatar src={p?.avatar_url ?? null} name={full} />
                                <div>
                                  <p className="font-medium text-foreground">{full}</p>
                                  <p className="font-mono text-[11px] text-muted">{p?.member_code ?? "—"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-[11px] text-muted whitespace-nowrap">{new Date(e.enrolled_at).toLocaleDateString("th-TH")}</td>
                            <td className="px-4 py-2">
                              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                            </td>
                            <td className="px-4 py-2 text-xs font-mono">{e.score != null ? `${e.score}` : "—"}</td>
                            <td className="px-4 py-2 text-[11px] text-muted">{e.completed_at ? new Date(e.completed_at).toLocaleDateString("th-TH") : "—"}</td>
                            <td className="px-4 py-2 text-right"><EnrollmentRowActions enrollmentId={e.id} currentStatus={e.status} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}

      <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted">
        เมื่อ Pass หลักสูตร ระบบจะบันทึก completed_at + คะแนน · ผู้เรียนเองสามารถดูสิทธิ์เรียนของตัวเองได้ (RLS = profile_id = auth.uid)
      </div>
    </main>
  );
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} className="h-7 w-7 rounded-full object-cover ring-1 ring-border shrink-0" />
    );
  }
  return (
    <div className="h-7 w-7 rounded-full bg-surface-alt ring-1 ring-border flex items-center justify-center text-[11px] font-bold text-muted shrink-0">
      {name.charAt(0).toUpperCase() || "?"}
    </div>
  );
}
