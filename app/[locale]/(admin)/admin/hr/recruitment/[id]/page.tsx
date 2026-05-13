import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  ChevronRight, Home, Megaphone, MapPin, Wallet, Briefcase,
  Calendar, Pause, CheckCircle2, Archive,
} from "lucide-react";
import {
  PostingStatusToggle, AddApplicantInline, ApplicantActions,
} from "./posting-actions";

type Stage = "applied" | "screening" | "interviewing" | "offered" | "hired" | "rejected";
type Status = "draft" | "open" | "paused" | "closed";

type Posting = {
  id: string;
  slug: string;
  title: string;
  status: Status;
  openings_count: number;
  salary_range_text: string | null;
  location: string | null;
  description: string | null;
  employment_type: string;
  posted_at: string | null;
  closed_at: string | null;
  created_at: string;
  position: { name: string; section: { name: string; branch: { name: string; color_tone: string } | null } | { name: string; branch: { name: string; color_tone: string } | null }[] | null } | { name: string; section: { name: string; branch: { name: string; color_tone: string } | null } | { name: string; branch: { name: string; color_tone: string } | null }[] | null }[] | null;
};
type Applicant = {
  id: string;
  first_name: string;
  last_name: string | null;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  source_note: string | null;
  applied_at: string;
  stage: Stage;
  notes: string | null;
  interview_scheduled_at: string | null;
  interview_location: string | null;
  rejected_reason: string | null;
  hired_at: string | null;
};

const STATUS_LABEL: Record<Status, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  draft:  { label: "ร่าง",   cls: "bg-gray-50 text-gray-700 border-gray-200", Icon: Archive },
  open:   { label: "เปิดรับ", cls: "bg-emerald-500 text-white border-emerald-600", Icon: CheckCircle2 },
  paused: { label: "พักรับ", cls: "bg-amber-500 text-white border-amber-600", Icon: Pause },
  closed: { label: "ปิดรับ", cls: "bg-red-500 text-white border-red-600", Icon: Archive },
};
const TYPE_LABEL: Record<string, string> = {
  full_time: "ประจำ", probation: "ทดลองงาน", contract: "สัญญาจ้าง",
  daily: "รายวัน", intern: "ฝึกงาน", partner: "พาร์ทเนอร์",
};
const SOURCE_LABEL: Record<string, string> = {
  walk_in: "Walk-in", website: "เว็บไซต์", line: "LINE OA",
  facebook: "Facebook", referral: "เพื่อนแนะนำ", jobsdb: "JobsDB", other: "อื่นๆ",
};
const STAGE_INFO: Record<Stage, { label: string; cls: string; bar: string }> = {
  applied:      { label: "Applied",      cls: "bg-blue-50 text-blue-700 border-blue-200",       bar: "bg-blue-500" },
  screening:    { label: "Screening",    cls: "bg-cyan-50 text-cyan-700 border-cyan-200",       bar: "bg-cyan-500" },
  interviewing: { label: "Interviewing", cls: "bg-amber-50 text-amber-700 border-amber-200",    bar: "bg-amber-500" },
  offered:      { label: "Offered",      cls: "bg-purple-50 text-purple-700 border-purple-200", bar: "bg-purple-500" },
  hired:        { label: "Hired",        cls: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500" },
  rejected:     { label: "Rejected",     cls: "bg-gray-50 text-gray-600 border-gray-200",       bar: "bg-gray-400" },
};
const STAGE_ORDER: Stage[] = ["applied", "screening", "interviewing", "offered", "hired", "rejected"];

export default async function PostingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const [postingRes, applicantsRes] = await Promise.all([
    admin
      .from("job_postings")
      .select(`
        id, slug, title, status, openings_count, salary_range_text, location, description, employment_type,
        posted_at, closed_at, created_at,
        position:org_positions!position_id (
          name,
          section:org_sections!section_id (
            name,
            branch:org_branches!branch_id ( name, color_tone )
          )
        )
      `)
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("job_applicants")
      .select("id, first_name, last_name, nickname, phone, email, source, source_note, applied_at, stage, notes, interview_scheduled_at, interview_location, rejected_reason, hired_at")
      .eq("posting_id", id)
      .order("applied_at", { ascending: false }),
  ]);

  if (!postingRes.data) notFound();
  const posting = postingRes.data as Posting;
  const pos = Array.isArray(posting.position) ? posting.position[0] ?? null : posting.position;
  const sec = pos?.section ? (Array.isArray(pos.section) ? pos.section[0] ?? null : pos.section) : null;
  const br  = sec?.branch  ? (Array.isArray(sec.branch)  ? sec.branch[0]  ?? null : sec.branch)  : null;

  const applicants = (applicantsRes.data ?? []) as Applicant[];

  // Group by stage
  const byStage = new Map<Stage, Applicant[]>();
  for (const s of STAGE_ORDER) byStage.set(s, []);
  for (const a of applicants) byStage.get(a.stage)!.push(a);

  const totalApplicants = applicants.length;
  const inPipeline = applicants.filter((a) => !["hired", "rejected"].includes(a.stage)).length;
  const hiredCount = byStage.get("hired")!.length;
  const fillRatio = posting.openings_count > 0 ? Math.min(100, (hiredCount / posting.openings_count) * 100) : 0;

  const cfg = STATUS_LABEL[posting.status];

  return (
    <main className="p-4 lg:p-6 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr" className="hover:text-primary-600">ฝ่ายทรัพยากรบุคคล</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr/recruitment" className="hover:text-primary-600">สรรหา</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium truncate max-w-[300px]">{posting.title}</span>
      </nav>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white shadow-sm">
        <div className="absolute inset-0 opacity-10 [background:radial-gradient(circle_at_top_right,white,transparent_50%)]" />
        <div className="relative p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                <Megaphone className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}>
                    <cfg.Icon className="w-3 h-3" />
                    {cfg.label}
                  </span>
                  <span className="rounded-full border border-white/30 bg-white/10 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium">
                    {TYPE_LABEL[posting.employment_type] ?? posting.employment_type}
                  </span>
                  <span className="rounded-full border border-white/30 bg-white/10 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold">
                    รับ {posting.openings_count} คน
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold">{posting.title}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs opacity-90">
                  {pos?.name && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="w-3 h-3" />
                      {br?.name ? `${br.name} · ` : ""}{sec?.name ? `${sec.name} · ` : ""}{pos.name}
                    </span>
                  )}
                  {posting.salary_range_text && (
                    <span className="inline-flex items-center gap-1"><Wallet className="w-3 h-3" /> {posting.salary_range_text}</span>
                  )}
                  {posting.location && (
                    <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {posting.location}</span>
                  )}
                  {posting.posted_at && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      ลง {new Date(posting.posted_at).toLocaleDateString("th-TH")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PostingStatusToggle postingId={posting.id} status={posting.status} />
              <Link
                href="/admin/hr/recruitment"
                className="rounded-lg bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-2 text-xs font-medium hover:bg-white/25"
              >
                ← กลับรายการ
              </Link>
            </div>
          </div>

          {/* Progress bar */}
          <div className="rounded-lg bg-white/10 backdrop-blur-sm p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold opacity-90">รับแล้ว {hiredCount} / {posting.openings_count} คน</span>
              <span className="opacity-80">ผู้สมัครรวม {totalApplicants} · ในกระบวนการ {inPipeline}</span>
            </div>
            <div className="h-2 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${fillRatio}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {posting.description && (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <h2 className="font-bold text-sm text-foreground mb-2">รายละเอียดงาน</h2>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{posting.description}</p>
        </div>
      )}

      {/* Inline add applicant */}
      <AddApplicantInline postingId={posting.id} />

      {/* Pipeline stages */}
      {STAGE_ORDER.map((s) => {
        const arr = byStage.get(s)!;
        const info = STAGE_INFO[s];
        if (arr.length === 0 && (s === "rejected" || s === "hired")) return null;   // hide empty terminal columns
        return (
          <section key={s} className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
            <header className="flex items-center justify-between px-5 py-3 bg-surface-alt/50 border-b border-border">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${info.bar}`} />
                <h2 className="font-bold text-sm">{info.label}</h2>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${info.cls}`}>{arr.length}</span>
              </div>
            </header>

            {arr.length === 0 ? (
              <p className="p-5 text-xs text-muted italic">— ยังไม่มีผู้สมัครในขั้นนี้ —</p>
            ) : (
              <div className="divide-y divide-border">
                {arr.map((a) => (
                  <div key={a.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-foreground">
                        {a.first_name} {a.last_name ?? ""}
                        {a.nickname && <span className="text-muted font-normal text-sm"> ({a.nickname})</span>}
                      </p>
                      <div className="text-[11px] text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>สมัครเมื่อ {new Date(a.applied_at).toLocaleDateString("th-TH")}</span>
                        <span>ที่มา: <b className="text-foreground">{SOURCE_LABEL[a.source] ?? a.source}</b>{a.source_note ? ` · ${a.source_note}` : ""}</span>
                        {a.interview_scheduled_at && (
                          <span className="text-amber-700 font-semibold">
                            📅 นัดสัมภาษณ์ {new Date(a.interview_scheduled_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                            {a.interview_location ? ` @ ${a.interview_location}` : ""}
                          </span>
                        )}
                        {a.hired_at && (
                          <span className="text-emerald-700 font-semibold">
                            ✓ รับเข้าทำงาน {new Date(a.hired_at).toLocaleDateString("th-TH")}
                          </span>
                        )}
                        {a.rejected_reason && (
                          <span className="text-red-700">
                            ✗ ปฏิเสธ: {a.rejected_reason}
                          </span>
                        )}
                      </div>
                      {a.notes && (
                        <p className="mt-1.5 text-xs text-foreground bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
                          📝 {a.notes}
                        </p>
                      )}
                    </div>
                    <ApplicantActions
                      applicantId={a.id}
                      stage={a.stage}
                      phone={a.phone}
                      email={a.email}
                      interviewScheduledAt={a.interview_scheduled_at}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted">
        เมื่อกด <b>รับเข้าทำงาน</b> ระบบจะแค่ตั้ง stage = hired — ขั้นถัดไป HR ต้องไปที่ <Link href="/admin/admins" className="text-primary-600 hover:underline">/admin/admins</Link> เพื่อเปิดสิทธิ์ admin ให้พนักงานใหม่ แล้วไปแก้ฟิลด์ HR ที่ <Link href="/admin/hr/employees" className="text-primary-600 hover:underline">/admin/hr/employees</Link>
      </div>
    </main>
  );
}
