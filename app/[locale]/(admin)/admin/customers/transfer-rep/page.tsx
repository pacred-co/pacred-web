/**
 * /admin/customers/transfer-rep — ย้ายเซลล์ผู้ดูแลลูกค้า
 *
 * Wave 7.2 (2026-05-21 night): the original bulk-edit form read
 * profiles.sales_admin_id (rebuilt · empty) + listed customers from
 * profiles (rebuilt · empty) → was silently broken.
 *
 * The faithful port needs:
 *   - Customer list from tb_users (with `adminidsale` field)
 *   - Admins list from the rebuilt `admins` table (Pacred-only — staff
 *     log into the Pacred admin app, not the legacy PHP)
 *   - A bulk UPDATE that writes `tb_users.adminidsale = '<new_admin_userid>'`
 *
 * Wave 8 will rebuild the form. For now this page shows a clear
 * "ยังไม่เปิด" banner so ops don't try to use the broken bulk-edit.
 * Staff who need to reassign a customer's sales rep TODAY can do it
 * one-by-one from the customer detail page (`/admin/customers/[id]`).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ArrowLeftRight, ChevronRight, Home } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TransferSalesRepPage() {
  await requireAdmin(["ops", "sales_admin"]);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/admin/customers" className="hover:text-primary-600">
          ลูกค้า
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">ย้ายเซลล์ผู้ดูแล</span>
      </nav>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600">
          <ArrowLeftRight className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">
            ADMIN · ลูกค้า · ย้ายเซลล์
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold">ย้ายเซลล์ผู้ดูแลลูกค้า</h1>
        </div>
      </div>

      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 space-y-3 text-sm">
        <p className="font-medium text-yellow-900">
          ฟีเจอร์นี้อยู่ใน Wave 8 backlog (bulk reassignment to tb_users.adminidsale).
        </p>
        <p className="text-yellow-800">
          การย้ายเซลล์ผู้ดูแลแบบครั้งละหลายราย ยังไม่ ship เพราะต้องเชื่อม{" "}
          <code className="rounded bg-yellow-100 px-1.5 py-0.5">tb_users.adminidsale</code>
          {" "}กับ Pacred admin users (table{" "}
          <code className="rounded bg-yellow-100 px-1.5 py-0.5">admins</code>) ซึ่งเป็น
          mapping ใหม่ของ Pacred ที่ legacy PCS ไม่มี
        </p>
        <p className="text-yellow-800 font-medium">วิธีทำชั่วคราว — ย้ายทีละราย:</p>
        <ol className="list-decimal pl-6 text-yellow-800 space-y-1">
          <li>
            เข้า{" "}
            <Link
              href="/admin/customers"
              className="font-medium text-yellow-900 underline"
            >
              /admin/customers
            </Link>{" "}
            → ค้นหาลูกค้าด้วยรหัสหรือเบอร์
          </li>
          <li>กด "ดู" เข้า customer detail page</li>
          <li>เลือก "เซลล์ผู้ดูแล" → save (เปลี่ยนทีละราย)</li>
        </ol>
        <p className="text-yellow-800">
          ถ้าต้องย้ายเป็นจำนวนมาก ใช้ legacy PHP admin tool (
          <code className="rounded bg-yellow-100 px-1.5 py-0.5">user-transfer-sales.php</code>
          ) ชั่วคราว จนกว่า Wave 8 จะ ship form ที่นี่
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link
          href="/admin/customers"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← รายการลูกค้า
        </Link>
        <Link
          href="/admin/customers?focus=search"
          className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          ค้นหาลูกค้า →
        </Link>
      </div>
    </main>
  );
}
