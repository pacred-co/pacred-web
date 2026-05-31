import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  ChevronRight, Home, Megaphone, Plus, Users, Wallet,
  Briefcase, CheckCircle2, Archive, Search, Calendar,
} from "lucide-react";
import {
  postCompanyLabel, postAdminTypeLabel, postDepartmentLabel, postSectionLabel,
  postingIsActive,
} from "../_legacy-labels";

/**
 * D1 faithful port of post-job-hs.php (the ประวัติลงประกาศงาน list) — reads the
 * migrated legacy `tb_post_job`. Status is DERIVED from the start/end window
 * (legacy has NO status column). Pacred card design, legacy fields + 3-tab
 * filter (ทั้งหมด / กำลังประกาศ / หมดเวลาแล้ว) verbatim.
 */

type Posting = {
  id: number;
  companytype: string;
  admintype: string;
  department: string;
  section: string;
  jobtitle: string;
  amount: number;
  salary: string | null;
  description: string | null;
  startdate: string | null;
  enddate: string | null;
  admincreate: string | null;
  date: string | null;
};

type Filter = "all" | "active" | "expired";

export default async function AdminHRRecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: Filter }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter: Filter = sp.status === "active" || sp.status === "expired" ? sp.status : "all";
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("tb_post_job")
    .select("id, companytype, admintype, department, section, jobtitle, amount, salary, description, startdate, enddate, admincreate, date")
    .order("date", { ascending: false });
  if (error) {
    console.error(`[tb_post_job list] failed`, { code: error.code, message: error.message });
    throw new Error("ไม่สามารถโหลดประกาศรับสมัครงานได้");
  }

  const now = new Date();
  const postings = ((data ?? []) as Posting[]).map((p) => ({
    ...p,
    _active: postingIsActive(p.startdate, p.enddate, now),
  }));

  // Apply UI filter
  const q = sp.q?.trim().toLowerCase();
  let visible = postings;
  if (filter === "active") visible = visible.filter((p) => p._active);
  if (filter === "expired") visible = visible.filter((p) => !p._active);
  if (q) visible = visible.filter((p) =>
    [p.jobtitle, postCompanyLabel(p.companytype), postDepartmentLabel(p.companytype, p.department), postSectionLabel(p.companytype, p.section), p.salary]
      .some((v) => (v ?? "").toLowerCase().includes(q)),
  );

  const totalActive  = postings.filter((p) => p._active).length;
  const totalExpired = postings.length - totalActive;
  const totalOpenings = postings.reduce((s, p) => s + (p.amount || 0), 0);

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
        <span className="text-foreground font-medium">ลงประกาศรับสมัครงาน</span>
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
              <h1 className="text-xl sm:text-2xl font-bold">ลงประกาศรับสมัครงาน</h1>
              <p className="text-xs opacity-80 mt-0.5">
                ประกาศทั้งหมด {postings.length} · กำลังประกาศ {totalActive} · หมดเวลาแล้ว {totalExpired} · รับสมัครรวม {totalOpenings} อัตรา
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
          <TabPill href={tabHref("all")}     active={filter === "all"}     label="ทั้งหมด"     count={postings.length} />
          <TabPill href={tabHref("active")}  active={filter === "active"}  label="กำลังประกาศ" count={totalActive}  tone="green" />
          <TabPill href={tabHref("expired")} active={filter === "expired"} label="หมดเวลาแล้ว" count={totalExpired} tone="red" />
        </div>
        <form action="/admin/hr/recruitment" method="get" className="grid gap-2 md:grid-cols-[1fr_auto]">
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="ค้นหา ชื่อตำแหน่ง / บริษัท / แผนก / ฝ่าย"
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
            const cfg = p._active
              ? { label: "กำลังประกาศ", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 }
              : { label: "หมดเวลาแล้ว", cls: "bg-red-50 text-red-700 border-red-200", Icon: Archive };
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
                        {postCompanyLabel(p.companytype)}
                      </span>
                      <span className="rounded-full border border-border bg-surface-alt px-2 py-0.5 text-[10px] font-medium">
                        {postAdminTypeLabel(p.admintype)}
                      </span>
                      <span className="rounded-full border border-primary-200 bg-primary-50 text-primary-700 px-2 py-0.5 text-[10px] font-bold">
                        รับ {p.amount} อัตรา
                      </span>
                    </div>
                    <h3 className="font-bold text-foreground group-hover:text-primary-600 transition-colors">{p.jobtitle}</h3>
                    <p className="text-[11px] text-muted mt-0.5">
                      <Briefcase className="w-3 h-3 inline-block mr-1 -mt-0.5" />
                      {postDepartmentLabel(p.companytype, p.department)} · {postSectionLabel(p.companytype, p.section)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-muted">
                  {p.salary && (
                    <span className="inline-flex items-center gap-1"><Wallet className="w-3 h-3" /> {p.salary}</span>
                  )}
                  {p.startdate && p.enddate && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(p.startdate).toLocaleDateString("th-TH")} ถึง {new Date(p.enddate).toLocaleDateString("th-TH")}
                    </span>
                  )}
                  {p.admincreate && <span className="text-[10px]">โดย {p.admincreate}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pacred-original ATS note */}
      <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted">
        <Users className="w-4 h-4 inline-block mr-1 -mt-0.5" />
        ระบบติดตามผู้สมัคร (pipeline · นัดสัมภาษณ์) เป็นส่วนเสริมของ Pacred — กดเข้าประกาศเพื่อจัดการผู้สมัคร
      </div>
    </main>
  );
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
