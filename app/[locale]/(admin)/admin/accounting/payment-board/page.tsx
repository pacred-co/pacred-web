/**
 * /admin/accounting/payment-board — กระดานสถานะการชำระเงินลูกค้า (owner 2026-06-28).
 *
 * ONE at-a-glance, searchable board: per ฝากนำเข้า order — ลูกค้า · จ่าย/ยังไม่จ่าย ·
 * ยอดค้าง · ขาย/ต้นทุน/กำไร · เงินสด/เครดิต · รถ/เรือ/แอร์ · admin เกี่ยวข้อง · สถานะ.
 * Replaces the scatter across AR-aging / forwarders-list / billing-run. Read-only;
 * each row deep-links to the guarded forwarder detail for edits (§0d).
 *
 * Cost/profit columns gated by canViewCostProfit (server-side · the action nulls
 * them for non-cost roles). force-dynamic (auth + live money).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { listPaymentStatus } from "@/actions/admin/payment-board";
import { PaymentBoardTable } from "./payment-board-table";
import { PageHeader } from "@/components/admin/page-header";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

export default async function PaymentBoardPage() {
  const { roles } = await requireAdmin(["super", "accounting", "ops", "sales", "sales_admin"]);
  const showCost = canViewCostProfit(roles);
  const res = await listPaymentStatus({ pay: "all", money: "all" });

  return (
    <main className="p-4 lg:p-8 space-y-5">
      <PageHeader
        eyebrow="ADMIN · บัญชี · การเงิน"
        title="กระดานสถานะการชำระเงิน"
        subtitle="ลูกค้าคนไหนจ่ายแล้ว/ยังไม่จ่าย · ยอดค้าง · ขาย-ต้นทุน · เงินสด/เครดิต · รถ/เรือ/แอร์ · เซลล์ที่ดูแล — ค้นหา + กดเข้าไปแก้ได้"
        actions={
          <Link href="/admin/accounting/ar-aging" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
            ลูกหนี้ตามอายุ (AR) →
          </Link>
        }
      />

      {!res.ok ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {res.error}
        </div>
      ) : (
        <PaymentBoardTable
          rows={res.data.rows}
          totalOwed={res.data.totalOwed}
          unpaidCount={res.data.unpaidCount}
          capped={res.data.capped}
          showCost={showCost}
        />
      )}
    </main>
  );
}
