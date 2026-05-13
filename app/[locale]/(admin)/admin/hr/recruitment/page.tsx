import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  ChevronRight, Home, Megaphone, Plus, MapPin, Users, Wallet,
  Briefcase, Pause, CheckCircle2, Archive, Search,
} from "lucide-react";

type Posting = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "open" | "paused" | "closed";
  openings_count: number;
  salary_range_text: string | null;
  location: string | null;
  employment_type: string;
  posted_at: string | null;
  closed_at: string | null;
  created_at: string;
  position: { name: string; section: { name: string } | { name: string }[] | null } | { name: string; section: { name: string } | { name: string }[] | null }[] | null;
};
type ApplicantBucket = { posting_id: string; stage: string; count: number };

const STATUS_LABEL: Record<Posting["status"], { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  draft:  { label: "ร่าง",     cls: "bg-gray-50 text-gray-700 border-gray-200",       Icon: Archive },
  open:   { label: "เปิดรับ",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  paused: { label: "พักรับ",   cls: "bg-amber-50 text-amber-700 border-amber-200",     Icon: Pause },
  closed: { label: "ปิดรับ",   cls: "bg-red-50 text-red-700 border-red-200",           Icon: Archive },
};
const TYPE_LABEL: Record<string, string> = {
  full_time: "ประจำ", probation: "ทดลองงาน", contract: "สัญญาจ้าง",
  daily: "รายวัน", intern: "ฝึกงาน", partner: "พาร์ทเนอร์",
};
const STAGE_TONE: Record<string, string> = {
  applied:      "bg-blue-50 text-blue-700 border-blue-200",
  screening:    "bg-cyan-50 text-cyan-700 border-cyan-200",
  interviewing: "bg-amber-50 text-amber-700 border-amber-200",
  offered:      "bg-purple-50 text-purple-700 border-purple-200",
  hired:        "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected:     "bg-gray-50 text-gray-600 border-gray-200",
};

type Filter = "all" | "open" | "paused" | "closed";

export default async function AdminHRRecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: Filter }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter: Filter = sp.status === "open" || sp.status === "paused" || sp.status === "closed" ? sp.status : "all";
  const admin = createAdminClient();

  const [postingsRes, applicantsRes] = await Promise.all([
    admin
      .from("job_postings")
      .select(`
        id, slug, title, status, openings_count, salary_range_text, location, employment_type,
        posted_at, closed_at, created_at,
        position:org_positions!position_id (
          name,
          section:org_sections!section_id ( name )
        )
      `)
      .order("created_at", { ascending: false }),
    admin
      .from("job_applicants")
      .select("posting_id, stage"),
  ]);

  const postings = ((postingsRes.data ?? []) as Posting[]).map((p) => {
    const pos = Array.isArray(p.position) ? p.position[0] ?? null : p.position;
    const sec = pos?.section ? (Array.isArray(pos.section) ? pos.section[0] ?? null : pos.section) : null;
    return { ...p, _positionName: pos?.name ?? null, _sectionName: sec?.name ?? null };
  });

  // Tally applicants by (posting, stage) → ApplicantBucket[]
  const tally = new Map<string, number>();
  for (const a of (applicantsRes.data ?? []) as Array<{ posting_id: string; stage: string }>) {
    const k = `${a.posting_id}::${a.stage}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const buckets: ApplicantBucket[] = Array.from(tally.entries()).map(([k, count]) => {
    const [posting_id, stage] = k.split("::");
    return { posting_id, stage, count };
  });

  // Bucket counts per posting
  const stageCount = new Map<string, Map<string, number>>();
  for (const b of buckets) {
    if (!stageCount.has(b.posting_id)) stageCount.set(b.posting_id, new Map());
    stageCount.get(b.posting_id)!.set(b.stage, b.count);
  }

  // Apply UI filter
  const q = sp.q?.trim().toLowerCase();
  let visible = postings;
  if (filter !== "all") visible = visible.filter((p) => p.status === filter);
  if (q) visible = visible.filter((p) =>
    [p.title, p._positionName, p._sectionName, p.location, p.salary_range_text]
      .some((v) => (v ?? "").toLowerCase().includes(q)),
  );

  // Stat counts BEFORE filter
  const totalOpen   = postings.filter((p) => p.status === "open").length;
  const totalPaused = postings.filter((p) => p.status === "paused").length;
  const totalClosed = postings.filter((p) => p.status === "closed").length;
  const totalApplicants = buckets.reduce((s, b) => s + b.count, 0);
  const inPipeline = buckets.filter((b) => !["hired", "rejected"].includes(b.stage)).reduce((s, b) => s + b.count, 0);
  const hiredCount = buckets.filter((b) => b.stage === "hired").reduce((s, b) => s + b.count, 0);

  const tabHref = (s: Filter) => {
    const qs = new URLSearchParams();
    if (sp.q) qs.set("q", sp.q);
    if (s !== "all") qs.set("status", s);
    const s2 = qs.toString();
    return `/admin/hr/recruitment${s2 ? `?${s2}` : ""}`;
  };

  return (
    <main className="p-4 lg:p-6 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr" className="hover:text-primary-600">ฝ่ายทรัพยากรบุคคล</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">สรรหา / รับสมัครงาน</span>
      </nav>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white shadow-sm">
        <div className="absolute inset-0 opacity-10 [background:radial-gradient(circle_at_top_right,white,transparent_50%)]" />
        <div className="relative p-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <Megaphone className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-widest opacity-80">HR · RECRUITMENT</p>
              <h1 className="text-xl sm:text-2xl font-bold">สรรหา / รับสมัครงาน</h1>
              <p className="text-xs opacity-80 mt-0.5">
                ประกาศ {postings.length} ตำแหน่ง · เปิดรับ {totalOpen} · ผู้สมัครรวม {totalApplicants} คน · ในกระบวนการ {inPipeline} · รับเข้าทำงานแล้ว {hiredCount}
              </p>
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
              href="/admin/hr/recruitment/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white text-primary-700 px-3 py-2 text-xs sm:text-sm font-bold hover:bg-white/90 shadow"
            >
              <Plus className="w-4 h-4" />
              ลงประกาศใหม่
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <TabPill href={tabHref("all")}    active={filter === "all"}    label="ทั้งหมด"  count={postings.length} />
          <TabPill href={tabHref("open")}   active={filter === "open"}   label="เปิดรับ"   count={totalOpen}    tone="green" />
          <TabPill href={tabHref("paused")} active={filter === "paused"} label="พักรับ"   count={totalPaused}  tone="amber" />
          <TabPill href={tabHref("closed")} active={filter === "closed"} label="ปิดรับ"   count={totalClosed}  tone="red" />
        </div>
        <form action="/admin/hr/recruitment" method="get" className="grid gap-2 md:grid-cols-[1fr_auto]">
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="ค้นหา ชื่อตำแหน่ง / แผนก / สถานที่"
              className="w-full rounded-lg border border-border bg-surface-alt/30 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40"
            />
          </label>
          <button type="submit" className="rounded-lg bg-primary-500 text-white px-4 text-sm font-medium hover:bg-primary-600">
            ค้นหา
          </button>
        </form>
      </div>

      {/* Postings grid */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted">
          <Megaphone className="w-12 h-12 mx-auto mb-2 opacity-30" />
          {postings.length === 0 ? "ยังไม่มีประกาศรับสมัครงาน — เริ่มลงประกาศใหม่กันเลย" : "ไม่พบประกาศตามเงื่อนไขที่เลือก"}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((p) => {
            const cfg = STATUS_LABEL[p.status];
            const counts = stageCount.get(p.id) ?? new Map<string, number>();
            const totalForPost = Array.from(counts.values()).reduce((s, n) => s + n, 0);
            const pipelineForPost = Array.from(counts.entries())
              .filter(([k]) => !["hired", "rejected"].includes(k))
              .reduce((s, [, n]) => s + n, 0);
            return (
              <Link
                key={p.id}
                href={`/admin/hr/recruitment/${p.id}`}
                className="group flex flex-col gap-3 rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm hover:shadow-md hover:border-primary-300 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}>
                        <cfg.Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                      <span className="rounded-full border border-border bg-surface-alt px-2 py-0.5 text-[10px] font-medium">
                        {TYPE_LABEL[p.employment_type] ?? p.employment_type}
                      </span>
                      <span className="rounded-full border border-primary-200 bg-primary-50 text-primary-700 px-2 py-0.5 text-[10px] font-bold">
                        รับ {p.openings_count} คน
                      </span>
                    </div>
                    <h3 className="font-bold text-foreground group-hover:text-primary-600 transition-colors">{p.title}</h3>
                    {p._positionName && (
                      <p className="text-[11px] text-muted mt-0.5">
                        <Briefcase className="w-3 h-3 inline-block mr-1 -mt-0.5" />
                        {p._sectionName ? `${p._sectionName} · ` : ""}{p._positionName}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-muted">
                  {p.salary_range_text && (
                    <span className="inline-flex items-center gap-1"><Wallet className="w-3 h-3" /> {p.salary_range_text}</span>
                  )}
                  {p.location && (
                    <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {p.location}</span>
                  )}
                  {p.posted_at && (
                    <span className="text-[10px]">ลงประกาศ {new Date(p.posted_at).toLocaleDateString("th-TH")}</span>
                  )}
                </div>

                {/* Pipeline */}
                <div className="rounded-xl border border-border bg-surface-alt/30 p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-muted inline-flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      ผู้สมัคร {totalForPost} คน · ในกระบวนการ {pipelineForPost}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(["applied", "screening", "interviewing", "offered", "hired", "rejected"] as const).map((s) => {
                      const c = counts.get(s) ?? 0;
                      if (c === 0) return null;
                      return (
                        <span key={s} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${STAGE_TONE[s]}`}>
                          {stageLabel(s)} <b>{c}</b>
                        </span>
                      );
                    })}
                    {totalForPost === 0 && (
                      <span className="text-[10px] text-muted italic">— ยังไม่มีผู้สมัคร —</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted">
        เมื่อรับเข้าทำงานแล้ว ระบบจะลิงก์ applicant กับ profile (โปรไฟล์ลูกค้า) เพื่อให้ขึ้นทะเบียนพนักงานต่อใน <Link href="/admin/hr/employees" className="text-primary-600 hover:underline">/admin/hr/employees</Link>
      </div>
    </main>
  );
}

function stageLabel(s: string): string {
  return {
    applied: "Applied", screening: "Screening", interviewing: "Interview",
    offered: "Offered", hired: "Hired", rejected: "Rejected",
  }[s] ?? s;
}

function TabPill({
  href, active, label, count, tone,
}: { href: string; active: boolean; label: string; count: number; tone?: "green" | "amber" | "red" }) {
  const activeCls = {
    green: "bg-emerald-500 text-white border-emerald-500",
    amber: "bg-amber-500 text-white border-amber-500",
    red:   "bg-red-500 text-white border-red-500",
  }[tone ?? "green"] ?? "bg-primary-500 text-white border-primary-500";
  const baseActive = tone ? activeCls : "bg-primary-500 text-white border-primary-500";
  const idleCls = "bg-white dark:bg-surface text-foreground border-border hover:bg-surface-alt";
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${active ? baseActive : idleCls}`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white/25" : "bg-surface-alt"}`}>
        {count}
      </span>
    </Link>
  );
}
