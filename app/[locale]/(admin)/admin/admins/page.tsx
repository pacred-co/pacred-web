import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * /admin/admins — ยุบรวมเข้า /admin/hr/staff (owner 2026-08-05 "รวมเป็นหน้าเดียว").
 *
 * เดิมหน้านี้อ่าน profiles + admins + `admin_contact_extras` (ตารางที่ 3 ที่ค้าง
 * ไม่ตรงผัง HR) → ข้อมูลไม่เชื่อมโยง. หน้าพนักงานใหม่ /admin/hr/staff ดึงจากแหล่ง
 * เดียว (tb_admin + hr_org_units) + จัดตำแหน่ง + จัดสิทธิ์ (RBAC) + ล็อก/ปลดล็อก
 * ครบในหน้าเดียว → redirect มาที่นั่น. (สร้างพนักงานใหม่ยังอยู่ /admin/admins/new)
 */

export const dynamic = "force-dynamic";

export default async function AdminsRedirectPage() {
  await requireAdmin(["super", "accounting"]);
  const locale = await getLocale();
  redirect({ href: "/admin/hr/staff", locale });
}
