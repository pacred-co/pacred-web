/**
 * /admin/shop-disbursement — admin-PUSH "ทำรายการเบิกเงิน" (เบิกจ่าย
 * ค่าสินค้า · shop-affiliate disbursement). Re-sweep A2 #23, D1 / ADR-0017.
 *
 * FAITHFUL port of `pcs-admin/report-shops-profit-pay.php` (the default
 * view + the batch-create POST handler) — the accounting team selects
 * shop orders whose payment has cleared, batches them, and pays the
 * China-side bank. Workflow copied 1:1; UI is our own Tailwind design
 * per AGENTS.md §0a.
 *
 * Eligibility (computed server-side · shop-disbursement-calc.ts):
 *   tb_header_order hStatus>2, hStatus<>6, hShopPay IS NULL, joined to a
 *   SETTLED wallet event (tb_wallet_hs.status='2') whose date falls in
 *   the range. Date range filters on the SETTLED WALLET date (faithful
 *   to the legacy `DATE(date)` resolving to wh.date).
 *
 * Distinct from `/admin/sales-payouts` (sales-rep commission, customer-
 * PULL, tb_user_sales_admin_pay) and `/admin/accounting/shop` (read-only
 * revenue report). This is the SHOP-ORDER cost/profit disbursement PUSH.
 *
 * Reachable §0d: accounting menubar leaf "เบิกจ่ายค่าสินค้า"
 * (lib/admin/accounting-menubar.ts → CARGO_MENUBAR) + the "ประวัติการ
 * เบิกจ่าย" button on this page.
 *
 * Auth — legacy gate (report-shops-profit-pay.php uses the admin shell;
 * the sibling acc-shop gate is CEO/Manager/QAAndQC/Accounting/ITDT).
 * Closest V3 RBAC = accounting + super.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";
import {
  getEligibleShopOrdersForDisbursement,
  getShopPayAccounts,
} from "@/actions/admin/shop-disbursement";
import { ShopDisbursementCreateForm } from "./create-form";

export const dynamic = "force-dynamic";

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type SP = { date?: string; start?: string; end?: string };

export default async function AdminShopDisbursementPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["accounting", "super"]);

  const sp = await searchParams;
  // Accept either explicit ?start=&end= OR the legacy
  // ?date=YYYY-MM-DD%20-%20YYYY-MM-DD shape (substr 0,10 + 13).
  let start = sp.start;
  let end = sp.end;
  if ((!start || !end) && sp.date && sp.date.length >= 23) {
    start = sp.date.slice(0, 10);
    end = sp.date.slice(13);
  }

  const [eligRes, accRes] = await Promise.all([
    getEligibleShopOrdersForDisbursement({ start, end }),
    getShopPayAccounts(),
  ]);

  const orders = eligRes.ok ? eligRes.data!.orders : [];
  const totals = eligRes.ok
    ? eligRes.data!.totals
    : { priceUserAll: 0, pricePCSAll: 0, profitAll: 0, vat7All: 0 };
  const rangeStart = eligRes.ok ? eligRes.data!.start : (start ?? "");
  const rangeEnd = eligRes.ok ? eligRes.data!.end : (end ?? "");
  const accounts = accRes.ok ? accRes.data!.accounts : [];

  return (
    <>
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/shop-disbursement" />
      <main className="space-y-5 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ACCOUNTING</p>
            <h1 className="mt-1 text-2xl font-bold">เบิกจ่ายค่าสินค้า (ฝากสั่งซื้อ)</h1>
            <p className="mt-1 text-xs text-muted">
              เลือกออเดอร์ฝากสั่งซื้อที่ชำระเงินแล้ว · ยังไม่เบิกจ่าย → ทำรายการเบิกเงินจ่ายต้นทุนจีน (บันทึก tb_shop_pay_h)
            </p>
          </div>
          <Link
            href="/admin/shop-disbursement/history"
            className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            ประวัติการเบิกจ่าย →
          </Link>
        </div>

        {!eligRes.ok && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            โหลดรายการไม่สำเร็จ: {eligRes.error}
          </div>
        )}

        {/* Date filter — on SETTLED WALLET date (วันที่ชำระเงิน) */}
        <form
          method="GET"
          className="flex flex-wrap items-end gap-3 rounded-xl border border-black/10 bg-white p-4"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="f-start">
              ตั้งแต่วันที่ชำระเงิน
            </label>
            <input
              id="f-start"
              type="date"
              name="start"
              defaultValue={rangeStart}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="f-end">
              ถึงวันที่
            </label>
            <input
              id="f-end"
              type="date"
              name="end"
              defaultValue={rangeEnd}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            ค้นหาข้อมูล
          </button>
        </form>

        {/* Eligible orders + multi-select create */}
        <ShopDisbursementCreateForm orders={orders} accounts={accounts} />

        {/* Period totals (legacy footer L279-286) */}
        <div className="rounded-xl border border-black/10 bg-white p-4 text-right text-sm">
          <div>
            ราคาทุนรวม: <span className="font-semibold">{fmt2(totals.pricePCSAll)}</span> บาท
          </div>
          <div>
            ราคาขายรวม: <span className="font-semibold">{fmt2(totals.priceUserAll)}</span> บาท
          </div>
          <div>
            ค่าบริการรวม (กำไรรวม):{" "}
            <span className="font-semibold text-primary-700">{fmt2(totals.profitAll)}</span> บาท
          </div>
          <div>
            ภาษีมูลค่าเพิ่ม 7% รวม:{" "}
            <span className="font-semibold text-primary-700">{fmt2(totals.vat7All)}</span> บาท
          </div>
        </div>
      </main>
    </>
  );
}
