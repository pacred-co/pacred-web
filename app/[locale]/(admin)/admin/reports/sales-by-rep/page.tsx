/**
 * V-G6 #2 — Sales revenue per sales rep (Wave 8 backlog).
 *
 * Wave 7.2 (2026-05-21 night): the original aggregated rebuilt
 * `profiles.sales_admin_id` × `forwarders`/`service_orders`/`yuan_payments`
 * (all empty on prod) → page rendered "฿0" for every rep.
 *
 * The faithful port needs to group `tb_users.adminidsale` (text) ×
 * SUM(tb_forwarder.ftotalprice) + SUM(tb_header_order.htotalpriceuser) +
 * SUM(tb_payment.paythb) joined on the right user-id text key. That's a
 * non-trivial cross-table aggregation (PostgREST doesn't expose
 * server-side SUM/GROUP BY directly · need a Postgres view or RPC).
 *
 * Until Wave 8 ships, this page shows the legacy-PHP fallback instead
 * of silently rendering ฿0 for every sales rep.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

export default async function SalesByRepReport() {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">
            ADMIN · REPORTS (V-G6)
          </p>
          <h1 className="mt-1 text-2xl font-bold">รายได้แยกตามเซลล์ผู้ดูแล</h1>
        </div>
        <Link
          href="/admin/reports"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 space-y-3 text-sm">
        <p className="font-medium text-yellow-900">
          ฟีเจอร์นี้อยู่ใน Wave 8 backlog (cross-table aggregate on tb_users.adminidsale).
        </p>
        <p className="text-yellow-800">
          การคำนวณรายได้รวมต่อเซลล์ ต้องการ Postgres view (หรือ RPC) ที่ join
          tb_users.adminidsale × SUM(tb_forwarder.ftotalprice) +
          SUM(tb_header_order.htotalpriceuser) + SUM(tb_payment.paythb)
          ในช่วงเวลาที่กำหนด · ยังไม่ ship เพราะต้องสร้าง view + tune
          performance สำหรับ ~8,898 ลูกค้า × หลายปีของ transactions
        </p>
        <p className="text-yellow-800 font-medium">วิธีดูข้อมูลชั่วคราว:</p>
        <ol className="list-decimal pl-6 text-yellow-800 space-y-1">
          <li>
            ใช้ legacy PHP admin (
            <code className="rounded bg-yellow-100 px-1.5 py-0.5">
              report-sales-group-by-user.php
            </code>
            ) สำหรับ ranking เซลล์
          </li>
          <li>
            หรือใช้{" "}
            <Link
              href="/admin/customers/transfer-rep"
              className="font-medium text-yellow-900 underline"
            >
              ย้ายเซลล์
            </Link>{" "}
            filter ด้วย adminid เพื่อดูว่าเซลล์คนไหนดูแลลูกค้าทั้งหมดกี่ราย
          </li>
        </ol>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link
          href="/admin/reports"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับรีพอร์ตหลัก
        </Link>
        <Link
          href="/admin/reports/forwarder-volume"
          className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          ดูปริมาณฝากนำเข้า (พร้อมใช้) →
        </Link>
      </div>
    </main>
  );
}
