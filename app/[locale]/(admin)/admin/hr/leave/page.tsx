import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, CalendarCheck, Users } from "lucide-react";
import { loadLeaveRequests } from "@/lib/admin/hr-leave";
import { loadStaffRegister } from "@/lib/admin/hr-staff";
import { LeaveClient } from "./leave-client";

/**
 * /admin/hr/leave — การลา 2 ชั้น (item 4b · owner).
 *
 * พนักงานยื่นใบลา → HR อนุมัติก่อน (pending → hr_approved) → CEO อนุมัติปิดท้าย
 * (hr_approved → approved). ปฏิเสธได้ที่ชั้น pending/hr_approved. RBAC: super |
 * accounting เห็น+ทำชั้น HR ได้ · CEO อนุมัติ = super เท่านั้น (canCeoApprove).
 */

export const dynamic = "force-dynamic";

export default async function LeavePage() {
  const { roles } = await requireAdmin(["super", "accounting"]);
  const canCeoApprove = roles.includes("super"); // ชั้น CEO = super (ตำแหน่ง CEO)

  const [rows, staff] = await Promise.all([loadLeaveRequests(), loadStaffRegister()]);
  const staffOptions = staff.rows
    .filter((s) => s.isActive)
    .map((s) => ({ adminId: s.adminId, name: s.name, nickname: s.nickname }));

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1 text-xs text-muted">
        <Link href="/admin" className="inline-flex items-center gap-1 hover:text-foreground"><Home className="h-3.5 w-3.5" /> หน้าหลัก</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/admin/hr/staff" className="hover:text-foreground">HR</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">การลา</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · HUMAN RESOURCES</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarCheck className="h-6 w-6 text-primary-600" /> การลา · อนุมัติ 2 ชั้น</h1>
          <p className="mt-0.5 text-xs text-muted leading-relaxed">
            พนักงานยื่นใบลา → <b>HR อนุมัติก่อน</b> → <b>CEO อนุมัติปิดท้าย</b> · ปฏิเสธได้ก่อนอนุมัติจบ
          </p>
        </div>
        <Link href="/admin/hr/staff" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          <Users className="h-4 w-4" /> ทะเบียนพนักงาน
        </Link>
      </header>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-[11.5px] text-sky-800 leading-relaxed">
        📌 เส้นทางอนุมัติเดินทางเดียว: <b>รอ HR</b> → <b>รอ CEO</b> → <b>อนุมัติ</b> ·
        {canCeoApprove ? " คุณอนุมัติได้ทั้งชั้น HR และ CEO" : " คุณอนุมัติได้ชั้น HR (ชั้น CEO เฉพาะ super)"}
      </div>

      <LeaveClient rows={rows} staffOptions={staffOptions} canCeoApprove={canCeoApprove} />
    </main>
  );
}
