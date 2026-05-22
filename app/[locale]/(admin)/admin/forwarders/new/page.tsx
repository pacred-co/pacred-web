/**
 * /admin/forwarders/new — admin-initiated forwarder create (Wave 12 backlog).
 *
 * Wave 11 follow-up 2026-05-23 (ภูม flagged): the previous stub did a
 * silent `redirect("/admin/forwarders")` which made the "+ เพิ่มรายการ
 * ให้ลูกค้า" button feel broken (click → bounce back to list with zero
 * feedback). Replaced with an explicit "Wave 12 backlog" page so staff
 * know the feature is on the roadmap + how to do it today.
 *
 * Why it's a heavy port:
 *   Legacy `pcs-admin/forwarder.php?page=add` is a 2,661-line god-page
 *   with the full customer-side /service-import/add form duplicated
 *   under admin auth — select customer · warehouse · transport · items ·
 *   dimensions · add-ons · delivery · slip upload · bypass user-side
 *   validations + audit log.
 *
 * Wave 12 plan (when prioritised):
 *   1. Customer picker (autocomplete from tb_users)
 *   2. Reuse the customer-side /service-import/add form under admin gate
 *   3. Server action that INSERTs tb_forwarder with adminidcreator=<admin>
 *      so the row badges "ฝากนำเข้า : admin_X" in the list (matches
 *      legacy filter convention used by ?create=admin)
 *   4. Slip upload (needs Supabase Storage bucket from ก๊อต)
 *
 * Until that ships — 2 alternatives:
 *   a) Use legacy PHP admin (forwarder.php?page=add) — same DB, fully
 *      functional, no retraining needed
 *   b) "View as customer" (G-4 impersonation) → create on the customer's
 *      own /service-import/add page
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

export default async function AdminForwarderNewPage() {
  await requireAdmin(["ops", "accounting"]);

  return (
    <main className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">
          Admin
        </Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">
          ฝากนำเข้า
        </Link>
        <span>›</span>
        <span className="text-foreground font-medium">เพิ่มรายการให้ลูกค้า</span>
      </nav>

      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">
          ADMIN · ฝากนำเข้า · เพิ่มรายการให้ลูกค้า
        </p>
        <h1 className="mt-1 text-2xl font-bold">ยังไม่เปิดให้แอดมินเพิ่ม forwarder</h1>
      </div>

      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 space-y-3 text-sm">
        <p className="font-medium text-yellow-900">
          ฟีเจอร์นี้อยู่ใน Wave 12 backlog (admin-initiated forwarder · 2,661 LOC legacy port).
        </p>
        <p className="text-yellow-800">
          ตัว form เพิ่มรายการให้ลูกค้า เป็น page หนัก — ต้องเลือกลูกค้า · เลือกโกดัง ·
          กรอกสินค้า · ขนาด · ตัวเลือกขนส่ง · อัพโหลดสลิป + เขียน adminidcreator
          ลง <code className="rounded bg-yellow-100 px-1.5 py-0.5">tb_forwarder</code>{" "}
          เพื่อให้แถวขึ้น badge "ฝากนำเข้า : admin_X" ในรายการ. การอัพโหลดสลิปก็ต้องรอ
          Supabase Storage bucket จาก ก๊อต ก่อน.
        </p>
        <p className="text-yellow-800 font-medium">วิธีเพิ่มรายการให้ลูกค้าชั่วคราว:</p>
        <ol className="list-decimal pl-6 text-yellow-800 space-y-1">
          <li>
            ใช้ legacy PHP admin (
            <code className="rounded bg-yellow-100 px-1.5 py-0.5">
              pcs-admin/forwarder.php?page=add
            </code>
            ) — เป็น form ที่ใช้งานได้อยู่ · ลูกค้าจะเห็นแถวใหม่ทันทีเหมือนเดิม
          </li>
          <li>
            หรือ "ดูในมุมลูกค้า" (G-4 impersonation) จาก{" "}
            <Link href="/admin/customers" className="font-medium text-yellow-900 underline">
              /admin/customers
            </Link>{" "}
            → เลือกลูกค้า → "เข้าระบบในมุมลูกค้า" → ไป /service-import/add ในนามลูกค้า
          </li>
        </ol>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link
          href="/admin/forwarders"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับรายการฝากนำเข้า
        </Link>
        <Link
          href="/admin/customers?focus=search"
          className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          ไปค้นหาลูกค้า (สำหรับ impersonate) →
        </Link>
      </div>
    </main>
  );
}
