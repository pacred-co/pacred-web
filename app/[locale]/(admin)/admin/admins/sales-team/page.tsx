/**
 * /admin/admins/sales-team — จัดการทีมเซล (self-service · super-only)
 *
 * Owner directive (2026-06-15): "ให้มันผูกกันหมดออโต้" — the sales-rep
 * roster must be 100% data-driven. This page lets a super-admin flip a
 * staffer's `tb_admin.adminStatusSale` flag from the UI, so adding a 4th/5th
 * sales rep is a TOGGLE — never a code edit or a phpMyAdmin run.
 *
 * Everything that reads the roster picks the change up automatically:
 *   - lib/admin/assign-sales-rep.ts (round-robin lead assignment)
 *   - components/ui/sales-carousel.tsx (customer-facing team carousel)
 *   - admin rep filters/dropdowns that read the active sales pool
 * SOT reader: lib/admin/sales-roster.ts · writer: actions/admin/admins.ts.
 *
 * §0c — the data is fetched server-side via the audited action
 * `listStaffSalesFlags()` (every Supabase call destructures error inside it).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { listStaffSalesFlags } from "@/actions/admin/admins";
import { SalesTeamManager } from "./sales-team-client";

export const dynamic = "force-dynamic";

export default async function SalesTeamPage() {
  await requireAdmin(["super"]);

  const res = await listStaffSalesFlags();
  const rows = res.ok && res.data ? res.data.rows : [];
  const loadError = res.ok ? null : res.error;
  const salesCount = rows.filter((r) => r.isSales).length;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/admins" className="hover:text-primary-600">พนักงาน</Link>
        <span>/</span>
        <span className="text-foreground">จัดการทีมเซล</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">จัดการทีมเซล</h1>
          <p className="mt-1 text-sm text-muted">
            เปิด/ปิด ว่าใครเป็นเซล (รับลูกค้าสุ่ม) — ระบบจะสุ่มลูกค้าใหม่ + แสดงทีมเซลให้ลูกค้าเห็น
            ตามนี้อัตโนมัติ ไม่ต้องแก้โค้ด
          </p>
        </div>
        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-2 text-center">
          <p className="text-[11px] font-medium text-primary-700">เซลที่เปิดใช้งาน</p>
          <p className="text-2xl font-bold text-primary-700">{salesCount}</p>
        </div>
      </div>

      {/* How-it-works note */}
      <section className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p className="font-medium mb-1.5">ทำงานยังไง</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>เปิดสวิตช์ &ldquo;เป็นเซล&rdquo; ให้พนักงาน → เขาจะเข้าทีมเซลทันที</li>
          <li>
            ลูกค้าใหม่จะถูก <span className="font-medium">สุ่ม (round-robin)</span> ให้เซลที่เปิดใช้งานอยู่
            แบบกระจายงานเท่าๆ กัน
          </li>
          <li>หน้าเว็บลูกค้า (การ์ดทีมเซล) จะแสดงเฉพาะเซลที่เปิดใช้งานโดยอัตโนมัติ</li>
          <li>ปิดสวิตช์ = เอาออกจากทีมเซล (พนักงานยังทำงานอยู่ แค่ไม่รับลูกค้าสุ่ม)</li>
        </ul>
      </section>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          โหลดรายชื่อพนักงานไม่สำเร็จ: {loadError}
        </div>
      ) : (
        <SalesTeamManager initialRows={rows} />
      )}
    </main>
  );
}
