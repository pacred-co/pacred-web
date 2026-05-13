import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, FileText, Plane, Calendar, Clock } from "lucide-react";
import { LeaveDecideActions, NewLeaveButton } from "./leave-actions";

type Profile = {
  id: string;
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};
type LeaveRow = {
  id: string;
  profile_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approved_by: string | null;
  approved_at: string | null;
  approval_note: string | null;
  created_at: string;
  profile: Profile | Profile[] | null;
};

type Filter = "pending" | "approved" | "rejected" | "all";

const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  vacation:  { label: "ลาพักร้อน", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  sick:      { label: "ลาป่วย",    cls: "bg-red-50 text-red-700 border-red-200" },
  personal:  { label: "ลากิจ",     cls: "bg-amber-50 text-amber-700 border-amber-200" },
  maternity: { label: "ลาคลอด",   cls: "bg-pink-50 text-pink-700 border-pink-200" },
  marriage:  { label: "ลาสมรส",   cls: "bg-purple-50 text-purple-700 border-purple-200" },
  funeral:   { label: "ลาฌาปนกิจ", cls: "bg-gray-50 text-gray-700 border-gray-200" },
  unpaid:    { label: "ลาไม่รับค่าจ้าง", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  other:     { label: "อื่นๆ",     cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
};
const STATUS_LABEL: Record<LeaveRow["status"], { label: string; cls: string }> = {
  pending:   { label: "รออนุมัติ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved:  { label: "อนุมัติ",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected:  { label: "ไม่อนุมัติ", cls: "bg-red-50 text-red-700 border-red-200" },
  cancelled: { label: "ยกเลิก",    cls: "bg-gray-50 text-gray-700 border-gray-200" },
};

export default async function AdminHRLeavesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: Filter }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter: Filter = sp.status === "approved" || sp.status === "rejected" || sp.status === "all" ? sp.status : "pending";
  const admin = createAdminClient();

  const [leavesRes, adminsRes] = await Promise.all([
    admin
      .from("leave_requests")
      .select(`
        id, profile_id, leave_type, start_date, end_date, days_count,
        reason, status, approved_by, approved_at, approval_note, created_at,
        profile:profiles!profile_id ( id, member_code, first_name, last_name, avatar_url )
      `)
      .order("created_at", { ascending: false })
      .limit(500),
    // Pre-load active admins as candidates for "new leave" dropdown
    admin
      .from("admins")
      .select(`profile_id,
               profile:profiles!profile_id ( id, member_code, first_name, last_name )`)
      .eq("is_active", true),
  ]);

  const rows = ((leavesRes.data ?? []) as LeaveRow[]).map((r) => ({
    ...r,
    profile_one: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  const visible = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "pending") return r.status === "pending";
    return r.status === filter;
  });

  const totals = {
    pending:  rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected" || r.status === "cancelled").length,
    all:      rows.length,
  };

  type AdminRow = { profile_id: string; profile: Profile | Profile[] | null };
  const employees = ((adminsRes.data ?? []) as AdminRow[]).map((a) => {
    const p = Array.isArray(a.profile) ? a.profile[0] ?? null : a.profile;
    const full = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "—";
    return { id: a.profile_id, label: `${p?.member_code ?? "—"} · ${full}` };
  }).sort((a, b) => a.label.localeCompare(b.label, "th"));

  const tabHref = (s: Filter) =>
    `/admin/hr/attendance/leaves${s === "pending" ? "" : `?status=${s}`}`;

  return (
    <main className="p-4 lg:p-6 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr" className="hover:text-primary-600">ฝ่ายทรัพยากรบุคคล</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr/attendance" className="hover:text-primary-600">เข้างาน</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">คำขอลา</span>
      </nav>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white shadow-sm">
        <div className="absolute inset-0 opacity-10 [background:radial-gradient(circle_at_top_right,white,transparent_50%)]" />
        <div className="relative p-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-widest opacity-80">HR · LEAVE REQUESTS</p>
              <h1 className="text-xl sm:text-2xl font-bold">คำขอลา</h1>
              <p className="text-xs opacity-80 mt-0.5">
                ทั้งหมด {totals.all} คำขอ · รออนุมัติ {totals.pending} · อนุมัติแล้ว {totals.approved} · ไม่อนุมัติ/ยกเลิก {totals.rejected}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NewLeaveButton employees={employees} />
            <Link
              href="/admin/hr/attendance"
              className="rounded-lg bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-2 text-xs sm:text-sm font-medium hover:bg-white/25"
            >
              ← เข้างาน
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <TabPill href={tabHref("pending")}  active={filter === "pending"}  label="รออนุมัติ"   count={totals.pending}  tone="amber" />
          <TabPill href={tabHref("approved")} active={filter === "approved"} label="อนุมัติแล้ว" count={totals.approved} tone="green" />
          <TabPill href={tabHref("rejected")} active={filter === "rejected"} label="ไม่อนุมัติ"  count={totals.rejected} tone="red" />
          <TabPill href={tabHref("all")}      active={filter === "all"}      label="ทั้งหมด"     count={totals.all} />
        </div>
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted">
          <Plane className="w-12 h-12 mx-auto mb-2 opacity-30" />
          {filter === "pending" ? "ไม่มีคำขอลาที่รออนุมัติ — เคลียร์หมดแล้ว 🎉" : "ไม่พบคำขอลาในเงื่อนไขที่เลือก"}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const t = TYPE_LABEL[r.leave_type] ?? { label: r.leave_type, cls: "bg-gray-50 text-gray-700 border-gray-200" };
            const s = STATUS_LABEL[r.status];
            const p = r.profile_one;
            const full = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "—";
            return (
              <article key={r.id} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm flex flex-wrap items-start gap-4">
                <Avatar src={p?.avatar_url ?? null} name={full} />

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-foreground">{full}</span>
                    <span className="font-mono text-[10px] text-muted">{p?.member_code ?? "—"}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${t.cls}`}>{t.label}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${s.cls}`}>{s.label}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(r.start_date).toLocaleDateString("th-TH")}
                      {" → "}
                      {new Date(r.end_date).toLocaleDateString("th-TH")}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                      <Clock className="w-3 h-3" />
                      {r.days_count} วัน
                    </span>
                    <span className="text-[10px]">ยื่นเมื่อ {new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </div>

                  {r.reason && (
                    <p className="text-xs text-foreground bg-surface-alt/50 border border-border rounded-md px-2 py-1.5">
                      💬 {r.reason}
                    </p>
                  )}
                  {r.approval_note && (
                    <p className={`text-xs rounded-md px-2 py-1.5 border ${r.status === "rejected" ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                      🗒 {r.approval_note}
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  <LeaveDecideActions id={r.id} currentStatus={r.status} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted">
        เมื่ออนุมัติคำขอลา ระบบจะ mark ตาราง attendance ของวันที่ลาให้อัตโนมัติ (status = leave) ผ่าน Postgres trigger
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

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} className="h-10 w-10 rounded-full object-cover ring-1 ring-border shrink-0" />
    );
  }
  return (
    <div className="h-10 w-10 rounded-full bg-surface-alt ring-1 ring-border flex items-center justify-center text-sm font-bold text-muted shrink-0">
      {name.charAt(0).toUpperCase() || "?"}
    </div>
  );
}
