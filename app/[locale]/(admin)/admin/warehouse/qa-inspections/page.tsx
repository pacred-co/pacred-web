/**
 * /admin/warehouse/qa-inspections — TOMBSTONE (Wave 3 cleanup, 2026-05-20 ค่ำ).
 *
 * QA inspections (V-E10) were built on the retired spine table cargo_shipments.
 * Under D1 Option A the spine was retired in Wave 2; this module is deferred
 * to Phase C when a faithful port of legacy ตรวจสอบสินค้า workflow can be
 * built on the tb_forwarder + tb_forwarder_items shape.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function QaInspectionsTombstonePage() {
  await requireAdmin(["super", "accounting", "warehouse"]);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · QA</p>
        <h1 className="mt-1 text-2xl font-bold">QA / ตรวจสอบสินค้าก่อนจัดส่ง</h1>
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 space-y-2">
        <p className="font-bold">โมดูล QA ถูกพักการใช้งานชั่วคราว (D1 Wave 3)</p>
        <p>
          ฟีเจอร์บันทึก QA inspection (V-E10) อ้างอิงตารางสไปน์ที่ถูกยกเลิก. ระหว่าง faithful port (Phase B)
          ใช้หน้าตู้ <Link href="/admin/report-cnt" className="underline font-bold">/admin/report-cnt</Link> เพื่อจัดการสถานะตู้/สินค้า.
        </p>
        <p className="text-xs text-amber-700">
          ฟังก์ชัน QA inspection อย่างเต็มรูปแบบจะกลับมาใน Phase C เมื่อมีการ port workflow ตรวจสอบสินค้าจากระบบเดิม.
        </p>
      </div>
    </main>
  );
}
