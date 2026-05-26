/**
 * /admin/warehouse/bulletin — TOMBSTONE (Wave 3 cleanup, 2026-05-20 ค่ำ).
 *
 * The daily bulletin generator (U2-1) was built on the retired "spine"
 * tables (cargo_containers + status enum). Under D1 Option A the spine
 * was retired in Wave 2; this page is deferred to Phase C when a faithful
 * port of the legacy LINE-bulletin workflow can be built directly from
 * tb_forwarder GROUP BY fCabinetNumber.
 *
 * For container status today, use:
 *   - /admin/report-cnt — faithful รายงานตู้ port (reads tb_forwarder)
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function BulletinPage() {
  await requireAdmin(["super", "ops", "warehouse"]);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ปฏิบัติการ</p>
        <h1 className="mt-1 text-2xl font-bold">บุลเลตินตู้คอนเทนเนอร์รายวัน</h1>
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 space-y-2">
        <p className="font-bold">เครื่องมือนี้ถูกพักการใช้งานชั่วคราว (D1 Wave 3)</p>
        <p>
          ฟีเจอร์สร้างบุลเลตินอัตโนมัติเดิม (U2-1) อ้างอิงตารางสไปน์ที่ถูกยกเลิกในการแก้
          legacy ของ Pacred. ระหว่างทำ faithful port (Phase B) ให้ใช้ <Link href="/admin/report-cnt" className="underline font-bold">/admin/report-cnt (รายงานตู้)</Link> แทน
          — เป็นหน้าตู้ตามรูปแบบ legacy ที่อ่านจาก <code className="bg-amber-100 px-1 rounded">tb_forwarder</code> โดยตรง.
        </p>
        <p className="text-xs text-amber-700">
          ภูม / เดฟ: บุลเลตินอัตโนมัติจะกลับมาใน Phase C เมื่อมีการ port workflow LINE bulletin จากระบบเดิม.
        </p>
      </div>
      <Link
        href="/admin/report-cnt"
        className="inline-block rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-bold hover:bg-primary-600"
      >
        ไปหน้ารายงานตู้ →
      </Link>
    </main>
  );
}
