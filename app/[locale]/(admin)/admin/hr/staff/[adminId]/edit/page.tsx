import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, UserCog } from "lucide-react";
import { loadStaffDetail } from "@/lib/admin/hr-staff";
import { EditEmployeeClient } from "./edit-employee-client";

/**
 * /admin/hr/staff/[adminId]/edit — แก้ข้อมูลพนักงาน (owner 2026-08-03).
 * single-source: บันทึกเขียน profiles + tb_admin พร้อมกัน (ชื่อ/เบอร์/รูป ตรงทุก surface).
 * เติม HR ให้คนที่ยังไม่มี tb_admin (moo/sunta) ได้. RBAC: super | accounting.
 */

export const dynamic = "force-dynamic";

export default async function EditEmployeePage({ params }: { params: Promise<{ adminId: string }> }) {
  await requireAdmin(["super", "accounting"]);
  const { adminId } = await params;
  const detail = await loadStaffDetail(adminId);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1 text-xs text-muted">
        <Link href="/admin" className="inline-flex items-center gap-1 hover:text-foreground"><Home className="h-3.5 w-3.5" /> หน้าหลัก</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/admin/hr/staff" className="hover:text-foreground">ทะเบียนพนักงาน</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">แก้ไข</span>
      </nav>

      {!detail ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-700">
          ไม่พบพนักงาน <code>{adminId}</code> (หรือถูกล็อก/ออกจากงานแล้ว)
        </div>
      ) : (
        <>
          <header>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · HUMAN RESOURCES</p>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <UserCog className="h-6 w-6 text-primary-600" /> แก้ข้อมูลพนักงาน
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              {detail.memberCode ?? detail.adminId}
              {detail.positionName && <span> · {detail.positionName}</span>}
              {detail.roles.length > 0 && <span> · สิทธิ์: {detail.roles.join(", ")}</span>}
              {!detail.hasHrRecord && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-700">⚠ ยังไม่มีข้อมูล HR — กรอกแล้วบันทึกเพื่อเติม</span>}
            </p>
          </header>
          <EditEmployeeClient detail={detail} />
        </>
      )}
    </main>
  );
}
