/**
 * /admin/yuan-payments/new — admin-initiated yuan payment (Wave 8 backlog).
 *
 * Legacy lets admin create a yuan-payment request on a customer's behalf
 * (CNY amount + recipient details + supporting docs · `pcs-admin/payment-add.php`).
 * Pacred-current = customer-initiated only — admin approves via the queue.
 *
 * Wave 7.1 (ภูม flagged 2026-05-21 night): the previous stub did a
 * silent `redirect("/admin/yuan-payments")` which made the "+ เพิ่มรายการ"
 * button feel broken (clicking it bounces back to the same list with
 * zero feedback). Replaced with a real "ยังไม่เปิด" page so staff know
 * what's going on + what to do instead.
 *
 * Wave 8 will build the actual form (customer picker + CNY/recipient
 * fields + slip upload + tb_payment INSERT + wallet auto-credit on
 * approve).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

export default async function AdminYuanPaymentNewPage() {
  await requireAdmin(["ops", "accounting"]);

  return (
    <main className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">
          ADMIN · ฝากโอนหยวน · เพิ่มรายการ
        </p>
        <h1 className="mt-1 text-2xl font-bold">ยังไม่เปิดให้แอดมินเพิ่มรายการ</h1>
      </div>

      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 space-y-3 text-sm">
        <p className="font-medium text-yellow-900">
          ฟีเจอร์นี้อยู่ใน Wave 8 backlog (admin-initiated payment).
        </p>
        <p className="text-yellow-800">
          ขั้นตอนการสร้างรายการฝากโอน ปัจจุบันลูกค้าสร้างเองผ่านหน้า{" "}
          <code className="rounded bg-yellow-100 px-1.5 py-0.5">/wallet</code> ฝั่งลูกค้า · แอดมินจะเข้ามา
          อนุมัติ/ปฏิเสธ ผ่านหน้า{" "}
          <Link href="/admin/yuan-payments" className="font-medium text-yellow-900 underline">
            /admin/yuan-payments
          </Link>{" "}
          แทน
        </p>
        <p className="text-yellow-800">
          ถ้าจำเป็นต้องสร้างรายการแทนลูกค้าด่วน → ใช้ legacy PHP admin
          (<code className="rounded bg-yellow-100 px-1.5 py-0.5">payment-add.php</code>) ชั่วคราว
          จนกว่า Wave 8 จะ ship.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link
          href="/admin/yuan-payments"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับรายการ
        </Link>
        <Link
          href="/admin/yuan-payments?status=1"
          className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          ไปคิวรอตรวจ →
        </Link>
      </div>
    </main>
  );
}
