import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Home, UserPlus } from "lucide-react";
import { loadPositionOptions } from "@/lib/admin/hr-org";
import { CreateStaffClient } from "./create-staff-client";

/**
 * /admin/hr/staff/new — เพิ่มพนักงานใหม่ (owner 2026-08-05 · "ฟอร์มเพิ่มพนักงาน
 * ตรงแกนเดียว"). สร้าง auth+profiles+admins+tb_admin + เติมข้อมูล + จัดตำแหน่ง
 * ในไหลเดียว (createStaffComplete) → ไม่มี account กลวง. RBAC: super.
 */

export const dynamic = "force-dynamic";

export default async function NewStaffPage() {
  await requireAdmin(["super"]);
  const positions = await loadPositionOptions();

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1 text-xs text-muted">
        <Link href="/admin" className="inline-flex items-center gap-1 hover:text-foreground"><Home className="h-3.5 w-3.5" /> หน้าหลัก</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/admin/hr/staff" className="hover:text-foreground">พนักงานทั้งหมด</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">เพิ่มพนักงาน</span>
      </nav>

      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · HUMAN RESOURCES</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><UserPlus className="h-6 w-6 text-primary-600" /> เพิ่มพนักงานใหม่</h1>
        <p className="mt-0.5 text-xs text-muted leading-relaxed">
          สร้างครบชุดในครั้งเดียว — บัญชีล็อกอิน + ข้อมูลพนักงาน (tb_admin แหล่งเดียว) + จัดเข้าตำแหน่งในผัง ·
          ข้อมูลอื่น (บัตรปชช./รูป/เงินเดือน) เติมทีหลังที่หน้าแก้ไข
        </p>
      </header>

      <CreateStaffClient positions={positions} />
    </main>
  );
}
