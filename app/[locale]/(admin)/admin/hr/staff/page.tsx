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
  const { roles } = await requireAdmin(["super", "accounting"]);
  const canManageRoles = roles.includes("super") || roles.includes("ultra"); // จัดสิทธิ์/ล็อก = super/ultra
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
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Users className="h-6 w-6 text-primary-600" /> พนักงานทั้งหมด · จัดตำแหน่ง + สิทธิ์</h1>
          <p className="mt-0.5 text-xs text-muted leading-relaxed">
            หน้าเดียวรวมทุกอย่าง (ยุบ /admin/admins มารวม · owner 2026-08-05) — ตัวตน/ตำแหน่งในผัง/สิทธิ์ระบบ/สถานะ ดึงจากแหล่งเดียว (tb_admin + ผัง HR)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/admins/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700">
            + เพิ่มพนักงาน
          </Link>
          <Link href="/admin/hr/org-chart" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
            <Building2 className="h-4 w-4" /> ดูผังองค์กร
          </Link>
        </div>
      </header>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-[11.5px] text-sky-800 leading-relaxed">
        📌 <b>ตำแหน่งในผัง</b> = อยู่ทีมไหน (นับคนสดบนผัง) · <b>สิทธิ์ระบบ (role)</b> = เห็น/ทำอะไรได้ (คนละแกน) ·
        แท็บ "ลาออก · ล็อก" ดูคนออก + <b>กดเปิดกลับ</b>ได้ (ปลดล็อกทุกชั้น){canManageRoles ? "" : " · (เฉพาะ super แก้สิทธิ์/ล็อกได้)"}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">โหลดทะเบียนไม่สำเร็จ ({error})</div>
      ) : (
        <StaffAssignClient rows={rows} positions={positions} canManageRoles={canManageRoles} />
      )}
    </main>
  );
}
