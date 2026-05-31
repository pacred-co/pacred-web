import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  ChevronRight, Home, Clock, Calendar, FileText, CalendarDays, Trash2 as Trash2Icon,
} from "lucide-react";
import { AddHolidayButton, DeleteHolidayButton } from "./attendance-actions";

/**
 * D1 faithful port of time-attendance-system.php (default + add-holiday modes) —
 * repointed from the REBUILT empty twin (`attendance_logs`) to the migrated
 * legacy `tas_holiday` (annual holidays calendar · 18 rows on prod). The legacy
 * "แดชบอร์ดการเข้างาน" core is the holidays calendar + leave records; there is
 * NO per-employee daily attendance_logs table in legacy (clock-in/out lives in
 * tas_historydataold, a CSV import from the fingerprint scanner — flagged as a
 * follow-up below, not built in this pass).
 *
 * tas_holiday columns (lowercase): id, holidayname, holidaydate, adminidcreate,
 * date, note.
 */

type Holiday = {
  id: number;
  holidayname: string;
  holidaydate: string | null;
  adminidcreate: string | null;
  date: string | null;
  note: string | null;
};

function thYear(d: string | null): string {
  if (!d) return "—";
  const y = new Date(d).getFullYear();
  return String(y + 543); // Buddhist year, faithful to YEAR(holidayDate) display intent
}

export default async function AdminHRAttendancePage() {
  await requireAdmin();
  const admin = createAdminClient();

  // tas_holiday — annual holidays, ordered by date ASC (legacy add-holiday/home.php)
  const { data, error } = await admin
    .from("tas_holiday")
    .select("id, holidayname, holidaydate, adminidcreate, date, note")
    .order("holidaydate", { ascending: true });
  if (error) {
    console.error(`[tas_holiday list] failed`, { code: error.code, message: error.message });
    throw new Error("ไม่สามารถโหลดวันหยุดประจำปีได้");
  }
  const holidays = (data ?? []) as Holiday[];

  // Pending leave count for the badge (faithful: tas_leave status 1 = รอ HR ตรวจสอบ)
  const { data: pendLeaves, error: pendErr } = await admin
    .from("tas_leave")
    .select("id")
    .eq("status", "1");
  if (pendErr) {
    console.error(`[tas_leave pending] failed`, { code: pendErr.code, message: pendErr.message });
  }
  const pendingLeaves = (pendLeaves ?? []).length;

  // Group holidays by Gregorian year for the table sections
  const byYear = new Map<number, Holiday[]>();
  for (const h of holidays) {
    const y = h.holidaydate ? new Date(h.holidaydate).getFullYear() : 0;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(h);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b - a);

  return (
    <main className="p-4 lg:p-6 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/hr" className="hover:text-primary-600">ฝ่ายทรัพยากรบุคคล</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">บันทึกเวลางาน · วันหยุด</span>
      </nav>

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white shadow-sm">
        <div className="absolute inset-0 opacity-10 [background:radial-gradient(circle_at_top_right,white,transparent_50%)]" />
        <div className="relative p-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-widest opacity-80">HR · TIME ATTENDANCE</p>
              <h1 className="text-xl sm:text-2xl font-bold">ระบบบันทึกเวลางาน</h1>
              <p className="text-xs opacity-80 mt-0.5">
                จัดการวันหยุดประจำปี · วันหยุดทั้ง 2 บริษัทใช้แบบเดียวกัน · ทั้งหมด {holidays.length} วัน
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AddHolidayButton />
            <Link
              href="/admin/hr/attendance/leaves"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white text-primary-700 px-3 py-2 text-xs sm:text-sm font-bold hover:bg-white/90 shadow"
            >
              <FileText className="w-4 h-4" />
              การลางาน
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
      </div>

      {/* Holidays table grouped by year */}
      {holidays.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted">
          <CalendarDays className="w-12 h-12 mx-auto mb-2 opacity-30" />
          ยังไม่มีวันหยุดประจำปี — กด &ldquo;เพิ่มวันหยุด&rdquo; เพื่อเริ่มต้น
        </div>
      ) : (
        years.map((y) => {
          const rows = byYear.get(y)!;
          return (
            <section key={y} className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
              <header className="flex items-center justify-between px-5 py-3 bg-surface-alt/50 border-b border-border">
                <h2 className="font-bold text-sm inline-flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary-600" />
                  ปี {y ? y + 543 : "—"} <span className="text-muted text-xs font-normal">({rows.length} วัน)</span>
                </h2>
              </header>
              <div className="overflow-x-auto scrollbar-x-visible">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-border">
                    <tr>
                      <th className="px-4 py-2">ชื่อวันหยุด</th>
                      <th className="px-4 py-2">วันหยุด</th>
                      <th className="px-4 py-2">ปีของวันหยุด</th>
                      <th className="px-4 py-2">โน๊ตช่วยจำ</th>
                      <th className="px-4 py-2">ผู้สร้าง</th>
                      <th className="px-4 py-2 text-right">ตัวเลือก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((h) => (
                      <tr key={h.id} className="border-t border-border hover:bg-surface-alt/30">
                        <td className="px-4 py-2 font-medium text-foreground">{h.holidayname}</td>
                        <td className="px-4 py-2 text-xs">
                          {h.holidaydate ? new Date(h.holidaydate).toLocaleDateString("th-TH", { weekday: "short", year: "numeric", month: "long", day: "numeric" }) : "—"}
                        </td>
                        <td className="px-4 py-2 text-xs">{thYear(h.holidaydate)}</td>
                        <td className="px-4 py-2 text-xs text-muted">{h.note || "—"}</td>
                        <td className="px-4 py-2 text-xs text-muted">{h.adminidcreate || "—"}</td>
                        <td className="px-4 py-2 text-right">
                          <DeleteHolidayButton id={h.id} name={h.holidayname} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}

      {/* Follow-up flag: clock-in/out scanner CSV (tas_historydataold) not built this pass */}
      <div className="rounded-2xl border border-dashed border-border p-4 text-xs text-muted flex items-start gap-2">
        <Trash2Icon className="w-4 h-4 mt-0.5 opacity-0 shrink-0" aria-hidden />
        <span>
          <b>ยังไม่เปิด:</b> นำเข้าเวลาเข้า-ออกจากเครื่องสแกนนิ้ว (CSV → <code>tas_historydataold</code>) และวันหยุดแม่บ้าน
          (<code>tas_holiday_maid</code>) — legacy รองรับ แต่รอ port รอบถัดไป · ตอนนี้จัดการ &ldquo;วันหยุดประจำปี&rdquo; +
          &ldquo;การลางาน&rdquo; ได้แล้วบนข้อมูลจริงที่ migrate มา
        </span>
      </div>
    </main>
  );
}
