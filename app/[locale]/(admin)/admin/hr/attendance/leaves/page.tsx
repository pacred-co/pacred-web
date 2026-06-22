import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, FileText, Plane, Calendar, Clock } from "lucide-react";
import { LeaveDecideActions, NewLeaveButton } from "./leave-actions";
import { LEAVE_TYPE_LABEL, LEAVE_DURATION_LABEL, LEAVE_STATUS_LABEL } from "../../_legacy-labels";

/**
 * D1 faithful port of time-attendance-system.php case 'leave-record' — reads
 * the migrated legacy `tas_leave` joined to `tb_admin` for the employee name
 * (verbatim to leave-record/home.php SQL: LEFT JOIN tb_admin ON adminID=adminid).
 *
 * tas_leave columns (lowercase): id, type(1-4), startdate, enddate, duration(1-3),
 * reason, filename, adminid, date, status(1-4), adminidcreate, adminidceo, adminidhr.
 * status: 1=รอ HR ตรวจสอบ 2=รอผู้บริหารอนุมัติ 3=อนุมัติ 4=ไม่อนุมัติ.
 */

type LeaveRow = {
  id: number;
  type: string;
  startdate: string | null;
  enddate: string | null;
  duration: string;
  reason: string | null;
  adminid: string | null;
  date: string | null;
  status: string;
  adminidcreate: string | null;
};
type AdminRow = {
  adminID: string;
  adminName: string | null;
  adminLastName: string | null;
  adminNickname: string | null;
  adminStatusA: string | null;
  section: string | null;
  adminType: string | null;
};

type Filter = "pending" | "approved" | "rejected" | "all";

const STATUS_CLS: Record<string, string> = {
  "1": "bg-amber-50 text-amber-700 border-amber-200",
  "2": "bg-blue-50 text-blue-700 border-blue-200",
  "3": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "4": "bg-red-50 text-red-700 border-red-200",
};
const TYPE_CLS: Record<string, string> = {
  "1": "bg-red-50 text-red-700 border-red-200",
  "2": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "3": "bg-amber-50 text-amber-700 border-amber-200",
  "4": "bg-pink-50 text-pink-700 border-pink-200",
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
      .from("tas_leave")
      .select("id, type, startdate, enddate, duration, reason, adminid, date, status, adminidcreate")
      .order("date", { ascending: false })
      .limit(500),
    // tb_admin roster — for name resolution of ALL leave rows (display) AND
    // the "เพิ่มการลางาน" dropdown (which the legacy add.php filters to active
    // staff: adminStatusA<>'0' AND section<>'0' AND adminType IN 1..4).
    admin
      .from("tb_admin")
      .select("adminID, adminName, adminLastName, adminNickname, adminStatusA, section, adminType"),
  ]);

  if (leavesRes.error) {
    console.error(`[tas_leave list] failed`, { code: leavesRes.error.code, message: leavesRes.error.message });
    throw new Error("ไม่สามารถโหลดข้อมูลการลางานได้");
  }
  if (adminsRes.error) {
    console.error(`[tb_admin roster] failed`, { code: adminsRes.error.code, message: adminsRes.error.message });
  }

  const adminMap = new Map<string, AdminRow>();
  for (const a of (adminsRes.data ?? []) as unknown as AdminRow[]) adminMap.set(a.adminID, a);

  const rows = (leavesRes.data ?? []) as unknown as LeaveRow[];

  const visible = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "pending") return r.status === "1" || r.status === "2";   // awaiting (HR or exec)
    if (filter === "approved") return r.status === "3";
    return r.status === "4"; // rejected
  });

  const totals = {
    pending:  rows.filter((r) => r.status === "1" || r.status === "2").length,
    approved: rows.filter((r) => r.status === "3").length,
    rejected: rows.filter((r) => r.status === "4").length,
    all:      rows.length,
  };

  // Employee dropdown options — legacy add.php filter (active staff with a
  // section, adminType 1-4): adminStatusA<>'0' AND section<>'0' AND adminType IN 1..4.
  const employees = ((adminsRes.data ?? []) as unknown as AdminRow[])
    .filter((a) =>
      a.adminStatusA !== "0" &&
      (a.section ?? "0") !== "0" &&
      ["1", "2", "3", "4"].includes(a.adminType ?? ""))
    .map((a) => {
      const full = `${a.adminName ?? ""} ${a.adminLastName ?? ""}`.trim() || a.adminID;
      const nick = a.adminNickname ? `(${a.adminNickname}) ` : "";
      return { id: a.adminID, label: `${nick}${full}` };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "th"));

  const fullName = (adminid: string | null): string => {
    if (!adminid) return "—";
    const a = adminMap.get(adminid);
    if (!a) return adminid;
    const full = `${a.adminName ?? ""} ${a.adminLastName ?? ""}`.trim() || adminid;
    return a.adminNickname ? `(${a.adminNickname}) ${full}` : full;
  };

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
        <Link href="/admin/hr/attendance" className="hover:text-primary-600">บันทึกเวลางาน</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">การลางาน</span>
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
              <p className="text-[11px] font-bold tracking-widest opacity-80">HR · LEAVE RECORDS</p>
              <h1 className="text-xl sm:text-2xl font-bold">การลางาน</h1>
              <p className="text-xs opacity-80 mt-0.5">
                ทั้งหมด {totals.all} รายการ · รออนุมัติ {totals.pending} · อนุมัติแล้ว {totals.approved} · ไม่อนุมัติ {totals.rejected}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NewLeaveButton employees={employees} />
            <Link
              href="/admin/hr/attendance"
              className="rounded-lg bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-2 text-xs sm:text-sm font-medium hover:bg-white/25"
            >
              ← วันหยุด
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
          {filter === "pending" ? "ไม่มีคำขอลาที่รออนุมัติ — เคลียร์หมดแล้ว 🎉" : "ไม่พบรายการลาในเงื่อนไขที่เลือก"}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const typeLabel = LEAVE_TYPE_LABEL[r.type] ?? r.type;
            const statusLabel = LEAVE_STATUS_LABEL[r.status] ?? r.status;
            const durationLabel = LEAVE_DURATION_LABEL[r.duration] ?? r.duration;
            return (
              <article key={r.id} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm flex flex-wrap items-start gap-4">
                <Avatar name={fullName(r.adminid)} />

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-foreground">{fullName(r.adminid)}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${TYPE_CLS[r.type] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}>{typeLabel}</span>
                    <span className="rounded-full border border-border bg-surface-alt px-2 py-0.5 text-[11px] font-medium">{durationLabel}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_CLS[r.status] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}>{statusLabel}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {r.startdate ? new Date(r.startdate).toLocaleDateString("th-TH") : "—"}
                      {r.enddate && r.enddate !== r.startdate ? ` → ${new Date(r.enddate).toLocaleDateString("th-TH")}` : ""}
                    </span>
                    {r.date && (
                      <span className="inline-flex items-center gap-1 text-[11px]">
                        <Clock className="w-3 h-3" />
                        ยื่นเมื่อ {new Date(r.date).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    )}
                    {r.adminidcreate && <span className="text-[11px]">บันทึกโดย {r.adminidcreate}</span>}
                  </div>

                  {r.reason && (
                    <p className="text-xs text-foreground bg-surface-alt/50 border border-border rounded-md px-2 py-1.5">
                      💬 {r.reason}
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
        เกณฑ์การอนุมัติ (legacy): รอ HR ตรวจสอบ → รอผู้บริหารอนุมัติ → อนุมัติ / ไม่อนุมัติ
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
      <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${active ? "bg-white/25" : "bg-surface-alt"}`}>
        {count}
      </span>
    </Link>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="h-10 w-10 rounded-full bg-surface-alt ring-1 ring-border flex items-center justify-center text-sm font-bold text-muted shrink-0">
      {name.replace(/[()]/g, "").trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}
