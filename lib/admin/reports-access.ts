/**
 * reports-access.ts — SOT ตัวเดียวที่ตัดสินว่าใครเข้า /admin/system-reports ได้ + เห็นอะไร.
 *
 * owner 2026-07-30: "ทำฟังชั่นนี้ให้ HR เห็นและสามารถใช้ได้" — เดิมหน้านี้ ultra-only
 * (page gate + sidebar withUltraReports). HR ไม่ใช่ money-tier role — เป็น **แผนก**
 * (admin_positions.department='hr' · lib/admin/departments.ts) ตามแกน RBAC 3 แกน
 * (role=money-tier · department · position→workspace). จึง gate ด้วย department ไม่ใช่
 * เพิ่ม role ใหม่ (ไม่ทำให้แกน money-tier เลอะ · ใครถือตำแหน่ง HR ได้สิทธิ์อัตโนมัติ
 * ไม่ต้อง assign role มือ).
 *
 * แยก 2 ระดับ (money-visibility):
 *   • เข้าหน้า + เห็นรายงานค่าคอมมิชชั่น = ultra หรือ HR (งาน payroll ของ HR ตรงตัว)
 *   • เห็นแท็บ "กำไรตู้" (margin ต่อตู้ = ข้อมูลกำไร/ต้นทุนระดับผู้บริหาร) = ultra เท่านั้น
 *     — สอดคล้อง canViewCostProfit (lib/admin/money-visibility.ts) ที่จำกัด cost/profit
 *     ไว้ {ultra,accounting,pricing}. HR ทำเงินเดือน/คอม ไม่ใช่ดู margin ตู้.
 *
 * pure · client-safe (ไม่มี DB/server-only) — caller ส่ง roles + department เข้ามา.
 */
import type { AdminRole } from "@/lib/auth/require-admin";

/** แผนกที่ให้เข้ารายงานระบบได้นอกจาก ultra (ตอนนี้ = HR เท่านั้น). */
const REPORTS_DEPARTMENTS: readonly string[] = ["hr"];

/**
 * เข้า /admin/system-reports ได้ไหม (+ โชว์แถบใน sidebar).
 * ultra = god (เห็นทุกอย่าง) · HR = เห็นได้เพื่อทำ payroll/คอม.
 */
export function canViewSystemReports(
  roles: readonly AdminRole[],
  department: string | null | undefined,
): boolean {
  if (roles.includes("ultra")) return true;
  return REPORTS_DEPARTMENTS.includes(String(department ?? "").trim().toLowerCase());
}

/**
 * เห็นแท็บ "กำไรตู้ (รายเดือน)" ได้ไหม — margin ต่อตู้ = ข้อมูลผู้บริหาร → ultra เท่านั้น.
 * (HR เห็นหน้าได้แต่ไม่เห็นแท็บนี้ · owner เปิดเพิ่มได้ทีหลังถ้าต้องการ.)
 */
export function canViewContainerProfit(roles: readonly AdminRole[]): boolean {
  return roles.includes("ultra");
}
