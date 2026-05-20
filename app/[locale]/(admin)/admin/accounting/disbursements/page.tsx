/**
 * /admin/accounting/disbursements — TOMBSTONE (Wave 3 cleanup, 2026-05-20 ค่ำ).
 *
 * Container disbursements (U2-2 AP ledger) FK'd to the retired spine table
 * cargo_containers. Under D1 Option A the spine was retired in Wave 2; the
 * AP ledger module is deferred to Phase C when the legacy tb_bill / tb_bill_item
 * disbursement workflow can be faithfully ported.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function AdminDisbursementsTombstonePage() {
  // W-1 keystone: explicit super+accounting gate.
  await requireAdmin(["super", "accounting"]);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ACCOUNTING</p>
        <h1 className="mt-1 text-2xl font-bold">AP Ledger / สมุดจ่าย (Container disbursements)</h1>
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 space-y-2">
        <p className="font-bold">โมดูล AP Ledger ถูกพักการใช้งานชั่วคราว (D1 Wave 3)</p>
        <p>
          ระบบบันทึกค่าใช้จ่ายต่อตู้ (U2-2 disbursements) อ้างอิงตารางสไปน์ที่ถูกยกเลิก. ระหว่าง faithful port
          (Phase B) ให้บันทึก disbursement ผ่าน workflow เดิมในระบบ PCS Cargo (legacy <code className="bg-amber-100 px-1 rounded">tb_bill</code> /
          <code className="bg-amber-100 px-1 rounded">tb_bill_item</code>) ตามที่ทีมบัญชีใช้อยู่ปัจจุบัน.
        </p>
        <p className="text-xs text-amber-700">
          เดฟ/ก๊อต: AP ledger ใน Pacred จะกลับมาใน Phase C เมื่อ port faithful ของ disbursement workflow.
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
