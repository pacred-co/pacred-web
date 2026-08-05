import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, Users, Building2 } from "lucide-react";
import { loadStaffRegister } from "@/lib/admin/hr-staff";
import { loadPositionOptions } from "@/lib/admin/hr-org";
import { StaffAssignClient } from "./staff-assign-client";

/**
 * /admin/hr/staff — ทะเบียนพนักงาน + จัดคนเข้าตำแหน่ง (เฟส 2 · owner 2026-08-03).
 *
 * SPINE = profiles (login+role+identity · ครบกว่า tb_admin) · join tb_admin เอา
 * HR detail · join admins เอา role. roster ทุกคนมาจาก profiles ที่เดียว (รวม
 * คนที่ยังไม่มี HR record). จัดตำแหน่ง → profiles.org_unit_id · ผังนับสดจากตรงนี้.
 * RBAC: super | accounting · §0c error surfaced.
 */

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  await requireAdmin(["super", "accounting"]);
  const [{ rows, error }, positions] = await Promise.all([loadStaffRegister(), loadPositionOptions()]);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1 text-xs text-muted">
        <Link href="/admin" className="inline-flex items-center gap-1 hover:text-foreground"><Home className="h-3.5 w-3.5" /> หน้าหลัก</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/admin/hr" className="hover:text-foreground">HR</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">ทะเบียนพนักงาน · จัดตำแหน่ง</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · HUMAN RESOURCES</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Users className="h-6 w-6 text-primary-600" /> ทะเบียนพนักงาน · จัดคนเข้าตำแหน่ง</h1>
          <p className="mt-0.5 text-xs text-muted leading-relaxed">
            รายชื่อพนักงานทั้งหมดจาก profiles (ที่เดียว · รวม login+สิทธิ์+HR) — จัดแต่ละคนเข้าตำแหน่งในผัง แล้วผังจะนับคนสดเอง
          </p>
        </div>
        <Link href="/admin/hr/org-chart" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          <Building2 className="h-4 w-4" /> ดูผังองค์กร
        </Link>
      </header>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-[11.5px] text-sky-800 leading-relaxed">
        📌 <b>เฟส 2</b> — เลือกตำแหน่งในช่องขวาของแต่ละคน → บันทึกทันที · ตำแหน่งที่ยังไม่มีคนจัดเข้าจะขึ้น <b>แดง</b> บนผัง (ต้องจัดคน) ·
        ข้อมูล legacy เก่าจัดตำแหน่งไม่ตรง จึงต้องจัดใหม่ทีละคน
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">โหลดทะเบียนไม่สำเร็จ ({error})</div>
      ) : (
        <StaffAssignClient rows={rows} positions={positions} />
      )}
    </main>
  );
}
